import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const exists=path=>fs.existsSync(new URL(path,root));
const tenant='11111111-1111-4111-8111-111111111111';
const user='22222222-2222-4222-8222-222222222222';
const shipmentId='33333333-3333-4333-8333-333333333333';
const carrierId='44444444-4444-4444-8444-444444444444';
const ECB_XML=`<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <Cube><Cube time="2026-09-03"><Cube currency="USD" rate="1.1600"/><Cube currency="GBP" rate="0.8700"/></Cube>
  <Cube time="2026-09-04"><Cube currency="USD" rate="1.1673"/><Cube currency="GBP" rate="0.8725"/><Cube currency="CHF" rate="0.9350"/></Cube></Cube>
</gesmes:Envelope>`;

function loadEcb(){
  assert.equal(exists('api/shared/ecb-rates.js'),true,'api/shared/ecb-rates.js fehlt');
  return require('../api/shared/ecb-rates.js');
}

test('ECB parser accepts dated official Cube rates and weekend selection uses last available publication',()=>{
  const ecb=loadEcb();
  assert.equal(ecb.ECB_90D_URL,'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml');
  const rows=ecb.parseEcbRates(ECB_XML);
  assert.ok(rows.some(row=>row.rateDate==='2026-09-04'&&row.currency==='USD'&&row.rate===1.1673));
  const selected=ecb.selectReferenceRate(rows,'USD','2026-09-06');
  assert.deepEqual(selected,{currency:'USD',rate:1.1673,rateDate:'2026-09-04',source:'ECB'});
});

test('ECB conversion divides foreign amount by units-per-EUR quote and rounds EUR to cents',()=>{
  const ecb=loadEcb();
  const rate={currency:'USD',rate:1.1673,rateDate:'2026-09-04',source:'ECB'};
  assert.deepEqual(ecb.convertToEur({amount:1500,currency:'USD'},rate),{originalAmount:1500,originalCurrency:'USD',rate:1.1673,rateDate:'2026-09-04',source:'ECB',eurValue:1285.02});
});

test('EUR reference rate is synthetic without network and unavailable currencies never get an approximate rate',async()=>{
  const ecb=loadEcb();
  let fetchCalls=0;
  const euro=await ecb.getReferenceRate('EUR',{requestedDate:'2026-09-06',fetchFn:async()=>{fetchCalls++;throw new Error('network must not be used');}});
  assert.deepEqual(euro,{currency:'EUR',rate:1,rateDate:'2026-09-06',source:'ECB'});
  assert.equal(fetchCalls,0);
  const rows=ecb.parseEcbRates(ECB_XML);
  assert.throws(()=>ecb.selectReferenceRate(rows,'JPY','2026-09-06'),error=>error.code==='FX_RATE_UNAVAILABLE');
  assert.throws(()=>ecb.convertToEur({amount:100,currency:'USD'},{currency:'USD',rate:0,rateDate:'2026-09-04',source:'ECB'}),error=>error.code==='FX_RATE_UNAVAILABLE');
});

test('ECB cache schema is global server-owned reference data mirrored in canonical postgres schema',()=>{
  const shipmentSchema=read('api/shared/shipment-schema.js');
  const canonical=read('schema/postgres.sql');
  for(const source of [shipmentSchema,canonical]){
    assert.match(source,/create table if not exists ecb_reference_rates/i);
    assert.match(source,/rate_date\s+date\s+not null/i);
    assert.match(source,/currency\s+text\s+not null/i);
    assert.match(source,/rate\s+numeric\(20,10\)\s+not null/i);
    assert.match(source,/primary key\s*\(rate_date\s*,\s*currency\)/i);
  }
  assert.doesNotMatch(shipmentSchema,/alter table ecb_reference_rates enable row level security/i);
});

test('ECB resolver checks cached greatest rate date first and persists successful official rows',()=>{
  const ecb=loadEcb();
  const src=read('api/shared/ecb-rates.js');
  assert.match(src,/rate_date\s*<=\s*\$2/i);
  assert.match(src,/order by rate_date desc/i);
  assert.match(src,/insert into ecb_reference_rates/i);
  assert.match(src,/on conflict\s*\(rate_date\s*,\s*currency\)/i);
  assert.match(src,/fetchFn/);
  assert.doesNotMatch(src,/Math\.random|approx|fallbackRate/i);
});

test('shipment goods value mutation stores immutable FX snapshot and server-derived ABD CMR facts under lock and revision',async()=>{
  const store=require('../api/shared/shipment-store.js');
  assert.equal(typeof store.setShipmentGoodsValueInClient,'function');
  const shipment={id:shipmentId,tenant_id:tenant,reference:'FX0001',source_kind:'LIVE',status:'Entwurf',revision:7,sender_snapshot:{shippingCountryIso:'DE'},recipient_snapshot:{companyName:'Swiss AG',countryIso:'CH'},carrier_snapshot:{carrierId,carrierRequiresAbd:false},fx_snapshot:{},readiness:{},rework:{}};
  let savedFx=null,savedReadiness=null;
  const client={query:async(sql,params=[])=>{
    const q=String(sql).toLowerCase();
    if(q.includes('from shipments')&&q.includes('for update'))return {rows:[shipment]};
    if(q.includes('from shipment_edit_locks'))return {rows:[{lock_token:'lock'}]};
    if(q.startsWith('update shipments')&&q.includes('fx_snapshot')&&q.includes('readiness')){
      const jsonValues=params.filter(value=>typeof value==='string'&&value.startsWith('{')).map(JSON.parse);
      savedFx=jsonValues.find(value=>Object.prototype.hasOwnProperty.call(value,'originalAmount'));
      savedReadiness=jsonValues.find(value=>Object.prototype.hasOwnProperty.call(value,'abdRequired'));
      return {rows:[{...shipment,revision:8,fx_snapshot:savedFx,readiness:savedReadiness}]};
    }
    if(q.startsWith('update shipment_edit_locks')||q.includes('insert into audit_events'))return {rows:[]};
    throw new Error(`Unexpected SQL: ${sql}`);
  }};
  const result=await store.setShipmentGoodsValueInClient(client,tenant,shipmentId,user,{lockToken:'lock',revision:7,amount:1500,currency:'USD',now:new Date('2026-09-06T10:00:00.000Z'),rateResolver:async()=>({currency:'USD',rate:1.1673,rateDate:'2026-09-04',source:'ECB'})});
  assert.equal(savedFx.originalAmount,1500);
  assert.equal(savedFx.originalCurrency,'USD');
  assert.equal(savedFx.eurValue,1285.02);
  assert.equal(savedFx.rateDate,'2026-09-04');
  assert.equal(savedFx.convertedAt,'2026-09-06T10:00:00.000Z');
  assert.equal(savedReadiness.abdRequired,true);
  assert.equal(savedReadiness.abdReason,'NON_EU_VALUE');
  assert.equal(savedReadiness.cmrRequired,true);
  assert.equal(savedReadiness.cmrReason,'CROSS_BORDER');
  assert.equal(result.revision,8);
});

test('shipment API and browser accept only amount currency while rendering server customs result without duplicating rules',()=>{
  const api=read('api/shipment/index.js');
  const controller=read('assets/js/shipments.js');
  const editor=read('assets/js/shipment-editor.js');
  assert.match(api,/set-goods-value/);
  assert.match(api,/amount/);
  assert.match(api,/currency/);
  assert.doesNotMatch(api,/setShipmentGoodsValue[\s\S]{0,500}(?:fxSnapshot|eurValue|abdRequired|cmrRequired)\s*:/);
  assert.match(controller,/operation:\s*['"]set-goods-value['"]/);
  assert.match(editor,/shipmentGoodsValueAmount/);
  assert.match(editor,/shipmentGoodsValueCurrency/);
  assert.match(editor,/abdRequired|abdReason/);
  assert.match(editor,/cmrRequired|cmrReason/);
  assert.doesNotMatch(controller+editor,/abdDecision|cmrRequired\s*\(|isEuDestination|NON_EU_VALUE|NON_EU_CARRIER|>\s*1000|1000\s*<|goodsValue[^\n]{0,60}>\s*1000/i);
});
