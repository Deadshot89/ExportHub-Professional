import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('shipment Azure Functions expose the approved read routes',()=>{
  const expected={
    shipments:{route:'professional-shipments',methods:['get','post']},
    shipment:{route:'professional-shipments/{shipmentId}',methods:['get','post']},
    'shipment-dashboard':{route:'professional-shipment-dashboard',methods:['get']}
  };
  for(const [folder,want] of Object.entries(expected)){
    const fn=JSON.parse(read(`api/${folder}/function.json`));
    const trigger=fn.bindings.find(binding=>binding.type==='httpTrigger');
    assert.equal(trigger.authLevel,'anonymous',folder);
    assert.equal(trigger.route,want.route,folder);
    assert.deepEqual(trigger.methods,want.methods,folder);
  }
});

test('shipment read handlers use shipment permissions and session tenant only',()=>{
  for(const folder of ['shipments','shipment','shipment-dashboard']){
    const src=read(`api/${folder}/index.js`);
    assert.match(src,/session\.tenant_id/,folder);
    assert.match(src,/permission:'shipments\.read'/,folder);
    assert.doesNotMatch(src,/req\.(?:body|query)[\s\S]{0,160}tenant/i,folder);
  }
});

test('shipment POST placeholders require write permission and CSRF then stay disabled before LIVE creation task',()=>{
  for(const folder of ['shipments','shipment']){
    const src=read(`api/${folder}/index.js`);
    assert.match(src,/permission:'shipments\.write',csrf:true/,folder);
    assert.match(src,/SHIPMENT_WRITES_DISABLED/,folder);
  }
});

test('shipment store performs tenant-scoped reads and tenant-safe customer/location joins',()=>{
  const src=read('api/shared/shipment-store.js');
  for(const fn of ['listShipments','getShipment','getShipmentDashboard'])assert.match(src,new RegExp(`async function ${fn}|function ${fn}`));
  assert.match(src,/withTenantShipmentClient/);
  assert.match(src,/s\.tenant_id=\$1/i);
  assert.match(src,/c\.tenant_id=s\.tenant_id[\s\S]*c\.id=s\.customer_id/i);
  assert.match(src,/l\.tenant_id=s\.tenant_id[\s\S]*l\.id=s\.location_id/i);
  assert.match(src,/s\.discarded_at is null/i);
});

test('dashboard handler returns only server-derived shipment dashboard facts',()=>{
  const src=read('api/shipment-dashboard/index.js');
  assert.match(src,/getShipmentDashboard\(session\.tenant_id/);
  assert.doesNotMatch(src,/openShipments\s*=|pickupsToday\s*=/);
});
