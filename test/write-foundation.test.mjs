import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const rootPath=path=>new URL(`../${path}`,import.meta.url);
const exists=path=>fs.existsSync(rootPath(path));
const read=path=>fs.readFileSync(rootPath(path),'utf8');
const requireFile=path=>require(fileURLToPath(rootPath(path)));

function expectWriteHandler(dir,method,route,permission){
  assert.ok(exists(`api/${dir}/function.json`),`${dir}/function.json fehlt`);
  assert.ok(exists(`api/${dir}/index.js`),`${dir}/index.js fehlt`);
  const config=JSON.parse(read(`api/${dir}/function.json`));
  const trigger=config.bindings.find(binding=>binding.type==='httpTrigger');
  assert.deepEqual(trigger.methods,[method]);
  assert.equal(trigger.route,route);
  const source=read(`api/${dir}/index.js`);
  assert.match(source,new RegExp(`permission:'${permission.replace('.','\\.')}'`));
  assert.match(source,/csrf\s*:\s*true/);
  assert.match(source,/session\.tenant_id/);
  assert.doesNotMatch(source,/body\.(?:tenant|tenantId|tenant_id)|req\.query\.(?:tenant|tenantId|tenant_id)/);
}

test('schema adds tenant-RLS protected persistent operational_tasks',()=>{
  const schema=read('schema/postgres.sql');
  assert.match(schema,/create table if not exists operational_tasks\s*\(/i);
  for(const column of ['tenant_id uuid not null','title text not null','priority text not null','status text not null','due_at timestamptz','created_by uuid','completed_at timestamptz']) assert.match(schema,new RegExp(column,'i'));
  assert.match(schema,/operational_tasks_tenant/i);
  assert.match(schema,/alter table operational_tasks enable row level security/i);
  assert.match(schema,/create policy tenant_isolation on operational_tasks[\s\S]*current_setting\('app\.tenant_id'/i);
});

test('task store mutates only through tenant write transactions and never accepts tenant scope from input',()=>{
  assert.ok(exists('api/shared/tasks-store.js'),'tasks-store fehlt');
  const source=read('api/shared/tasks-store.js');
  for(const name of ['listTasks','createTask','setTaskStatus','validateTaskInput']) assert.match(source,new RegExp(name));
  assert.match(source,/withTenantClient\([^\n]+\{\s*write\s*:\s*true\s*\}/s);
  assert.doesNotMatch(source,/input\.(?:tenant|tenantId|tenant_id)/);
  assert.doesNotMatch(source,/payload\.(?:tenant|tenantId|tenant_id)/);
});

test('task validation requires a meaningful title and normalizes priority',()=>{
  const store=requireFile('api/shared/tasks-store.js');
  assert.throws(()=>store.validateTaskInput({title:'   '}),error=>error?.code==='INPUT_INVALID');
  const task=store.validateTaskInput({title:'  ABD prüfen  ',priority:'p1',dueAt:'2026-09-07T08:00:00.000Z'});
  assert.equal(task.title,'ABD prüfen');
  assert.equal(task.priority,'P1');
  assert.equal(task.status,'OPEN');
  assert.equal(task.dueAt,'2026-09-07T08:00:00.000Z');
});

test('persistent task APIs use GET read plus CSRF protected POST and PATCH writes',()=>{
  assert.ok(exists('api/tasks-list/function.json'));
  const listConfig=JSON.parse(read('api/tasks-list/function.json'));
  const listTrigger=listConfig.bindings.find(binding=>binding.type==='httpTrigger');
  assert.deepEqual(listTrigger.methods,['get']);
  assert.equal(listTrigger.route,'professional-tasks');
  const listSource=read('api/tasks-list/index.js');
  assert.match(listSource,/permission:'tasks\.read'/);
  assert.match(listSource,/session\.tenant_id/);
  expectWriteHandler('task-create','post','professional-tasks','tasks.write');
  expectWriteHandler('task-status','patch','professional-tasks/{id}/status','tasks.write');
});

test('shipment create validation enforces exact six-character uppercase reference and required masterdata ids',()=>{
  const store=requireFile('api/shared/operations-write-store.js');
  const valid=store.validateShipmentCreateInput({reference:'AB12CD',customerId:'c1',locationId:'l1'});
  assert.equal(valid.reference,'AB12CD');
  assert.equal(valid.customerId,'c1');
  assert.equal(valid.locationId,'l1');
  for(const reference of ['ABC12','ABC1234','abc123','ABC-12','ABC 12']){
    assert.throws(()=>store.validateShipmentCreateInput({reference,customerId:'c1',locationId:'l1'}),error=>error?.code==='INPUT_INVALID');
  }
  assert.throws(()=>store.validateShipmentCreateInput({reference:'ABC123',customerId:'',locationId:'l1'}),error=>error?.code==='INPUT_INVALID');
  assert.throws(()=>store.validateShipmentCreateInput({reference:'ABC123',customerId:'c1',locationId:''}),error=>error?.code==='INPUT_INVALID');
});

test('shipment creation is tenant-safe gated write and validates customer-location ownership before insert',()=>{
  const source=read('api/shared/operations-write-store.js');
  assert.match(source,/createShipment/);
  assert.match(source,/withTenantClient\([^\n]+\{\s*write\s*:\s*true\s*\}/s);
  assert.match(source,/from customers c[\s\S]+customer_locations l/i);
  assert.match(source,/c\.tenant_id\s*=\s*s?et_config|c\.tenant_id|l\.tenant_id/i);
  assert.match(source,/insert into shipments/i);
  assert.match(source,/['"]Entwurf['"]/);
  assert.doesNotMatch(source,/input\.(?:tenant|tenantId|tenant_id)/);
});

test('shipment POST API requires shipments.write plus CSRF and never accepts browser tenant scope',()=>{
  expectWriteHandler('shipment-create','post','professional-operations/shipments','shipments.write');
  const source=read('api/shipment-create/index.js');
  assert.match(source,/operations-write-store/);
  assert.match(source,/createShipment\(session\.tenant_id/);
  assert.match(source,/bodyOf\(req\)/);
});

test('live operations UI exposes writes only from server meta gate and never changes environment settings',()=>{
  assert.ok(exists('assets/js/operations-write.js'),'operations write frontend fehlt');
  const source=read('assets/js/operations-write.js');
  assert.match(source,/writesEnabled/);
  assert.match(source,/Sendung erstellen/);
  assert.match(source,/Aufgabe anlegen/);
  assert.match(source,/x-professional-csrf/i);
  assert.match(source,/professional-meta/);
  assert.match(source,/method\s*:\s*['"]POST['"]/i);
  assert.match(source,/method\s*:\s*['"]PATCH['"]/i);
  assert.doesNotMatch(source,/PROFESSIONAL_ENABLE_WRITES\s*=|PROFESSIONAL_DATA_MODE\s*=/);
  assert.doesNotMatch(source,/tenantId\s*:/);
  const readOnly=read('assets/js/operations.js');
  assert.match(readOnly,/operations-write\.js/);
  assert.doesNotMatch(readOnly,/method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)/i);
});

test('write foundation errors have deterministic HTTP mappings',()=>{
  const http=read('api/shared/http.js');
  for(const [code,status] of Object.entries({WRITE_DISABLED_MIGRATION_MODE:503,SHIPMENT_EXISTS:409,SHIPMENT_NOT_FOUND:404,TASK_NOT_FOUND:404})){
    assert.match(http,new RegExp(`${code}:${status}`));
  }
});
