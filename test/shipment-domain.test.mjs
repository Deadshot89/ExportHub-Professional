import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

const domain=require('../api/shared/shipment-domain.js');
const calc=require('../api/shared/shipment-calculations.js');

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
