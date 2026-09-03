const db=require('./database');
const validation=require('./masterdata-validation');

function filterStatus(value){
  const v=String(value||'').trim().toLowerCase();
  return v==='active'?true:(v==='inactive'?false:null);
}
function locationAddress(v){return `${v.street} ${v.houseNumber}, ${v.postalCode} ${v.city}`;}
function mapDatabaseError(err){
  if(err&&err.code==='23505'){
    const constraint=String(err.constraint||'');
    if(constraint.includes('customer_location_registration_emails')) return Object.assign(new Error('Anmelde-E-Mail-Adresse ist bereits hinterlegt.'),{code:'REGISTRATION_EMAIL_DUPLICATE'});
    if(constraint.includes('customers')) return Object.assign(new Error('Diese Kundennummer existiert bereits.'),{code:'CUSTOMER_EXISTS'});
  }
  return err;
}
async function audit(client,tenantId,userId,eventType,{entityType=null,entityId=null,metadata={}}={}){
  await client.query('insert into audit_events(tenant_id,user_id,event_type,entity_type,entity_id,metadata) values($1,$2,$3,$4,$5,$6::jsonb)',[tenantId,userId||null,eventType,entityType,entityId,JSON.stringify(metadata||{})]);
}
async function replaceRegistrationEmails(client,tenantId,locationId,emails){
  await client.query('delete from customer_location_registration_emails where tenant_id=$1 and location_id=$2',[tenantId,locationId]);
  for(const email of emails){
    await client.query('insert into customer_location_registration_emails(tenant_id,location_id,email) values($1,$2,$3)',[tenantId,locationId,email]);
  }
}
async function insertLocation(client,tenantId,customerId,v){
  const r=await client.query(`insert into customer_locations(
    tenant_id,customer_id,name,address,country,contact_name,email,phone,street,house_number,postal_code,city,country_iso,contact_email,carrier_name,shipping_instructions,active,updated_at
  ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true,now())
  returning id,customer_id,name,street,house_number,postal_code,city,country,country_iso,contact_name,contact_email,phone,carrier_name,shipping_instructions,active,created_at,updated_at`,[
    tenantId,customerId,v.name,locationAddress(v),v.country,v.contactName,v.contactEmail,v.phone,v.street,v.houseNumber,v.postalCode,v.city,v.countryIso,v.contactEmail,v.carrierName,v.shippingInstructions
  ]);
  const row=r.rows[0];
  await replaceRegistrationEmails(client,tenantId,row.id,v.registrationEmails);
  return {...row,registration_emails:[...v.registrationEmails]};
}
async function getLocationWithClient(client,tenantId,locationId){
  const r=await client.query(`select id,customer_id,name,street,house_number,postal_code,city,country,country_iso,contact_name,contact_email,phone,carrier_name,shipping_instructions,active,created_at,updated_at
    from customer_locations where tenant_id=$1 and id=$2 limit 1`,[tenantId,locationId]);
  const row=r.rows[0];if(!row) return null;
  const er=await client.query('select email from customer_location_registration_emails where tenant_id=$1 and location_id=$2 order by lower(email)',[tenantId,locationId]);
  return {...row,registration_emails:er.rows.map(x=>x.email)};
}
async function getCustomerWithClient(client,tenantId,customerId){
  const cr=await client.query('select id,account,name,active,created_at,updated_at from customers where tenant_id=$1 and id=$2 limit 1',[tenantId,customerId]);
  const customer=cr.rows[0];if(!customer) return null;
  const lr=await client.query(`select id,customer_id,name,street,house_number,postal_code,city,country,country_iso,contact_name,contact_email,phone,carrier_name,shipping_instructions,active,created_at,updated_at
    from customer_locations where tenant_id=$1 and customer_id=$2 order by lower(name),created_at`,[tenantId,customerId]);
  const locations=lr.rows;
  if(locations.length){
    const ids=locations.map(x=>x.id);
    const er=await client.query('select location_id,email from customer_location_registration_emails where tenant_id=$1 and location_id=any($2::uuid[]) order by lower(email)',[tenantId,ids]);
    const byLocation=new Map();
    for(const e of er.rows){if(!byLocation.has(e.location_id))byLocation.set(e.location_id,[]);byLocation.get(e.location_id).push(e.email);}
    for(const location of locations) location.registration_emails=byLocation.get(location.id)||[];
  }
  return {...customer,locations};
}

async function listCustomers(tenantId,{query='',status='all'}={}){
  const q=String(query||'').trim(),active=filterStatus(status);
  return db.withTenantMasterdataClient(tenantId,async client=>{
    const params=[tenantId],where=['c.tenant_id=$1'];
    if(q){params.push(q);const p='$'+params.length;where.push(`(c.account ilike '%'||${p}||'%' or c.name ilike '%'||${p}||'%')`);}
    if(active!==null){params.push(active);where.push(`c.active=$${params.length}`);}
    const r=await client.query(`select c.id,c.account,c.name,c.active,c.created_at,c.updated_at,count(l.id)::int as location_count
      from customers c left join customer_locations l on l.tenant_id=c.tenant_id and l.customer_id=c.id
      where ${where.join(' and ')} group by c.id,c.account,c.name,c.active,c.created_at,c.updated_at
      order by lower(c.name),lower(coalesce(c.account,''))`,params);
    return r.rows;
  });
}
async function getCustomer(tenantId,customerId){
  return db.withTenantMasterdataClient(tenantId,async client=>{
    const value=await getCustomerWithClient(client,tenantId,customerId);
    if(!value) throw Object.assign(new Error('Kunde wurde nicht gefunden.'),{code:'CUSTOMER_NOT_FOUND'});
    return value;
  });
}
async function createCustomer(tenantId,actorUserId,input={}){
  const customer=validation.cleanCustomer(input);
  if(!input.location||typeof input.location!=='object') throw Object.assign(new Error('Beim Anlegen eines Kunden ist mindestens ein Standort erforderlich.'),{code:'LOCATION_REQUIRED'});
  const location=validation.cleanLocation(input.location);
  try{
    return await db.withTenantMasterdataClient(tenantId,async client=>{
      const cr=await client.query('insert into customers(tenant_id,account,name,active,updated_at) values($1,$2,$3,true,now()) returning id,account,name,active,created_at,updated_at',[tenantId,customer.account,customer.name]);
      const created=cr.rows[0];
      const loc=await insertLocation(client,tenantId,created.id,location);
      await audit(client,tenantId,actorUserId,'CUSTOMER_CREATED',{entityType:'CUSTOMER',entityId:created.id,metadata:{account:created.account}});
      await audit(client,tenantId,actorUserId,'LOCATION_CREATED',{entityType:'LOCATION',entityId:loc.id,metadata:{customerId:created.id,registrationEmailCount:location.registrationEmails.length}});
      await audit(client,tenantId,actorUserId,'LOCATION_REGISTRATION_EMAILS_CHANGED',{entityType:'LOCATION',entityId:loc.id,metadata:{count:location.registrationEmails.length}});
      return getCustomerWithClient(client,tenantId,created.id);
    },{write:true});
  }catch(err){throw mapDatabaseError(err);}
}
async function updateCustomer(tenantId,actorUserId,customerId,input={}){
  const customer=validation.cleanCustomer(input);
  try{
    return await db.withTenantMasterdataClient(tenantId,async client=>{
      const r=await client.query('update customers set account=$3,name=$4,updated_at=now() where tenant_id=$1 and id=$2 returning id,account,name,active,created_at,updated_at',[tenantId,customerId,customer.account,customer.name]);
      if(!r.rowCount) throw Object.assign(new Error('Kunde wurde nicht gefunden.'),{code:'CUSTOMER_NOT_FOUND'});
      await audit(client,tenantId,actorUserId,'CUSTOMER_UPDATED',{entityType:'CUSTOMER',entityId:customerId,metadata:{account:customer.account}});
      return getCustomerWithClient(client,tenantId,customerId);
    },{write:true});
  }catch(err){throw mapDatabaseError(err);}
}
async function setCustomerActive(tenantId,actorUserId,customerId,active){
  const next=active===true;
  return db.withTenantMasterdataClient(tenantId,async client=>{
    const r=await client.query('update customers set active=$3,updated_at=now() where tenant_id=$1 and id=$2 returning id,account,name,active,created_at,updated_at',[tenantId,customerId,next]);
    if(!r.rowCount) throw Object.assign(new Error('Kunde wurde nicht gefunden.'),{code:'CUSTOMER_NOT_FOUND'});
    await audit(client,tenantId,actorUserId,next?'CUSTOMER_ACTIVATED':'CUSTOMER_DEACTIVATED',{entityType:'CUSTOMER',entityId:customerId});
    return r.rows[0];
  },{write:true});
}
async function createLocation(tenantId,actorUserId,customerId,input={}){
  const location=validation.cleanLocation(input);
  try{
    return await db.withTenantMasterdataClient(tenantId,async client=>{
      const customer=await client.query('select id from customers where tenant_id=$1 and id=$2 limit 1',[tenantId,customerId]);
      if(!customer.rowCount) throw Object.assign(new Error('Kunde wurde nicht gefunden.'),{code:'CUSTOMER_NOT_FOUND'});
      const loc=await insertLocation(client,tenantId,customerId,location);
      await audit(client,tenantId,actorUserId,'LOCATION_CREATED',{entityType:'LOCATION',entityId:loc.id,metadata:{customerId,registrationEmailCount:location.registrationEmails.length}});
      await audit(client,tenantId,actorUserId,'LOCATION_REGISTRATION_EMAILS_CHANGED',{entityType:'LOCATION',entityId:loc.id,metadata:{count:location.registrationEmails.length}});
      return loc;
    },{write:true});
  }catch(err){throw mapDatabaseError(err);}
}
async function updateLocation(tenantId,actorUserId,locationId,input={}){
  const location=validation.cleanLocation(input);
  try{
    return await db.withTenantMasterdataClient(tenantId,async client=>{
      const current=await client.query('select id,customer_id from customer_locations where tenant_id=$1 and id=$2 limit 1',[tenantId,locationId]);
      if(!current.rowCount) throw Object.assign(new Error('Standort wurde nicht gefunden.'),{code:'LOCATION_NOT_FOUND'});
      const customerId=current.rows[0].customer_id;
      const r=await client.query(`update customer_locations set name=$3,address=$4,country=$5,contact_name=$6,email=$7,phone=$8,street=$9,house_number=$10,postal_code=$11,city=$12,country_iso=$13,contact_email=$14,carrier_name=$15,shipping_instructions=$16,updated_at=now()
        where tenant_id=$1 and id=$2 returning id,customer_id,name,street,house_number,postal_code,city,country,country_iso,contact_name,contact_email,phone,carrier_name,shipping_instructions,active,created_at,updated_at`,[
        tenantId,locationId,location.name,locationAddress(location),location.country,location.contactName,location.contactEmail,location.phone,location.street,location.houseNumber,location.postalCode,location.city,location.countryIso,location.contactEmail,location.carrierName,location.shippingInstructions
      ]);
      await replaceRegistrationEmails(client,tenantId,locationId,location.registrationEmails);
      await audit(client,tenantId,actorUserId,'LOCATION_UPDATED',{entityType:'LOCATION',entityId:locationId,metadata:{customerId,registrationEmailCount:location.registrationEmails.length}});
      await audit(client,tenantId,actorUserId,'LOCATION_REGISTRATION_EMAILS_CHANGED',{entityType:'LOCATION',entityId:locationId,metadata:{count:location.registrationEmails.length}});
      return {...r.rows[0],registration_emails:[...location.registrationEmails]};
    },{write:true});
  }catch(err){throw mapDatabaseError(err);}
}
async function setLocationActive(tenantId,actorUserId,locationId,active){
  const next=active===true;
  return db.withTenantMasterdataClient(tenantId,async client=>{
    const r=await client.query('update customer_locations set active=$3,updated_at=now() where tenant_id=$1 and id=$2 returning id,customer_id,name,active,updated_at',[tenantId,locationId,next]);
    if(!r.rowCount) throw Object.assign(new Error('Standort wurde nicht gefunden.'),{code:'LOCATION_NOT_FOUND'});
    await audit(client,tenantId,actorUserId,next?'LOCATION_ACTIVATED':'LOCATION_DEACTIVATED',{entityType:'LOCATION',entityId:locationId,metadata:{customerId:r.rows[0].customer_id}});
    return r.rows[0];
  },{write:true});
}
async function listLocations(tenantId,{query='',status='all'}={}){
  const q=String(query||'').trim(),active=filterStatus(status);
  return db.withTenantMasterdataClient(tenantId,async client=>{
    const params=[tenantId],where=['l.tenant_id=$1'];
    if(q){params.push(q);const p='$'+params.length;where.push(`(l.name ilike '%'||${p}||'%' or l.city ilike '%'||${p}||'%' or l.country ilike '%'||${p}||'%' or c.name ilike '%'||${p}||'%' or c.account ilike '%'||${p}||'%')`);}
    if(active!==null){params.push(active);where.push(`l.active=$${params.length}`);}
    const r=await client.query(`select l.id,l.customer_id,l.name,l.street,l.house_number,l.postal_code,l.city,l.country,l.country_iso,l.carrier_name,l.active,l.updated_at,
      c.account as customer_account,c.name as customer_name,c.active as customer_active
      from customer_locations l join customers c on c.tenant_id=l.tenant_id and c.id=l.customer_id
      where ${where.join(' and ')} order by lower(c.name),lower(l.name)`,params);
    return r.rows;
  });
}

module.exports={listCustomers,getCustomer,createCustomer,updateCustomer,setCustomerActive,createLocation,updateLocation,setLocationActive,listLocations};
