# ExportHUB Professional Live Shipments Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one tenant-safe Professional shipment core that reads migrated shipments, creates/processes native LIVE shipments end-to-end, and feeds the Logistics Control Center with real shipment facts.

**Architecture:** Extend the existing `shipments`, `documents`, `generated_artifacts`, `audit_events`, customer/location and tenant-setting structures rather than creating a parallel shipment system. Lifecycle/readiness rules live in server-side domain modules, persistence uses tenant-scoped stores, Azure Function handlers remain thin, and browser modules render server-derived state rather than reimplementing business rules.

**Tech Stack:** Node.js >=20, Azure Functions with `function.json`, CommonJS backend modules under `api/`, browser ES modules under `assets/js/`, PostgreSQL via `pg` 8.13.1, Node built-in test runner (`node --test test/*.test.mjs`), static HTML/CSS frontend, `pdf-lib` 1.17.1 for generated shipment PDFs.

**Spec:** `docs/superpowers/specs/2026-09-03-live-shipments-core-design.md`

## Global Constraints

- Repository is only `Deadshot89/ExportHub-Professional`; never write Professional code to ExportHUB Internal.
- Keep `PROFESSIONAL_DATA_MODE=migration-read-only` compatible with read-only migrated shipment data.
- Keep `PROFESSIONAL_ENABLE_CONTROL_WRITES=true`; shipment work must not disable identity/session/admin operations.
- Keep existing customer/location APIs and role behavior green.
- LIVE shipment writes use independent gate `PROFESSIONAL_ENABLE_SHIPMENT_WRITES=true`.
- Carrier and packaging writes stay behind `PROFESSIONAL_ENABLE_MASTERDATA_WRITES=true`.
- `MIGRATED` shipments stay read-only even when LIVE shipment writes are enabled.
- Every mutation derives `tenant_id` only from the authenticated session.
- Every browser mutation uses existing CSRF validation through `authorization.requireSession()`.
- Reference is exactly six characters `[A-Z0-9]{6}`, server-generated on `Neue Sendung`, immutable, unique per tenant, and never reused.
- Planned pickup date is implemented now; pickup time/time-window remains an additive later extension.
- Final visual PDF styling is deferred, but Ladeliste/CMR generated now must be valid versioned PDFs with required business facts.
- Normal shipment business data is immutable from `Abgeholt` onward.
- TDD is mandatory. Each task: failing focused test -> minimal implementation -> focused GREEN -> full regression GREEN -> commit.
- Before task completion run `npm test`; before PR readiness run all frontend/API syntax checks used by Professional CI.

---

## File Boundaries

### Backend

- `api/shared/shipment-schema.js` — idempotent schema upgrade for shipment support tables/columns.
- `api/shared/shipment-domain.js` — lifecycle, mutability, checklist/readiness, transition rules, reference generation.
- `api/shared/shipment-calculations.js` — Colli/LDM, CMR and ABD calculations.
- `api/shared/shipment-store.js` — LIVE/MIGRATED persistence, snapshots, locks, revisions, transitions and audit.
- `api/shared/shipment-read-model.js` — list/detail/dashboard facts.
- `api/shared/workspace-settings-store.js` — workspace sender/shipping country/timezone.
- `api/shared/packaging-store.js` — packaging master data.
- `api/shared/carrier-store.js` — carrier master data.
- `api/shared/ecb-rates.js` — official ECB rate retrieval/cache/conversion.
- `api/shared/document-store.js` — immutable document history and generated artifact versions.
- `api/shared/document-generator.js` — Ladeliste/CMR PDF generation.
- `api/shared/shipment-maintenance.js` — empty-draft discard and 30-day archive processing per tenant.

### Frontend

- `assets/js/shipments.js` — shipment list/navigation/API orchestration.
- `assets/js/shipment-editor.js` — seven approved editor sections and actions.
- `assets/js/shipment-autosave.js` — autosave/retry state machine.
- `assets/js/shipment-documents.js` — document/version UI.
- `assets/js/carriers.js` — carrier master-data screen.
- `assets/js/workspace-settings.js` — shipping settings screen.
- `assets/js/overview.js` — real shipment KPIs/action items/activity.
- `assets/css/control-center.css` — shipment/control-center presentation.
- `index.html` — Sendungen, Speditionen and Versand-Einstellungen views.

### New tests

- `test/shipment-schema.test.mjs`
- `test/shipment-domain.test.mjs`
- `test/shipment-read-model.test.mjs`
- `test/shipment-api.test.mjs`
- `test/shipment-lock.test.mjs`
- `test/shipment-ui.test.mjs`
- `test/shipment-masterdata.test.mjs`
- `test/shipment-customs.test.mjs`
- `test/shipment-documents.test.mjs`
- `test/shipment-pickup.test.mjs`
- `test/shipment-maintenance.test.mjs`

---

### Task 1: Shipment schema, database gate and HTTP error contract

**Files:**
- Create: `api/shared/shipment-schema.js`
- Modify: `api/shared/database.js`
- Modify: `api/shared/http.js`
- Modify: `schema/postgres.sql`
- Create: `test/shipment-schema.test.mjs`

**Interfaces:**
- Produces `shipmentWritesEnabled()`, `ensureShipmentSchema()`, `withTenantShipmentClient(tenantId, fn, {write})`.
- Produces tables/columns used by every later task.

- [ ] **Step 1: Write the failing schema/gate test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('shipment writes have their own gate',()=>{
  const src=fs.readFileSync(new URL('../api/shared/database.js',import.meta.url),'utf8');
  assert.match(src,/PROFESSIONAL_ENABLE_SHIPMENT_WRITES/);
  assert.match(src,/function shipmentWritesEnabled/);
  assert.match(src,/withTenantShipmentClient/);
  assert.doesNotMatch(src,/function shipmentWritesEnabled\([^)]*\)\s*\{[^}]*PROFESSIONAL_ENABLE_WRITES/s);
});

test('shipment schema contains live origin locks snapshots colli and document payloads',()=>{
  const src=fs.readFileSync(new URL('../api/shared/shipment-schema.js',import.meta.url),'utf8');
  for(const token of ['source_kind','revision','recipient_snapshot','sender_snapshot','carrier_snapshot','fx_snapshot','planned_pickup_date','completed_at','archived_at','discarded_at']) assert.match(src,new RegExp(token,'i'));
  for(const table of ['shipment_edit_locks','shipment_colli','carriers','packaging_types','document_payloads','generated_artifact_payloads','ecb_reference_rates']) assert.match(src,new RegExp(`create table if not exists ${table}`,'i'));
});
```

- [ ] **Step 2: Run RED**

```bash
node --test test/shipment-schema.test.mjs
```
Expected: FAIL because shipment schema/gate do not exist.

- [ ] **Step 3: Add idempotent shipment schema upgrade**

`api/shared/shipment-schema.js` must use the same transaction/advisory-lock pattern as `masterdata-schema.js` and include these exact concepts:

```sql
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

create table if not exists shipment_edit_locks(
  tenant_id uuid not null references tenants(id),
  shipment_id uuid not null references shipments(id) on delete cascade,
  user_id uuid not null references app_users(id),
  lock_token text not null,
  acquired_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  primary key(tenant_id,shipment_id)
);

create table if not exists packaging_types(
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
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists packaging_types_tenant_name_uq on packaging_types(tenant_id,lower(name));

create table if not exists carriers(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  active boolean not null default true,
  abd_required_default boolean not null default false,
  contact_name text,email text,phone text,portal_url text,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index if not exists carriers_tenant_name_uq on carriers(tenant_id,lower(name));

alter table customer_locations add column if not exists carrier_id uuid;

create table if not exists shipment_colli(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  shipment_id uuid not null references shipments(id) on delete cascade,
  packaging_type_id uuid references packaging_types(id),
  packaging_name_snapshot text not null,
  quantity integer not null check(quantity>0),
  weight_kg numeric(14,3) not null check(weight_kg>=0),
  length_cm numeric(12,2),width_cm numeric(12,2),height_cm numeric(12,2),
  ldm numeric(14,4) not null check(ldm>=0),
  position integer not null default 0,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);

alter table documents add column if not exists status text not null default 'VALID';
alter table documents add column if not exists replaces_document_id uuid;
alter table documents add column if not exists invalidated_at timestamptz;
alter table documents add column if not exists invalidated_by uuid;

create table if not exists document_payloads(
  tenant_id uuid not null references tenants(id),
  document_id uuid primary key references documents(id) on delete cascade,
  mime_type text not null,
  size_bytes bigint not null,
  sha256 text not null,
  content bytea not null,
  created_at timestamptz not null default now()
);

create table if not exists generated_artifact_payloads(
  tenant_id uuid not null references tenants(id),
  artifact_id uuid primary key references generated_artifacts(id) on delete cascade,
  mime_type text not null default 'application/pdf',
  size_bytes bigint not null,
  sha256 text not null,
  content bytea not null,
  created_at timestamptz not null default now()
);

create table if not exists ecb_reference_rates(
  rate_date date not null,
  currency text not null,
  rate numeric(20,10) not null,
  source text not null default 'ECB',
  fetched_at timestamptz not null default now(),
  primary key(rate_date,currency)
);
```

Enable tenant RLS and `tenant_isolation` policy on `shipment_edit_locks`, `shipment_colli`, `carriers`, `packaging_types`, `document_payloads`, `generated_artifact_payloads`. `ecb_reference_rates` is global server-owned reference data and does not get tenant RLS. Mirror structural SQL in `schema/postgres.sql`.

- [ ] **Step 4: Add shipment gate/client and error map**

```js
const {applyShipmentSchema}=require('./shipment-schema');
function shipmentWritesEnabled(){return process.env.PROFESSIONAL_ENABLE_SHIPMENT_WRITES==='true';}
async function withTenantShipmentClient(tenantId,fn,{write=false}={}){
  const tid=String(tenantId||'').trim();
  if(!tid)throw Object.assign(new Error('Tenant required.'),{code:'TENANT_REQUIRED'});
  if(write&&!shipmentWritesEnabled())throw Object.assign(new Error('Sendungs-Schreibzugriffe sind deaktiviert.'),{code:'SHIPMENT_WRITES_DISABLED'});
  await ensureShipmentSchema();
  const client=await getPool().connect();
  try{return await transact(client,async c=>{await c.query("select set_config('app.tenant_id',$1,true)",[tid]);return fn(c);},{write,readOnly:!write});}finally{client.release();}
}
```

Add deterministic mappings in `api/shared/http.js` for `SHIPMENT_WRITES_DISABLED`, `SHIPMENT_SCHEMA_UPGRADE_DISABLED`, `SHIPMENT_NOT_FOUND`, `SHIPMENT_READ_ONLY`, `SHIPMENT_LOCKED`, `SHIPMENT_LOCK_INVALID`, `SHIPMENT_REVISION_CONFLICT`, `SHIPMENT_TRANSITION_INVALID`, `SHIPMENT_NOT_READY`, `COLLI_MISMATCH`, `DOCUMENT_REQUIRED`, `DOCUMENT_STORAGE_UNAVAILABLE`, `DOCUMENT_TOO_LARGE`, `FX_RATE_UNAVAILABLE`.

- [ ] **Step 5: Verify GREEN and commit**

```bash
node --test test/shipment-schema.test.mjs
npm test
git add api/shared/shipment-schema.js api/shared/database.js api/shared/http.js schema/postgres.sql test/shipment-schema.test.mjs
git commit -m "feat: add Professional shipment schema foundation"
```

---

### Task 2: Shipment lifecycle, reference and calculation domain

**Files:**
- Create: `api/shared/shipment-domain.js`
- Create: `api/shared/shipment-calculations.js`
- Create: `test/shipment-domain.test.mjs`

**Interfaces:**
- `generateReference(randomBytes=crypto.randomBytes): string`
- `assertMutable(shipment): true`
- `evaluateCreation(shipment,context): {complete,missing}`
- `evaluateReadiness(shipment,context): {ready,blocks,checklist}`
- `applyLifecycleAction(shipment,action,context): object`
- `calculateRowLdm(row,packaging): number`
- `calculateTotals(rows,packagingById): {totalColli,totalWeightKg,totalLdm,rows}`
- `cmrRequired(input): {required,resolved,reason}`
- `abdDecision(input): {required,resolved,reason}`

- [ ] **Step 1: Write failing lifecycle/calculation tests**

```js
const domain=require('../api/shared/shipment-domain.js');
const calc=require('../api/shared/shipment-calculations.js');

test('reference is six uppercase alphanumeric characters',()=>{
  assert.match(domain.generateReference(()=>Buffer.from([0,1,2,3,4,5,6,7,8,9,10,11])),/^[A-Z0-9]{6}$/);
});

test('migrated and picked-up shipments reject ordinary mutation',()=>{
  assert.throws(()=>domain.assertMutable({source_kind:'MIGRATED',status:'Entwurf'}),e=>e.code==='SHIPMENT_READ_ONLY');
  assert.throws(()=>domain.assertMutable({source_kind:'LIVE',status:'Abgeholt'}),e=>e.code==='SHIPMENT_READ_ONLY');
});

test('ABD is non-EU plus value over 1000 or carrier requirement',()=>{
  assert.equal(calc.abdDecision({isEuDestination:false,goodsValueEur:1000,carrierRequiresAbd:false}).required,false);
  assert.equal(calc.abdDecision({isEuDestination:false,goodsValueEur:1000.01,carrierRequiresAbd:false}).required,true);
  assert.equal(calc.abdDecision({isEuDestination:false,goodsValueEur:10,carrierRequiresAbd:true}).required,true);
  assert.equal(calc.abdDecision({isEuDestination:true,goodsValueEur:5000,carrierRequiresAbd:true}).required,false);
});

test('LDM is calculated only from packaging rule and physical quantity',()=>{
  assert.equal(calc.calculateRowLdm({quantity:3},{ldm_mode:'FIXED_PER_UNIT',fixed_ldm_per_unit:0.2}),0.6);
  assert.equal(calc.calculateRowLdm({quantity:2,length_cm:120,width_cm:80},{ldm_mode:'FOOTPRINT'}),0.8);
});
```

- [ ] **Step 2: Run RED**

```bash
node --test test/shipment-domain.test.mjs
```

- [ ] **Step 3: Implement deterministic domain**

Reference generation uses rejection sampling over `ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789`. `Nachbearbeitung` is `shipment.rework` and never replaces base lifecycle state. `assertMutable` rejects `MIGRATED` and lifecycle `Abgeholt`, `POD vorhanden`, `Abgeschlossen`, `Archiviert`, `Storniert` for ordinary edits.

CMR:

```js
function cmrRequired({destinationCountryIso,shippingCountryIso}){
  const dst=String(destinationCountryIso||'').trim().toUpperCase();
  const src=String(shippingCountryIso||'').trim().toUpperCase();
  if(!dst||!src)return {required:false,resolved:false,reason:'COUNTRY_MISSING'};
  return {required:dst!==src,resolved:true,reason:dst!==src?'CROSS_BORDER':'DOMESTIC'};
}
```

ABD:

```js
function abdDecision({isEuDestination,goodsValueEur,carrierRequiresAbd}){
  if(typeof isEuDestination!=='boolean'||!Number.isFinite(Number(goodsValueEur)))return {required:false,resolved:false,reason:'CUSTOMS_FACTS_MISSING'};
  const required=!isEuDestination&&(Number(goodsValueEur)>1000||carrierRequiresAbd===true);
  return {required,resolved:true,reason:required?(carrierRequiresAbd?'NON_EU_CARRIER':'NON_EU_VALUE'):(isEuDestination?'EU_DESTINATION':'NON_EU_BELOW_THRESHOLD')};
}
```

`FOOTPRINT` LDM = `(length_cm/100)*(width_cm/100)/2.4*quantity`, rounded to four decimals. `FIXED_PER_UNIT` = `fixed_ldm_per_unit*quantity`. No function accepts browser LDM as authoritative input.

- [ ] **Step 4: Verify and commit**

```bash
node --test test/shipment-domain.test.mjs
npm test
git add api/shared/shipment-domain.js api/shared/shipment-calculations.js test/shipment-domain.test.mjs
git commit -m "feat: add shipment lifecycle and calculation domain"
```

---

### Task 3: Read-only migrated shipments and first real dashboard facts

**Files:**
- Create: `api/shared/shipment-store.js`
- Create: `api/shared/shipment-read-model.js`
- Create: `api/shipments/index.js`, `api/shipments/function.json`
- Create: `api/shipment/index.js`, `api/shipment/function.json`
- Create: `api/shipment-dashboard/index.js`, `api/shipment-dashboard/function.json`
- Create: `test/shipment-read-model.test.mjs`
- Create: `test/shipment-api.test.mjs`
- Modify: `assets/js/overview.js`
- Modify: `test/control-center-ui.test.mjs`

**Interfaces:**
- `listShipments(tenantId,filters)`
- `getShipment(tenantId,shipmentId)`
- `getShipmentDashboard(tenantId,{localDate,timeZone})`

- [ ] **Step 1: Write RED read-model/API tests**

Fixtures cover migrated `Erstellt`, `Bereit zur Abholung`, `Abgeholt`, `Abgeschlossen`, `Archiviert`, `Storniert`. Assert all returned migrated rows have `sourceKind:'MIGRATED'` and `readOnly:true`; completed/archived/cancelled do not count as open.

Azure routes are exactly:

```json
{"route":"professional-shipments","methods":["get","post"]}
{"route":"professional-shipments/{shipmentId}","methods":["get","post"]}
{"route":"professional-shipment-dashboard","methods":["get"]}
```

The dedicated dashboard route avoids ambiguity with `{shipmentId}`.

- [ ] **Step 2: Run RED**

```bash
node --test test/shipment-read-model.test.mjs test/shipment-api.test.mjs
```

- [ ] **Step 3: Implement tenant-scoped reads**

List SQL joins customer/location by both tenant and ID, filters `discarded_at is null`, and never trusts request tenant. GET routes require `shipments.read`. POST routes remain present but return `SHIPMENT_WRITES_DISABLED` until LIVE creation is implemented in Task 5.

- [ ] **Step 4: Replace Overview's unavailable shipment source with real GET**

Use `/api/professional-shipment-dashboard`. Merge shipment action items with current masterdata action items. Do not fabricate rows or zeroes on request failure; render explicit unavailable error on failure and real numeric zero only on a successful response containing zero.

- [ ] **Step 5: Verify and commit**

```bash
node --test test/shipment-read-model.test.mjs test/shipment-api.test.mjs test/control-center-ui.test.mjs
node --check assets/js/overview.js
npm test
git add api/shared/shipment-store.js api/shared/shipment-read-model.js api/shipments api/shipment api/shipment-dashboard assets/js/overview.js test/shipment-read-model.test.mjs test/shipment-api.test.mjs test/control-center-ui.test.mjs
git commit -m "feat: expose migrated shipments and dashboard facts"
```

---

### Task 4: Workspace sender/shipping settings before LIVE creation

**Files:**
- Create: `api/shared/workspace-settings-store.js`
- Create: `api/workspace-shipping-settings/index.js`, `api/workspace-shipping-settings/function.json`
- Modify: `api/shared/authorization.js`
- Create: `assets/js/workspace-settings.js`
- Modify: `index.html`
- Create: `test/shipment-masterdata.test.mjs`

**Interfaces:**
- `getShippingSettings(tenantId): {companyName,street,houseNumber,postalCode,city,shippingCountry,shippingCountryIso,timezone,complete}`
- `updateShippingSettings(tenantId,userId,input)`

- [ ] **Step 1: Write RED settings/role tests**

```js
assert.equal(authz.hasPermission('TENANT_ADMIN','workspace.shipping.write'),true);
assert.equal(authz.hasPermission('EXPORT_ADMIN','workspace.shipping.write'),false);
assert.equal(authz.hasPermission('AUDITOR','workspace.shipping.read'),true);
```

Validate ISO country is two uppercase letters and timezone is accepted by `new Intl.DateTimeFormat('de-DE',{timeZone})`.

- [ ] **Step 2: Run RED**

```bash
node --test test/shipment-masterdata.test.mjs
```

- [ ] **Step 3: Implement settings in existing `tenant_settings.settings.shipping`**

No new duplicate settings table. Mutation uses `withTenantControlClient` because tenant settings are control-plane data and only `TENANT_ADMIN` may write. API route:

```json
{"route":"professional-workspace/shipping-settings","methods":["get","post"]}
```

GET requires `workspace.shipping.read`; POST requires `workspace.shipping.write,csrf:true`.

- [ ] **Step 4: Add Versand-Einstellungen UI**

Fields: company name, street, house number, postal code, city, shipping country, ISO, timezone. Show a blocking warning when incomplete. The later `Neue Sendung` action may exist, but LIVE creation will reject with `WORKSPACE_SENDER_INCOMPLETE` until settings are complete, ensuring the sender snapshot is valid at creation time.

- [ ] **Step 5: Verify and commit**

```bash
node --test test/shipment-masterdata.test.mjs
node --check assets/js/workspace-settings.js
npm test
git add api/shared/workspace-settings-store.js api/workspace-shipping-settings api/shared/authorization.js assets/js/workspace-settings.js index.html test/shipment-masterdata.test.mjs
git commit -m "feat: add Professional shipping workspace settings"
```

---

### Task 5: LIVE draft creation, immutable reference, edit lock and revisioned autosave API

**Files:**
- Modify: `api/shared/shipment-store.js`
- Modify: `api/shared/shipment-domain.js`
- Modify: `api/shipments/index.js`
- Modify: `api/shipment/index.js`
- Create: `api/shipment-lock/index.js`, `api/shipment-lock/function.json`
- Create: `api/shipment-action/index.js`, `api/shipment-action/function.json`
- Extend: `test/shipment-api.test.mjs`
- Create: `test/shipment-lock.test.mjs`

**Interfaces:**
- `createDraft(tenantId,userId)` returns `{shipment,lock}`.
- `acquireEditLock`, `heartbeatEditLock`, `releaseEditLock`, `forceReleaseEditLock`.
- `updateShipment(tenantId,shipmentId,userId,{lockToken,revision,patch})`.

- [ ] **Step 1: Write RED creation/locking tests**

Assert LIVE draft starts `Entwurf`, gets a six-character reference, copies complete workspace sender snapshot, and rejects incomplete workspace sender settings. Test duplicate generator retry, MIGRATED mutation rejection, wrong lock rejection and stale revision rejection.

- [ ] **Step 2: Run RED**

```bash
node --test test/shipment-api.test.mjs test/shipment-lock.test.mjs
```

- [ ] **Step 3: Implement atomic draft creation**

Transaction order:

```text
load complete workspace sender settings -> generate unique reference -> insert LIVE Entwurf -> snapshot sender -> audit SHIPMENT_CREATED -> acquire creator lock -> commit
```

Retry unique reference collisions up to 20 attempts; after 20 raise `REFERENCE_GENERATION_FAILED`.

- [ ] **Step 4: Implement exclusive lock and revision check**

Lock acquisition uses `on conflict ... do update ... where last_activity_at < now()-interval '15 minutes'`. Passive GET never refreshes a lock. Successful business mutation refreshes lock activity and increments `revision=revision+1`. Update `where revision=$expectedRevision`; no returned row -> `SHIPMENT_REVISION_CONFLICT`.

Only `TENANT_ADMIN` may force-release another user's lock and the action writes `SHIPMENT_LOCK_FORCE_RELEASED` audit.

- [ ] **Step 5: Implement thin POST handlers**

Create/update requires `shipments.write,csrf:true`. Every handler passes `session.tenant_id`, never body/query tenant. `shipment-action` route:

```json
{"route":"professional-shipments/{shipmentId}/actions/{action}","methods":["post"]}
```

Initially supported actions: `mark-created`, `confirm-ready`, `cancel`, `set-rework`, `clear-rework`, `archive`, `restore`; later tasks fill the action implementations.

- [ ] **Step 6: Verify and commit**

```bash
node --test test/shipment-api.test.mjs test/shipment-lock.test.mjs
npm test
git add api/shared/shipment-store.js api/shared/shipment-domain.js api/shipments api/shipment api/shipment-lock api/shipment-action test/shipment-api.test.mjs test/shipment-lock.test.mjs
git commit -m "feat: add live shipment draft and concurrency core"
```

---

### Task 6: Shipment workspace UI and resilient autosave

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
- `createAutosaveQueue({save,onState,setTimeoutFn,clearTimeoutFn})`
- `renderShipmentEditor(root,model,permissions)`
- `loadShipments(filters)`, `openShipment(id)`, `createShipment()`

- [ ] **Step 1: Write RED UI contract tests**

Assert Sendungen view, `Neue Sendung`, seven approved sections, permanent reference/status/checklist/save state, migrated read-only badge, lock banner, and retry delays `2000,5000,10000,30000,60000`. Assert browser JS does not contain ABD threshold or EU/CMR calculations.

- [ ] **Step 2: Run RED**

```bash
node --test test/shipment-ui.test.mjs
```

- [ ] **Step 3: Add master-detail shipment view**

Use a dense list/filter panel and single-page editor with collapsible blocks: `Kunde & Standort`, `Sendungsdaten`, `Colli/LDM`, `Spedition`, `Warenwert & Zoll`, `Dokumente`, `Abholung`. On phones stack panels and avoid horizontal overflow.

- [ ] **Step 4: Implement autosave queue exactly**

```js
export function createAutosaveQueue({save,onState=()=>{},setTimeoutFn=setTimeout,clearTimeoutFn=clearTimeout}){
  const delays=[2000,5000,10000,30000,60000];
  let pending={},timer=null,retry=0,disposed=false;
  async function flush(){
    if(disposed||!Object.keys(pending).length)return;
    const patch=pending;pending={};onState('saving');
    try{await save(patch);retry=0;onState('saved');}
    catch(err){pending={...patch,...pending};onState('error',err);timer=setTimeoutFn(flush,delays[Math.min(retry++,delays.length-1)]);}
  }
  function queue(patch){pending={...pending,...patch};if(timer)clearTimeoutFn(timer);timer=setTimeoutFn(flush,500);}
  return {queue,flush,dispose(){disposed=true;if(timer)clearTimeoutFn(timer);}};
}
```

The page releases its edit lock on explicit navigation/close action using the lock API. `pagehide` may send a best-effort release request, but lock expiry remains the safety net.

- [ ] **Step 5: Add CI/deploy guards**

Add `node --check` for all new JS modules and `.deploy` file existence checks.

- [ ] **Step 6: Verify and commit**

```bash
node --test test/shipment-ui.test.mjs test/control-center-ui.test.mjs
node --check assets/js/shipments.js
node --check assets/js/shipment-editor.js
node --check assets/js/shipment-autosave.js
npm test
git add assets/js/shipment-autosave.js assets/js/shipment-editor.js assets/js/shipments.js assets/js/app.js index.html assets/css/control-center.css test/shipment-ui.test.mjs .github/workflows/professional-ci.yml .github/workflows/professional-deploy.yml
git commit -m "feat: add Professional shipment workspace"
```

---

### Task 7: Packaging master data and server-owned Colli/LDM

**Files:**
- Create: `api/shared/packaging-store.js`
- Create: `api/packaging-types/index.js`, `api/packaging-types/function.json`
- Create: `api/packaging-type/index.js`, `api/packaging-type/function.json`
- Create: `api/packaging-type-status/index.js`, `api/packaging-type-status/function.json`
- Modify: `api/shared/authorization.js`
- Modify: `api/shared/shipment-store.js`
- Modify: `api/shared/shipment-read-model.js`
- Modify: `assets/js/shipment-editor.js`
- Extend: `test/shipment-masterdata.test.mjs`
- Extend: `test/shipment-domain.test.mjs`

**Interfaces:**
- packaging CRUD uses masterdata gate.
- `replaceColliRows(...,{lockToken,revision,rows})` ignores any LDM property from browser and returns server-calculated rows/totals.

- [ ] **Step 1: Write RED tests**

Use direct calculation tests plus source invariant:

```js
const src=fs.readFileSync(new URL('../api/shared/shipment-store.js',import.meta.url),'utf8');
assert.doesNotMatch(src,/\brow\.ldm\b[^\n]*insert/i);
```

Assert `quantity` sum determines total Colli and both LDM modes produce expected numbers.

- [ ] **Step 2: Run RED**

```bash
node --test test/shipment-masterdata.test.mjs test/shipment-domain.test.mjs
```

- [ ] **Step 3: Add permissions and packaging CRUD**

`packaging.read`: all roles. `packaging.write`: `TENANT_ADMIN`, `EXPORT_ADMIN`, `TEAM_LEAD`, `OPERATOR`. Writes use `withTenantMasterdataClient`.

- [ ] **Step 4: Implement revisioned Colli replacement**

Before pickup only. Load packaging records server-side, validate allowed dimensions, calculate every LDM, replace working Colli rows in one transaction, write `SHIPMENT_COLLI_CHANGED` audit, increment shipment revision. Logical working-row replacement is allowed before pickup; document/POD history rules do not apply to editable Colli rows.

- [ ] **Step 5: Update editor and verify**

LDM field is readonly output from successful server response. Never expose an editable LDM input.

```bash
node --test test/shipment-masterdata.test.mjs test/shipment-domain.test.mjs test/shipment-ui.test.mjs
npm test
git add api/shared/packaging-store.js api/packaging-types api/packaging-type api/packaging-type-status api/shared/authorization.js api/shared/shipment-store.js api/shared/shipment-read-model.js assets/js/shipment-editor.js test/shipment-masterdata.test.mjs test/shipment-domain.test.mjs
git commit -m "feat: add packaging and server calculated colli ldm"
```

---

### Task 8: Carrier master data and one-off recipient conversion

**Files:**
- Create: `api/shared/carrier-store.js`
- Create: `api/carriers/index.js`, `api/carriers/function.json`
- Create: `api/carrier/index.js`, `api/carrier/function.json`
- Create: `api/carrier-status/index.js`, `api/carrier-status/function.json`
- Modify: `api/shared/authorization.js`
- Modify: `api/shared/masterdata-store.js`
- Modify: `api/shared/masterdata-validation.js`
- Modify: `api/shared/shipment-store.js`
- Create: `assets/js/carriers.js`
- Modify: `assets/js/shipment-editor.js`
- Modify: `index.html`
- Extend: `test/shipment-masterdata.test.mjs`

**Interfaces:**
- Carrier fields exactly: name, active, ABD default, contact name, email, phone, portal URL.
- `convertOneOffRecipient()` creates new customer+location or adds a location to an existing customer, links IDs to shipment, and never rewrites recipient snapshot.

- [ ] **Step 1: Write RED carrier/conversion tests**

Assert default carrier snapshot copies values but per-shipment `carrierRequiresAbd` may differ. Assert duplicate customer number blocks. Assert similar names are returned as candidates. Assert special conversion path can create `masterdataIncomplete=true` location without registration email while normal `createLocation()` still rejects it.

- [ ] **Step 2: Run RED**

```bash
node --test test/shipment-masterdata.test.mjs test/masterdata.test.mjs
```

- [ ] **Step 3: Add carrier CRUD/permissions**

`carriers.read`: all roles. `carriers.write`: `TENANT_ADMIN`, `EXPORT_ADMIN`, `TEAM_LEAD`, `OPERATOR`. Mutations use masterdata gate. Location may store `carrier_id`; keep legacy `carrier_name` readable until mapped.

- [ ] **Step 4: Add controlled one-off conversion**

The dedicated conversion method validates customer number, full address and customer choice. It alone may omit registration email and writes `source_metadata.masterdataIncomplete=true`. A shipment selecting such an incomplete location can remain draft but `evaluateCreation()` blocks `Entwurf -> Erstellt` until registration email exists.

- [ ] **Step 5: Add Speditionen UI and conversion modal**

The modal first requests customer number, then shows identical-number error and similar-name choices. Explicit outcomes: `Neuer Kunde + Standort` or `Neuer Standort bei bestehendem Kunden`.

- [ ] **Step 6: Verify and commit**

```bash
node --test test/shipment-masterdata.test.mjs test/masterdata.test.mjs test/shipment-ui.test.mjs
node --check assets/js/carriers.js
npm test
git add api/shared/carrier-store.js api/carriers api/carrier api/carrier-status api/shared/authorization.js api/shared/masterdata-store.js api/shared/masterdata-validation.js api/shared/shipment-store.js assets/js/carriers.js assets/js/shipment-editor.js index.html test/shipment-masterdata.test.mjs
git commit -m "feat: add carrier and one off recipient flows"
```

---

### Task 9: Official ECB rates, currency snapshot, ABD and CMR decisions

**Files:**
- Create: `api/shared/ecb-rates.js`
- Modify: `api/shared/shipment-store.js`
- Modify: `api/shared/shipment-domain.js`
- Modify: `api/shared/shipment-read-model.js`
- Modify: `assets/js/shipment-editor.js`
- Create: `test/shipment-customs.test.mjs`

**Interfaces:**
- `getReferenceRate(currency,{fetchFn,now}) -> {currency,rate,rateDate,source:'ECB'}`.
- `convertToEur({amount,currency},rateSnapshot)`.
- rate semantics: ECB quote is foreign-currency units per EUR; therefore `eurValue = amount / rate` for non-EUR currencies.

- [ ] **Step 1: Write RED tests using local XML fixtures**

No network in tests. Fixture contains multiple dates. Assert weekend uses last published date and conversion divides by the ECB quote.

```js
const rate={currency:'USD',rate:1.1673,rateDate:'2026-09-04',source:'ECB'};
assert.equal(ecb.convertToEur({amount:1500,currency:'USD'},rate).eurValue,1285.02);
```

Assert unknown/unavailable currency throws `FX_RATE_UNAVAILABLE` and no approximate value is returned.

- [ ] **Step 2: Run RED**

```bash
node --test test/shipment-customs.test.mjs
```

- [ ] **Step 3: Implement official ECB retrieval/cache**

Use official ECB last-90-days XML endpoint constant:

```js
const ECB_90D_URL='https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml';
```

Parse only dated Cube blocks and currency/rate attributes; reject malformed/non-positive rates. Cache successful rows in `ecb_reference_rates`. Select greatest `rate_date <= requested local date`. EUR returns synthetic `{currency:'EUR',rate:1,rateDate:requestedDate,source:'ECB'}` without network call.

- [ ] **Step 4: Persist immutable FX/customs facts**

Snapshot:

```js
{
  originalAmount:1500,
  originalCurrency:'USD',
  rate:1.1673,
  rateDate:'2026-09-04',
  source:'ECB',
  eurValue:1285.02,
  convertedAt:'2026-09-06T10:00:00.000Z'
}
```

Use server-owned EU ISO set. Destination only from recipient snapshot. CMR compares recipient ISO with sender snapshot ISO. Store `abdRequired`, `abdReason`, `cmrRequired`, `cmrReason` with shipment readiness facts.

- [ ] **Step 5: Render server decision only and verify**

Browser displays reason/result, never computes EU membership, 1000 EUR threshold or CMR rule.

```bash
node --test test/shipment-customs.test.mjs test/shipment-domain.test.mjs test/shipment-ui.test.mjs
npm test
git add api/shared/ecb-rates.js api/shared/shipment-store.js api/shared/shipment-domain.js api/shared/shipment-read-model.js assets/js/shipment-editor.js test/shipment-customs.test.mjs
git commit -m "feat: add ECB customs and CMR decisions"
```

---

### Task 10: Immutable documents and versioned Ladeliste/CMR PDFs

**Files:**
- Modify: `api/package.json`
- Modify/Create: `api/package-lock.json`
- Create: `api/shared/document-store.js`
- Create: `api/shared/document-generator.js`
- Create: `api/shipment-documents/index.js`, `api/shipment-documents/function.json`
- Create: `api/shipment-document-action/index.js`, `api/shipment-document-action/function.json`
- Modify: `api/shared/shipment-domain.js`
- Modify: `api/shared/shipment-read-model.js`
- Create: `assets/js/shipment-documents.js`
- Modify: `assets/js/shipment-editor.js`
- Create: `test/shipment-documents.test.mjs`

**Interfaces:**
- Manual file bytes are durably stored in PostgreSQL `document_payloads.content bytea` for this release.
- Generated PDF bytes are stored in `generated_artifact_payloads.content bytea`.
- Default per-file maximum is 10 MiB, configurable by `PROFESSIONAL_DOCUMENT_MAX_BYTES`; reject above limit with `DOCUMENT_TOO_LARGE`.
- `generateLoadListPdf(model): Buffer`, `generateCmrPdf(model): Buffer`.

- [ ] **Step 1: Write RED document/history tests**

Assert replacing A inserts B, marks A `REPLACED`, preserves A payload. Invalidating never deletes. Generated version increments and old PDF payload remains. Current signature is stable for identical canonical model and changes for document-relevant edits.

- [ ] **Step 2: Run RED**

```bash
node --test test/shipment-documents.test.mjs
```

- [ ] **Step 3: Pin PDF library**

```bash
npm install --prefix api --save-exact pdf-lib@1.17.1
```
Commit updated package/lock file.

- [ ] **Step 4: Implement durable PostgreSQL document payload storage**

Input uses base64 JSON because current Professional API is JSON-oriented. Decode server-side, enforce byte limit after decoding, compute SHA-256 server-side, insert `documents` + `document_payloads` in one transaction. Do not accept caller-provided hash/size as authoritative.

Generated artifacts similarly insert metadata + `generated_artifact_payloads`. This plan intentionally uses PostgreSQL bytea now; Azure Blob is not required for correctness of this release and no fake `storage_key` success is permitted.

- [ ] **Step 5: Generate valid minimum PDFs**

Ladeliste includes reference, sender snapshot, recipient snapshot, pickup date, carrier, each Colli row, total Colli, total weight, total LDM.

CMR includes sender, consignee, carrier, reference, Colli/goods summary, gross weight and available place/date facts.

Canonical signature = SHA-256 of stable-key-order JSON of document-relevant facts. Relevant edit marks latest artifact `STALE`; autosave does not generate immediately.

- [ ] **Step 6: Enforce readiness documents**

Always require valid Lieferschein + current Ladeliste. Require current CMR when `cmrRequired`. Require valid ABD when `abdRequired`. `REPLACED`, `INVALID`, `STALE` do not satisfy readiness.

- [ ] **Step 7: Add document UI and verify**

```bash
node --test test/shipment-documents.test.mjs test/shipment-domain.test.mjs test/shipment-ui.test.mjs
node --check assets/js/shipment-documents.js
npm test
git add api/package.json api/package-lock.json api/shared/document-store.js api/shared/document-generator.js api/shipment-documents api/shipment-document-action api/shared/shipment-domain.js api/shared/shipment-read-model.js assets/js/shipment-documents.js assets/js/shipment-editor.js test/shipment-documents.test.mjs
git commit -m "feat: add immutable shipment document versions"
```

---

### Task 11: Created/readiness, pickup, POD and automatic completion

**Files:**
- Modify: `api/shared/shipment-domain.js`
- Modify: `api/shared/shipment-store.js`
- Modify: `api/shared/document-store.js`
- Modify: `api/shipment-action/index.js`
- Create: `api/shipment-pickup/index.js`, `api/shipment-pickup/function.json`
- Create: `api/shipment-pod/index.js`, `api/shipment-pod/function.json`
- Create: `test/shipment-pickup.test.mjs`
- Extend: `test/shipment-domain.test.mjs`
- Extend: `test/shipment-documents.test.mjs`
- Modify: `assets/js/shipment-editor.js`
- Modify: `assets/js/shipment-documents.js`

**Interfaces:**
- `markCreated()` validates creation facts and generates Ladeliste v1/CMR v1 if required.
- `confirmReady()` refreshes stale required artifacts then transitions only on green readiness.
- `confirmPickup(...,{method,confirmedTotalColli})`.
- valid POD automatically advances status.

- [ ] **Step 1: Write RED transition/pickup/POD tests**

Test `Entwurf -> Erstellt` blockers: recipient, planned pickup date, incomplete selected location registration email. Test generated documents. Test ready blocked by missing Lieferschein/ABD/current CMR. Test Colli mismatch leaves base status `Bereit zur Abholung`, sets rework, and no role bypasses. Test manual pickup only admin/export admin. Test valid POD produces `POD vorhanden` and then `Abgeschlossen` when blockers are zero.

- [ ] **Step 2: Run RED**

```bash
node --test test/shipment-pickup.test.mjs test/shipment-domain.test.mjs test/shipment-documents.test.mjs
```

- [ ] **Step 3: Implement transaction ordering**

For `mark-created` and `confirm-ready`:

```text
lock shipment row -> verify LIVE/revision/edit lock -> evaluate facts -> generate/regenerate required artifacts -> re-evaluate -> persist status/revision -> audit -> commit
```

Never persist the status first.

Pickup QR uses `pickup.confirm`. Manual mode additionally requires role `TENANT_ADMIN` or `EXPORT_ADMIN`. Both call the same domain Colli/readiness checks. Successful pickup stores timestamp, actual pickup date in workspace timezone, user, method, expected/confirmed total Colli and audit metadata.

- [ ] **Step 4: Implement POD immutability/automatic states**

POD upload only after pickup and uses immutable document storage. Corrected POD = new record + old `REPLACED`. After a valid POD:

```js
if(shipment.status==='Abgeholt') shipment.status='POD vorhanden';
if(shipment.status==='POD vorhanden' && blockers.length===0){shipment.status='Abgeschlossen';shipment.completed_at=now;}
```

Audit both automatic transitions.

- [ ] **Step 5: Add editor actions and verify**

```bash
node --test test/shipment-pickup.test.mjs test/shipment-domain.test.mjs test/shipment-documents.test.mjs test/shipment-ui.test.mjs
npm test
git add api/shared/shipment-domain.js api/shared/shipment-store.js api/shared/document-store.js api/shipment-action api/shipment-pickup api/shipment-pod assets/js/shipment-editor.js assets/js/shipment-documents.js test/shipment-pickup.test.mjs test/shipment-domain.test.mjs test/shipment-documents.test.mjs
git commit -m "feat: add readiness pickup POD and completion"
```

---

### Task 12: Cancellation, rework, archive maintenance and final Control Center model

**Files:**
- Create: `api/shared/shipment-maintenance.js`
- Create: `api/shipment-maintenance/index.js`, `api/shipment-maintenance/function.json`
- Modify: `api/shipment-action/index.js`
- Modify: `api/shared/shipment-store.js`
- Modify: `api/shared/shipment-read-model.js`
- Modify: `api/shipment-dashboard/index.js`
- Modify: `assets/js/overview.js`
- Modify: `assets/js/shipments.js`
- Create: `test/shipment-maintenance.test.mjs`
- Extend: `test/shipment-read-model.test.mjs`
- Extend: `test/security.test.mjs`
- Modify: `.github/workflows/professional-ci.yml`
- Modify: `.github/workflows/professional-deploy.yml`
- Modify: `api/professional-meta/index.js`
- Create: `docs/live-shipments-rollout.md`

**Interfaces:**
- `discardEmptyDraftsForTenant(tenantId,now)`.
- `archiveCompletedForTenant(tenantId,now)`.
- global timer first lists active tenant IDs through control-plane DB access, then invokes tenant-scoped maintenance per tenant so RLS remains active.

- [ ] **Step 1: Write RED maintenance/action/dashboard/security tests**

Assert:

- completely empty LIVE draft older than 24h gets `discarded_at`, row/reference remains;
- non-empty draft remains;
- completed shipment reaches archive after 30 days;
- early archive only `TENANT_ADMIN`/`EXPORT_ADMIN`;
- restore only `TENANT_ADMIN` + non-empty reason;
- cancellation only through `Bereit zur Abholung`, admin/export admin + reason;
- manual rework admin/export admin + reason;
- system rework clears only when its concrete blocker is gone;
- every mutation route uses CSRF and `session.tenant_id`;
- dashboard exact counts/actions match fixture data.

- [ ] **Step 2: Run RED**

```bash
node --test test/shipment-maintenance.test.mjs test/shipment-read-model.test.mjs test/security.test.mjs
```

- [ ] **Step 3: Implement tenant-safe hourly maintenance**

Timer binding:

```json
{"bindings":[{"name":"timer","type":"timerTrigger","direction":"in","schedule":"0 15 * * * *"}]}
```

Algorithm:

```js
const tenantIds=await listActiveTenantIdsWithControlClient();
for(const tenantId of tenantIds){
  await maintenance.discardEmptyDraftsForTenant(tenantId,new Date());
  await maintenance.archiveCompletedForTenant(tenantId,new Date());
}
```

Each tenant method uses `withTenantShipmentClient` so `app.tenant_id` and RLS are set. Methods are idempotent: a second run changes zero already-discarded/already-archived rows.

- [ ] **Step 4: Complete dashboard/action/activity response**

Dashboard returns:

```js
{
  openShipments:0,
  pickupsToday:{open:0,pickedUp:0},
  missingDocuments:0,
  actionRequired:0,
  todayRows:[],
  actions:[],
  recentActivity:[]
}
```

Action items use `{code,severity,shipmentId,reference,title,detail,target:'shipment'}` for overdue pickup, rework, missing/stale required document, missing ABD, unavailable FX, incomplete selected masterdata and orphaned lock. Activity comes from actual audit events. Remove `Datenquelle noch nicht live` / `Livequelle folgt` only when this contract is green.

- [ ] **Step 5: Final CI/deploy guards and rollout doc**

CI syntax-checks all new frontend modules and requires all backend modules. Deploy verifies every new JS/CSS/HTML payload file exists before Azure action.

`docs/live-shipments-rollout.md` contains exactly the non-secret required state:

```text
PROFESSIONAL_ENABLE_CONTROL_WRITES=true
PROFESSIONAL_DATA_MODE=migration-read-only
PROFESSIONAL_ENABLE_WRITES=false
PROFESSIONAL_ENABLE_MASTERDATA_WRITES=true
PROFESSIONAL_ENABLE_SHIPMENT_WRITES=true
```

Explain that LIVE gate does not make `MIGRATED` writable. `professional-meta` may expose only gate booleans, never database URL, tokens or secrets.

- [ ] **Step 6: Run complete verification and commit**

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
node -e "require('./api/shared/shipment-schema.js');require('./api/shared/shipment-domain.js');require('./api/shared/shipment-calculations.js');require('./api/shared/shipment-store.js');require('./api/shared/shipment-read-model.js');require('./api/shared/workspace-settings-store.js');require('./api/shared/packaging-store.js');require('./api/shared/carrier-store.js');require('./api/shared/ecb-rates.js');require('./api/shared/document-store.js');require('./api/shared/document-generator.js');require('./api/shared/shipment-maintenance.js')"
git add api/shared/shipment-maintenance.js api/shipment-maintenance api/shipment-action/index.js api/shared/shipment-store.js api/shared/shipment-read-model.js api/shipment-dashboard/index.js assets/js/overview.js assets/js/shipments.js test/shipment-maintenance.test.mjs test/shipment-read-model.test.mjs test/security.test.mjs .github/workflows/professional-ci.yml .github/workflows/professional-deploy.yml api/professional-meta/index.js docs/live-shipments-rollout.md
git commit -m "test: complete and harden live shipment rollout"
```

---

## Exact PR / Deploy Verification

After Tasks 1–12 are green:

- [ ] Rebase/update against latest `main`; resolve only Professional conflicts.
- [ ] Compare branch against `main`; verify no ExportHUB Internal file or secret was introduced.
- [ ] Open draft PR to `main`.
- [ ] Require exact-head PR CI GREEN; an older green run is not evidence.
- [ ] Review diff specifically for tenant scope, CSRF, permissions, lifecycle duplication, browser-side ABD/CMR calculations, document history and lock/revision bypasses.
- [ ] Mark PR ready only after exact-head CI GREEN.
- [ ] Merge using expected head SHA protection.
- [ ] Verify fresh `main` CI for exact merge SHA.
- [ ] Verify `ExportHUB Professional Deploy` for exact same SHA.
- [ ] Enable `PROFESSIONAL_ENABLE_SHIPMENT_WRITES=true` only intentionally after the deployed exact SHA is verified and required workspace/masterdata settings are ready.
- [ ] Never claim authenticated live smoke success unless the deployed app was actually tested with an authenticated browser session.

## Self-Review Result

- Spec coverage: every approved design section maps to Tasks 1–12; only pickup time-window and final PDF visual styling remain explicitly deferred as approved.
- Dependency order: workspace sender settings are implemented before LIVE draft creation, so creation can always produce a valid sender snapshot.
- Document persistence: this release uses explicit durable PostgreSQL `bytea` payload tables with server-side hashes and limits; there is no unspecified storage provider.
- Maintenance isolation: the timer enumerates tenants through the control plane and runs every write through tenant-scoped RLS-aware shipment clients.
- ECB semantics: foreign-currency quotes are handled as currency units per EUR, so conversion to EUR divides by the ECB quote.
- Placeholder scan: no `TBD`, `TODO`, unnamed future validation, undefined helper, or "discover during implementation" step remains.
- Interface consistency: the lock token, revision, snapshots, dashboard contract and master-data functions are defined before downstream use.