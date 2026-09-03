'use strict';

const db=require('./database');
const validation=require('./masterdata-validation');

function carrierError(code,message){return Object.assign(new Error(message),{code});}
function text(value){return value==null?'':String(value).normalize('NFKC').trim();}
function optionalText(value,max=500){
  const valueText=text(value);
  if(!valueText)return null;
  if(valueText.length>max)throw carrierError('INPUT_INVALID','Eingabe ist zu lang.');
  return valueText;
}
function portalUrl(value){
  const raw=optionalText(value,2000);
  if(!raw)return null;
  let parsed;
  try{parsed=new URL(raw);}catch{throw carrierError('INPUT_INVALID','Portal-/Webadresse ist ungültig.');}
  if(!['http:','https:'].includes(parsed.protocol))throw carrierError('INPUT_INVALID','Portal-/Webadresse muss HTTP oder HTTPS verwenden.');
  return parsed.toString();
}
function filterStatus(value){
  const status=text(value).toLowerCase();
  return status==='active'?true:(status==='inactive'?false:null);
}
function normalizeCarrier(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))throw carrierError('INPUT_INVALID','Spedition ist ungültig.');
  const name=text(input.name);
  if(!name||name.length>160)throw carrierError('INPUT_INVALID','Name der Spedition ist erforderlich oder ungültig.');
  return {
    name,
    abdRequiredDefault:(input.abdRequiredDefault??input.abd_required_default)===true,
    contactName:optionalText(input.contactName??input.contact_name,160),
    email:validation.cleanEmail(input.email),
    phone:optionalText(input.phone,80),
    portalUrl:portalUrl(input.portalUrl??input.portal_url)
  };
}
function normalizeRow(row={}){
  return {
    id:text(row.id),
    name:text(row.name),
    active:row.active!==false,
    abdRequiredDefault:row.abd_required_default===true,
    contactName:row.contact_name??null,
    email:row.email??null,
    phone:row.phone??null,
    portalUrl:row.portal_url??null,
    createdAt:row.created_at??null,
    updatedAt:row.updated_at??null
  };
}
function mapDatabaseError(err){
  if(err?.code==='23505'&&String(err.constraint||'').includes('carriers'))return carrierError('CARRIER_EXISTS','Diese Spedition existiert bereits.');
  return err;
}
async function withCarrierClient(tenantId,fn,{write=false}={}){
  await db.ensureShipmentSchema();
  return db.withTenantMasterdataClient(tenantId,fn,{write});
}
async function audit(client,tenantId,userId,eventType,entityId,metadata={}){
  await client.query("insert into audit_events(tenant_id,user_id,event_type,entity_type,entity_id,metadata) values($1,$2,$3,'CARRIER',$4,$5::jsonb)",[tenantId,userId||null,eventType,entityId,JSON.stringify(metadata)]);
}
async function getCarrierInClient(client,tenantId,carrierId){
  const result=await client.query(`select id,name,active,abd_required_default,contact_name,email,phone,portal_url,created_at,updated_at
    from carriers where tenant_id=$1 and id=$2 limit 1`,[tenantId,carrierId]);
  return result.rows?.[0]?normalizeRow(result.rows[0]):null;
}
async function listCarriers(tenantId,{status='active'}={}){
  const active=filterStatus(status);
  return withCarrierClient(tenantId,async client=>{
    const params=[tenantId],where=['tenant_id=$1'];
    if(active!==null){params.push(active);where.push(`active=$${params.length}`);}
    const result=await client.query(`select id,name,active,abd_required_default,contact_name,email,phone,portal_url,created_at,updated_at
      from carriers where ${where.join(' and ')} order by lower(name),created_at`,params);
    return (result.rows||[]).map(normalizeRow);
  });
}
async function getCarrier(tenantId,carrierId){
  return withCarrierClient(tenantId,async client=>{
    const carrier=await getCarrierInClient(client,tenantId,carrierId);
    if(!carrier)throw carrierError('CARRIER_NOT_FOUND','Spedition wurde nicht gefunden.');
    return carrier;
  });
}
async function createCarrier(tenantId,userId,input={}){
  const value=normalizeCarrier(input);
  try{
    return await withCarrierClient(tenantId,async client=>{
      const result=await client.query(`insert into carriers(tenant_id,name,active,abd_required_default,contact_name,email,phone,portal_url,updated_at)
        values($1,$2,true,$3,$4,$5,$6,$7,now())
        returning id,name,active,abd_required_default,contact_name,email,phone,portal_url,created_at,updated_at`,[
        tenantId,value.name,value.abdRequiredDefault,value.contactName,value.email,value.phone,value.portalUrl
      ]);
      const created=normalizeRow(result.rows[0]);
      await audit(client,tenantId,userId,'CARRIER_CREATED',created.id,{name:created.name,abdRequiredDefault:created.abdRequiredDefault});
      return created;
    },{write:true});
  }catch(err){throw mapDatabaseError(err);}
}
async function updateCarrier(tenantId,userId,carrierId,input={}){
  const value=normalizeCarrier(input);
  try{
    return await withCarrierClient(tenantId,async client=>{
      const result=await client.query(`update carriers set name=$3,abd_required_default=$4,contact_name=$5,email=$6,phone=$7,portal_url=$8,updated_at=now()
        where tenant_id=$1 and id=$2
        returning id,name,active,abd_required_default,contact_name,email,phone,portal_url,created_at,updated_at`,[
        tenantId,carrierId,value.name,value.abdRequiredDefault,value.contactName,value.email,value.phone,value.portalUrl
      ]);
      if(!result.rows?.[0])throw carrierError('CARRIER_NOT_FOUND','Spedition wurde nicht gefunden.');
      const updated=normalizeRow(result.rows[0]);
      await audit(client,tenantId,userId,'CARRIER_UPDATED',updated.id,{name:updated.name,abdRequiredDefault:updated.abdRequiredDefault});
      return updated;
    },{write:true});
  }catch(err){throw mapDatabaseError(err);}
}
async function setCarrierActive(tenantId,userId,carrierId,active){
  const next=active===true;
  return withCarrierClient(tenantId,async client=>{
    const result=await client.query(`update carriers set active=$3,updated_at=now() where tenant_id=$1 and id=$2
      returning id,name,active,abd_required_default,contact_name,email,phone,portal_url,created_at,updated_at`,[tenantId,carrierId,next]);
    if(!result.rows?.[0])throw carrierError('CARRIER_NOT_FOUND','Spedition wurde nicht gefunden.');
    const updated=normalizeRow(result.rows[0]);
    await audit(client,tenantId,userId,next?'CARRIER_ACTIVATED':'CARRIER_DEACTIVATED',updated.id,{name:updated.name});
    return updated;
  },{write:true});
}

module.exports={normalizeCarrier,listCarriers,getCarrier,createCarrier,updateCarrier,setCarrierActive,getCarrierInClient};
