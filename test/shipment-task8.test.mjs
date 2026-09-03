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
  const liveSchema=read('api/shared/masterdata-schema.js');
  const canonical=read('schema/postgres.sql');
  for(const src of [liveSchema,canonical]){
    assert.match(src,/customer_locations add column if not exists carrier_id uuid/i);
    assert.match(src,/customer_locations_tenant_carrier_fk/i);
    assert.match(src,/foreign key\s*\(tenant_id\s*,\s*carrier_id\)[\s\S]*references carriers\s*\(tenant_id\s*,\s*id\)/i);
    assert.match(src,/carrier_name text/i);
  }
});
