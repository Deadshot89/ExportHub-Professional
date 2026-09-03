import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const url=path=>new URL(`../${path}`,import.meta.url);
const read=path=>fs.readFileSync(url(path),'utf8');
const exists=path=>fs.existsSync(url(path));

const frontendFiles=['assets/js/shipment-autosave.js','assets/js/shipment-editor.js','assets/js/shipments.js'];

test('shipment workspace files and master-detail view exist',()=>{
  for(const file of frontendFiles)assert.equal(exists(file),true,`${file} fehlt`);
  const html=read('index.html');
  assert.match(html,/data-view="shipments"/);
  assert.match(html,/id="newShipmentBtn"[^>]*>\s*\+?\s*Neue Sendung/i);
  assert.match(html,/id="shipmentMasterList"/);
  assert.match(html,/id="shipmentEditorRoot"/);
  assert.match(html,/id="shipmentSearch"/);
  assert.match(html,/id="shipmentStatusFilter"/);
});

test('shipment editor exposes permanent operational header and seven approved sections',()=>{
  assert.equal(exists('assets/js/shipment-editor.js'),true,'shipment-editor.js fehlt');
  const src=read('assets/js/shipment-editor.js');
  for(const marker of ['shipmentReference','shipmentStatus','shipmentChecklist','shipmentSaveState','shipmentLockBanner','shipmentReadOnlyBadge'])assert.match(src,new RegExp(marker));
  for(const title of ['Kunde & Standort','Sendungsdaten','Colli/LDM','Spedition','Warenwert & Zoll','Dokumente','Abholung'])assert.match(src,new RegExp(title.replace(/[&/]/g,m=>`\\${m}`)));
  assert.match(src,/MIGRATED|Migriert/);
  assert.match(src,/readOnly/);
});

test('autosave queue merges patches and retries with approved backoff',async()=>{
  assert.equal(exists('assets/js/shipment-autosave.js'),true,'shipment-autosave.js fehlt');
  const {createAutosaveQueue}=await import('../assets/js/shipment-autosave.js');
  const scheduled=[];let id=0,attempts=0;const saves=[],states=[];
  const queue=createAutosaveQueue({
    save:async patch=>{attempts++;saves.push({...patch});if(attempts<=5)throw new Error('offline');},
    onState:(state)=>states.push(state),
    setTimeoutFn:(fn,ms)=>{const item={id:++id,fn,ms};scheduled.push(item);return item.id;},
    clearTimeoutFn:timerId=>{const item=scheduled.find(entry=>entry.id===timerId);if(item)item.cancelled=true;}
  });
  queue.queue({customerId:'c1'});
  queue.queue({plannedPickupDate:'2026-09-05'});
  const debounce=scheduled.filter(item=>!item.cancelled).at(-1);
  assert.equal(debounce.ms,500);
  await debounce.fn();
  const delays=[];
  while(attempts<6){
    const timer=scheduled.filter(item=>!item.cancelled&&!item.ran).at(-1);
    assert.ok(timer,'Retry-Timer fehlt');timer.ran=true;delays.push(timer.ms);await timer.fn();
  }
  assert.deepEqual(delays,[2000,5000,10000,30000,60000]);
  assert.deepEqual(saves[0],{customerId:'c1',plannedPickupDate:'2026-09-05'});
  assert.equal(states.at(-1),'saved');
  queue.dispose();
});

test('shipment workspace uses APIs for load create update and explicit lock release',()=>{
  assert.equal(exists('assets/js/shipments.js'),true,'shipments.js fehlt');
  const src=read('assets/js/shipments.js');
  for(const fn of ['loadShipments','openShipment','createShipment'])assert.match(src,new RegExp(`(?:async\\s+)?function\\s+${fn}|export\\s+(?:async\\s+)?function\\s+${fn}`));
  assert.match(src,/\/api\/professional-shipments/);
  assert.match(src,/\/lock/);
  assert.match(src,/action:\s*['"]release['"]/);
  assert.match(src,/x-professional-csrf/i);
  assert.match(src,/professional:session-ready/);
});

test('browser shipment modules do not own ABD EU CMR or LDM business calculations',()=>{
  const src=frontendFiles.filter(exists).map(read).join('\n');
  assert.doesNotMatch(src,/abdDecision|cmrRequired|isEuDestination|NON_EU_VALUE|NON_EU_CARRIER|fixed_ldm_per_unit|FOOTPRINT/);
  assert.doesNotMatch(src,/goodsValue[^\n]{0,80}>\s*1000|1000[^\n]{0,80}ABD/i);
});

test('shipment workspace has responsive no-overflow control-center styles',()=>{
  const css=read('assets/css/control-center.css');
  assert.match(css,/shipment-master-detail/);
  assert.match(css,/shipment-editor/);
  assert.match(css,/@media\s*\(max-width:\s*700px\)/);
  assert.match(css,/shipment-master-detail[\s\S]*grid-template-columns:\s*1fr/);
});

test('CI and deploy explicitly guard all shipment workspace modules',()=>{
  const ci=read('.github/workflows/professional-ci.yml');
  const deploy=read('.github/workflows/professional-deploy.yml');
  for(const file of frontendFiles){
    assert.match(ci,new RegExp(`node --check ${file.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`));
    assert.match(deploy,new RegExp(`test -f \\.deploy/${file.replace(/^assets\//,'assets/').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`));
  }
});
