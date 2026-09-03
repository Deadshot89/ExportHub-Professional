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

test('colli editor renders server packaging choices and readonly LDM output only',async()=>{
  const src=read('assets/js/shipment-editor.js');
  assert.match(src,/data-colli-action="add"/);
  assert.match(src,/data-colli-field="packagingTypeId"/);
  assert.match(src,/data-colli-field="quantity"/);
  assert.match(src,/data-colli-field="weightKg"/);
  assert.match(src,/data-colli-ldm/);
  assert.doesNotMatch(src,/<input[^>]+(?:id|name|data-colli-field)=["'][^"']*ldm/i);

  const {renderShipmentEditor}=await import('../assets/js/shipment-editor.js');
  const root={innerHTML:''};
  renderShipmentEditor(root,{
    shipment:{id:'s1',reference:'COL001',sourceKind:'LIVE',status:'Entwurf',revision:2,colliRows:[{packagingTypeId:'p1',packagingName:'Euro Palette',quantity:3,weightKg:120,lengthCm:120,widthCm:80,heightCm:150,ldm:0.6,position:0}],colliTotals:{totalColli:3,totalWeightKg:120,totalLdm:0.6}},
    packagingTypes:[{id:'p1',name:'Euro Palette',ldmMode:'FIXED_PER_UNIT',fixedLdmPerUnit:0.2,allowLength:false,allowWidth:false,allowHeight:true,lengthCm:120,widthCm:80,heightCm:null}]
  },{canWrite:true,lock:{lockToken:'lock-1'},saveState:'saved'});
  assert.match(root.innerHTML,/Euro Palette/);
  assert.match(root.innerHTML,/data-colli-ldm[^>]*>\s*0[,.]6/);
  assert.match(root.innerHTML,/3\s*Colli/);
  assert.doesNotMatch(root.innerHTML,/<input[^>]+(?:id|name|data-colli-field)=["'][^"']*ldm/i);
});

test('shipment controller loads packaging masterdata and persists colli rows through shipment API',()=>{
  const src=read('assets/js/shipments.js');
  assert.match(src,/professional-masterdata\/packaging-types/);
  assert.match(src,/packagingTypes/);
  assert.match(src,/colliRows/);
  assert.match(src,/data-colli-action/);
  assert.match(src,/data-colli-field/);
  assert.doesNotMatch(src,/fixedLdmPerUnit\s*\*|calculate(?:Row)?Ldm|calculateLdm/i);
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

test('explicit flush waits for an in-flight save before navigation may release the lock',async()=>{
  const {createAutosaveQueue}=await import('../assets/js/shipment-autosave.js');
  const scheduled=[];let resolveSave;
  const queue=createAutosaveQueue({
    save:()=>new Promise(resolve=>{resolveSave=resolve;}),
    setTimeoutFn:(fn,ms)=>{scheduled.push({fn,ms});return scheduled.length;},
    clearTimeoutFn:()=>{}
  });
  queue.queue({plannedPickupDate:'2026-09-06'});
  const running=scheduled[0].fn();
  await Promise.resolve();
  let flushDone=false;
  const flushResult=queue.flush().then(result=>{flushDone=true;return result;});
  await Promise.resolve();
  assert.equal(flushDone,false,'flush darf einen laufenden Save nicht überholen');
  resolveSave();
  await running;
  assert.equal(await flushResult,true);
  queue.dispose();
});

test('failed explicit flush reports failure so navigation cannot discard pending changes',async()=>{
  const {createAutosaveQueue}=await import('../assets/js/shipment-autosave.js');
  const scheduled=[];
  const queue=createAutosaveQueue({
    save:async()=>{throw new Error('offline');},
    setTimeoutFn:(fn,ms)=>{scheduled.push({fn,ms});return scheduled.length;},
    clearTimeoutFn:()=>{}
  });
  queue.queue({plannedPickupDate:'2026-09-06'});
  assert.equal(await queue.flush(),false);
  assert.equal(scheduled.at(-1).ms,2000);
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

test('shipment navigation flushes pending autosave before releasing edit lock',()=>{
  const src=read('assets/js/shipments.js');
  assert.match(src,/async function prepareToLeaveCurrent/);
  assert.match(src,/await autosave\.flush\(\)[\s\S]{0,500}releaseCurrentLock/);
  assert.ok((src.match(/await prepareToLeaveCurrent\(/g)||[]).length>=2,'Sendungswechsel und Neuanlage müssen vor dem Wechsel flushen');
  assert.match(src,/querySelectorAll\([^\n]*\.nav button[\s\S]{0,700}prepareToLeaveCurrent/);
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
