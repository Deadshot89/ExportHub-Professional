'use strict';

const crypto=require('crypto');
const db=require('./database');
const readModel=require('./shipment-read-model');
const domain=require('./shipment-domain');
const workspaceSettings=require('./workspace-settings-store');

function q(value){return value==null?'':String(value).trim();}
function shipmentError(code,message){return Object.assign(new Error(message),{code});}
function defaultLockToken(){return crypto.randomBytes(24).toString('base64url');}
function objectInput(value,name){
  if(value==null)return {};
  if(value&&typeof value==='object'&&!Array.isArray(value))return value;
  throw shipmentError('INPUT_INVALID',`${name} ist ungültig.`);
}
function nullableId(value,name){
  if(value===null||value==='')return null;
  const id=q(value);
  if(!id)throw shipmentError('INPUT_INVALID',`${name} ist ungültig.`);
  return id;
}
function nullableDate(value,name){
  if(value===null||value==='')return null;
  const date=q(value);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw shipmentError('INPUT_INVALID',`${name} muss YYYY-MM-DD entsprechen.`);
  return date;
}
function localDateInZone(timeZone='UTC',now=new Date()){
  try{
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
    const get=type=>parts.find(part=>part.type===type)?.value||'';
    const value=`${get('year')}-${get('month')}-${get('day')}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(value)?value:now.toISOString().slice(0,10);
  }catch{return now.toISOString().slice(0,10);}
}

const BASE_SELECT=`
  select s.*,
         c.account as customer_account,
         c.name as customer_name,
         l.name as location_name,
         l.city as location_city,
         l.country as location_country
    from shipments s
    left join customers c
      on c.tenant_id=s.tenant_id and c.id=s.customer_id
    left join customer_locations l
      on l.tenant_id=s.tenant_id and l.id=s.location_id
`;

function normalizeLock(row={}){
  return {
    shipmentId:q(row.shipment_id??row.shipmentId),
    userId:q(row.user_id??row.userId),
    lockToken:q(row.lock_token??row.lockToken),
    acquiredAt:row.acquired_at??row.acquiredAt??null,
    lastActivityAt:row.last_activity_at??row.lastActivityAt??null
  };
}

function sanitizeShipmentPatch(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))throw shipmentError('INPUT_INVALID','Sendungsänderung ist ungültig.');
  const patch={};
  const has=(...keys)=>keys.find(key=>Object.prototype.hasOwnProperty.call(input,key));
  let key=has('customer_id','customerId');
  if(key)patch.customer_id=nullableId(input[key],'Kunde');
  key=has('location_id','locationId');
  if(key)patch.location_id=nullableId(input[key],'Standort');
  key=has('recipient_snapshot','recipientSnapshot');
  if(key)patch.recipient_snapshot=objectInput(input[key],'Empfänger-Snapshot');
  key=has('planned_pickup_date','plannedPickupDate');
  if(key)patch.planned_pickup_date=nullableDate(input[key],'Geplantes Abholdatum');
  return patch;
}

async function validateMasterdataRefsInClient(client,tenantId,current,patch){
  let customerId=Object.prototype.hasOwnProperty.call(patch,'customer_id')?patch.customer_id:(current.customer_id??null);
  let locationId=Object.prototype.hasOwnProperty.call(patch,'location_id')?patch.location_id:(current.location_id??null);
  if(Object.prototype.hasOwnProperty.call(patch,'customer_id')&&patch.customer_id){
    const customer=await client.query('select id from customers where tenant_id=$1 and id=$2 and active=true limit 1',[tenantId,patch.customer_id]);
    if(!customer.rows?.[0])throw shipmentError('CUSTOMER_NOT_FOUND','Kunde wurde nicht gefunden oder ist inaktiv.');
  }
  if(Object.prototype.hasOwnProperty.call(patch,'customer_id')&&current.customer_id&&patch.customer_id!==current.customer_id&&!Object.prototype.hasOwnProperty.call(patch,'location_id')){
    patch.location_id=null;locationId=null;
  }
  if(locationId){
    const location=await client.query('select id,customer_id from customer_locations where tenant_id=$1 and id=$2 and active=true limit 1',[tenantId,locationId]);
    const row=location.rows?.[0];
    if(!row)throw shipmentError('LOCATION_NOT_FOUND','Standort wurde nicht gefunden oder ist inaktiv.');
    if(customerId&&q(row.customer_id)!==q(customerId))throw shipmentError('LOCATION_NOT_FOUND','Standort gehört nicht zum gewählten Kunden.');
    if(!customerId){patch.customer_id=q(row.customer_id);customerId=patch.customer_id;}
  }
}

async function acquireEditLockInClient(client,tenantId,shipmentId,userId,{lockTokenGenerator=defaultLockToken}={}){
  const tid=q(tenantId),sid=q(shipmentId),uid=q(userId);
  if(!tid||!sid||!uid)throw shipmentError('INPUT_INVALID','Sperrkontext ist unvollständig.');
  const token=q(lockTokenGenerator());
  if(!token)throw shipmentError('INTERNAL_ERROR','Sperr-Token konnte nicht erzeugt werden.');
  const result=await client.query(`
    insert into shipment_edit_locks(tenant_id,shipment_id,user_id,lock_token,acquired_at,last_activity_at)
    values($1,$2,$3,$4,now(),now())
    on conflict (tenant_id,shipment_id) do update
       set user_id=excluded.user_id,
           lock_token=excluded.lock_token,
           acquired_at=now(),
           last_activity_at=now()
     where shipment_edit_locks.user_id=excluded.user_id
        or shipment_edit_locks.last_activity_at < now()-interval '15 minutes'
    returning tenant_id,shipment_id,user_id,lock_token,acquired_at,last_activity_at
  `,[tid,sid,uid,token]);
  if(!result.rows?.[0])throw shipmentError('SHIPMENT_LOCKED','Sendung wird bereits von einem anderen Benutzer bearbeitet.');
  return normalizeLock(result.rows[0]);
}

async function requireEditLockInClient(client,tenantId,shipmentId,userId,lockToken){
  const token=q(lockToken);
  if(!token)throw shipmentError('SHIPMENT_LOCK_INVALID','Bearbeitungssperre fehlt oder ist ungültig.');
  const result=await client.query(`
    select lock_token
      from shipment_edit_locks
     where tenant_id=$1 and shipment_id=$2 and user_id=$3 and lock_token=$4
       and last_activity_at >= now()-interval '15 minutes'
     limit 1
     for update
  `,[q(tenantId),q(shipmentId),q(userId),token]);
  if(!result.rows?.[0])throw shipmentError('SHIPMENT_LOCK_INVALID','Bearbeitungssperre ist ungültig oder abgelaufen.');
  return true;
}

async function heartbeatEditLockInClient(client,tenantId,shipmentId,userId,lockToken){
  const token=q(lockToken);
  if(!token)throw shipmentError('SHIPMENT_LOCK_INVALID','Bearbeitungssperre fehlt oder ist ungültig.');
  const result=await client.query(`
    update shipment_edit_locks
       set last_activity_at=now()
     where tenant_id=$1 and shipment_id=$2 and user_id=$3 and lock_token=$4
       and last_activity_at >= now()-interval '15 minutes'
    returning tenant_id,shipment_id,user_id,lock_token,acquired_at,last_activity_at
  `,[q(tenantId),q(shipmentId),q(userId),token]);
  if(!result.rows?.[0])throw shipmentError('SHIPMENT_LOCK_INVALID','Bearbeitungssperre ist ungültig oder abgelaufen.');
  return normalizeLock(result.rows[0]);
}

async function releaseEditLockInClient(client,tenantId,shipmentId,userId,lockToken){
  const token=q(lockToken);
  if(!token)throw shipmentError('SHIPMENT_LOCK_INVALID','Bearbeitungssperre fehlt oder ist ungültig.');
  const result=await client.query(`
    delete from shipment_edit_locks
     where tenant_id=$1 and shipment_id=$2 and user_id=$3 and lock_token=$4
    returning tenant_id,shipment_id,user_id,lock_token,acquired_at,last_activity_at
  `,[q(tenantId),q(shipmentId),q(userId),token]);
  if(!result.rows?.[0])throw shipmentError('SHIPMENT_LOCK_INVALID','Bearbeitungssperre ist ungültig.');
  return normalizeLock(result.rows[0]);
}

async function createDraftInClient(client,tenantId,userId,{referenceGenerator=domain.generateReference,lockTokenGenerator=defaultLockToken}={}){
  const tid=q(tenantId),uid=q(userId);
  if(!tid||!uid)throw shipmentError('INPUT_INVALID','Benutzer- oder Workspace-Kontext fehlt.');
  const settingsResult=await client.query("select settings->'shipping' as shipping from tenant_settings where tenant_id=$1 limit 1",[tid]);
  const sender=workspaceSettings.normalizeShippingSettings(settingsResult.rows?.[0]?.shipping||{});
  if(!sender.complete)throw shipmentError('WORKSPACE_SENDER_INCOMPLETE','Versand-Einstellungen des Workspaces sind unvollständig.');
  const senderSnapshot={...sender};delete senderSnapshot.complete;
  let created=null;
  for(let attempt=0;attempt<20;attempt++){
    const reference=q(referenceGenerator()).toUpperCase();
    if(!/^[A-Z0-9]{6}$/.test(reference))throw shipmentError('REFERENCE_GENERATION_FAILED','Gültige Sendungsreferenz konnte nicht erzeugt werden.');
    const result=await client.query(`
      insert into shipments(
        tenant_id,reference,status,source_kind,revision,sender_snapshot,recipient_snapshot,
        carrier_snapshot,fx_snapshot,readiness,rework,updated_at
      ) values($1,$2,'Entwurf','LIVE',0,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,now())
      on conflict (tenant_id,reference) do nothing
      returning *
    `,[tid,reference,JSON.stringify(senderSnapshot),'{}','{}','{}','{}','{}']);
    if(result.rows?.[0]){created=result.rows[0];break;}
  }
  if(!created)throw shipmentError('REFERENCE_GENERATION_FAILED','Eindeutige Sendungsreferenz konnte nach 20 Versuchen nicht erzeugt werden.');
  await client.query(`
    insert into audit_events(tenant_id,user_id,event_type,entity_type,entity_id,metadata)
    values($1,$2,'SHIPMENT_CREATED','shipment',$3,$4::jsonb)
  `,[tid,uid,created.id,JSON.stringify({reference:created.reference,sourceKind:'LIVE'})]);
  const lock=await acquireEditLockInClient(client,tid,created.id,uid,{lockTokenGenerator});
  return {shipment:readModel.normalizeShipmentRow(created),lock};
}

async function updateShipmentInClient(client,tenantId,shipmentId,userId,{lockToken,revision,patch}={}){
  const tid=q(tenantId),sid=q(shipmentId),uid=q(userId);
  if(!tid||!sid||!uid)throw shipmentError('INPUT_INVALID','Sendungs- oder Benutzerkontext fehlt.');
  const expected=Number(revision);
  if(!Number.isInteger(expected)||expected<0)throw shipmentError('INPUT_INVALID','Sendungsrevision ist ungültig.');
  const currentResult=await client.query(`select * from shipments where tenant_id=$1 and id=$2 and discarded_at is null for update`,[tid,sid]);
  const current=currentResult.rows?.[0];
  if(!current)throw shipmentError('SHIPMENT_NOT_FOUND','Sendung wurde nicht gefunden.');
  domain.assertMutable(current);
  await requireEditLockInClient(client,tid,sid,uid,lockToken);
  if(Number(current.revision)!==expected)throw shipmentError('SHIPMENT_REVISION_CONFLICT','Sendung wurde zwischenzeitlich geändert. Bitte neu laden.');
  const safe=sanitizeShipmentPatch(patch||{});
  await validateMasterdataRefsInClient(client,tid,current,safe);
  const fields=Object.keys(safe);
  if(!fields.length)return readModel.normalizeShipmentRow(current);
  const values=[tid,sid,expected];
  const assignments=[];
  for(const field of fields){
    let value=safe[field];
    if(field==='recipient_snapshot')value=JSON.stringify(value);
    values.push(value);
    const position=`$${values.length}`;
    assignments.push(`${field}=${field==='recipient_snapshot'?`${position}::jsonb`:position}`);
  }
  const updated=await client.query(`
    update shipments
       set ${assignments.join(',')},revision=revision+1,updated_at=now()
     where tenant_id=$1 and id=$2 and revision=$3 and discarded_at is null
    returning *
  `,values);
  if(!updated.rows?.[0])throw shipmentError('SHIPMENT_REVISION_CONFLICT','Sendung wurde zwischenzeitlich geändert. Bitte neu laden.');
  await client.query(`
    update shipment_edit_locks
       set last_activity_at=now()
     where tenant_id=$1 and shipment_id=$2 and user_id=$3 and lock_token=$4
  `,[tid,sid,uid,q(lockToken)]);
  await client.query(`
    insert into audit_events(tenant_id,user_id,event_type,entity_type,entity_id,metadata)
    values($1,$2,'SHIPMENT_UPDATED','shipment',$3,$4::jsonb)
  `,[tid,uid,sid,JSON.stringify({fields,revision:Number(updated.rows[0].revision)})]);
  return readModel.normalizeShipmentRow(updated.rows[0]);
}

async function listShipments(tenantId,filters={}){
  return db.withTenantShipmentClient(tenantId,async client=>{
    const params=[String(tenantId)];
    const where=['s.tenant_id=$1','s.discarded_at is null'];
    const query=q(filters.query??filters.q);
    const status=q(filters.status);
    const source=q(filters.source??filters.sourceKind).toUpperCase();
    if(query){
      params.push(`%${query}%`);
      const p=`$${params.length}`;
      where.push(`(s.reference ilike ${p} or coalesce(c.account,'') ilike ${p} or coalesce(c.name,'') ilike ${p} or coalesce(l.name,'') ilike ${p})`);
    }
    if(status&&status.toLowerCase()!=='all'){
      params.push(status);where.push(`s.status=$${params.length}`);
    }
    if(source&&source!=='ALL'){
      params.push(source);where.push(`upper(s.source_kind)=$${params.length}`);
    }
    const result=await client.query(`${BASE_SELECT} where ${where.join(' and ')} order by s.planned_pickup_date nulls last,s.created_at desc,s.reference`,params);
    return (result.rows||[]).map(readModel.normalizeShipmentRow);
  });
}

async function getShipment(tenantId,shipmentId){
  const id=q(shipmentId);if(!id)throw shipmentError('SHIPMENT_NOT_FOUND','Sendungs-ID fehlt.');
  return db.withTenantShipmentClient(tenantId,async client=>{
    const result=await client.query(`${BASE_SELECT} where s.tenant_id=$1 and s.id=$2 and s.discarded_at is null limit 1`,[String(tenantId),id]);
    const row=result.rows?.[0];
    if(!row)throw shipmentError('SHIPMENT_NOT_FOUND','Sendung wurde nicht gefunden.');
    return readModel.normalizeShipmentRow(row);
  });
}

async function getShipmentDashboard(tenantId,{localDate,timeZone='UTC',now=new Date()}={}){
  const date=q(localDate)||localDateInZone(timeZone,now);
  const shipments=await listShipments(tenantId,{status:'all'});
  return readModel.buildShipmentDashboard(shipments,{localDate:date,timeZone});
}

async function createDraft(tenantId,userId,options={}){
  return db.withTenantShipmentClient(tenantId,client=>createDraftInClient(client,tenantId,userId,options),{write:true});
}

async function acquireEditLock(tenantId,shipmentId,userId,options={}){
  return db.withTenantShipmentClient(tenantId,async client=>{
    const result=await client.query('select * from shipments where tenant_id=$1 and id=$2 and discarded_at is null limit 1',[q(tenantId),q(shipmentId)]);
    const shipment=result.rows?.[0];
    if(!shipment)throw shipmentError('SHIPMENT_NOT_FOUND','Sendung wurde nicht gefunden.');
    domain.assertMutable(shipment);
    return acquireEditLockInClient(client,tenantId,shipmentId,userId,options);
  },{write:true});
}

async function heartbeatEditLock(tenantId,shipmentId,userId,lockToken){
  return db.withTenantShipmentClient(tenantId,client=>heartbeatEditLockInClient(client,tenantId,shipmentId,userId,lockToken),{write:true});
}

async function releaseEditLock(tenantId,shipmentId,userId,lockToken){
  return db.withTenantShipmentClient(tenantId,client=>releaseEditLockInClient(client,tenantId,shipmentId,userId,lockToken),{write:true});
}

async function forceReleaseEditLock(tenantId,shipmentId,userId,{role,reason}={}){
  if(q(role).toUpperCase()!=='TENANT_ADMIN')throw shipmentError('FORBIDDEN','Nur Firmen-Admins dürfen fremde Bearbeitungssperren aufheben.');
  const why=q(reason);if(!why)throw shipmentError('INPUT_INVALID','Begründung für das Aufheben der Sperre fehlt.');
  return db.withTenantShipmentClient(tenantId,async client=>{
    const result=await client.query(`
      delete from shipment_edit_locks where tenant_id=$1 and shipment_id=$2
      returning tenant_id,shipment_id,user_id,lock_token,acquired_at,last_activity_at
    `,[q(tenantId),q(shipmentId)]);
    const released=result.rows?.[0];
    if(!released)return {released:false};
    await client.query(`
      insert into audit_events(tenant_id,user_id,event_type,entity_type,entity_id,metadata)
      values($1,$2,'SHIPMENT_LOCK_FORCE_RELEASED','shipment',$3,$4::jsonb)
    `,[q(tenantId),q(userId),q(shipmentId),JSON.stringify({reason:why,previousUserId:q(released.user_id)})]);
    return {released:true,lock:normalizeLock(released)};
  },{write:true});
}

async function updateShipment(tenantId,shipmentId,userId,input){
  return db.withTenantShipmentClient(tenantId,client=>updateShipmentInClient(client,tenantId,shipmentId,userId,input),{write:true});
}

module.exports={
  listShipments,getShipment,getShipmentDashboard,localDateInZone,
  createDraft,updateShipment,acquireEditLock,heartbeatEditLock,releaseEditLock,forceReleaseEditLock,
  createDraftInClient,updateShipmentInClient,acquireEditLockInClient,heartbeatEditLockInClient,releaseEditLockInClient,
  sanitizeShipmentPatch,normalizeLock
};