import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const store=require('../api/shared/shipment-store.js');

const tenant='11111111-1111-4111-8111-111111111111';
const user='22222222-2222-4222-8222-222222222222';
const shipmentId='33333333-3333-4333-8333-333333333333';
const shipping={companyName:'ExportHUB Professional',street:'Musterstraße',houseNumber:'7',postalCode:'41334',city:'Nettetal',shippingCountry:'Deutschland',shippingCountryIso:'DE',timezone:'Europe/Berlin'};

function draftRow(overrides={}){
  return {id:shipmentId,tenant_id:tenant,reference:'ABC123',source_kind:'LIVE',status:'Entwurf',revision:0,sender_snapshot:shipping,recipient_snapshot:{},carrier_snapshot:{},fx_snapshot:{},readiness:{},rework:{},...overrides};
}

test('draft creation retries reference collisions and returns LIVE draft with creator lock',async()=>{
  let inserts=0;
  const client={query:async(sql,params=[])=>{
    const q=String(sql).toLowerCase();
    if(q.includes("settings->'shipping'"))return {rows:[{shipping}]};
    if(q.includes('insert into shipments')){
      inserts++;
      if(inserts===1)return {rows:[]};
      const reference=params.find(value=>typeof value==='string'&&/^[A-Z0-9]{6}$/.test(value));
      return {rows:[draftRow({reference,sender_snapshot:JSON.parse(params.find(value=>typeof value==='string'&&value.startsWith('{'))||'{}')})]};
    }
    if(q.includes('insert into audit_events'))return {rows:[]};
    if(q.includes('insert into shipment_edit_locks'))return {rows:[{tenant_id:tenant,shipment_id:shipmentId,user_id:user,lock_token:'lock-token',acquired_at:'2026-09-03T19:00:00Z',last_activity_at:'2026-09-03T19:00:00Z'}]};
    throw new Error(`Unexpected SQL: ${sql}`);
  }};
  const refs=['AAAAAA','BBBBBB'];
  const result=await store.createDraftInClient(client,tenant,user,{referenceGenerator:()=>refs.shift(),lockTokenGenerator:()=> 'lock-token'});
  assert.equal(inserts,2);
  assert.equal(result.shipment.reference,'BBBBBB');
  assert.equal(result.shipment.sourceKind,'LIVE');
  assert.equal(result.shipment.status,'Entwurf');
  assert.equal(result.shipment.revision,0);
  assert.equal(result.shipment.senderSnapshot.shippingCountryIso,'DE');
  assert.equal(result.lock.lockToken,'lock-token');
});

test('draft creation rejects incomplete sender settings before inserting shipment',async()=>{
  let inserted=false;
  const client={query:async sql=>{
    const q=String(sql).toLowerCase();
    if(q.includes("settings->'shipping'"))return {rows:[{shipping:{companyName:'ExportHUB Professional',shippingCountryIso:'DE',timezone:'Europe/Berlin'}}]};
    if(q.includes('insert into shipments'))inserted=true;
    return {rows:[]};
  }};
  await assert.rejects(()=>store.createDraftInClient(client,tenant,user,{referenceGenerator:()=> 'ABC123'}),error=>error.code==='WORKSPACE_SENDER_INCOMPLETE');
  assert.equal(inserted,false);
});

test('reference generation stops after twenty database collisions',async()=>{
  let inserts=0;
  const client={query:async sql=>{
    const q=String(sql).toLowerCase();
    if(q.includes("settings->'shipping'"))return {rows:[{shipping}]};
    if(q.includes('insert into shipments')){inserts++;return {rows:[]};}
    throw new Error(`Unexpected SQL: ${sql}`);
  }};
  await assert.rejects(()=>store.createDraftInClient(client,tenant,user,{referenceGenerator:()=> 'AAAAAA'}),error=>error.code==='REFERENCE_GENERATION_FAILED');
  assert.equal(inserts,20);
});

test('exclusive lock acquisition rejects an active competing lock',async()=>{
  const client={query:async()=>({rows:[]})};
  await assert.rejects(()=>store.acquireEditLockInClient(client,tenant,shipmentId,user,{lockTokenGenerator:()=> 'token'}),error=>error.code==='SHIPMENT_LOCKED');
});

test('update rejects wrong lock token before mutation',async()=>{
  let writes=0;
  const client={query:async sql=>{
    const q=String(sql).toLowerCase();
    if(q.includes('from shipments')&&q.includes('for update'))return {rows:[draftRow({revision:3})]};
    if(q.includes('from shipment_edit_locks'))return {rows:[]};
    if(q.startsWith('update shipments'))writes++;
    return {rows:[]};
  }};
  await assert.rejects(()=>store.updateShipmentInClient(client,tenant,shipmentId,user,{lockToken:'wrong',revision:3,patch:{plannedPickupDate:'2026-09-05'}}),error=>error.code==='SHIPMENT_LOCK_INVALID');
  assert.equal(writes,0);
});

test('update locks the matching edit-lock row and rejects stale revision without overwriting newer data',async()=>{
  let writes=0,lockSql='';
  const client={query:async sql=>{
    const q=String(sql).toLowerCase();
    if(q.includes('from shipments')&&q.includes('for update'))return {rows:[draftRow({revision:4})]};
    if(q.includes('from shipment_edit_locks')){lockSql=String(sql);return {rows:[{lock_token:'good'}]};}
    if(q.startsWith('update shipments'))writes++;
    return {rows:[]};
  }};
  await assert.rejects(()=>store.updateShipmentInClient(client,tenant,shipmentId,user,{lockToken:'good',revision:3,patch:{plannedPickupDate:'2026-09-05'}}),error=>error.code==='SHIPMENT_REVISION_CONFLICT');
  assert.match(lockSql,/for\s+update/i);
  assert.equal(writes,0);
});

test('ordinary autosave patch cannot mutate reference lifecycle source sender or server-derived operational facts',()=>{
  const patch=store.sanitizeShipmentPatch({
    reference:'HACKED',status:'Abgeholt',source_kind:'MIGRATED',sourceKind:'MIGRATED',sender_snapshot:{companyName:'Fake'},senderSnapshot:{companyName:'Fake'},
    readiness:{ready:true},carrierSnapshot:{id:'fake'},fxSnapshot:{EUR:1},
    customerId:'44444444-4444-4444-8444-444444444444',plannedPickupDate:'2026-09-05',recipientSnapshot:{companyName:'Empfänger'}
  });
  assert.deepEqual(Object.keys(patch).sort(),['customer_id','planned_pickup_date','recipient_snapshot']);
  assert.equal(patch.planned_pickup_date,'2026-09-05');
});
