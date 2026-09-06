import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const rootPath=path=>new URL(`../${path}`,import.meta.url);
const exists=path=>fs.existsSync(rootPath(path));
const read=path=>fs.readFileSync(rootPath(path),'utf8');

function requireFile(path){
  assert.ok(exists(path),`${path} fehlt`);
  return require(fileURLToPath(rootPath(path)));
}

test('Professional exposes a tenant-scoped read-only operational store',()=>{
  assert.ok(exists('api/shared/operations-store.js'),'operations store fehlt');
  const source=read('api/shared/operations-store.js');
  assert.match(source,/withTenantClient/);
  assert.match(source,/listShipments/);
  assert.match(source,/listDocuments/);
  assert.match(source,/buildOperationalTasks/);
  assert.match(source,/buildOperationsSummary/);
  assert.doesNotMatch(source,/write\s*:\s*true/);
  assert.doesNotMatch(source,/\b(insert|update|delete)\s+into?\b/i);
});

test('derived operational tasks are deterministic and come only from real shipment or document state',()=>{
  const store=requireFile('api/shared/operations-store.js');
  const shipments=[
    {id:'s1',reference:'ABC123',status:'Erstellt',locked:true,lock_reason:'Wartet auf ABD'},
    {id:'s2',reference:'DEF456',status:'Abgeholt',locked:false}
  ];
  const documents=[
    {id:'d1',shipment_id:'s2',shipment_reference:'DEF456',kind:'POD',verification_status:'CONTENT_MISSING',cutover_blocking:true,recovery_action:'SOURCE_FILE_REQUIRED'},
    {id:'d2',shipment_id:'s1',shipment_reference:'ABC123',kind:'L1',verification_status:'VERIFIED_INLINE',cutover_blocking:true,recovery_action:'NONE'}
  ];
  const tasks=store.buildOperationalTasks(shipments,documents);
  assert.deepEqual(tasks.map(task=>task.id),['shipment:s1:lock','document:d1:recovery']);
  assert.equal(tasks[0].source,'shipment');
  assert.equal(tasks[1].source,'document');
  assert.equal(tasks.some(task=>/demo|rheinwerk/i.test(JSON.stringify(task))),false);
});

test('summary counts only real read-only operational state and keeps finished shipments out of open count',()=>{
  const store=requireFile('api/shared/operations-store.js');
  const today='2026-09-06';
  const shipments=[
    {id:'s1',status:'Erstellt',actual_pickup_date:null,locked:false},
    {id:'s2',status:'Abgeholt',actual_pickup_date:today,locked:false},
    {id:'s3',status:'Abgeschlossen',actual_pickup_date:null,locked:false},
    {id:'s4',status:'Archiviert',actual_pickup_date:null,locked:false}
  ];
  const documents=[
    {id:'d1',verification_status:'CONTENT_MISSING',cutover_blocking:true},
    {id:'d2',verification_status:'VERIFIED_INLINE',cutover_blocking:true}
  ];
  const tasks=store.buildOperationalTasks(shipments,documents);
  const summary=store.buildOperationsSummary(shipments,documents,tasks,today);
  assert.equal(summary.openShipments,2);
  assert.equal(summary.pickupsToday,1);
  assert.equal(summary.documentActions,1);
  assert.equal(summary.actionRequired,tasks.length);
});

test('four GET-only operational APIs enforce existing role permissions',()=>{
  const contracts=[
    ['operations-summary','professional-operations/summary','shipments.read'],
    ['operations-shipments','professional-operations/shipments','shipments.read'],
    ['operations-documents','professional-operations/documents','documents.read'],
    ['operations-tasks','professional-operations/tasks','tasks.read']
  ];
  for(const [dir,route,permission] of contracts){
    assert.ok(exists(`api/${dir}/function.json`),`${dir} function.json fehlt`);
    assert.ok(exists(`api/${dir}/index.js`),`${dir} handler fehlt`);
    const config=JSON.parse(read(`api/${dir}/function.json`));
    const trigger=config.bindings.find(binding=>binding.type==='httpTrigger');
    assert.deepEqual(trigger.methods,['get']);
    assert.equal(trigger.route,route);
    const source=read(`api/${dir}/index.js`);
    assert.match(source,new RegExp(`permission:'${permission.replace('.','\\.')}'`));
    assert.match(source,/session\.tenant_id/);
    assert.doesNotMatch(source,/csrf\s*:\s*true|method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)/i);
  }
});

test('live operations runtime replaces migration placeholders only for an authenticated Professional session',()=>{
  assert.ok(exists('assets/js/operations.js'),'operations frontend runtime fehlt');
  const source=read('assets/js/operations.js');
  for(const marker of ['professional-operations/summary','professional-operations/shipments','professional-operations/documents','professional-operations/tasks']) assert.match(source,new RegExp(marker));
  for(const marker of ['data-operational-live','Aufgaben & Planung','Sendungsarbeitsplatz','Dokumentenkontrolle']) assert.match(source,new RegExp(marker));
  assert.match(source,/professional:session-ready/);
  assert.match(source,/detail\?\.local/);
  assert.doesNotMatch(source,/DEMO \/ MUSTER|Rheinwerk|Math\.random|method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)/i);
});

test('overview consumes the real operational summary instead of placeholder shipment metrics',()=>{
  const source=read('assets/js/overview.js');
  assert.match(source,/from '\.\/operations\.js'/);
  assert.match(source,/loadOperationsSummary/);
  assert.match(source,/operations\.summary\.openShipments/);
  assert.match(source,/operations\.summary\.pickupsToday/);
  assert.match(source,/operations\.summary\.documentActions/);
  assert.match(source,/operations\.summary\.actionRequired/);
  assert.doesNotMatch(source,/RWD30\d|Rheinwerk Industrial Solutions GmbH/);
});
