import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('shipment Azure Functions expose approved core routes including lock and actions',()=>{
  const expected={
    shipments:{route:'professional-shipments',methods:['get','post']},
    shipment:{route:'professional-shipments/{shipmentId}',methods:['get','post']},
    'shipment-dashboard':{route:'professional-shipment-dashboard',methods:['get']},
    'shipment-lock':{route:'professional-shipments/{shipmentId}/lock',methods:['post','delete']},
    'shipment-action':{route:'professional-shipments/{shipmentId}/actions/{action}',methods:['post']}
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

test('LIVE create and update handlers require write permission CSRF and session identity',()=>{
  const collection=read('api/shipments/index.js');
  assert.match(collection,/permission:'shipments\.write',csrf:true/);
  assert.match(collection,/createDraft\(session\.tenant_id,session\.user_id/);
  assert.doesNotMatch(collection,/SHIPMENT_WRITES_DISABLED/);

  const single=read('api/shipment/index.js');
  assert.match(single,/permission:'shipments\.write',csrf:true/);
  assert.match(single,/updateShipment\(session\.tenant_id,req\.params\?\.shipmentId,session\.user_id/);
  assert.doesNotMatch(single,/SHIPMENT_WRITES_DISABLED/);
  for(const src of [collection,single])assert.doesNotMatch(src,/body\.tenant|query\.tenant|tenantId\s*=\s*.*body/i);
});

test('lock handler is CSRF protected and force release remains role-aware server side',()=>{
  const src=read('api/shipment-lock/index.js');
  assert.match(src,/permission:'shipments\.write',csrf:true/);
  assert.match(src,/acquireEditLock\(session\.tenant_id/);
  assert.match(src,/heartbeatEditLock\(session\.tenant_id/);
  assert.match(src,/releaseEditLock\(session\.tenant_id/);
  assert.match(src,/forceReleaseEditLock\(session\.tenant_id/);
  assert.match(src,/session\.user_id/);
  assert.match(src,/session\.role/);
  assert.doesNotMatch(src,/body\.tenant|query\.tenant/i);
});

test('shipment action route is thin authenticated and only advertises approved lifecycle actions',()=>{
  const src=read('api/shipment-action/index.js');
  assert.match(src,/permission:'shipments\.write',csrf:true/);
  for(const action of ['mark-created','confirm-ready','cancel','set-rework','clear-rework','archive','restore'])assert.match(src,new RegExp(action));
  assert.match(src,/session\.tenant_id/);
  assert.doesNotMatch(src,/body\.tenant|query\.tenant/i);
});

test('shipment store performs tenant-scoped reads and tenant-safe customer/location joins',()=>{
  const src=read('api/shared/shipment-store.js');
  for(const fn of ['listShipments','getShipment','getShipmentDashboard','createDraft','updateShipment','acquireEditLock','heartbeatEditLock','releaseEditLock','forceReleaseEditLock'])assert.match(src,new RegExp(`async function ${fn}|function ${fn}`));
  assert.match(src,/withTenantShipmentClient/);
  assert.match(src,/s\.tenant_id=\$1/i);
  assert.match(src,/c\.tenant_id=s\.tenant_id[\s\S]*c\.id=s\.customer_id/i);
  assert.match(src,/l\.tenant_id=s\.tenant_id[\s\S]*l\.id=s\.location_id/i);
  assert.match(src,/s\.discarded_at is null/i);
  assert.match(src,/revision\s*=\s*revision\s*\+\s*1/i);
  assert.match(src,/last_activity_at\s*=\s*now\(\)/i);
  assert.match(src,/interval '15 minutes'/i);
});

test('dashboard handler returns only server-derived shipment dashboard facts',()=>{
  const src=read('api/shipment-dashboard/index.js');
  assert.match(src,/getShipmentDashboard\(session\.tenant_id/);
  assert.doesNotMatch(src,/openShipments\s*=|pickupsToday\s*=/);
});

test('new shipment write failures have deterministic HTTP mappings',()=>{
  const src=read('api/shared/http.js');
  assert.match(src,/WORKSPACE_SENDER_INCOMPLETE:409/);
  assert.match(src,/REFERENCE_GENERATION_FAILED:503/);
});
