import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const authz=require('../api/shared/authorization.js');

test('customer master-data permissions match approved roles',()=>{
  for(const role of ['TENANT_ADMIN','EXPORT_ADMIN','TEAM_LEAD','OPERATOR']){
    assert.equal(authz.hasPermission(role,'customers.read'),true,`${role} must read customers`);
    assert.equal(authz.hasPermission(role,'customers.write'),true,`${role} must write customers`);
  }
  for(const role of ['WAREHOUSE','AUDITOR']){
    assert.equal(authz.hasPermission(role,'customers.read'),true,`${role} must read customers`);
    assert.equal(authz.hasPermission(role,'customers.write'),false,`${role} must not write customers`);
  }
});

test('master-data writes use a separate environment gate',()=>{
  const src=fs.readFileSync(new URL('../api/shared/database.js',import.meta.url),'utf8');
  assert.match(src,/PROFESSIONAL_ENABLE_MASTERDATA_WRITES/);
  assert.match(src,/function masterdataWritesEnabled/);
  assert.match(src,/withTenantMasterdataClient/);
  assert.match(src,/MASTERDATA_WRITES_DISABLED/);
  assert.doesNotMatch(src,/function masterdataWritesEnabled\([^)]*\)\s*\{[^}]*PROFESSIONAL_ENABLE_WRITES/s);
});

test('database status exposes only the master-data gate boolean',()=>{
  const src=fs.readFileSync(new URL('../api/shared/database.js',import.meta.url),'utf8');
  assert.match(src,/masterdataWritesEnabled:masterdataWritesEnabled\(\)/);
  const meta=fs.readFileSync(new URL('../api/professional-meta/index.js',import.meta.url),'utf8');
  assert.match(meta,/database:db\.status\(\)/);
  assert.doesNotMatch(meta,/PROFESSIONAL_ENABLE_MASTERDATA_WRITES/);
});

test('master-data errors have deterministic HTTP mappings',()=>{
  const src=fs.readFileSync(new URL('../api/shared/http.js',import.meta.url),'utf8');
  assert.match(src,/MASTERDATA_WRITES_DISABLED:503/);
  assert.match(src,/CUSTOMER_EXISTS:409/);
  assert.match(src,/CUSTOMER_NOT_FOUND:404/);
  assert.match(src,/LOCATION_NOT_FOUND:404/);
  assert.match(src,/LOCATION_REQUIRED:400/);
  assert.match(src,/REGISTRATION_EMAIL_REQUIRED:400/);
  assert.match(src,/REGISTRATION_EMAIL_DUPLICATE:409/);
});

test('schema upgrades customers and locations without removing legacy fields',()=>{
  const sql=fs.readFileSync(new URL('../schema/postgres.sql',import.meta.url),'utf8');
  assert.match(sql,/alter table customers add column if not exists active boolean not null default true/i);
  assert.match(sql,/alter table customers add column if not exists updated_at timestamptz not null default now\(\)/i);
  for(const column of ['street','house_number','postal_code','city','country_iso','contact_email','carrier_name','shipping_instructions']){
    assert.match(sql,new RegExp(`alter table customer_locations add column if not exists ${column} text`,'i'));
  }
  assert.match(sql,/alter table customer_locations add column if not exists active boolean not null default true/i);
  assert.match(sql,/alter table customer_locations add column if not exists updated_at timestamptz not null default now\(\)/i);
  assert.match(sql,/\baddress text\b/i);
  assert.match(sql,/\bemail text\b/i);
  assert.match(sql,/derived_main boolean/i);
});

test('schema stores registration emails relationally with tenant isolation',()=>{
  const sql=fs.readFileSync(new URL('../schema/postgres.sql',import.meta.url),'utf8');
  assert.match(sql,/create table if not exists customer_location_registration_emails/i);
  assert.match(sql,/foreign key\s*\(tenant_id\s*,\s*location_id\)[\s\S]*references customer_locations\s*\(tenant_id\s*,\s*id\)/i);
  assert.match(sql,/customer_location_registration_emails_uq[\s\S]*lower\(email\)/i);
  assert.match(sql,/array\[[^\]]*'customer_location_registration_emails'/s);
  assert.match(sql,/customers_tenant_id_id_uq/i);
  assert.match(sql,/customer_locations_tenant_id_id_uq/i);
});

test('customer validation trims required account and company name',()=>{
  const validation=require('../api/shared/masterdata-validation.js');
  assert.deepEqual(validation.cleanCustomer({account:' 100471 ',name:' Beispiel GmbH '}),{account:'100471',name:'Beispiel GmbH'});
  assert.throws(()=>validation.cleanCustomer({account:'',name:'Beispiel GmbH'}),e=>e.code==='INPUT_INVALID');
  assert.throws(()=>validation.cleanCustomer({account:'100471',name:' '}),e=>e.code==='INPUT_INVALID');
});

test('location validation normalizes address, optional fields and registration emails',()=>{
  const validation=require('../api/shared/masterdata-validation.js');
  const value=validation.cleanLocation({
    name:' Werk Nettetal ',street:' An der Straße ',houseNumber:' 12a ',postalCode:' 41334 ',city:' Nettetal ',country:' Deutschland ',countryIso:' de ',
    contactName:' Max Mustermann ',contactEmail:' Kontakt@Example.DE ',phone:' 02153 123 ',carrierName:' Dachser ',shippingInstructions:' Anmeldung vor Abholung ',
    registrationEmails:[' AVIS@EXAMPLE.DE ','avis@example.de',' lager@example.de ']
  });
  assert.deepEqual(value,{
    name:'Werk Nettetal',street:'An der Straße',houseNumber:'12a',postalCode:'41334',city:'Nettetal',country:'Deutschland',countryIso:'DE',
    contactName:'Max Mustermann',contactEmail:'kontakt@example.de',phone:'02153 123',carrierName:'Dachser',shippingInstructions:'Anmeldung vor Abholung',
    registrationEmails:['avis@example.de','lager@example.de']
  });
});

test('location validation requires full address and at least one valid registration email',()=>{
  const validation=require('../api/shared/masterdata-validation.js');
  const complete={name:'Werk',street:'Straße',houseNumber:'1',postalCode:'41334',city:'Nettetal',country:'Deutschland'};
  assert.throws(()=>validation.cleanLocation({...complete,registrationEmails:[]}),e=>e.code==='REGISTRATION_EMAIL_REQUIRED');
  assert.throws(()=>validation.cleanLocation({...complete,registrationEmails:['keine-mail']}),e=>e.code==='EMAIL_INVALID');
  assert.throws(()=>validation.cleanLocation({...complete,street:'',registrationEmails:['avis@example.de']}),e=>e.code==='INPUT_INVALID');
});

test('masterdata store owns tenant-scoped persistence, audit and soft status changes',()=>{
  const src=fs.readFileSync(new URL('../api/shared/masterdata-store.js',import.meta.url),'utf8');
  for(const fn of ['listCustomers','getCustomer','createCustomer','updateCustomer','setCustomerActive','createLocation','updateLocation','setLocationActive','listLocations']) assert.match(src,new RegExp(`function ${fn}|async function ${fn}`));
  assert.match(src,/withTenantMasterdataClient/);
  assert.match(src,/\{write:true\}/);
  assert.match(src,/insert into customers/i);
  assert.match(src,/insert into customer_locations/i);
  assert.match(src,/insert into customer_location_registration_emails/i);
  for(const event of ['CUSTOMER_CREATED','CUSTOMER_UPDATED','CUSTOMER_ACTIVATED','CUSTOMER_DEACTIVATED','LOCATION_CREATED','LOCATION_UPDATED','LOCATION_ACTIVATED','LOCATION_DEACTIVATED','LOCATION_REGISTRATION_EMAILS_CHANGED']) assert.match(src,new RegExp(event));
  assert.doesNotMatch(src,/delete from customers/i);
  assert.doesNotMatch(src,/delete from customer_locations\b/i);
  assert.match(src,/where tenant_id=\$1/i);
});

test('masterdata Azure Functions expose the exact approved routes and methods',()=>{
  const expected={
    'masterdata-customers':{route:'professional-masterdata/customers',methods:['get','post']},
    'masterdata-customer':{route:'professional-masterdata/customers/{customerId}',methods:['get','post']},
    'masterdata-customer-status':{route:'professional-masterdata/customers/{customerId}/status',methods:['post']},
    'masterdata-customer-locations':{route:'professional-masterdata/customers/{customerId}/locations',methods:['post']},
    'masterdata-location':{route:'professional-masterdata/locations/{locationId}',methods:['post']},
    'masterdata-location-status':{route:'professional-masterdata/locations/{locationId}/status',methods:['post']},
    'masterdata-locations':{route:'professional-masterdata/locations',methods:['get']}
  };
  for(const [folder,want] of Object.entries(expected)){
    const fn=JSON.parse(fs.readFileSync(new URL(`../api/${folder}/function.json`,import.meta.url),'utf8'));
    const trigger=fn.bindings.find(b=>b.type==='httpTrigger');
    assert.equal(trigger.route,want.route,folder);
    assert.deepEqual(trigger.methods,want.methods,folder);
    assert.equal(trigger.authLevel,'anonymous',folder);
  }
});

test('masterdata read and mutation routes enforce permission and CSRF server-side',()=>{
  const mixed=['masterdata-customers','masterdata-customer'];
  for(const folder of mixed){
    const src=fs.readFileSync(new URL(`../api/${folder}/index.js`,import.meta.url),'utf8');
    assert.match(src,/permission:'customers\.read'/,`${folder} read permission`);
    assert.match(src,/permission:'customers\.write',csrf:true/,`${folder} write permission and csrf`);
  }
  for(const folder of ['masterdata-customer-status','masterdata-customer-locations','masterdata-location','masterdata-location-status']){
    const src=fs.readFileSync(new URL(`../api/${folder}/index.js`,import.meta.url),'utf8');
    assert.match(src,/permission:'customers\.write',csrf:true/,folder);
  }
  const list=fs.readFileSync(new URL('../api/masterdata-locations/index.js',import.meta.url),'utf8');
  assert.match(list,/permission:'customers\.read'/);
  assert.doesNotMatch(list,/customers\.write/);
});
