# ExportHUB Professional Live Shipments Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one tenant-safe Professional shipment core that reads migrated shipments, creates/processes native LIVE shipments end-to-end, and feeds the Logistics Control Center with real shipment facts.

**Architecture:** Extend the existing `shipments`, `documents`, `generated_artifacts`, `audit_events`, customer/location and tenant-setting structures rather than creating a parallel shipment system. Put lifecycle/readiness rules in server-side domain modules, persistence in tenant-scoped stores, and expose thin Azure Function handlers that reuse the current Professional session/CSRF/authorization infrastructure. Frontend modules consume server-derived shipment facts and never duplicate lifecycle/readiness calculations.

**Tech Stack:** Node.js >=20, Azure Functions using `function.json`, CommonJS API modules under `api/`, browser ES modules under `assets/js/`, PostgreSQL via `pg` 8.13.1, Node built-in test runner (`node --test test/*.test.mjs`), static HTML/CSS frontend.

**Spec:** `docs/superpowers/specs/2026-09-03-live-shipments-core-design.md`

## Global Constraints

- Repository is only `Deadshot89/ExportHub-Professional`; never write Professional code to ExportHUB Internal.
- Keep `PROFESSIONAL_DATA_MODE=migration-read-only` compatible with read-only migrated shipment data.
- Keep `PROFESSIONAL_ENABLE_CONTROL_WRITES=true`; identity/session/admin control writes must not be disabled by shipment work.
- Keep existing customer/location roles and APIs working.
- LIVE shipment writes use an independent gate `PROFESSIONAL_ENABLE_SHIPMENT_WRITES=true`.
- Carrier and packaging master-data writes remain behind `PROFESSIONAL_ENABLE_MASTERDATA_WRITES=true`.
- `MIGRATED` shipments are permanently read-only in this rollout.
- Every server mutation derives tenant from the authenticated session; tenant IDs from browser body/query are never authoritative.
- Every browser mutation requires CSRF through the existing `authorization.requireSession()` convention.
- Reference is exactly six characters `[A-Z0-9]{6}`, generated server-side when `Neue Sendung` is invoked, immutable, unique per tenant, and never reused.
- Exact pickup time/time-window is intentionally outside this plan; planned pickup date is implemented now.
- Final visual PDF template styling is outside this plan; generated Ladeliste/CMR must still be valid versioned PDFs containing the required shipment facts.
- TDD is mandatory: each task begins with a failing focused test, then minimal implementation, then the full regression suite.
- Before claiming a task complete, run `npm test`; before PR readiness, also run all frontend/API syntax checks used by Professional CI.

---

## File Structure Map

### Shared shipment backend

- `api/shared/shipment-schema.js` — idempotent shipment/carrier/packaging/workspace schema upgrade guarded by advisory lock.
- `api/shared/shipment-domain.js` — lifecycle, mutability, transition rules, reference generation, checklist/readiness orchestration.
- `api/shared/shipment-calculations.js` — total Colli/weight/LDM, CMR and ABD calculations.
- `api/shared/shipment-store.js` — tenant-scoped shipment persistence, locks, revision checks, transitions, snapshots, audit.
- `api/shared/shipment-read-model.js` — normalized list/detail/dashboard facts for both LIVE and MIGRATED data.
- `api/shared/shipment-maintenance.js` — idempotent empty-draft discard and 30-day archive maintenance.
- `api/shared/ecb-rates.js` — official ECB fetch/cache/last-available selection and deterministic conversion snapshot.
- `api/shared/document-store.js` — document records, validity/replacement lineage and generated-artifact versions.
- `api/shared/document-generator.js` — server-side Ladeliste/CMR PDF bytes and deterministic source signature.
- `api/shared/carrier-store.js` — carrier master data.
- `api/shared/packaging-store.js` — packaging master data.
- `api/shared/workspace-settings-store.js` — sender/shipping-country/timezone settings.

### Azure Function route families

- `api/shipments/` — GET shipment list, POST create LIVE draft.
- `api/shipment/` — GET detail, POST autosave/update.
- `api/shipment-lock/` — POST acquire/heartbeat/release based on request action.
- `api/shipment-action/` — POST lifecycle actions (`mark-created`, `confirm-ready`, `cancel`, `set-rework`, `clear-rework`, `archive`, `restore`).
- `api/shipment-dashboard/` — GET dashboard KPIs/action items/today rows.
- `api/shipment-documents/` — GET documents/artifacts, POST upload manual document.
- `api/shipment-document-action/` — POST replace/invalidate/generate.
- `api/shipment-pickup/` — POST QR/manual pickup confirmation.
- `api/shipment-pod/` — POST POD upload/replacement.
- `api/carriers/`, `api/carrier/`, `api/carrier-status/` — carrier master data.
- `api/packaging-types/`, `api/packaging-type/`, `api/packaging-type-status/` — packaging master data.
- `api/workspace-shipping-settings/` — GET/POST sender/shipping-country/timezone settings.
- `api/shipment-maintenance/` — timer-triggered cleanup/archive worker.

### Frontend

- `assets/js/shipments.js` — shipment navigation, list/filter, editor orchestration, server state rendering.
- `assets/js/shipment-autosave.js` — debounced autosave queue, retry schedule and visible state machine.
- `assets/js/shipment-editor.js` — editor section rendering/checklist/action wiring.
- `assets/js/shipment-documents.js` — document/version UI.
- `assets/js/carriers.js` — carrier master-data screen.
- `assets/js/workspace-settings.js` — shipping sender settings UI.
- `assets/js/overview.js` — switch dashboard from unavailable placeholders to server shipment summary.
- `assets/css/control-center.css` — shipment/control-center layouts and responsive states.
- `index.html` — Sendungen, Speditionen and Versand-Einstellungen views plus module loading.

### Tests

- `test/shipment-domain.test.mjs`
- `test/shipment-schema.test.mjs`
- `test/shipment-api.test.mjs`
- `test/shipment-read-model.test.mjs`
- `test/shipment-ui.test.mjs`
- `test/shipment-masterdata.test.mjs`
- `test/shipment-customs.test.mjs`
- `test/shipment-documents.test.mjs`
- `test/shipment-pickup.test.mjs`
- `test/shipment-maintenance.test.mjs`
- existing `test/control-center-ui.test.mjs`, `test/masterdata.test.mjs`, `test/security.test.mjs` remain regression gates.

---

### Task 1: Shipment schema, write gate and deterministic HTTP errors

**Files:**
- Create: `api/shared/shipment-schema.js`
- Modify: `api/shared/database.js`
- Modify: `api/shared/http.js`
- Modify: `schema/postgres.sql`
- Create: `test/shipment-schema.test.mjs`

**Interfaces:**
- Consumes: existing `getPool()`, `transact()`, `set_config('app.tenant_id',...)`, and masterdata schema pattern.
- Produces: `ensureShipmentSchema()`, `shipmentWritesEnabled()`, `withTenantShipmentClient(tenantId, fn, {write})`, and SQL objects later stores rely on.

- [ ] **Step 1: Write failing schema/write-gate tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('shipment writes have an independent environment gate',()=>{
  const src=fs.readFileSync(new URL('../api/shared/database.js',import.meta.url),'utf8');
  assert.match(src,/PROFESSIONAL_ENABLE_SHIPMENT_WRITES/);
  assert.match(src,/function shipmentWritesEnabled/);
  assert.match(src,/function withTenantShipmentClient|async function withTenantShipmentClient/);
  assert.doesNotMatch(src,/function shipmentWritesEnabled\([^)]*\)\s*\{[^}]*PROFESSIONAL_ENABLE_WRITES/s);
});

test('shipment schema has source kind revision lock snapshots and tenant indexes',()=>{
  const sql=fs.readFileSync(new URL('../api/shared/shipment-schema.js',import.meta.url),'utf8');
  for(const token of ['source_kind','revision','recipient_snapshot','sender_snapshot','carrier_snapshot','planned_pickup_date','completed_at','archived_at','discarded_at']) assert.match(sql,new RegExp(token,'i'));
  assert.match(sql,/create table if not exists shipment_edit_locks/i);
  assert.match(sql,/create table if not exists shipment_colli/i);
  assert.match(sql,/create table if not exists carriers/i);
  assert.match(sql,/create table if not exists packaging_types/i);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:
```bash
node --test test/shipment-schema.test.mjs
```
Expected: FAIL because `shipment-schema.js`, shipment gate and columns do not yet exist.

- [ ] **Step 3: Add idempotent shipment schema upgrade**

Create `api/shared/shipment-schema.js` with one `SHIPMENT_SCHEMA_SQL` string and advisory lock. Required core shape:

```js
'use strict';
const SHIPMENT_SCHEMA_SQL=`
alter table shipments add column if not exists source_kind text not null default 'MIGRATED';
alter table shipments add column if not exists revision bigint not null default 0;
alter table shipments add column if not exists recipient_snapshot jsonb not null default '{}'::jsonb;
alter table shipments add column if not exists sender_snapshot jsonb not null default '{}'::jsonb;
alter table shipments add column if not exists carrier_snapshot jsonb not null default '{}'::jsonb;
alter table shipments add column if not exists fx_snapshot jsonb not null default '{}'::jsonb;
alter table shipments add column if not exists readiness jsonb not null default '{}'::jsonb;
alter table shipments add column if not exists planned_pickup_date date;
alter table shipments add column if not exists completed_at timestamptz;
alter table shipments add column if not exists archived_at timestamptz;
alter table shipments add column if not exists discarded_at timestamptz;
alter table shipments add column if not exists rework jsonb not null default '{}'::jsonb;
alter table shipments add column if not exists updated_at timestamptz not null default now();
create unique index if not exists shipments_tenant_reference_uq on shipments(tenant_id,reference);
create index if not exists shipments_tenant_status_pickup_idx on shipments(tenant_id,status,planned_pickup_date);

create table if not exists shipment_edit_locks (
  tenant_id uuid not null references tenants(id),
  shipment_id uuid not null references shipments(id) on delete cascade,
  user_id uuid not null references app_users(id),
  lock_token text not null,
  acquired_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  primary key(tenant_id,shipment_id)
);

create table if not exists shipment_colli (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  shipment_id uuid not null references shipments(id) on delete cascade,
  packaging_type_id uuid,
  packaging_name_snapshot text not null,
  quantity integer not null check(quantity>0),
  weight_kg numeric(14,3) not null check(weight_kg>=0),
  length_cm numeric(12,2), width_cm numeric(12,2), height_cm numeric(12,2),
  ldm numeric(14,4) not null check(ldm>=0),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists carriers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  active boolean not null default true,
  abd_required_default boolean not null default false,
  contact_name text, email text, phone text, portal_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists carriers_tenant_name_uq on carriers(tenant_id,lower(name));

create table if not exists packaging_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  active boolean not null default true,
  length_cm numeric(12,2), width_cm numeric(12,2), height_cm numeric(12,2),
  ldm_mode text not null check(ldm_mode in ('FIXED_PER_UNIT','FOOTPRINT')),
  fixed_ldm_per_unit numeric(14,4),
  allow_length boolean not null default false,
  allow_width boolean not null default false,
  allow_height boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists packaging_types_tenant_name_uq on packaging_types(tenant_id,lower(name));
`;
async function applyShipmentSchema(client){
  await client.query('BEGIN');
  try{
    await client.query("select pg_advisory_xact_lock(hashtext('exporthub_professional_shipment_schema_v1'))");
    await client.query(SHIPMENT_SCHEMA_SQL);
    await client.query('COMMIT');
  }catch(err){try{await client.query('ROLLBACK')}catch{};throw err;}
}
module.exports={SHIPMENT_SCHEMA_SQL,applyShipmentSchema};
```

Also add RLS policies for every new tenant table and mirror the same structural SQL in `schema/postgres.sql`.

- [ ] **Step 4: Add database gate and deterministic error mappings**

In `api/shared/database.js` add:

```js
const {applyShipmentSchema}=require('./shipment-schema');
let shipmentSchemaPromise=null,shipmentSchemaReady=false;
function shipmentWritesEnabled(){return process.env.PROFESSIONAL_ENABLE_SHIPMENT_WRITES==='true';}
async function ensureShipmentSchema(){
  if(shipmentSchemaReady)return true;
  if(!controlWritesEnabled())throw Object.assign(new Error('Sendungs-Schemaaktualisierung ist deaktiviert.'),{code:'SHIPMENT_SCHEMA_UPGRADE_DISABLED'});
  if(!shipmentSchemaPromise)shipmentSchemaPromise=(async()=>{
    const client=await getPool().connect();
    try{await applyShipmentSchema(client);shipmentSchemaReady=true;return true;}finally{client.release();}
  })().catch(err=>{shipmentSchemaPromise=null;throw err;});
  return shipmentSchemaPromise;
}
async function withTenantShipmentClient(tenantId,fn,{write=false}={}){
  const tid=String(tenantId||'').trim();
  if(!tid)throw Object.assign(new Error('Tenant required.'),{code:'TENANT_REQUIRED'});
  if(write&&!shipmentWritesEnabled())throw Object.assign(new Error('Sendungs-Schreibzugriffe sind deaktiviert.'),{code:'SHIPMENT_WRITES_DISABLED'});
  await ensureShipmentSchema();
  const client=await getPool().connect();
  try{return await transact(client,async c=>{await c.query("select set_config('app.tenant_id',$1,true)",[tid]);return fn(c);},{write,readOnly:!write});}finally{client.release();}
}
```

Expose only the boolean in `status()` and map shipment errors in `api/shared/http.js`, including:

```js
SHIPMENT_WRITES_DISABLED:503,
SHIPMENT_SCHEMA_UPGRADE_DISABLED:503,
SHIPMENT_NOT_FOUND:404,
SHIPMENT_READ_ONLY:409,
SHIPMENT_LOCKED:423,
SHIPMENT_LOCK_INVALID:409,
SHIPMENT_REVISION_CONFLICT:409,
SHIPMENT_TRANSITION_INVALID:409,
SHIPMENT_NOT_READY:409,
COLLI_MISMATCH:409,
DOCUMENT_REQUIRED:409,
FX_RATE_UNAVAILABLE:503
```

- [ ] **Step 5: Run focused and full tests**

```bash
node --test test/shipment-schema.test.mjs
npm test
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add api/shared/shipment-schema.js api/shared/database.js api/shared/http.js schema/postgres.sql test/shipment-schema.test.mjs
git commit -m "feat: add Professional shipment schema foundation"
```

---

### Task 2: Server shipment domain, references and lifecycle invariants

**Files:**
- Create: `api/shared/shipment-domain.js`
- Create: `api/shared/shipment-calculations.js`
- Create: `test/shipment-domain.test.mjs`

**Interfaces:**
- Produces `generateReference(randomBytes)`, `assertMutable(shipment)`, `evaluateCreation(shipment, context)`, `evaluateReadiness(shipment, context)`, `applyLifecycleAction(shipment, action, context)`, `calculateTotals(rows, packagingById)`, `cmrRequired(input)`, `abdDecision(input)`.
- Later store/API tasks must call these functions instead of duplicating rules.

- [ ] **Step 1: Write failing domain tests**

```js
const domain=require('../api/shared/shipment-domain.js');
const calc=require('../api/shared/shipment-calculations.js');

test('reference is six uppercase alphanumeric characters',()=>{
  assert.match(domain.generateReference(()=>Buffer.from([0,1,2,3,4,5,6,7,8,9])),/^[A-Z0-9]{6}$/);
});

test('migrated and picked-up shipments reject ordinary mutation',()=>{
  assert.throws(()=>domain.assertMutable({source_kind:'MIGRATED',status:'Entwurf'}),e=>e.code==='SHIPMENT_READ_ONLY');
  assert.throws(()=>domain.assertMutable({source_kind:'LIVE',status:'Abgeholt'}),e=>e.code==='SHIPMENT_READ_ONLY');
});

test('ready confirmation needs green readiness',()=>{
  assert.throws(()=>domain.applyLifecycleAction({source_kind:'LIVE',status:'Erstellt'},'confirm-ready',{readiness:{ready:false}}),e=>e.code==='SHIPMENT_NOT_READY');
});

test('ABD rule is non-EU plus value or carrier',()=>{
  assert.equal(calc.abdDecision({isEuDestination:false,goodsValueEur:1000,carrierRequiresAbd:false}).required,false);
  assert.equal(calc.abdDecision({isEuDestination:false,goodsValueEur:1000.01,carrierRequiresAbd:false}).required,true);
  assert.equal(calc.abdDecision({isEuDestination:false,goodsValueEur:50,carrierRequiresAbd:true}).required,true);
  assert.equal(calc.abdDecision({isEuDestination:true,goodsValueEur:5000,carrierRequiresAbd:true}).required,false);
});
```

- [ ] **Step 2: Run RED**

```bash
node --test test/shipment-domain.test.mjs
```
Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement deterministic reference/lifecycle domain**

Use Node `crypto` and rejection-safe random sampling so character distribution is not biased:

```js
const crypto=require('node:crypto');
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function generateReference(randomBytes=crypto.randomBytes){
  let out='';
  while(out.length<6){
    for(const byte of randomBytes(12)){
      if(byte>=252)continue;
      out+=ALPHABET[byte%36];
      if(out.length===6)break;
    }
  }
  return out;
}
```

Define lifecycle constants and explicit action map. `Nachbearbeitung` remains an exception object and never overwrites the base lifecycle status. `applyLifecycleAction()` returns the new state fields; persistence/audit stays in the store.

- [ ] **Step 4: Implement calculation helpers**

```js
function cmrRequired({destinationCountryIso,shippingCountryIso}){
  const dst=String(destinationCountryIso||'').trim().toUpperCase();
  const src=String(shippingCountryIso||'').trim().toUpperCase();
  if(!dst||!src)return {required:false,resolved:false,reason:'COUNTRY_MISSING'};
  return {required:dst!==src,resolved:true,reason:dst!==src?'CROSS_BORDER':'DOMESTIC'};
}
function abdDecision({isEuDestination,goodsValueEur,carrierRequiresAbd}){
  if(typeof isEuDestination!=='boolean'||!Number.isFinite(Number(goodsValueEur)))return {required:false,resolved:false,reason:'CUSTOMS_FACTS_MISSING'};
  const required=!isEuDestination&&(Number(goodsValueEur)>1000||carrierRequiresAbd===true);
  return {required,resolved:true,reason:required?(carrierRequiresAbd?'NON_EU_CARRIER':'NON_EU_VALUE'):(isEuDestination?'EU_DESTINATION':'NON_EU_BELOW_THRESHOLD')};
}
```

For `FOOTPRINT` LDM use `length_m * width_m / 2.4` per unit, rounded to four decimals; for `FIXED_PER_UNIT`, multiply the configured fixed value by physical quantity. Never accept caller-provided LDM.

- [ ] **Step 5: Run focused and full tests**

```bash
node --test test/shipment-domain.test.mjs
npm test
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/shared/shipment-domain.js api/shared/shipment-calculations.js test/shipment-domain.test.mjs
git commit -m "feat: add shipment lifecycle and calculations"
```

---

### Task 3: Read-only migrated shipment list/detail and dashboard read model

**Files:**
- Create: `api/shared/shipment-read-model.js`
- Create: `api/shared/shipment-store.js`
- Create: `api/shipments/index.js`
- Create: `api/shipments/function.json`
- Create: `api/shipment/index.js`
- Create: `api/shipment/function.json`
- Create: `api/shipment-dashboard/index.js`
- Create: `api/shipment-dashboard/function.json`
- Create: `test/shipment-read-model.test.mjs`
- Create: `test/shipment-api.test.mjs`
- Modify: `assets/js/overview.js`
- Modify: `test/control-center-ui.test.mjs`

**Interfaces:**
- `listShipments(tenantId, filters)` returns normalized rows with `sourceKind`, `reference`, `status`, `recipientName`, `plannedPickupDate`, `readOnly`, `actionRequired`.
- `getShipment(tenantId, shipmentId)` returns normalized detail.
- `getShipmentDashboard(tenantId, localDate)` returns `{openShipments,pickupsToday,missingDocuments,actionRequired,todayRows,actions,recentActivity}`.

- [ ] **Step 1: Write failing read-model tests from migration-normalized data**

Tests must prove:

```js
assert.equal(row.sourceKind,'MIGRATED');
assert.equal(row.readOnly,true);
assert.equal(summary.openShipments,2);
assert.equal(summary.pickupsToday.open,1);
assert.equal(summary.pickupsToday.pickedUp,1);
assert.equal(summary.todayRows.every(r=>!r.fake),true);
```

Use fixtures containing canonical statuses `Erstellt`, `Bereit zur Abholung`, `Abgeholt`, `Abgeschlossen`, `Archiviert`, `Storniert` and verify completed/archived/cancelled do not inflate `openShipments`.

- [ ] **Step 2: Run RED**

```bash
node --test test/shipment-read-model.test.mjs test/shipment-api.test.mjs
```

- [ ] **Step 3: Implement read-only store/read model**

`shipment-store.js` read methods use `withTenantShipmentClient(...,{write:false})` and query by `tenant_id` under RLS. Existing rows without `source_kind` are normalized by the schema default/migration policy to `MIGRATED` unless explicitly created by the LIVE creation path.

Keep SQL fields index-friendly:

```sql
select s.id,s.reference,s.source_kind,s.status,s.source_status,s.process_status,
       s.pod_evidence,s.locked,s.picked_up_at,s.actual_pickup_date,
       s.planned_pickup_date,s.created_at,s.updated_at,
       c.account customer_account,c.name customer_name,
       l.name location_name,l.city,l.country
  from shipments s
  left join customers c on c.tenant_id=s.tenant_id and c.id=s.customer_id
  left join customer_locations l on l.tenant_id=s.tenant_id and l.id=s.location_id
 where s.tenant_id=$1
   and s.discarded_at is null
 order by coalesce(s.updated_at,s.created_at) desc
```

- [ ] **Step 4: Add thin GET routes with server permissions**

Use exact routes:

```json
{"route":"professional-shipments","methods":["get","post"]}
{"route":"professional-shipments/{shipmentId}","methods":["get","post"]}
{"route":"professional-shipments/dashboard","methods":["get"]}
```

For this task, POST paths return `SHIPMENT_WRITES_DISABLED` until Task 4 implements LIVE creation/update. GET handlers require `shipments.read` and only pass `session.tenant_id` to the store.

- [ ] **Step 5: Wire Overview to real dashboard endpoint**

Replace unavailable KPI placeholders with `/api/professional-shipments/dashboard`. Preserve masterdata action items by merging them with shipment actions, not overwriting them.

The rendered KPI contract becomes:

```js
openShipments.textContent=fmt(data.openShipments||0);
pickupsToday.textContent=fmt((data.pickupsToday?.open||0)+(data.pickupsToday?.pickedUp||0));
missingDocuments.textContent=fmt(data.missingDocuments||0);
actionRequired.textContent=fmt((data.actions||[]).length+masterdataActions.length);
```

- [ ] **Step 6: Run focused/full tests and syntax checks**

```bash
node --test test/shipment-read-model.test.mjs test/shipment-api.test.mjs test/control-center-ui.test.mjs
node --check assets/js/overview.js
npm test
```

- [ ] **Step 7: Commit**

```bash
git add api/shared/shipment-read-model.js api/shared/shipment-store.js api/shipments api/shipment api/shipment-dashboard assets/js/overview.js test/shipment-read-model.test.mjs test/shipment-api.test.mjs test/control-center-ui.test.mjs
git commit -m "feat: expose migrated shipments and live dashboard facts"
```

---

### Task 4: LIVE draft creation, immutable reference, snapshots, revision and edit locks

**Files:**
- Modify: `api/shared/shipment-store.js`
- Modify: `api/shared/shipment-domain.js`
- Modify: `api/shipments/index.js`
- Modify: `api/shipment/index.js`
- Create: `api/shipment-lock/index.js`
- Create: `api/shipment-lock/function.json`
- Create: `api/shipment-action/index.js`
- Create: `api/shipment-action/function.json`
- Modify: `test/shipment-api.test.mjs`
- Create: `test/shipment-lock.test.mjs`

**Interfaces:**
- `createDraft(tenantId,userId)` returns `{shipment,lock}` with `sourceKind:'LIVE'`, `status:'Entwurf'` and generated reference.
- `acquireEditLock(tenantId,shipmentId,userId)` returns opaque `lockToken` and timestamps.
- `updateShipment(tenantId,shipmentId,userId,{lockToken,revision,patch})` increments revision exactly once per successful mutation.
- `releaseEditLock(...)`, `heartbeatEditLock(...)`, `forceReleaseEditLock(...)`.

- [ ] **Step 1: Write failing creation/locking tests**

Include assertions that:

```js
assert.match(created.reference,/^[A-Z0-9]{6}$/);
assert.equal(created.source_kind,'LIVE');
assert.equal(created.status,'Entwurf');
assert.throws(()=>updateMigrated(),e=>e.code==='SHIPMENT_READ_ONLY');
assert.throws(()=>updateWithWrongLock(),e=>e.code==='SHIPMENT_LOCK_INVALID');
assert.throws(()=>updateWithOldRevision(),e=>e.code==='SHIPMENT_REVISION_CONFLICT');
```

Also test a deterministic duplicate-reference retry by stubbing the generator to return one duplicate and then one free reference.

- [ ] **Step 2: Run RED**

```bash
node --test test/shipment-api.test.mjs test/shipment-lock.test.mjs
```

- [ ] **Step 3: Implement draft creation transaction**

Within one tenant write transaction:

1. load workspace sender settings;
2. generate reference and retry on unique conflict up to 20 attempts;
3. insert `source_kind='LIVE'`, `status='Entwurf'`, sender snapshot and revision `0`;
4. insert audit `SHIPMENT_CREATED`;
5. acquire initial edit lock for the creator.

Never recycle a row/reference on later discard.

- [ ] **Step 4: Implement lock/revision enforcement**

Lock expiry is exactly 15 minutes of no genuine edit activity. Mutating autosave updates `last_activity_at`; a passive GET never does.

Use atomic lock acquisition:

```sql
insert into shipment_edit_locks(tenant_id,shipment_id,user_id,lock_token)
values($1,$2,$3,$4)
on conflict(tenant_id,shipment_id) do update
set user_id=excluded.user_id,lock_token=excluded.lock_token,acquired_at=now(),last_activity_at=now()
where shipment_edit_locks.last_activity_at < now()-interval '15 minutes'
returning *
```

If no row returns, fetch current owner and raise `SHIPMENT_LOCKED`.

Autosave updates must include:

```sql
update shipments
   set updated_at=now(),revision=revision+1,...
 where tenant_id=$1 and id=$2 and revision=$3 and source_kind='LIVE'
 returning *
```

- [ ] **Step 5: Implement route permissions/CSRF**

Create/post/update requires `shipments.write, csrf:true`. Force release requires the authenticated role to be exactly `TENANT_ADMIN` in addition to `shipments.write`.

- [ ] **Step 6: Run full verification**

```bash
node --test test/shipment-api.test.mjs test/shipment-lock.test.mjs
npm test
```

- [ ] **Step 7: Commit**

```bash
git add api/shared/shipment-store.js api/shared/shipment-domain.js api/shipments api/shipment api/shipment-lock api/shipment-action test/shipment-api.test.mjs test/shipment-lock.test.mjs
git commit -m "feat: add live shipment drafts autosave concurrency core"
```

---

### Task 5: Shipment list/editor UI, checklist and resilient autosave

**Files:**
- Create: `assets/js/shipment-autosave.js`
- Create: `assets/js/shipment-editor.js`
- Create: `assets/js/shipments.js`
- Modify: `assets/js/app.js`
- Modify: `index.html`
- Modify: `assets/css/control-center.css`
- Create: `test/shipment-ui.test.mjs`
- Modify: `.github/workflows/professional-ci.yml`
- Modify: `.github/workflows/professional-deploy.yml`

**Interfaces:**
- `createAutosaveQueue({save,onState,setTimeoutFn})` exposes `queue(patch)`, `flush()`, `dispose()`.
- `renderShipmentEditor(root, model, permissions)` renders all seven approved sections from server facts.
- `loadShipments(filters)`, `openShipment(id)`, `createShipment()` orchestrate API calls.

- [ ] **Step 1: Write failing UI contract tests**

Static tests assert exact controls/text and no duplicate domain logic:

```js
assert.match(html,/data-view="shipments"/);
assert.match(html,/Neue Sendung/);
for(const label of ['Kunde & Standort','Sendungsdaten','Colli\/LDM','Spedition','Warenwert & Zoll','Dokumente','Abholung']) assert.match(editor,new RegExp(label));
assert.match(autosave,/\[2000,5000,10000,30000/);
assert.doesNotMatch(shipmentsJs,/goodsValueEur\s*>\s*1000/); // customs stays server-side
```

- [ ] **Step 2: Run RED**

```bash
node --test test/shipment-ui.test.mjs
```

- [ ] **Step 3: Add Sendungen Control Center view**

The shipment view includes:

```html
<section class="view" data-view="shipments">
  <div class="shipment-workspace">
    <aside class="shipment-list-panel cc-panel">
      <div class="cc-toolbar"><input id="shipmentSearch" placeholder="Referenz, Kunde oder Empfänger"><select id="shipmentStatusFilter"></select><button id="newShipmentBtn" class="btn">Neue Sendung</button></div>
      <div id="shipmentList"></div>
    </aside>
    <section id="shipmentEditor" class="shipment-editor cc-panel"></section>
  </div>
</section>
```

Add dense desktop master-detail behavior and phone stacking without horizontal overflow.

- [ ] **Step 4: Implement autosave queue exactly**

Use one pending merged patch and retry delays `[2000,5000,10000,30000,60000]`, then continue at 60000 ms. Server response revision replaces local revision only after success.

```js
export function createAutosaveQueue({save,onState=()=>{},setTimeoutFn=setTimeout}){
  let pending={},timer=null,retryIndex=0,disposed=false;
  const delays=[2000,5000,10000,30000,60000];
  async function flush(){
    if(disposed||!Object.keys(pending).length)return;
    const patch=pending;pending={};onState('saving');
    try{await save(patch);retryIndex=0;onState('saved');}
    catch(err){pending={...patch,...pending};onState('error',err);timer=setTimeoutFn(flush,delays[Math.min(retryIndex++,delays.length-1)]);}
  }
  function queue(patch){pending={...pending,...patch};if(timer)clearTimeout(timer);timer=setTimeoutFn(flush,500);}
  return {queue,flush,dispose(){disposed=true;if(timer)clearTimeout(timer);}};
}
```

- [ ] **Step 5: Wire lock/read-only behavior**

If the server returns `SHIPMENT_LOCKED`, render the shipment and banner:

`Bearbeitung gesperrt – {displayName} bearbeitet diese Sendung seit {time}.`

Do not hide shipment data. Disable business inputs and retain print/read actions.

- [ ] **Step 6: Add CI/deploy guards for all new frontend modules**

Add `node --check` commands for the new modules and payload `test -f` guards in Professional deploy.

- [ ] **Step 7: Verify**

```bash
node --test test/shipment-ui.test.mjs test/control-center-ui.test.mjs
node --check assets/js/shipments.js
node --check assets/js/shipment-editor.js
node --check assets/js/shipment-autosave.js
npm test
```

- [ ] **Step 8: Commit**

```bash
git add assets/js/shipment-autosave.js assets/js/shipment-editor.js assets/js/shipments.js assets/js/app.js index.html assets/css/control-center.css test/shipment-ui.test.mjs .github/workflows/professional-ci.yml .github/workflows/professional-deploy.yml
git commit -m "feat: add Professional shipment workspace"
```

---

### Task 6: Packaging master data and Colli/LDM server calculations

**Files:**
- Create: `api/shared/packaging-store.js`
- Create: `api/packaging-types/index.js` + `function.json`
- Create: `api/packaging-type/index.js` + `function.json`
- Create: `api/packaging-type-status/index.js` + `function.json`
- Modify: `api/shared/shipment-store.js`
- Modify: `api/shared/shipment-read-model.js`
- Modify: `assets/js/shipment-editor.js`
- Create: `test/shipment-masterdata.test.mjs`
- Extend: `test/shipment-domain.test.mjs`

**Interfaces:**
- `listPackagingTypes`, `createPackagingType`, `updatePackagingType`, `setPackagingTypeActive` use masterdata gate.
- `replaceColliRows(tenantId,shipmentId,userId,{lockToken,revision,rows})` ignores any browser LDM and persists server-calculated LDM.

- [ ] **Step 1: Write RED tests for fixed and footprint LDM**

```js
assert.equal(calc.calculateRowLdm({quantity:3},{ldmMode:'FIXED_PER_UNIT',fixedLdmPerUnit:0.2}),0.6);
assert.equal(calc.calculateRowLdm({quantity:2,lengthCm:120,widthCm:80},{ldmMode:'FOOTPRINT'}),0.8);
assert.throws(()=>storeAcceptsBrowserLdm(),/server calculated/i);
```

Also test total Colli is sum of physical quantities, not number of rows.

- [ ] **Step 2: Run RED**

```bash
node --test test/shipment-masterdata.test.mjs test/shipment-domain.test.mjs
```

- [ ] **Step 3: Implement packaging CRUD using existing masterdata conventions**

Require `customers.write` is not semantically correct for this resource; add new authorization permissions `packaging.read` and `packaging.write` to the approved operational/admin roles:

- read: all six roles
- write: `TENANT_ADMIN`, `EXPORT_ADMIN`, `TEAM_LEAD`, `OPERATOR`

Use `withTenantMasterdataClient` for mutations.

- [ ] **Step 4: Implement Colli replacement in one revisioned transaction**

Delete/reinsert Colli rows is allowed because Colli rows are mutable working data before pickup; audit the logical change, and do not expose physical deletion as a document/history operation. Reject the entire mutation after pickup.

Calculate every LDM server-side from the packaging record and supplied dimensions. Return totals with the updated shipment.

- [ ] **Step 5: Update editor**

Render row inputs for packaging, physical quantity, weight and allowed dimensions. Render `LDM` as readonly text only. Show live preview only from the latest successful server response; never treat browser preview as authoritative.

- [ ] **Step 6: Verify and commit**

```bash
node --test test/shipment-masterdata.test.mjs test/shipment-domain.test.mjs test/shipment-ui.test.mjs
npm test
git add api/shared/packaging-store.js api/packaging-* api/shared/authorization.js api/shared/shipment-store.js api/shared/shipment-read-model.js assets/js/shipment-editor.js test/shipment-masterdata.test.mjs test/shipment-domain.test.mjs
git commit -m "feat: add packaging and server calculated colli ldm"
```

---

### Task 7: Carriers, workspace shipping settings and one-off recipient conversion

**Files:**
- Create: `api/shared/carrier-store.js`
- Create: `api/shared/workspace-settings-store.js`
- Create: `api/carriers/index.js` + `function.json`
- Create: `api/carrier/index.js` + `function.json`
- Create: `api/carrier-status/index.js` + `function.json`
- Create: `api/workspace-shipping-settings/index.js` + `function.json`
- Modify: `api/shared/masterdata-store.js`
- Modify: `api/shared/masterdata-validation.js`
- Modify: `api/shared/shipment-store.js`
- Create: `assets/js/carriers.js`
- Create: `assets/js/workspace-settings.js`
- Modify: `assets/js/shipment-editor.js`
- Modify: `index.html`
- Extend: `test/shipment-masterdata.test.mjs`

**Interfaces:**
- carrier CRUD stores ID-based location association while preserving legacy `carrier_name` display.
- workspace settings provide `{companyName,street,houseNumber,postalCode,city,shippingCountry,shippingCountryIso,timezone}`.
- `convertOneOffRecipient(...)` either creates new customer+location or adds location to existing customer, links shipment, and preserves recipient snapshot.

- [ ] **Step 1: Write RED tests for carrier snapshots and incomplete conversion exception**

Assert:

```js
assert.equal(snapshot.name,'Dachser');
assert.equal(snapshot.abdRequired,true);
assert.equal(converted.location.masterdataIncomplete,true);
assert.deepEqual(converted.shipment.recipient_snapshot,originalSnapshot);
```

Normal customer creation must still reject zero registration emails; only `convertOneOffRecipient` may create an incomplete location.

- [ ] **Step 2: Run RED**

```bash
node --test test/shipment-masterdata.test.mjs test/masterdata.test.mjs
```

- [ ] **Step 3: Implement carrier/workspace stores and routes**

Add authorization permissions:

- `carriers.read` all roles, `carriers.write` admin/export/team lead/operator.
- `workspace.shipping.read` `TENANT_ADMIN`, `EXPORT_ADMIN`, `TEAM_LEAD`, `AUDITOR`.
- `workspace.shipping.write` only `TENANT_ADMIN`.

Persist workspace shipping settings inside `tenant_settings.settings.shipping` and validate timezone with `Intl.DateTimeFormat(undefined,{timeZone:value})` in Node.

- [ ] **Step 4: Add controlled incomplete-location conversion path**

Add a dedicated store method that bypasses only the registration-email requirement, never the address/customer-number requirements. Persist a clear `source_metadata.masterdataIncomplete=true` marker. Existing `createLocation()` remains unchanged and strict.

- [ ] **Step 5: Add carrier/settings screens and shipment recipient conversion UI**

Add nav entries `Speditionen` and `Versand-Einstellungen`. One-off conversion modal must first request customer number, display exact-number conflict and similar-name candidates, and require explicit choice of `Neuer Kunde` or `Standort zu bestehendem Kunden`.

- [ ] **Step 6: Verify and commit**

```bash
node --test test/shipment-masterdata.test.mjs test/masterdata.test.mjs test/shipment-ui.test.mjs
node --check assets/js/carriers.js
node --check assets/js/workspace-settings.js
npm test
git add api/shared/carrier-store.js api/shared/workspace-settings-store.js api/carriers api/carrier api/carrier-status api/workspace-shipping-settings api/shared/masterdata-store.js api/shared/masterdata-validation.js api/shared/shipment-store.js api/shared/authorization.js assets/js/carriers.js assets/js/workspace-settings.js assets/js/shipment-editor.js index.html test/shipment-masterdata.test.mjs
git commit -m "feat: add carrier sender and recipient masterdata flows"
```

---

### Task 8: ECB rates, currency snapshot, CMR/ABD customs decisions

**Files:**
- Create: `api/shared/ecb-rates.js`
- Modify: `api/shared/shipment-schema.js`
- Modify: `schema/postgres.sql`
- Modify: `api/shared/shipment-store.js`
- Modify: `api/shared/shipment-domain.js`
- Modify: `api/shared/shipment-read-model.js`
- Create: `test/shipment-customs.test.mjs`
- Modify: `assets/js/shipment-editor.js`

**Interfaces:**
- `getReferenceRate(currency,{fetchFn,now})` returns `{currency,rate,rateDate,source:'ECB'}`.
- `convertToEur({amount,currency},rateSnapshot)` returns immutable conversion facts.
- store computes/stores `fx_snapshot`, `abd_required`, `abd_reason`, `cmr_required` from server facts.

- [ ] **Step 1: Write RED tests with local fetch fixtures only**

Do not hit the internet in automated tests. Fixture XML must contain two dates and multiple currencies. Assert last available prior date is chosen when `now` is weekend/holiday.

```js
assert.deepEqual(await ecb.getReferenceRate('USD',{fetchFn:fixtureFetch,now:new Date('2026-09-06T10:00:00Z')}),{
  currency:'USD',rate:1.1673,rateDate:'2026-09-04',source:'ECB'
});
assert.throws(()=>ecb.getReferenceRate('XYZ',{fetchFn:fixtureFetch}),e=>e.code==='FX_RATE_UNAVAILABLE');
```

- [ ] **Step 2: Run RED**

```bash
node --test test/shipment-customs.test.mjs
```

- [ ] **Step 3: Add tenant-safe/shared ECB cache**

Create table `ecb_reference_rates(rate_date date,currency text,rate numeric,source text,fetched_at timestamptz, primary key(rate_date,currency))`. This table is global reference data, so do not apply tenant RLS to it; only server code may write it. Never accept a rate from browser input.

Parse official ECB XML with a narrow regex/extractor for `<Cube time='YYYY-MM-DD'>` and nested `<Cube currency='USD' rate='...'>`; fail closed if structure/rate is invalid. Cache successful rows.

- [ ] **Step 4: Persist FX/customs decision snapshot on goods-value/carrier/recipient changes**

The snapshot contains:

```js
{
  originalAmount:1500,
  originalCurrency:'USD',
  rate:1.1673,
  rateDate:'2026-09-04',
  source:'ECB',
  eurValue:1285.01,
  convertedAt:'...'
}
```

Destination country is only read from recipient snapshot. CMR compares recipient ISO against workspace sender snapshot ISO. EU membership lookup is server-owned fixed reference data with an explicit list of EU ISO codes covered by tests.

- [ ] **Step 5: Render customs facts without duplicate calculations**

UI displays server-provided reason text/code and snapshots. Never calculate `>1000`, EU membership or CMR rules in browser JS.

- [ ] **Step 6: Verify and commit**

```bash
node --test test/shipment-customs.test.mjs test/shipment-domain.test.mjs
npm test
git add api/shared/ecb-rates.js api/shared/shipment-schema.js schema/postgres.sql api/shared/shipment-store.js api/shared/shipment-domain.js api/shared/shipment-read-model.js assets/js/shipment-editor.js test/shipment-customs.test.mjs
git commit -m "feat: add ECB customs and CMR decisions"
```

---

### Task 9: Manual documents and versioned generated Ladeliste/CMR PDFs

**Files:**
- Modify: `api/package.json`
- Modify: `api/package-lock.json` if generated by npm install
- Create: `api/shared/document-store.js`
- Create: `api/shared/document-generator.js`
- Create: `api/shipment-documents/index.js` + `function.json`
- Create: `api/shipment-document-action/index.js` + `function.json`
- Modify: `api/shared/shipment-domain.js`
- Modify: `api/shared/shipment-read-model.js`
- Create: `assets/js/shipment-documents.js`
- Modify: `assets/js/shipment-editor.js`
- Create: `test/shipment-documents.test.mjs`

**Interfaces:**
- `listShipmentDocuments`, `addManualDocument`, `markDocumentInvalid`, `replaceDocument`, `generateArtifact`.
- generated artifact carries `version`, `status`, `signature`, `generated_at`, metadata and stored PDF bytes/storage key.
- `document-generator.js` exports `generateLoadListPdf(model)` and `generateCmrPdf(model)` returning `Buffer`.

- [ ] **Step 1: Write RED tests for immutable replacement/version semantics**

Assert that replacing document A creates B and changes A status to `REPLACED`, never deletes A. Generated artifact signatures change only when document-relevant facts change.

```js
assert.equal(history[0].status,'REPLACED');
assert.equal(history[1].status,'VALID');
assert.equal(v2.version,v1.version+1);
assert.notEqual(v2.signature,v1.signature);
```

- [ ] **Step 2: Run RED**

```bash
node --test test/shipment-documents.test.mjs
```

- [ ] **Step 3: Add a pinned PDF dependency**

Use `pdf-lib` pinned to an exact tested version in `api/package.json`; run `npm install --prefix api --save-exact pdf-lib@1.17.1`. The API lockfile must be committed if npm creates/updates it.

- [ ] **Step 4: Implement document storage lifecycle**

Extend `documents` with `status` (`VALID`,`REPLACED`,`INVALID`), `replaces_document_id`, `invalidated_at`, `invalidated_by`. Do not physically delete document rows.

Use existing storage-key conventions if a storage provider exists; otherwise persist metadata and base64/byte storage only through the current deployment-supported document storage mechanism discovered during implementation. The implementation may not silently claim durable document storage without a configured durable provider; if durable storage is not available, the route must fail with `DOCUMENT_STORAGE_UNAVAILABLE` rather than pretend success.

- [ ] **Step 5: Generate deterministic minimum-valid PDFs**

`pdf-lib` pages must contain, at minimum:

Ladeliste: reference, sender snapshot, recipient snapshot, planned pickup date, carrier, Colli rows, total Colli, total weight, total LDM.

CMR: sender, consignee, carrier, shipment reference, goods/Colli summary, gross weight, place/date fields supported by current shipment facts.

Compute SHA-256 signature from canonical JSON of document-relevant facts. If signature equals the latest valid generated artifact, reuse it; otherwise create next version. Mark prior current artifact `STALE` when relevant shipment facts change.

- [ ] **Step 6: Enforce readiness document requirements**

`evaluateReadiness()` must require valid Lieferschein + current Ladeliste, plus current CMR if `cmrRequired`, plus valid ABD if `abdRequired`. A `STALE`, `INVALID` or `REPLACED` item never satisfies readiness.

- [ ] **Step 7: Wire document UI and verify**

```bash
node --test test/shipment-documents.test.mjs test/shipment-domain.test.mjs test/shipment-ui.test.mjs
node --check assets/js/shipment-documents.js
npm test
git add api/package.json api/package-lock.json api/shared/document-store.js api/shared/document-generator.js api/shipment-documents api/shipment-document-action api/shared/shipment-domain.js api/shared/shipment-read-model.js assets/js/shipment-documents.js assets/js/shipment-editor.js test/shipment-documents.test.mjs
git commit -m "feat: add immutable shipment documents and generated versions"
```

---

### Task 10: Created/readiness transitions and automatic generated-document triggers

**Files:**
- Modify: `api/shared/shipment-domain.js`
- Modify: `api/shared/shipment-store.js`
- Modify: `api/shared/document-store.js`
- Modify: `api/shipment-action/index.js`
- Extend: `test/shipment-domain.test.mjs`
- Extend: `test/shipment-documents.test.mjs`
- Modify: `assets/js/shipment-editor.js`

**Interfaces:**
- `markCreated(...)` validates minimum creation facts then atomically transitions and generates Ladeliste v1 / CMR v1 when required.
- `confirmReady(...)` regenerates stale required artifacts, re-evaluates readiness in the same transaction boundary, then moves to `Bereit zur Abholung` only when green.

- [ ] **Step 1: Write RED transition tests**

Test missing recipient/date/registration email; generated artifact creation on `mark-created`; stale regeneration before `confirm-ready`; missing ABD blocks ready.

- [ ] **Step 2: Run RED**

```bash
node --test test/shipment-domain.test.mjs test/shipment-documents.test.mjs
```

- [ ] **Step 3: Implement transaction orchestration**

The action store order is exact:

```text
lock shipment row -> verify LIVE/unlocked/revision -> verify edit lock -> validate creation/readiness -> generate required artifacts -> persist lifecycle/revision -> write audit -> commit
```

Do not update status before successful generation/validation.

- [ ] **Step 4: Add user actions to editor**

Show `Als Erstellt markieren` only for eligible draft writers. Show `Bereit zur Abholung bestätigen` only when server checklist says `readiness.ready=true`. Button click still calls server validation; visible button is not authorization.

- [ ] **Step 5: Verify and commit**

```bash
node --test test/shipment-domain.test.mjs test/shipment-documents.test.mjs test/shipment-ui.test.mjs
npm test
git add api/shared/shipment-domain.js api/shared/shipment-store.js api/shared/document-store.js api/shipment-action/index.js assets/js/shipment-editor.js test/shipment-domain.test.mjs test/shipment-documents.test.mjs
git commit -m "feat: enforce created and pickup readiness transitions"
```

---

### Task 11: QR/manual pickup, exact Colli verification, POD and automatic completion

**Files:**
- Create: `api/shipment-pickup/index.js` + `function.json`
- Create: `api/shipment-pod/index.js` + `function.json`
- Modify: `api/shared/shipment-store.js`
- Modify: `api/shared/shipment-domain.js`
- Modify: `api/shared/document-store.js`
- Create: `test/shipment-pickup.test.mjs`
- Modify: `assets/js/shipment-editor.js`
- Modify: `assets/js/shipment-documents.js`

**Interfaces:**
- `confirmPickup(tenantId,shipmentId,user,{method,confirmedTotalColli})`.
- `addPod(...)`, `replacePod(...)` automatically evaluate POD/completion transitions.

- [ ] **Step 1: Write RED pickup/POD tests**

Required assertions:

```js
assert.throws(()=>confirmPickup({expected:8,actual:7}),e=>e.code==='COLLI_MISMATCH');
assert.equal(afterMismatch.status,'Bereit zur Abholung');
assert.equal(afterMismatch.rework.active,true);
assert.equal(manualOperatorDenied.code,'FORBIDDEN');
assert.equal(validPod.status,'POD vorhanden');
assert.equal(completePod.status,'Abgeschlossen');
```

Also prove no role can bypass Colli mismatch.

- [ ] **Step 2: Run RED**

```bash
node --test test/shipment-pickup.test.mjs
```

- [ ] **Step 3: Implement pickup rules**

QR route uses `pickup.confirm`; manual mode additionally checks role is `TENANT_ADMIN` or `EXPORT_ADMIN`. Both call the exact same domain validation. On mismatch, persist rework + audit in a transaction and return `COLLI_MISMATCH`; do not change lifecycle.

Successful pickup stores `picked_up_at`, `actual_pickup_date` derived in workspace timezone, user ID, method, expected/confirmed total Colli in audit metadata and then makes ordinary business-field mutations fail.

- [ ] **Step 4: Implement POD lifecycle**

POD requires shipment already picked up. Upload/replacement uses immutable document semantics. After valid POD write:

```js
if(status==='Abgeholt')status='POD vorhanden';
if(status==='POD vorhanden' && noMandatoryBlockers)status='Abgeschlossen';
```

Set `completed_at=now()` exactly when entering `Abgeschlossen` and audit both automatic transitions.

- [ ] **Step 5: Verify and commit**

```bash
node --test test/shipment-pickup.test.mjs test/shipment-documents.test.mjs test/shipment-domain.test.mjs
npm test
git add api/shipment-pickup api/shipment-pod api/shared/shipment-store.js api/shared/shipment-domain.js api/shared/document-store.js assets/js/shipment-editor.js assets/js/shipment-documents.js test/shipment-pickup.test.mjs
git commit -m "feat: add pickup POD and automatic completion"
```

---

### Task 12: Cancellation, rework, archive restore and scheduled maintenance

**Files:**
- Create: `api/shared/shipment-maintenance.js`
- Create: `api/shipment-maintenance/index.js`
- Create: `api/shipment-maintenance/function.json`
- Modify: `api/shipment-action/index.js`
- Modify: `api/shared/shipment-store.js`
- Create: `test/shipment-maintenance.test.mjs`
- Extend: `test/shipment-domain.test.mjs`
- Modify: `assets/js/shipment-editor.js`

**Interfaces:**
- `discardEmptyDrafts({olderThanHours:24})`
- `archiveCompleted({olderThanDays:30})`
- manual actions `cancel`, `set-rework`, `clear-rework`, `archive`, `restore`.

- [ ] **Step 1: Write RED maintenance/admin-action tests**

Assert empty draft with no business data is soft-discarded after 24h, non-empty draft is retained, reference row remains. Assert 30-day archive based on `completed_at`, early archive role restrictions, restore only tenant admin + non-empty reason.

- [ ] **Step 2: Run RED**

```bash
node --test test/shipment-maintenance.test.mjs test/shipment-domain.test.mjs
```

- [ ] **Step 3: Implement idempotent maintenance**

Use set-based SQL with `returning id` and per-row audit insertion in one server control transaction. A second run over the same timestamp window must change zero rows.

Timer trigger:

```json
{
  "bindings":[
    {"name":"timer","type":"timerTrigger","direction":"in","schedule":"0 15 * * * *"}
  ]
}
```

Hourly is sufficient; date-based semantics are evaluated using each tenant workspace timezone when selecting archive/due-state boundaries.

- [ ] **Step 4: Implement privileged action reasons**

Cancellation and manual rework require `TENANT_ADMIN`/`EXPORT_ADMIN` plus non-empty trimmed reason. Restore requires exactly `TENANT_ADMIN` plus reason. `clear-rework` may automatically clear system rework once blockers resolve; manually created rework requires an admin reason to clear.

- [ ] **Step 5: Verify and commit**

```bash
node --test test/shipment-maintenance.test.mjs test/shipment-domain.test.mjs
npm test
git add api/shared/shipment-maintenance.js api/shipment-maintenance api/shipment-action/index.js api/shared/shipment-store.js assets/js/shipment-editor.js test/shipment-maintenance.test.mjs test/shipment-domain.test.mjs
git commit -m "feat: add shipment rework cancellation and archive maintenance"
```

---

### Task 13: Final shipment dashboard/action model and activity feed

**Files:**
- Modify: `api/shared/shipment-read-model.js`
- Modify: `api/shipment-dashboard/index.js`
- Modify: `assets/js/overview.js`
- Modify: `assets/js/shipments.js`
- Modify: `assets/css/control-center.css`
- Extend: `test/shipment-read-model.test.mjs`
- Extend: `test/control-center-ui.test.mjs`

**Interfaces:**
- dashboard response is the sole source for shipment KPIs/action items/today rows/recent shipment activity.

- [ ] **Step 1: Write RED exact-counter tests**

Build a fixture set covering overdue pickup, today pickup, missing Lieferschein, stale generated CMR, ABD required/missing, rework, unresolved FX, orphaned lock, completed, archived and cancelled. Compute expected counters explicitly and compare full object equality.

- [ ] **Step 2: Run RED**

```bash
node --test test/shipment-read-model.test.mjs test/control-center-ui.test.mjs
```

- [ ] **Step 3: Complete server action model**

Every action item returns:

```js
{
  code:'PICKUP_OVERDUE',
  severity:'warning',
  shipmentId:'...',
  reference:'ABC123',
  title:'Abholung überfällig',
  detail:'Geplant für 02.09.2026',
  target:'shipment'
}
```

Activity feed uses actual `audit_events` and does not synthesize events from timestamps when an audit event exists.

- [ ] **Step 4: Replace all remaining unavailable shipment placeholders in Overview**

Remove `Datenquelle noch nicht live` and `Livequelle folgt` only after the dashboard endpoint contract is fully implemented and tested. Keep truthful empty states when counters are zero.

- [ ] **Step 5: Verify and commit**

```bash
node --test test/shipment-read-model.test.mjs test/control-center-ui.test.mjs test/shipment-ui.test.mjs
node --check assets/js/overview.js
node --check assets/js/shipments.js
npm test
git add api/shared/shipment-read-model.js api/shipment-dashboard/index.js assets/js/overview.js assets/js/shipments.js assets/css/control-center.css test/shipment-read-model.test.mjs test/control-center-ui.test.mjs
git commit -m "feat: complete live shipment control center data"
```

---

### Task 14: Security regression, CI/runtime guards and rollout readiness

**Files:**
- Modify: `test/security.test.mjs`
- Modify: `.github/workflows/professional-ci.yml`
- Modify: `.github/workflows/professional-deploy.yml`
- Modify: `api/professional-meta/index.js`
- Modify: `professional-project.json` if it contains environment/runtime documentation
- Create: `docs/live-shipments-rollout.md`

**Interfaces:**
- No product logic; this task makes the completed subsystem verifiable and safely operable.

- [ ] **Step 1: Add RED security/static-invariant tests**

Assert every shipment mutation route contains `csrf:true`, uses `session.tenant_id`, never reads request tenant as authority, and all shipment runtime modules are syntax-checked by CI. Assert deploy payload includes all new frontend files.

Also assert database status exposes only booleans, never secret values:

```js
assert.match(meta,/shipmentWritesEnabled/);
assert.doesNotMatch(meta,/PROFESSIONAL_DATABASE_URL/);
assert.doesNotMatch(meta,/SESSION_SECRET/);
```

- [ ] **Step 2: Run RED**

```bash
node --test test/security.test.mjs test/shipment-api.test.mjs
```

- [ ] **Step 3: Update CI syntax/runtime checks**

CI must run:

```bash
node --check assets/js/shipments.js
node --check assets/js/shipment-editor.js
node --check assets/js/shipment-autosave.js
node --check assets/js/shipment-documents.js
node --check assets/js/carriers.js
node --check assets/js/workspace-settings.js
node -e "require('./api/shared/shipment-schema.js');require('./api/shared/shipment-domain.js');require('./api/shared/shipment-calculations.js');require('./api/shared/shipment-store.js');require('./api/shared/shipment-read-model.js');require('./api/shared/ecb-rates.js');require('./api/shared/document-store.js');require('./api/shared/document-generator.js');require('./api/shared/shipment-maintenance.js')"
```

Deploy payload guards must assert `index.html`, shipment CSS and every new JS file exists under `.deploy` before calling Azure deploy.

- [ ] **Step 4: Write exact rollout document**

`docs/live-shipments-rollout.md` must state the required environment state without secrets:

```text
PROFESSIONAL_ENABLE_CONTROL_WRITES=true
PROFESSIONAL_DATA_MODE=migration-read-only
PROFESSIONAL_ENABLE_WRITES=false
PROFESSIONAL_ENABLE_MASTERDATA_WRITES=true   # only when carrier/packaging writes are intentionally enabled
PROFESSIONAL_ENABLE_SHIPMENT_WRITES=true     # only after exact-head CI is green
```

It must explicitly say migrated shipment writes remain blocked even when LIVE shipment writes are enabled.

- [ ] **Step 5: Run complete local verification**

```bash
npm test
node --check assets/js/app.js
node --check assets/js/locations.js
node --check assets/js/overview.js
node --check assets/js/ui-kit.js
node --check assets/js/shipments.js
node --check assets/js/shipment-editor.js
node --check assets/js/shipment-autosave.js
node --check assets/js/shipment-documents.js
node --check assets/js/carriers.js
node --check assets/js/workspace-settings.js
npm install --prefix api
node -e "require('./api/shared/shipment-schema.js');require('./api/shared/shipment-domain.js');require('./api/shared/shipment-calculations.js');require('./api/shared/shipment-store.js');require('./api/shared/shipment-read-model.js');require('./api/shared/ecb-rates.js');require('./api/shared/document-store.js');require('./api/shared/document-generator.js');require('./api/shared/shipment-maintenance.js')"
```
Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add test/security.test.mjs .github/workflows/professional-ci.yml .github/workflows/professional-deploy.yml api/professional-meta/index.js professional-project.json docs/live-shipments-rollout.md
git commit -m "test: harden live shipment rollout"
```

---

## Final PR / Deploy Verification

After Tasks 1–14 are green:

- [ ] Confirm branch is based on latest `main` and contains no changes from ExportHUB Internal.
- [ ] Compare changed files against the spec and this plan; no production-only legacy files or secrets may appear.
- [ ] Open a draft PR from the implementation branch to `main`.
- [ ] Wait for exact-head PR CI; do not use an older green run as evidence.
- [ ] Review diff for tenant scope, role checks, CSRF, lifecycle duplication and any browser-side customs/readiness calculations.
- [ ] Mark PR ready only after exact-head CI is green.
- [ ] Merge with expected head SHA protection.
- [ ] Verify fresh `main` CI succeeds for the exact merge SHA.
- [ ] Verify `ExportHUB Professional Deploy` succeeds for the exact same merge SHA.
- [ ] Only after successful deploy may `PROFESSIONAL_ENABLE_SHIPMENT_WRITES=true` be enabled intentionally in Azure.
- [ ] Do not claim authenticated live smoke success unless the deployed app was actually tested with an authenticated browser session.

## Plan Self-Review Result

- Spec coverage: all 27 design sections map to Tasks 1–14; the deferred pickup time-window and final PDF visual styling remain explicitly outside scope as approved.
- Placeholder scan: no implementation step depends on `TBD`, `TODO`, unnamed validation, or an undefined future module.
- Type/interface consistency: lifecycle, lock token, revision, snapshots, dashboard response, carrier/packaging and document interfaces are defined before downstream use.
- Scope: although the feature spans several capabilities, they share one shipment core and are intentionally sequenced as independently reviewable tasks rather than separate competing subsystems.