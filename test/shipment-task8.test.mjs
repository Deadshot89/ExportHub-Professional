import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const root=new URL('../',import.meta.url);
const pathOf=path=>new URL(path,root);
const exists=path=>fs.existsSync(pathOf(path));
const read=path=>fs.readFileSync(pathOf(path),'utf8');
const authz=require('../api/shared/authorization.js');
const tenant='11111111-1111-4111-8111-111111111111';
const user='22222222-2222-4222-8222-222222222222';
const shipmentId='33333333-3333-4333-8333-333333333333';
const carrierId='44444444-4444-4444-8444-444444444444';
const customerId='55555555-5555-4555-8555-555555555555';
const locationId='66666666-6666-4666-8666-666666666666';

test('carrier permissions are read-wide and operational-write only',()=>{
  for(const role of ['TENANT_ADMIN','EXPORT_ADMIN','TEAM_LEAD','OPERATOR']){
    assert.equal(authz.hasPermission(role,'carriers.read'),true,`${role} read`);
    assert.equal(authz.hasPermission(role,'carriers.write'),true,`${role} write`);
  }
  for(const role of ['WAREHOUSE','AUDITOR']){
    assert.equal(authz.hasPermission(role,'carriers.read'),true,`${role} read`);
    assert.equal(authz.hasPermission(role,'carriers.write'),false,`${role} write`);
  }
});

test('carrier store exposes the approved fields and normalizes carrier input',()=>{
  assert.equal(exists('api/shared/carrier-store.js'),true,'carrier-store.js fehlt');
  const carriers=require('../api/shared/carrier-store.js');
  const value=carriers.normalizeCarrier({
    name:' Dachser ',abdRequiredDefault:true,contactName:' Max Mustermann ',email:' DISP@EXAMPLE.DE ',phone:' 02153 123 ',portalUrl:' https://example.com/portal '
  });
  assert.deepEqual(value,{
    name:'Dachser',abdRequiredDefault:true,contactName:'Max Mustermann',email:'disp@example.de',phone:'02153 123',portalUrl:'https://example.com/portal'
  });
  assert.throws(()=>carriers.normalizeCarrier({name:'',abdRequiredDefault:false}),e=>e.code==='INPUT_INVALID');
  assert.throws(()=>carriers.normalizeCarrier({name:'Dachser',email:'keine-mail'}),e=>e.code==='EMAIL_INVALID');
  assert.throws(()=>carriers.normalizeCarrier({name:'Dachser',portalUrl:'javascript:alert(1)'}),e=>e.code==='INPUT_INVALID');
});

test('carrier persistence uses masterdata gate, shipment schema, audit and soft status only',()=>{
  assert.equal(exists('api/shared/carrier-store.js'),true,'carrier-store.js fehlt');
  const src=read('api/shared/carrier-store.js');
  for(const fn of ['normalizeCarrier','listCarriers','getCarrier','createCarrier','updateCarrier','setCarrierActive'])assert.match(src,new RegExp(`function ${fn}|async function ${fn}`),fn);
  assert.match(src,/ensureShipmentSchema/);
  assert.match(src,/withTenantMasterdataClient/);
  assert.match(src,/CARRIER_CREATED/);
  assert.match(src,/CARRIER_UPDATED/);
  assert.match(src,/CARRIER_(?:ACTIVATED|DEACTIVATED)/);
  assert.doesNotMatch(src,/delete from carriers/i);
});

test('carrier APIs expose tenant-scoped read write and status routes with CSRF mutations',()=>{
  const expected={
    carriers:{route:'professional-masterdata/carriers',methods:['get','post']},
    carrier:{route:'professional-masterdata/carriers/{carrierId}',methods:['get','post']},
    'carrier-status':{route:'professional-masterdata/carriers/{carrierId}/status',methods:['post']}
  };
  for(const [folder,want] of Object.entries(expected)){
    assert.equal(exists(`api/${folder}/function.json`),true,`${folder}/function.json fehlt`);
    assert.equal(exists(`api/${folder}/index.js`),true,`${folder}/index.js fehlt`);
    const fn=JSON.parse(read(`api/${folder}/function.json`));
    const trigger=fn.bindings.find(binding=>binding.type==='httpTrigger');
    assert.equal(trigger.route,want.route,folder);
    assert.deepEqual(trigger.methods,want.methods,folder);
    const src=read(`api/${folder}/index.js`);
    assert.match(src,/session\.tenant_id/,folder);
    assert.doesNotMatch(src,/body\.tenant|query\.tenant|tenantId\s*=\s*.*body/i,folder);
    if(want.methods.includes('get'))assert.match(src,/permission:'carriers\.read'/,folder);
    if(want.methods.includes('post'))assert.match(src,/permission:'carriers\.write',csrf:true/,folder);
  }
});

test('locations can reference a tenant-safe carrier id while legacy carrier_name remains readable',()=>{
  const masterdataSchema=read('api/shared/masterdata-schema.js');
  const shipmentSchema=read('api/shared/shipment-schema.js');
  const canonical=read('schema/postgres.sql');
  assert.match(masterdataSchema,/customer_locations add column if not exists carrier_id uuid/i);
  assert.match(masterdataSchema,/carrier_name text/i);
  for(const src of [shipmentSchema,canonical]){
    assert.match(src,/customer_locations_tenant_carrier_fk/i);
    assert.match(src,/foreign key\s*\(tenant_id\s*,\s*carrier_id\)[\s\S]*references carriers\s*\(tenant_id\s*,\s*id\)/i);
  }
  assert.match(canonical,/customer_locations add column if not exists carrier_id uuid/i);
  assert.match(canonical,/carrier_name text/i);
});

test('special one-off location validation may omit registration email while normal location validation stays strict',()=>{
  const validation=require('../api/shared/masterdata-validation.js');
  const input={name:'Werk Venlo',street:'Industrieweg',houseNumber:'7',postalCode:'5911 AA',city:'Venlo',country:'Niederlande',countryIso:'NL',carrierId};
  assert.throws(()=>validation.cleanLocation({...input,registrationEmails:[]}),e=>e.code==='REGISTRATION_EMAIL_REQUIRED');
  assert.equal(typeof validation.cleanOneOffLocation,'function');
  assert.deepEqual(validation.cleanOneOffLocation(input),{
    name:'Werk Venlo',street:'Industrieweg',houseNumber:'7',postalCode:'5911 AA',city:'Venlo',country:'Niederlande',countryIso:'NL',
    contactName:null,contactEmail:null,phone:null,carrierId,carrierName:null,shippingInstructions:null,registrationEmails:[]
  });
});

test('cross-domain conversion helper requires both write gates and initializes both schemas in safe order',()=>{
  const src=read('api/shared/database.js');
  assert.match(src,/function withTenantShipmentMasterdataClient|async function withTenantShipmentMasterdataClient/);
  const start=src.indexOf('async function withTenantShipmentMasterdataClient');
  assert.ok(start>=0);
  const section=src.slice(start,start+1700);
  assert.match(section,/masterdataWritesEnabled\(\)/);
  assert.match(section,/shipmentWritesEnabled\(\)/);
  assert.ok(section.indexOf('ensureMasterdataSchema()')<section.indexOf('ensureShipmentSchema()'),'masterdata schema must initialize before carrier FK shipment schema');
  assert.match(section,/set_config\('app\.tenant_id'/);
  assert.match(src,/withTenantShipmentMasterdataClient/);
});

test('customer candidate search detects exact account and returns similar customer names tenant scoped',async()=>{
  const masterdata=require('../api/shared/masterdata-store.js');
  assert.equal(typeof masterdata.findOneOffCustomerCandidatesInClient,'function');
  const calls=[];
  const client={query:async(sql,params)=>{
    calls.push({sql:String(sql),params});
    return {rows:[
      {id:customerId,account:'100471',name:'Beispiel Logistics GmbH',active:true},
      {id:'77777777-7777-4777-8777-777777777777',account:'900001',name:'Beispiel Logistik BV',active:true}
    ]};
  }};
  const result=await masterdata.findOneOffCustomerCandidatesInClient(client,tenant,{account:'100471',name:'Beispiel Logistics'});
  assert.equal(result.exactAccount.id,customerId);
  assert.equal(result.similar.length,1);
  assert.equal(result.similar[0].name,'Beispiel Logistik BV');
  assert.ok(calls.every(call=>call.params?.[0]===tenant));
  assert.match(calls[0].sql,/tenant_id=\$1/i);
});

test('server-owned carrier selection copies carrier snapshot but allows shipment-specific ABD override',async()=>{
  const store=require('../api/shared/shipment-store.js');
  assert.equal(typeof store.setShipmentCarrierInClient,'function');
  const shipment={id:shipmentId,tenant_id:tenant,reference:'CAR001',source_kind:'LIVE',status:'Entwurf',revision:4,recipient_snapshot:{companyName:'Empfänger'},carrier_snapshot:{},rework:{}};
  let savedSnapshot=null;
  const client={query:async(sql,params=[])=>{
    const q=String(sql).toLowerCase();
    if(q.includes('from shipments')&&q.includes('for update'))return {rows:[shipment]};
    if(q.includes('from shipment_edit_locks'))return {rows:[{lock_token:'lock'}]};
    if(q.includes('from carriers'))return {rows:[{id:carrierId,name:'Dachser',active:true,abd_required_default:true,contact_name:'Disposition',email:'disp@example.de',phone:'123',portal_url:'https://example.com'}]};
    if(q.startsWith('update shipments')&&q.includes('carrier_snapshot')){
      savedSnapshot=JSON.parse(params.find(value=>typeof value==='string'&&value.startsWith('{')));
      return {rows:[{...shipment,revision:5,carrier_snapshot:savedSnapshot}]};
    }
    if(q.startsWith('update shipment_edit_locks')||q.includes('insert into audit_events'))return {rows:[]};
    throw new Error(`Unexpected SQL: ${sql}`);
  }};
  const result=await store.setShipmentCarrierInClient(client,tenant,shipmentId,user,{lockToken:'lock',revision:4,carrierId,carrierRequiresAbd:false});
  assert.equal(savedSnapshot.carrierId,carrierId);
  assert.equal(savedSnapshot.name,'Dachser');
  assert.equal(savedSnapshot.abdRequiredDefault,true);
  assert.equal(savedSnapshot.carrierRequiresAbd,false);
  assert.equal(result.carrierSnapshot.carrierRequiresAbd,false);
  assert.equal(result.revision,5);
});

test('one-off conversion creates incomplete masterdata atomically, links ids and preserves original recipient snapshot',async()=>{
  const store=require('../api/shared/shipment-store.js');
  assert.equal(typeof store.convertOneOffRecipientInClient,'function');
  const recipient={companyName:'One Off BV',street:'Havenstraat',houseNumber:'9',postalCode:'5911 AA',city:'Venlo',country:'Niederlande',countryIso:'NL',registrationEmails:[]};
  const shipment={id:shipmentId,tenant_id:tenant,reference:'ONE001',source_kind:'LIVE',status:'Entwurf',revision:2,recipient_snapshot:recipient,carrier_snapshot:{},rework:{}};
  let sourceMetadata=null,shipmentRecipientAfter=null;
  const client={query:async(sql,params=[])=>{
    const q=String(sql).toLowerCase();
    if(q.includes('from shipments')&&q.includes('for update'))return {rows:[shipment]};
    if(q.includes('from shipment_edit_locks'))return {rows:[{lock_token:'lock'}]};
    if(q.includes('from customers')&&(q.includes('lower(account)')||q.includes('lower(coalesce(account')))return {rows:[]};
    if(q.startsWith('insert into customers'))return {rows:[{id:customerId,account:'N1001',name:'One Off BV',active:true}]};
    if(q.startsWith('insert into customer_locations')){
      const json=params.find(value=>typeof value==='string'&&value.includes('masterdataIncomplete'));
      sourceMetadata=JSON.parse(json);
      return {rows:[{id:locationId,customer_id:customerId,name:'One Off BV',source_metadata:sourceMetadata}]};
    }
    if(q.startsWith('insert into customer_location_registration_emails'))throw new Error('must not insert empty registration email');
    if(q.startsWith('update shipments')&&q.includes('customer_id')&&q.includes('location_id')){
      shipmentRecipientAfter=shipment.recipient_snapshot;
      return {rows:[{...shipment,revision:3,customer_id:customerId,location_id:locationId,recipient_snapshot:shipmentRecipientAfter}]};
    }
    if(q.startsWith('update shipment_edit_locks')||q.includes('insert into audit_events'))return {rows:[]};
    throw new Error(`Unexpected SQL: ${sql}`);
  }};
  const result=await store.convertOneOffRecipientInClient(client,tenant,shipmentId,user,{lockToken:'lock',revision:2,customerAccount:'N1001',mode:'new-customer'});
  assert.equal(sourceMetadata.masterdataIncomplete,true);
  assert.equal(result.customerId,customerId);
  assert.equal(result.locationId,locationId);
  assert.deepEqual(result.recipientSnapshot,recipient);
  assert.deepEqual(shipmentRecipientAfter,recipient);
});

test('one-off conversion blocks duplicate customer account and shipment API dispatches only server-owned conversion inputs',()=>{
  const storeSrc=read('api/shared/shipment-store.js');
  const api=read('api/shipment/index.js');
  assert.match(storeSrc,/CUSTOMER_EXISTS/);
  assert.match(api,/convert-one-off-recipient/);
  assert.match(api,/set-carrier/);
  assert.match(api,/preview-one-off-recipient/);
  assert.match(api,/customerAccount/);
  assert.match(api,/customerId/);
  assert.match(api,/carrierId/);
  assert.doesNotMatch(api,/convertOneOffRecipient[\s\S]{0,500}recipientSnapshot\s*:/);
});
