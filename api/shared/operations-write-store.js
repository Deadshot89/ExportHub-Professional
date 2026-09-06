const db=require('./database');

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function normalized(value){return String(value||'').trim();}
function invalid(message){throw Object.assign(new Error(message),{code:'INPUT_INVALID'});}
function requiredUuid(value,label){const id=normalized(value);if(!id||!UUID.test(id))invalid(`${label} ist ungültig.`);return id;}
function writeTenant(tenantId,fn){return db.withTenantClient(tenantId,fn,{write:true});}

function validateShipmentCreateInput(value={}){
  const reference=normalized(value.reference);
  if(!/^[A-Z0-9]{6}$/.test(reference))invalid('Referenz muss exakt 6 Zeichen aus A-Z und 0-9 enthalten.');
  const customerId=requiredUuid(value.customerId,'Kunde');
  const locationId=requiredUuid(value.locationId,'Standort');
  return {reference,customerId,locationId};
}

async function createShipment(tenantId,value={}){
  const shipment=validateShipmentCreateInput(value);
  return writeTenant(tenantId,async client=>{
    const relation=await client.query(`
      select c.id as customer_id,l.id as location_id
        from customers c
        join customer_locations l on l.customer_id=c.id and l.tenant_id=c.tenant_id
       where c.id=$1 and l.id=$2
         and c.tenant_id=current_setting('app.tenant_id',true)::uuid
         and l.tenant_id=current_setting('app.tenant_id',true)::uuid
         and c.active is not false and l.active is not false
       limit 1`,[shipment.customerId,shipment.locationId]);
    if(!relation.rows[0])throw Object.assign(new Error('Kunde und Standort gehören nicht zusammen oder sind nicht aktiv.'),{code:'LOCATION_NOT_FOUND'});
    try{
      const result=await client.query(`
        insert into shipments(tenant_id,customer_id,location_id,reference,status,source_status,process_status,pod_evidence,locked,created_at)
        values(current_setting('app.tenant_id',true)::uuid,$1,$2,$3,'Entwurf','LIVE_CREATED','Entwurf',false,false,now())
        returning id,customer_id,location_id,reference,status,source_status,process_status,pod_evidence,locked,lock_reason,picked_up_at,actual_pickup_date,created_at`,
        [shipment.customerId,shipment.locationId,shipment.reference]);
      return result.rows[0];
    }catch(err){
      if(err?.code==='23505')throw Object.assign(new Error('Diese Sendungsreferenz existiert bereits.'),{code:'SHIPMENT_EXISTS'});
      throw err;
    }
  });
}

module.exports={validateShipmentCreateInput,createShipment};
