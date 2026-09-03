'use strict';

const db=require('./database');
const readModel=require('./shipment-read-model');

function q(value){return value==null?'':String(value).trim();}
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
  const id=q(shipmentId);if(!id)throw Object.assign(new Error('Sendungs-ID fehlt.'),{code:'SHIPMENT_NOT_FOUND'});
  return db.withTenantShipmentClient(tenantId,async client=>{
    const result=await client.query(`${BASE_SELECT} where s.tenant_id=$1 and s.id=$2 and s.discarded_at is null limit 1`,[String(tenantId),id]);
    const row=result.rows?.[0];
    if(!row)throw Object.assign(new Error('Sendung wurde nicht gefunden.'),{code:'SHIPMENT_NOT_FOUND'});
    return readModel.normalizeShipmentRow(row);
  });
}

async function getShipmentDashboard(tenantId,{localDate,timeZone='UTC',now=new Date()}={}){
  const date=q(localDate)||localDateInZone(timeZone,now);
  const shipments=await listShipments(tenantId,{status:'all'});
  return readModel.buildShipmentDashboard(shipments,{localDate:date,timeZone});
}

module.exports={listShipments,getShipment,getShipmentDashboard,localDateInZone};
