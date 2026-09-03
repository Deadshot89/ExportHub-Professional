# Customers & Locations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first live operational master-data module in ExportHUB Professional: tenant-isolated customer and location CRUD with multiple registration e-mails, location-specific carrier/shipping data, audit, role enforcement, Master-Detail UI, and a separate master-data write gate.

**Architecture:** Keep the existing Professional server-session/RLS model. Add a dedicated tenant-scoped master-data database wrapper and pure validation module, then a focused master-data store used by small Azure Functions. The frontend replaces the migration-only customer/location placeholders with a Master-Detail customer workspace and reusable right-side drawer; the global Locations view reuses the same customer/location data and opens the canonical customer editor.

**Tech Stack:** Node.js >=20, Azure Functions JavaScript (CommonJS), Azure Static Web Apps, PostgreSQL 18 / `pg` 8.13.1, browser ES modules, plain HTML/CSS/JavaScript, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-03-customers-locations-design.md`

## Global Constraints

- Repository is only `Deadshot89/ExportHub-Professional` on `main`; never touch `Deadshot89/ExportHub`.
- Keep `PROFESSIONAL_DATA_MODE=migration-read-only`.
- Keep `PROFESSIONAL_ENABLE_WRITES=false`.
- Keep `PROFESSIONAL_ENABLE_CONTROL_WRITES=true` because login/session/user administration needs it.
- Introduce `PROFESSIONAL_ENABLE_MASTERDATA_WRITES=true` as a separate gate; do not repurpose the global operational write gate.
- No normal hard-delete for customers or locations; use `active` status.
- A newly created customer must atomically include at least one complete location and at least one registration e-mail.
- Customer account number is manually entered and unique inside one tenant/workspace.
- No main/default location; shipment integration later must require deliberate location selection.
- All registration e-mails marked on the location are used automatically by the later shipment registration process.
- Registration e-mails are separate from optional contact e-mail.
- Carrier/shipping instructions belong to the location.
- `TENANT_ADMIN`, `EXPORT_ADMIN`, `TEAM_LEAD`, `OPERATOR` can write customer/location master data; `WAREHOUSE` and `AUDITOR` are read-only.
- Preserve legacy/imported rows and the existing `address`, `email`, `derived_main`, `legacy_*`, and migration metadata fields. New structured live fields may be nullable at database-upgrade time when required for backward compatibility, but live create/update API validation must enforce the approved required fields.
- Every mutating endpoint requires server-side session permission and CSRF validation.
- Every query must be tenant-scoped and continue to rely on PostgreSQL RLS as a second isolation layer.
- No secrets, tokens, passwords, or database credentials in Git or logs.
- Follow TDD: failing test first, then minimum implementation, then full regression suite.

---

## File Structure

**Modify**
- `schema/postgres.sql` — idempotent database upgrade, new master-data columns/table/indexes/FKs/RLS.
- `api/shared/database.js` — dedicated master-data write gate and tenant client.
- `api/shared/authorization.js` — approved customer read/write role matrix.
- `api/shared/http.js` — deterministic master-data HTTP error mappings.
- `api/professional-meta/index.js` — expose the safe boolean master-data gate state.
- `index.html` — live Customers Master-Detail markup, global Locations view, reusable drawer shell.
- `assets/css/app.css` — Master-Detail, accordion, drawer, forms, responsive layout.
- `assets/js/app.js` — live customer/location state, API calls, rendering, drawer forms, search and navigation.
- `.github/workflows/professional-ci.yml` — syntax/load validation for new API modules and routes.

**Create**
- `api/shared/masterdata-validation.js` — pure normalization/validation functions only.
- `api/shared/masterdata-store.js` — tenant-scoped customer/location persistence and audit.
- `api/masterdata-customers/index.js` + `function.json` — GET customer list, POST atomic customer creation.
- `api/masterdata-customer/index.js` + `function.json` — GET one customer with locations/e-mails, POST customer edit.
- `api/masterdata-customer-status/index.js` + `function.json` — activate/deactivate customer.
- `api/masterdata-customer-locations/index.js` + `function.json` — add location to customer.
- `api/masterdata-location/index.js` + `function.json` — update location including complete registration e-mail set.
- `api/masterdata-location-status/index.js` + `function.json` — activate/deactivate location.
- `api/masterdata-locations/index.js` + `function.json` — global location search/list.
- `test/masterdata.test.mjs` — write gate, permissions, validation, schema, API security/store contract.
- `test/masterdata-ui.test.mjs` — Master-Detail/drawer/global-location UI contract.

The store owns persistence and audit; validation owns input rules; route files only authenticate/authorize, parse input and call store methods. Do not put SQL into frontend or route handlers.

---

### Task 1: Add the dedicated master-data security foundation

**Files:**
- Modify: `api/shared/database.js`
- Modify: `api/shared/authorization.js`
- Modify: `api/shared/http.js`
- Modify: `api/professional-meta/index.js`
- Create/Test: `test/masterdata.test.mjs`

**Interfaces:**
- Produces: `db.masterdataWritesEnabled(): boolean`
- Produces: `db.withTenantMasterdataClient(tenantId, fn, {write=false})`
- Produces permissions `customers.read` / `customers.write` with the approved role matrix.
- Produces HTTP codes `MASTERDATA_WRITES_DISABLED`, `CUSTOMER_EXISTS`, `CUSTOMER_NOT_FOUND`, `LOCATION_NOT_FOUND`, `LOCATION_REQUIRED`, `REGISTRATION_EMAIL_REQUIRED`, `REGISTRATION_EMAIL_DUPLICATE`.

- [ ] **Step 1: Write the failing security tests**

Create `test/masterdata.test.mjs` with at least:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const authz=require('../api/shared/authorization.js');

test('customer master-data permissions match approved roles',()=>{
  for(const role of ['TENANT_ADMIN','EXPORT_ADMIN','TEAM_LEAD','OPERATOR']){
    assert.equal(authz.hasPermission(role,'customers.read'),true);
    assert.equal(authz.hasPermission(role,'customers.write'),true);
  }
  for(const role of ['WAREHOUSE','AUDITOR']){
    assert.equal(authz.hasPermission(role,'customers.read'),true);
    assert.equal(authz.hasPermission(role,'customers.write'),false);
  }
});

test('master-data writes use a separate environment gate',()=>{
  const src=fs.readFileSync(new URL('../api/shared/database.js',import.meta.url),'utf8');
  assert.match(src,/PROFESSIONAL_ENABLE_MASTERDATA_WRITES/);
  assert.match(src,/function masterdataWritesEnabled/);
  assert.match(src,/withTenantMasterdataClient/);
  assert.match(src,/MASTERDATA_WRITES_DISABLED/);
  assert.doesNotMatch(src,/masterdataWritesEnabled\(\).*PROFESSIONAL_ENABLE_WRITES/s);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test test/masterdata.test.mjs`

Expected: FAIL because `WAREHOUSE` lacks `customers.read`, `TEAM_LEAD`/`OPERATOR` lack `customers.write`, and the master-data gate/helper does not exist.

- [ ] **Step 3: Implement the database gate and permissions**

In `api/shared/database.js`, add the separate gate and wrapper without changing `writesEnabled()` or `controlWritesEnabled()` semantics:

```js
function masterdataWritesEnabled(){return process.env.PROFESSIONAL_ENABLE_MASTERDATA_WRITES==='true';}
async function withTenantMasterdataClient(tenantId,fn,{write=false}={}){
  const tid=String(tenantId||'').trim();
  if(!tid) throw Object.assign(new Error('Tenant required.'),{code:'TENANT_REQUIRED'});
  if(write&&!masterdataWritesEnabled()) throw Object.assign(new Error('Stammdaten-Schreibzugriffe sind deaktiviert.'),{code:'MASTERDATA_WRITES_DISABLED'});
  const client=await getPool().connect();
  try{
    return await transact(client,async c=>{
      await c.query("select set_config('app.tenant_id',$1,true)",[tid]);
      return fn(c);
    },{write,readOnly:!write});
  }finally{client.release();}
}
```

Add `masterdataWritesEnabled` to `status()` and exports.

In `authorization.js`, change only customer permissions so:
- `TEAM_LEAD` gains `customers.write`.
- `OPERATOR` gains `customers.write`.
- `WAREHOUSE` gains `customers.read` only.
- `AUDITOR` remains read only.

In `http.js`, map the new input/conflict/not-found/write-gate codes to 400/409/404/503 respectively.

In `api/professional-meta/index.js`, continue returning `database:db.status()` so the new `masterdataWritesEnabled` boolean is visible without exposing secrets.

- [ ] **Step 4: Run focused and existing security tests**

Run: `node --test test/masterdata.test.mjs test/user-admin.test.mjs test/auth.test.mjs test/security.test.mjs`

Expected: PASS. Existing control writes and login semantics remain unchanged.

- [ ] **Step 5: Commit**

```bash
git add api/shared/database.js api/shared/authorization.js api/shared/http.js api/professional-meta/index.js test/masterdata.test.mjs
git commit -m "Add isolated customer masterdata write gate"
```

---

### Task 2: Upgrade PostgreSQL schema without damaging legacy rows

**Files:**
- Modify: `schema/postgres.sql`
- Modify/Test: `test/masterdata.test.mjs`

**Interfaces:**
- Produces columns required by `masterdata-store.js`.
- Produces `customer_location_registration_emails` with tenant-safe FK and RLS.
- Preserves `customer_locations.address`, `customer_locations.email`, `derived_main`, and legacy metadata.

- [ ] **Step 1: Add failing schema contract tests**

Append tests that assert:

```js
test('schema contains live customer/location fields and registration email table',()=>{
  const sql=fs.readFileSync(new URL('../schema/postgres.sql',import.meta.url),'utf8');
  for(const token of ['active boolean','updated_at timestamptz','street text','house_number text','postal_code text','city text','country_iso text','contact_email text','carrier_name text','shipping_instructions text']) assert.match(sql,new RegExp(token,'i'));
  assert.match(sql,/create table if not exists customer_location_registration_emails/i);
  assert.match(sql,/lower\(email\)/i);
  assert.match(sql,/customer_location_registration_emails.*tenant_isolation/s);
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `node --test test/masterdata.test.mjs`

Expected: FAIL because the new columns/table/RLS entries are absent.

- [ ] **Step 3: Implement idempotent schema upgrades**

Keep the original create statements compatible with clean installs, then add upgrade statements using `ADD COLUMN IF NOT EXISTS` for existing databases:

```sql
alter table customers add column if not exists active boolean not null default true;
alter table customers add column if not exists updated_at timestamptz not null default now();

alter table customer_locations add column if not exists street text;
alter table customer_locations add column if not exists house_number text;
alter table customer_locations add column if not exists postal_code text;
alter table customer_locations add column if not exists city text;
alter table customer_locations add column if not exists country_iso text;
alter table customer_locations add column if not exists contact_email text;
alter table customer_locations add column if not exists carrier_name text;
alter table customer_locations add column if not exists shipping_instructions text;
alter table customer_locations add column if not exists active boolean not null default true;
alter table customer_locations add column if not exists updated_at timestamptz not null default now();
```

Do not drop/rename `address`, `email`, or `derived_main`.

Add composite tenant uniqueness and NOT VALID foreign-key hardening so new writes cannot create cross-tenant relations without requiring legacy rows to validate immediately:

```sql
create unique index if not exists customers_tenant_id_id_uq on customers(tenant_id,id);
create unique index if not exists customer_locations_tenant_id_id_uq on customer_locations(tenant_id,id);
```

Add the location/customer composite FK via an idempotent `DO $$ ... if not exists ... $$` block using `NOT VALID`.

Create:

```sql
create table if not exists customer_location_registration_emails (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  location_id uuid not null,
  email text not null,
  created_at timestamptz not null default now(),
  constraint customer_location_registration_emails_location_fk
    foreign key(tenant_id,location_id)
    references customer_locations(tenant_id,id)
    on delete cascade
);
create unique index if not exists customer_location_registration_emails_uq
  on customer_location_registration_emails(tenant_id,location_id,lower(email));
```

Add the new table to the RLS foreach array. Live required-field rules remain enforced by API validation because legacy imported rows may not yet have structured address fields.

- [ ] **Step 4: Run schema and regression tests**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add schema/postgres.sql test/masterdata.test.mjs
git commit -m "Extend Professional schema for customer masterdata"
```

---

### Task 3: Build pure validation and tenant-scoped master-data store

**Files:**
- Create: `api/shared/masterdata-validation.js`
- Create: `api/shared/masterdata-store.js`
- Modify/Test: `test/masterdata.test.mjs`

**Interfaces:**
- `validation.cleanCustomer(input) -> {account,name}`
- `validation.cleanLocation(input) -> {name,street,houseNumber,postalCode,city,country,countryIso,contactName,contactEmail,phone,carrierName,shippingInstructions,registrationEmails}`
- `store.listCustomers(tenantId,{query,status})`
- `store.getCustomer(tenantId,customerId)`
- `store.createCustomer(tenantId,actorUserId,input)`
- `store.updateCustomer(tenantId,actorUserId,customerId,input)`
- `store.setCustomerActive(tenantId,actorUserId,customerId,active)`
- `store.createLocation(tenantId,actorUserId,customerId,input)`
- `store.updateLocation(tenantId,actorUserId,locationId,input)`
- `store.setLocationActive(tenantId,actorUserId,locationId,active)`
- `store.listLocations(tenantId,{query,status})`

- [ ] **Step 1: Write failing validation tests**

Add tests for normalization and errors:

```js
const validation=require('../api/shared/masterdata-validation.js');

test('location validation normalizes and deduplicates registration emails',()=>{
  const v=validation.cleanLocation({
    name:' Werk A ',street:'Industriestraße',houseNumber:'7',postalCode:'41334',city:'Nettetal',country:'Deutschland',
    registrationEmails:[' AVIS@EXAMPLE.DE ','avis@example.de','lager@example.de']
  });
  assert.deepEqual(v.registrationEmails,['avis@example.de','lager@example.de']);
});

test('customer creation inputs require account, complete location and registration email',()=>{
  assert.throws(()=>validation.cleanCustomer({name:'Kunde'}),e=>e.code==='INPUT_INVALID');
  assert.throws(()=>validation.cleanLocation({name:'Werk'}),e=>e.code==='INPUT_INVALID'||e.code==='REGISTRATION_EMAIL_REQUIRED');
});
```

- [ ] **Step 2: Run focused test and verify failure**

Run: `node --test test/masterdata.test.mjs`

Expected: FAIL because validation/store modules do not exist.

- [ ] **Step 3: Implement `masterdata-validation.js`**

Use small pure helpers. Requirements:
- trim all strings;
- lowercase e-mails;
- validate e-mail with the same safe pattern used by identity code;
- normalize `countryIso` uppercase when present;
- registration e-mail array must contain at least one valid unique address;
- duplicates collapse case-insensitively;
- account/name and all approved location address fields are mandatory;
- optional strings become `null`, not empty strings.

- [ ] **Step 4: Implement `masterdata-store.js` with one transaction per mutation**

All reads/writes use `db.withTenantMasterdataClient`. `createCustomer` must perform customer insert, first location insert, registration-email inserts, and audit events inside one `{write:true}` callback.

Use duplicate-key detection (`err.code==='23505'`) to expose `CUSTOMER_EXISTS` for customer account conflicts and `REGISTRATION_EMAIL_DUPLICATE` for e-mail conflicts.

For location e-mail updates, replace the full approved set atomically inside the location transaction:

```js
await client.query('delete from customer_location_registration_emails where tenant_id=$1 and location_id=$2',[tenantId,locationId]);
for(const email of location.registrationEmails){
  await client.query('insert into customer_location_registration_emails(tenant_id,location_id,email) values($1,$2,$3)',[tenantId,locationId,email]);
}
```

Every lookup includes `tenant_id=$1`; missing rows become `CUSTOMER_NOT_FOUND` or `LOCATION_NOT_FOUND`.

Every mutation writes the appropriate audit event from the approved spec. Do not audit secrets; for e-mail changes store counts rather than full e-mail lists in audit metadata.

- [ ] **Step 5: Add store contract/security tests**

Static source tests must assert:
- every store mutation uses `withTenantMasterdataClient(...,{write:true})`;
- customer creation contains customer + location + registration e-mail insert in the same callback;
- approved audit event names exist;
- there is no `delete from customers` or `delete from customer_locations`;
- tenant filters are present on update/select operations.

- [ ] **Step 6: Run focused and full tests**

Run: `node --test test/masterdata.test.mjs && npm test`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/shared/masterdata-validation.js api/shared/masterdata-store.js test/masterdata.test.mjs
git commit -m "Add tenant isolated customer masterdata store"
```

---

### Task 4: Add authenticated/CSRF-protected master-data APIs

**Files:**
- Create: `api/masterdata-customers/index.js`, `api/masterdata-customers/function.json`
- Create: `api/masterdata-customer/index.js`, `api/masterdata-customer/function.json`
- Create: `api/masterdata-customer-status/index.js`, `api/masterdata-customer-status/function.json`
- Create: `api/masterdata-customer-locations/index.js`, `api/masterdata-customer-locations/function.json`
- Create: `api/masterdata-location/index.js`, `api/masterdata-location/function.json`
- Create: `api/masterdata-location-status/index.js`, `api/masterdata-location-status/function.json`
- Create: `api/masterdata-locations/index.js`, `api/masterdata-locations/function.json`
- Modify/Test: `test/masterdata.test.mjs`

**Interfaces / routes:**
- `GET /api/professional-masterdata/customers?q=&status=` — list/search.
- `POST /api/professional-masterdata/customers` — atomic customer + first location create.
- `GET /api/professional-masterdata/customers/{customerId}` — customer + locations + registration e-mails.
- `POST /api/professional-masterdata/customers/{customerId}` — update customer core data.
- `POST /api/professional-masterdata/customers/{customerId}/status` — `{active:boolean}`.
- `POST /api/professional-masterdata/customers/{customerId}/locations` — create location.
- `POST /api/professional-masterdata/locations/{locationId}` — update complete location/e-mail set.
- `POST /api/professional-masterdata/locations/{locationId}/status` — `{active:boolean}`.
- `GET /api/professional-masterdata/locations?q=&status=` — global location search.

- [ ] **Step 1: Write failing route/security tests**

Test exact `function.json` routes/methods and source requirements:

```js
test('masterdata mutation routes require write permission and CSRF',()=>{
  const folders=['masterdata-customers','masterdata-customer','masterdata-customer-status','masterdata-customer-locations','masterdata-location','masterdata-location-status'];
  for(const folder of folders){
    const src=fs.readFileSync(new URL(`../api/${folder}/index.js`,import.meta.url),'utf8');
    assert.match(src,/customers\.write/);
    assert.match(src,/csrf:true/);
  }
});
```

For mixed GET/POST handlers, ensure GET branches request `customers.read` without CSRF and POST branches request `customers.write` with CSRF.

- [ ] **Step 2: Run test and verify failure**

Run: `node --test test/masterdata.test.mjs`

Expected: FAIL because route folders are absent.

- [ ] **Step 3: Implement route handlers**

Follow the existing compact Professional pattern:

```js
const authz=require('../shared/authorization');
const store=require('../shared/masterdata-store');
const http=require('../shared/http');
module.exports=async function(context,req){
  try{
    // branch by req.method where a route supports GET and POST
  }catch(err){http.error(context,err);}
};
```

Never accept `tenantId` from body/query. Always use `session.tenant_id`. Parse route IDs only from `context.bindingData`/route binding. All mutating branches use `http.bodyOf(req)` and `csrf:true`.

- [ ] **Step 4: Run route tests and Node syntax checks**

Run:

```bash
node --test test/masterdata.test.mjs
for f in api/masterdata-*/index.js; do node --check "$f"; done
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/masterdata-* test/masterdata.test.mjs
git commit -m "Add Professional customer masterdata APIs"
```

---

### Task 5: Replace Customers placeholder with Master-Detail workspace and reusable drawer

**Files:**
- Modify: `index.html`
- Modify: `assets/css/app.css`
- Modify: `assets/js/app.js`
- Create/Test: `test/masterdata-ui.test.mjs`

**Interfaces:**
- Frontend state: `liveCustomers`, `selectedCustomerId`, `selectedCustomer`, `openLocationIds`, `masterdataBusy`.
- Functions: `loadCustomers()`, `selectCustomer(id,{focusLocationId}={})`, `renderCustomerList()`, `renderCustomerDetail()`, `toggleLocationAccordion(id)`, `openCustomerDrawer(mode,entity)`, `openLocationDrawer(mode,entity)`, `closeMasterdataDrawer()`, `saveCustomerDrawer()`, `saveLocationDrawer()`.
- `canWriteCustomers()` mirrors UI affordances only; server permission remains authoritative.

- [ ] **Step 1: Write failing UI contract tests**

Create `test/masterdata-ui.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('customers view is master-detail with reusable drawer',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/id="customerMasterList"/);
  assert.match(html,/id="customerDetailPane"/);
  assert.match(html,/id="masterdataDrawer"/);
  assert.match(html,/id="masterdataDrawerBackdrop"/);
});

test('customer UI supports multiple open locations and role-aware write controls',()=>{
  const js=fs.readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
  assert.match(js,/openLocationIds\s*=\s*new Set/);
  assert.match(js,/function canWriteCustomers/);
  assert.match(js,/loadCustomers/);
  assert.match(js,/renderCustomerDetail/);
});
```

- [ ] **Step 2: Run UI tests and verify failure**

Run: `node --test test/masterdata-ui.test.mjs`

Expected: FAIL because live Master-Detail markup/state does not exist.

- [ ] **Step 3: Replace the Customers read-only placeholder markup**

Build one page section containing:
- page header + `Neuer Kunde` action;
- left master column with search input, active/inactive/all filter, result count and `#customerMasterList`;
- right `#customerDetailPane` with compact customer header and location accordion container;
- empty/loading/error states.

Add one reusable drawer shell near the end of `#appShell`:

```html
<div id="masterdataDrawerBackdrop" class="drawer-backdrop hidden"></div>
<aside id="masterdataDrawer" class="masterdata-drawer hidden" aria-hidden="true">
  <header class="drawer-head"><div><div id="masterdataDrawerKicker" class="kicker"></div><h2 id="masterdataDrawerTitle"></h2></div><button id="closeMasterdataDrawer" class="ghost compact" type="button">Schließen</button></header>
  <div id="masterdataDrawerBody" class="drawer-body"></div>
</aside>
```

- [ ] **Step 4: Add Master-Detail and drawer CSS**

Use existing colors/radii; do not create a visually separate design system. Required behavior:
- desktop: roughly 320px customer master column + flexible detail pane;
- location accordions are compact, multiple can remain open;
- drawer fixed right, normal edit width ~520px, `wide` modifier ~760px for new customer;
- backdrop on smaller screens/full overlay;
- forms use two-column grids where space allows and single column on phone;
- no horizontal page scrolling.

- [ ] **Step 5: Implement customer list/detail loading and rendering**

In `setView(name)`, when `name==='customers'` and session exists, call `loadCustomers()`.

List item must show account, name, status. Customer detail must show compact customer header plus all location accordions. Collapsed location summary: name, city, country, active/inactive and carrier. Expanded content: full address, registration e-mails, contact data, carrier and shipping instructions.

`openLocationIds` remains a `Set`, so opening one location never closes another.

- [ ] **Step 6: Implement drawer forms and mutation flows**

New customer drawer is `wide` and contains customer account/name plus the first mandatory location and repeatable registration-e-mail inputs. It posts one payload to `POST /api/professional-masterdata/customers`.

Edit customer drawer edits account/name only. New/edit location drawers edit structured address, contact, carrier/shipping data and repeatable registration e-mails. After successful mutation:
1. close drawer;
2. refresh list;
3. reselect the saved customer;
4. preserve/open the affected location accordion;
5. display API errors inline in drawer, not only `alert()`.

Deactivation/activation uses confirmation and the status endpoints. No delete button exists.

- [ ] **Step 7: Run UI/full tests**

Run: `node --test test/masterdata-ui.test.mjs && npm test`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add index.html assets/css/app.css assets/js/app.js test/masterdata-ui.test.mjs
git commit -m "Build customer master detail workspace"
```

---

### Task 6: Implement the global Locations view using the same canonical editor

**Files:**
- Modify: `index.html`
- Modify: `assets/js/app.js`
- Modify: `assets/css/app.css`
- Modify/Test: `test/masterdata-ui.test.mjs`

**Interfaces:**
- `loadGlobalLocations()` calls `GET /api/professional-masterdata/locations`.
- `openCustomerForLocation(customerId,locationId)` switches to Customers view, selects customer and expands/focuses the location.

- [ ] **Step 1: Add failing global-location UI test**

```js
test('locations view reuses customer editor instead of creating a second edit flow',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const js=fs.readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
  assert.match(html,/id="globalLocationSearch"/);
  assert.match(html,/id="globalLocationRows"/);
  assert.match(js,/function loadGlobalLocations/);
  assert.match(js,/openCustomerForLocation/);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test test/masterdata-ui.test.mjs`

Expected: FAIL.

- [ ] **Step 3: Build global location search/list**

Replace the migration-only Locations placeholder with search + status filter + compact results. Each row shows customer account/name, location name, city, country, status and carrier.

Clicking a result calls `openCustomerForLocation(customerId,locationId)`; there is no separate location edit form on this page.

Update `setView('locations')` to load global locations when authenticated.

- [ ] **Step 4: Run UI/full tests**

Run: `node --test test/masterdata-ui.test.mjs && npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add index.html assets/js/app.js assets/css/app.css test/masterdata-ui.test.mjs
git commit -m "Add global customer location search"
```

---

### Task 7: Expand CI/runtime validation and complete security regression

**Files:**
- Modify: `.github/workflows/professional-ci.yml`
- Modify: `test/masterdata.test.mjs`
- Modify: `test/masterdata-ui.test.mjs`

**Interfaces:**
- CI must syntax-check and require-load new shared modules and every master-data route.
- CI continues validating Professional repository identity and existing 0.7 flows.

- [ ] **Step 1: Add regression assertions before workflow changes**

Add static tests that verify:
- all mutation route sources contain `customers.write` and `csrf:true`;
- read routes contain `customers.read`;
- no route reads a tenant ID from request body/query;
- store contains no hard-delete customer/location SQL;
- schema RLS array contains `customer_location_registration_emails`;
- frontend has no delete customer/location control;
- `WAREHOUSE` and `AUDITOR` cannot write.

- [ ] **Step 2: Run tests**

Run: `npm test`

Expected: PASS after Tasks 1-6; capture baseline test count.

- [ ] **Step 3: Update CI runtime validation**

Add to the `files=(...)` Node syntax-check list:
- `api/shared/masterdata-validation.js`
- `api/shared/masterdata-store.js`
- every `api/masterdata-*/index.js`

Extend the load check to require the two shared master-data modules.

Do not change repository identity, Node version, deployment repo, or legacy-backup protections.

- [ ] **Step 4: Run local-equivalent verification**

Run:

```bash
npm test
npm install --prefix api --ignore-scripts --no-audit --no-fund
for f in api/shared/*.js api/masterdata-*/index.js; do node --check "$f"; done
node -e "require('./api/shared/database.js');require('./api/shared/masterdata-validation.js');require('./api/shared/masterdata-store.js');require('./api/shared/authorization.js');require('./api/shared/http.js');console.log('OK')"
```

Expected: all PASS/OK.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/professional-ci.yml test/masterdata.test.mjs test/masterdata-ui.test.mjs
git commit -m "Validate customer masterdata in Professional CI"
```

---

### Task 8: Safe database activation, deployment and live verification

**Files:**
- No source-code changes unless verification finds a defect.
- Use committed `schema/postgres.sql` and existing `.github/workflows/professional-deploy.yml`.

**Interfaces:**
- Azure Static Web App remains `ExportHUB-Professional`.
- Live URL remains `https://kind-grass-0395b3a03.6.azurestaticapps.net`.
- New environment flag: `PROFESSIONAL_ENABLE_MASTERDATA_WRITES=true`.

- [ ] **Step 1: Verify the final branch before activation**

Run/confirm GitHub CI for the final `main` SHA. Required: `ExportHUB Professional CI` completes successfully. Do not activate the database gate while CI is failing.

- [ ] **Step 2: Apply the idempotent schema to the Professional PostgreSQL database**

From an authorized environment that already has the database credential (do not paste it into chat or Git):

```bash
psql "$PROFESSIONAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f schema/postgres.sql
```

Expected: command exits 0. `NOTICE ... already exists` is acceptable; SQL errors are not.

Then verify with SQL:

```sql
select column_name from information_schema.columns
 where table_name='customer_locations'
   and column_name in ('street','house_number','postal_code','city','country_iso','contact_email','carrier_name','shipping_instructions','active','updated_at')
 order by column_name;
select to_regclass('public.customer_location_registration_emails');
```

Expected: all ten location columns are returned and `to_regclass` is non-null.

- [ ] **Step 3: Enable only the new master-data gate in Azure**

Set Production environment variable:

```text
PROFESSIONAL_ENABLE_MASTERDATA_WRITES=true
```

Do not change:

```text
PROFESSIONAL_DATA_MODE=migration-read-only
PROFESSIONAL_ENABLE_WRITES=false
PROFESSIONAL_ENABLE_CONTROL_WRITES=true
```

- [ ] **Step 4: Deploy and verify Azure workflow**

Trigger/confirm `ExportHUB Professional Deploy` for the final CI-successful `main` SHA. Required: deployment job completes `success`.

- [ ] **Step 5: Verify safe runtime metadata**

GET `/api/professional-meta` and verify:
- `database.configured === true`
- `database.masterdataWritesEnabled === true`
- `database.writesEnabled === false`
- `database.controlWritesEnabled === true`
- no credentials or secret values appear in response.

- [ ] **Step 6: Perform live role and CRUD smoke tests**

Using the authenticated Professional UI:
1. Create a customer with manual customer number, company name, first complete location and two registration e-mails.
2. Confirm customer appears in left master list.
3. Expand its location and confirm both registration e-mails, address, carrier/shipping values.
4. Add a second location; open both accordions simultaneously and verify both remain open.
5. Edit one location from the right drawer; verify immediate refresh.
6. Use global Locations search and open the same location back in Customers.
7. Deactivate the second location; verify it remains visible as Inactive.
8. Deactivate/reactivate customer; verify no deletion occurs.
9. Verify warehouse/auditor sessions have no write controls and server rejects direct write attempts with 403.
10. Verify audit contains create/update/status events without full registration e-mail lists or secrets.

- [ ] **Step 7: Final regression evidence**

Record final GitHub commit SHA, CI run ID/status, deploy run ID/status and smoke-test result in the implementation handoff message. Never claim live completion until all four are verified.
