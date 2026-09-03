import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

const domain=require('../api/shared/shipment-domain.js');
const calc=require('../api/shared/shipment-calculations.js');
const shipmentStore=require('../api/shared/shipment-store.js');
const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

function live(overrides={}){
  return {source_kind:'LIVE',status:'Entwurf',recipient_snapshot:{},rework:{},...overrides};
}

test('reference is six uppercase alphanumeric characters and skips rejected random bytes',()=>{
  let calls=0;
  const ref=domain.generateReference(()=>{
    calls++;
    return calls===1?Buffer.from([252,253,254,255,0,1]):Buffer.from([2,3,4,5,6,7]);
  });
  assert.match(ref,/^[A-Z0-9]{6}$/);
  assert.equal(ref,'ABCDEF');
  assert.equal(calls,2);
});

test('migrated and picked-up shipments reject ordinary mutation',()=>{
  assert.throws(()=>domain.assertMutable({source_kind:'MIGRATED',status:'Entwurf'}),e=>e.code==='SHIPMENT_READ_ONLY');
  for(const status of ['Abgeholt','POD vorhanden','Abgeschlossen','Archiviert','Storniert']){
    assert.throws(()=>domain.assertMutable({source_kind:'LIVE',status}),e=>e.code==='SHIPMENT_READ_ONLY',status);
  }
  assert.equal(domain.assertMutable({source_kind:'LIVE',status:'Bereit zur Abholung'}),true);
});

test('all lifecycle actions keep MIGRATED shipments permanently read-only',()=>{
  const cases=[
    [{source_kind:'MIGRATED',status:'Abgeholt',rework:{}},'pod-valid',{}],
    [{source_kind:'MIGRATED',status:'POD vorhanden',rework:{}},'auto-complete',{noBlockers:true}],
    [{source_kind:'MIGRATED',status:'Abgeschlossen',rework:{}},'archive',{manual:false}],
    [{source_kind:'MIGRATED',status:'Archiviert',rework:{}},'restore',{role:'TENANT_ADMIN',reason:'Korrektur'}]
  ];
  for(const [shipment,action,context] of cases){
    assert.throws(()=>domain.applyLifecycleAction(shipment,action,context),e=>e.code==='SHIPMENT_READ_ONLY',action);
  }
});

test('creation evaluation requires recipient pickup date and registration email when flagged',()=>{
  const incomplete=domain.evaluateCreation(live(),{recipientValid:false,registrationEmailRequired:false,registrationEmailCount:0});
  assert.equal(incomplete.complete,false);
  assert.deepEqual(new Set(incomplete.missing),new Set(['RECIPIENT_REQUIRED','PLANNED_PICKUP_DATE_REQUIRED']));

  const needsEmail=domain.evaluateCreation(live({planned_pickup_date:'2026-09-04'}),{recipientValid:true,registrationEmailRequired:true,registrationEmailCount:0});
  assert.equal(needsEmail.complete,false);
  assert.ok(needsEmail.missing.includes('REGISTRATION_EMAIL_REQUIRED'));

  const complete=domain.evaluateCreation(live({planned_pickup_date:'2026-09-04'}),{recipientValid:true,registrationEmailRequired:true,registrationEmailCount:1});
  assert.deepEqual(complete,{complete:true,missing:[]});
});

test('readiness requires current mandatory documents and resolved operational facts',()=>{
  const shipment=live({status:'Erstellt',planned_pickup_date:'2026-09-04'});
  const base={
    creation:{complete:true,missing:[]},
    colliValid:true,
    carrierValid:true,
    customsResolved:true,
    cmr:{resolved:true,required:true},
    abd:{resolved:true,required:true},
    documents:{lieferschein:true,ladelisteCurrent:true,cmrCurrent:true,abdValid:true}
  };
  const ready=domain.evaluateReadiness(shipment,base);
  assert.equal(ready.ready,true);
  assert.deepEqual(ready.blocks,[]);
  assert.equal(ready.checklist.Dokumente,'complete');

  const blocked=domain.evaluateReadiness(shipment,{...base,documents:{...base.documents,cmrCurrent:false,abdValid:false}});
  assert.equal(blocked.ready,false);
  assert.ok(blocked.blocks.includes('CMR_REQUIRED'));
  assert.ok(blocked.blocks.includes('ABD_REQUIRED'));
  assert.equal(blocked.checklist.Dokumente,'error');
});

test('lifecycle actions enforce creation readiness and preserve base status during rework',()=>{
  const draft=live({planned_pickup_date:'2026-09-04'});
  assert.throws(()=>domain.applyLifecycleAction(draft,'mark-created',{creation:{complete:false,missing:['RECIPIENT_REQUIRED']}}),e=>e.code==='SHIPMENT_TRANSITION_INVALID');
  const created=domain.applyLifecycleAction(draft,'mark-created',{creation:{complete:true,missing:[]}});
  assert.equal(created.status,'Erstellt');

  assert.throws(()=>domain.applyLifecycleAction(created,'confirm-ready',{readiness:{ready:false,blocks:['DOCUMENT_REQUIRED']}}),e=>e.code==='SHIPMENT_NOT_READY');
  const ready=domain.applyLifecycleAction(created,'confirm-ready',{readiness:{ready:true,blocks:[]}});
  assert.equal(ready.status,'Bereit zur Abholung');

  const rework=domain.applyLifecycleAction(ready,'set-rework',{reason:'COLLI_MISMATCH',manual:false});
  assert.equal(rework.status,'Bereit zur Abholung');
  assert.equal(rework.rework.active,true);
  assert.equal(rework.rework.reason,'COLLI_MISMATCH');
  assert.throws(()=>domain.applyLifecycleAction(rework,'confirm-pickup',{}),e=>e.code==='SHIPMENT_TRANSITION_INVALID');
});

test('active rework blocks lifecycle progression from draft',()=>{
  const draft=live({status:'Entwurf',planned_pickup_date:'2026-09-04',rework:{active:true,reason:'DATA_ERROR'}});
  assert.throws(()=>domain.applyLifecycleAction(draft,'mark-created',{creation:{complete:true,missing:[]}}),e=>e.code==='SHIPMENT_TRANSITION_INVALID');
});

test('manual rework and manual clear are restricted to tenant and export admins',()=>{
  const shipment=live({status:'Erstellt'});
  assert.throws(()=>domain.applyLifecycleAction(shipment,'set-rework',{manual:true,role:'OPERATOR',reason:'Prüfung'}),e=>e.code==='FORBIDDEN');
  const flagged=domain.applyLifecycleAction(shipment,'set-rework',{manual:true,role:'EXPORT_ADMIN',reason:'Prüfung'});
  assert.equal(flagged.rework.active,true);
  assert.equal(flagged.rework.manual,true);
  assert.throws(()=>domain.applyLifecycleAction(flagged,'clear-rework',{role:'OPERATOR',reason:'erledigt'}),e=>e.code==='FORBIDDEN');
  assert.throws(()=>domain.applyLifecycleAction(flagged,'clear-rework',{role:'TENANT_ADMIN'}),e=>e.code==='INPUT_INVALID');
  const cleared=domain.applyLifecycleAction(flagged,'clear-rework',{role:'TENANT_ADMIN',reason:'geprüft'});
  assert.equal(cleared.rework.active,false);
});

test('system rework clears only after successful validation',()=>{
  const flagged=domain.applyLifecycleAction(live({status:'Erstellt'}),'set-rework',{manual:false,reason:'VALIDATION_FAILED'});
  assert.throws(()=>domain.applyLifecycleAction(flagged,'clear-rework',{}),e=>e.code==='SHIPMENT_TRANSITION_INVALID');
  assert.equal(domain.applyLifecycleAction(flagged,'clear-rework',{validationPassed:true}).rework.active,false);
});

test('CMR is required exactly when destination differs from workspace shipping country',()=>{
  assert.deepEqual(calc.cmrRequired({destinationCountryIso:'DE',shippingCountryIso:'DE'}),{required:false,resolved:true,reason:'DOMESTIC'});
  assert.deepEqual(calc.cmrRequired({destinationCountryIso:'NL',shippingCountryIso:'DE'}),{required:true,resolved:true,reason:'CROSS_BORDER'});
  assert.deepEqual(calc.cmrRequired({destinationCountryIso:'',shippingCountryIso:'DE'}),{required:false,resolved:false,reason:'COUNTRY_MISSING'});
});

test('ABD is non-EU plus value over 1000 or carrier requirement',()=>{
  assert.equal(calc.abdDecision({isEuDestination:false,goodsValueEur:1000,carrierRequiresAbd:false}).required,false);
  assert.equal(calc.abdDecision({isEuDestination:false,goodsValueEur:1000.01,carrierRequiresAbd:false}).required,true);
  assert.equal(calc.abdDecision({isEuDestination:false,goodsValueEur:10,carrierRequiresAbd:true}).required,true);
  assert.equal(calc.abdDecision({isEuDestination:true,goodsValueEur:5000,carrierRequiresAbd:true}).required,false);
  assert.equal(calc.abdDecision({isEuDestination:false,goodsValueEur:null,carrierRequiresAbd:false}).resolved,false);
});

test('LDM is calculated only from packaging rule and physical quantity',()=>{
  assert.equal(calc.calculateRowLdm({quantity:3,ldm:99},{ldm_mode:'FIXED_PER_UNIT',fixed_ldm_per_unit:0.2}),0.6);
  assert.equal(calc.calculateRowLdm({quantity:2,length_cm:120,width_cm:80,ldm:99},{ldm_mode:'FOOTPRINT'}),0.8);
  assert.throws(()=>calc.calculateRowLdm({quantity:0},{ldm_mode:'FIXED_PER_UNIT',fixed_ldm_per_unit:0.2}),e=>e.code==='INPUT_INVALID');
});

test('shipment totals use physical Colli quantity, row weight and calculated LDM',()=>{
  const totals=calc.calculateTotals([
    {packaging_type_id:'PAL',quantity:3,weight_kg:120,ldm:99},
    {packaging_type_id:'BOX',quantity:2,weight_kg:30,length_cm:120,width_cm:80,ldm:99}
  ],{
    PAL:{ldm_mode:'FIXED_PER_UNIT',fixed_ldm_per_unit:0.2},
    BOX:{ldm_mode:'FOOTPRINT'}
  });
  assert.equal(totals.totalColli,5);
  assert.equal(totals.totalWeightKg,150);
  assert.equal(totals.totalLdm,1.4);
  assert.deepEqual(totals.rows.map(r=>r.ldm),[0.6,0.8]);
});

test('colli replacement is revisioned locked and never inserts browser ldm directly',()=>{
  const src=read('api/shared/shipment-store.js');
  assert.match(src,/async function replaceColliRowsInClient|function replaceColliRowsInClient/);
  assert.match(src,/calculateTotals/);
  assert.match(src,/delete from shipment_colli/i);
  assert.match(src,/revision\s*=\s*revision\s*\+\s*1/i);
  assert.match(src,/SHIPMENT_COLLI_CHANGED/);
  assert.doesNotMatch(src,/\brow\.ldm\b[^\n]*insert/i);
});

test('server colli replacement ignores forged ldm and returns calculated totals',async()=>{
  const tenant='11111111-1111-4111-8111-111111111111';
  const user='22222222-2222-4222-8222-222222222222';
  const shipmentId='33333333-3333-4333-8333-333333333333';
  const pal='44444444-4444-4444-8444-444444444444';
  const box='55555555-5555-4555-8555-555555555555';
  const inserted=[];
  const client={query:async(sql,params=[])=>{
    const q=String(sql).toLowerCase();
    if(q.includes('from shipments')&&q.includes('for update'))return {rows:[{id:shipmentId,tenant_id:tenant,reference:'ABC123',source_kind:'LIVE',status:'Entwurf',revision:2,sender_snapshot:{},recipient_snapshot:{},carrier_snapshot:{},fx_snapshot:{},readiness:{},rework:{}}]};
    if(q.includes('from shipment_edit_locks'))return {rows:[{lock_token:'lock-good'}]};
    if(q.includes('from packaging_types'))return {rows:[
      {id:pal,name:'Euro Palette',active:true,ldm_mode:'FIXED_PER_UNIT',fixed_ldm_per_unit:0.2,length_cm:120,width_cm:80,height_cm:null,allow_length:false,allow_width:false,allow_height:true},
      {id:box,name:'Sonderpalette',active:true,ldm_mode:'FOOTPRINT',fixed_ldm_per_unit:null,length_cm:120,width_cm:80,height_cm:null,allow_length:true,allow_width:true,allow_height:true}
    ]};
    if(q.startsWith('delete from shipment_colli'))return {rows:[]};
    if(q.includes('insert into shipment_colli')){inserted.push(params);return {rows:[{}]};}
    if(q.startsWith('update shipments'))return {rows:[{id:shipmentId,tenant_id:tenant,reference:'ABC123',source_kind:'LIVE',status:'Entwurf',revision:3,sender_snapshot:{},recipient_snapshot:{},carrier_snapshot:{},fx_snapshot:{},readiness:{},rework:{}}]};
    if(q.startsWith('update shipment_edit_locks'))return {rows:[]};
    if(q.includes('insert into audit_events'))return {rows:[]};
    throw new Error(`Unexpected SQL: ${sql}`);
  }};
  const result=await shipmentStore.replaceColliRowsInClient(client,tenant,shipmentId,user,{lockToken:'lock-good',revision:2,rows:[
    {packagingTypeId:pal,quantity:3,weightKg:120,ldm:999},
    {packagingTypeId:box,quantity:2,weightKg:30,lengthCm:120,widthCm:80,ldm:999}
  ]});
  assert.equal(result.totals.totalColli,5);
  assert.equal(result.totals.totalWeightKg,150);
  assert.equal(result.totals.totalLdm,1.4);
  assert.deepEqual(result.colliRows.map(row=>row.ldm),[0.6,0.8]);
  assert.equal(inserted.length,2);
  assert.ok(inserted.every(params=>!params.includes(999)),'gefälschte Browser-LDM darf nie persistiert werden');
  assert.equal(result.shipment.revision,3);
});
