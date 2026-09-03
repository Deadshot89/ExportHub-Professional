# Customers & Locations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first live operational master-data module in ExportHUB Professional: tenant-isolated customer and location management with multiple registration e-mails, location-specific carrier/shipping data, audit, role enforcement, Master-Detail UI, and a separate master-data write gate.

**Architecture:** Keep the existing server-session and PostgreSQL-RLS model. Add a dedicated tenant-scoped master-data database wrapper, a pure validation module and a focused persistence store. Small Azure Functions expose the store; the frontend replaces the migration-only customer/location placeholders with one canonical Master-Detail workspace plus a reusable right-side drawer, while the global Locations view links back into that same editor.

**Tech Stack:** Node.js >=20, Azure Functions JavaScript (CommonJS), Azure Static Web Apps, PostgreSQL 18, `pg` 8.13.1, browser ES modules, plain HTML/CSS/JavaScript, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-03-customers-locations-design.md`

## Global Constraints

- Work only in `Deadshot89/ExportHub-Professional` on `main`; never modify `Deadshot89/ExportHub`.
- Keep `PROFESSIONAL_DATA_MODE=migration-read-only`.
- Keep `PROFESSIONAL_ENABLE_WRITES=false`.
- Keep `PROFESSIONAL_ENABLE_CONTROL_WRITES=true`.
- Add `PROFESSIONAL_ENABLE_MASTERDATA_WRITES=true` as a separate write gate; never map customer writes to the global operational gate.
- No normal hard-delete for customers or locations; use `active`.
- New customer creation is atomic: customer + first complete location + at least one registration e-mail.
- Customer account number is manually entered and unique inside one tenant/workspace.
- No main/default location and no automatic location choice.
- All registration e-mails stored on a location are the later registration recipient set.
- Contact e-mail remains separate from registration e-mails.
- Carrier and shipping instructions belong to the location.
- Write roles: `TENANT_ADMIN`, `EXPORT_ADMIN`, `TEAM_LEAD`, `OPERATOR`.
- Read-only roles: `WAREHOUSE`, `AUDITOR`.
- Preserve imported/legacy rows and the existing `address`, `email`, `derived_main`, `legacy_*` and migration metadata fields.
- New clean databases enforce required live columns with `NOT NULL`; upgrades of legacy databases add structured columns safely without rewriting old imported rows. The live API always enforces the approved required fields.
- Every mutating endpoint requires server-side `customers.write` plus CSRF.
- Every read endpoint requires server-side `customers.read`.
- Tenant IDs come only from the validated session, never request body/query.
- RLS remains the database-side second isolation layer.
- No secrets, tokens, passwords or database credentials in Git/logs.
- TDD for every task: failing test → implementation → focused tests → full regression → commit.

---

## File Map

**Modify**
- `schema/postgres.sql`
- `api/shared/database.js`
- `api/shared/authorization.js`
- `api/shared/http.js`
- `api/professional-meta/index.js`
- `index.html`
- `assets/css/app.css`
- `assets/js/app.js`
- `.github/workflows/professional-ci.yml`

**Create**
- `api/shared/masterdata-validation.js`
- `api/shared/masterdata-store.js`
- `api/masterdata-customers/index.js`
- `api/masterdata-customers/function.json`
- `api/masterdata-customer/index.js`
- `api/masterdata-customer/function.json`
- `api/masterdata-customer-status/index.js`
- `api/masterdata-customer-status/function.json`
- `api/masterdata-customer-locations/index.js`
- `api/masterdata-customer-locations/function.json`
- `api/masterdata-location/index.js`
- `api/masterdata-location/function.json`
- `api/masterdata-location-status/index.js`
- `api/masterdata-location-status/function.json`
- `api/masterdata-locations/index.js`
- `api/masterdata-locations/function.json`
- `test/masterdata.test.mjs`
- `test/masterdata-ui.test.mjs`

`masterdata-validation.js` contains no SQL. `masterdata-store.js` owns SQL and audit. Azure route files own only HTTP/session/permission/CSRF adaptation. Frontend owns no authorization decisions beyond hiding unavailable controls; the API remains authoritative.

---

### Task 1: Master-data write gate, permissions and HTTP errors

**Files:**
- Modify: `api/shared/database.js`
- Modify: `api/shared/authorization.js`
- Modify: `api/shared/http.js`
- Modify: `api/professional-meta/index.js`
- Create/Test: `test/masterdata.test.mjs`

**Produces:**
- `masterdataWritesEnabled(): boolean`
- `withTenantMasterdataClient(tenantId, fn, {write=false})`
- approved `customers.read` / `customers.write` matrix
- deterministic master-data HTTP error status mapping

- [ ] **Step 1: Write the failing tests**

Create `test/masterdata.test.mjs` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const authz=require('../api/shared/authorization.js');

test('customer masterdata permissions match approved roles',()=>{
  for(const role of ['TENANT_ADMIN','EXPORT_ADMIN','TEAM_LEAD','OPERATOR']){
    assert.equal(authz.hasPermission(role,'customers.read'),true);
    assert.equal(authz.hasPermission(role,'customers.write'),true);
  }
  for(const role of ['WAREHOUSE','AUDITOR']){
    assert.equal(authz.hasPermission(role,'customers.read'),true);
    assert.equal(authz.hasPermission(role,'customers.write'),false);
  }
});

test('customer masterdata has its own write gate',()=>{
  const src=fs.readFileSync(new URL('../api/shared/database.js',import.meta.url),'utf8');
  assert.match(src,/PROFESSIONAL_ENABLE_MASTERDATA_WRITES/);
  assert.match(src,/function masterdataWritesEnabled/);
  assert.match(src,/withTenantMasterdataClient/);
  assert.match(src,/MASTERDATA_WRITES_DISABLED/);
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `node --test test/masterdata.test.mjs`

Expected: FAIL because the new gate/helper and final role matrix do not yet exist.

- [ ] **Step 3: Implement the isolated database wrapper**

Add to `api/shared/database.js` without changing existing `writesEnabled()` or `controlWritesEnabled()`:

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

Change `status()` to:

```js
function status(){return {
  configured:configured(),
  dataMode:DATA_MODE,
  writesEnabled:writesEnabled(),
  controlWritesEnabled:controlWritesEnabled(),
  masterdataWritesEnabled:masterdataWritesEnabled()
};}
```

Export both new functions.

- [ ] **Step 4: Apply the approved role matrix and HTTP codes**

In `authorization.js` ensure:

```js
TENANT_ADMIN:  customers.read + customers.write
EXPORT_ADMIN:  customers.read + customers.write
TEAM_LEAD:     customers.read + customers.write
OPERATOR:      customers.read + customers.write
WAREHOUSE:     customers.read only
AUDITOR:       customers.read only
```

In `http.js` map:

```js
LOCATION_REQUIRED:400,
REGISTRATION_EMAIL_REQUIRED:400,
REGISTRATION_EMAIL_DUPLICATE:409,
CUSTOMER_EXISTS:409,
CUSTOMER_NOT_FOUND:404,
LOCATION_NOT_FOUND:404,
MASTERDATA_WRITES_DISABLED:503
```

`api/professional-meta/index.js` continues returning `database:db.status()`; no secret values are added.

- [ ] **Step 5: Run focused and regression tests**

Run:

```bash
node --test test/masterdata.test.mjs test/user-admin.test.mjs test/auth.test.mjs test/security.test.mjs
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/shared/database.js api/shared/authorization.js api/shared/http.js api/professional-meta/index.js test/masterdata.test.mjs
git commit -m "Add isolated customer masterdata write gate"
```

---

### Task 2: Migration-safe PostgreSQL master-data schema

**Files:**
- Modify: `schema/postgres.sql`
- Modify/Test: `test/masterdata.test.mjs`

**Produces:** structured customer/location fields, registration-e-mail relation, composite tenant FKs and RLS.

- [ ] **Step 1: Add failing schema tests**

Append:

```js
test('schema supports live customer locations and registration emails',()=>{
  const sql=fs.readFileSync(new URL('../schema/postgres.sql',import.meta.url),'utf8');
  for(const token of ['street text','house_number text','postal_code text','city text','country_iso text','contact_email text','carrier_name text','shipping_instructions text']){
    assert.match(sql,new RegExp(token,'i'));
  }
  assert.match(sql,/create table if not exists customer_location_registration_emails/i);
  assert.match(sql,/customer_location_registration_emails_uq/i);
  assert.match(sql,/customer_location_registration_emails.*tenant_isolation/s);
});
```

- [ ] **Step 2: Verify failure**

Run: `node --test test/masterdata.test.mjs`

Expected: FAIL because the fields/table do not yet exist.

- [ ] **Step 3: Harden clean-install table definitions**

For a fresh database, define customer account and structured live location fields as required:

```sql
-- in the clean-install customers definition
account text not null,
active boolean not null default true,
updated_at timestamptz not null default now(),

-- in the clean-install customer_locations definition
street text not null,
house_number text not null,
postal_code text not null,
city text not null,
country_iso text,
contact_email text,
carrier_name text,
shipping_instructions text,
active boolean not null default true,
updated_at timestamptz not null default now(),
```

Keep the legacy `address`, `country`, `email`, `derived_main`, `legacy_location_id`, `source_metadata` fields.

- [ ] **Step 4: Add safe upgrades for already-created databases**

After the existing table definitions add:

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

create unique index if not exists customers_tenant_id_id_uq on customers(tenant_id,id);
create unique index if not exists customer_locations_tenant_id_id_uq on customer_locations(tenant_id,id);
```

Do not force legacy rows to populate the new structured columns during this migration.

- [ ] **Step 5: Add tenant-safe customer/location FK**

Use the exact idempotent block:

```sql
do $$
begin
  if not exists (select 1 from pg_constraint where conname='customer_locations_tenant_customer_fk') then
    alter table customer_locations
      add constraint customer_locations_tenant_customer_fk
      foreign key(tenant_id,customer_id)
      references customers(tenant_id,id)
      not valid;
  end if;
end $$;
```

This enforces new writes without requiring historical rows to validate immediately.

- [ ] **Step 6: Add registration e-mail table and RLS**

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

Add `'customer_location_registration_emails'` to the existing RLS table array so it receives the same `tenant_isolation` policy.

- [ ] **Step 7: Run regression tests and commit**

Run: `npm test`

Expected: PASS.

```bash
git add schema/postgres.sql test/masterdata.test.mjs
git commit -m "Extend Professional schema for customer masterdata"
```

---

### Task 3: Pure validation and tenant-scoped persistence store

**Files:**
- Create: `api/shared/masterdata-validation.js`
- Create: `api/shared/masterdata-store.js`
- Modify/Test: `test/masterdata.test.mjs`

**Produces:**
- `cleanCustomer(input)`
- `cleanLocation(input)`
- `listCustomers`, `getCustomer`, `createCustomer`, `updateCustomer`, `setCustomerActive`
- `createLocation`, `updateLocation`, `setLocationActive`, `listLocations`

- [ ] **Step 1: Write failing validation tests**

Append:

```js
const validation=require('../api/shared/masterdata-validation.js');

test('location validation normalizes registration emails',()=>{
  const v=validation.cleanLocation({
    name:' Werk A ',street:'Industriestraße',houseNumber:'7',postalCode:'41334',city:'Nettetal',country:'Deutschland',
    registrationEmails:[' AVIS@EXAMPLE.DE ','avis@example.de','lager@example.de']
  });
  assert.deepEqual(v.registrationEmails,['avis@example.de','lager@example.de']);
});

test('live customer and location required fields are enforced',()=>{
  assert.throws(()=>validation.cleanCustomer({name:'Kunde'}),e=>e.code==='INPUT_INVALID');
  assert.throws(()=>validation.cleanLocation({name:'Werk',registrationEmails:['x@example.de']}),e=>e.code==='INPUT_INVALID');
  assert.throws(()=>validation.cleanLocation({name:'Werk',street:'A',houseNumber:'1',postalCode:'1',city:'X',country:'DE',registrationEmails:[]}),e=>e.code==='REGISTRATION_EMAIL_REQUIRED');
});
```

- [ ] **Step 2: Verify failure**

Run: `node --test test/masterdata.test.mjs`

Expected: FAIL because `masterdata-validation.js` does not exist.

- [ ] **Step 3: Implement the pure validation module**

Create `api/shared/masterdata-validation.js` with this interface and behavior:

```js
function text(value,label,{required=true,max=160}={}){
  const v=String(value??'').trim();
  if(required&&!v) throw Object.assign(new Error(`${label} ist erforderlich.`),{code:'INPUT_INVALID'});
  if(v.length>max) throw Object.assign(new Error(`${label} ist zu lang.`),{code:'INPUT_INVALID'});
  return v||null;
}
function email(value){
  const v=String(value??'').trim().toLowerCase();
  if(!v||v.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw Object.assign(new Error('E-Mail-Adresse ist ungültig.'),{code:'EMAIL_INVALID'});
  return v;
}
function registrationEmails(values){
  const list=Array.isArray(values)?values:[];
  if(!list.length) throw Object.assign(new Error('Mindestens eine Anmelde-E-Mail ist erforderlich.'),{code:'REGISTRATION_EMAIL_REQUIRED'});
  return [...new Set(list.map(email))];
}
function cleanCustomer(input={}){
  return {account:text(input.account,'Kundennummer',{max:80}),name:text(input.name,'Firmenname',{max:200})};
}
function cleanLocation(input={}){
  return {
    name:text(input.name,'Standortname',{max:200}),
    street:text(input.street,'Straße',{max:200}),
    houseNumber:text(input.houseNumber,'Hausnummer',{max:40}),
    postalCode:text(input.postalCode,'PLZ',{max:40}),
    city:text(input.city,'Ort',{max:160}),
    country:text(input.country,'Land',{max:160}),
    countryIso:text(input.countryIso,'ISO',{required:false,max:3})?.toUpperCase()||null,
    contactName:text(input.contactName,'Ansprechpartner',{required:false,max:160}),
    contactEmail:input.contactEmail?email(input.contactEmail):null,
    phone:text(input.phone,'Telefon',{required:false,max:80}),
    carrierName:text(input.carrierName,'Spedition',{required:false,max:160}),
    shippingInstructions:text(input.shippingInstructions,'Versandvorgaben',{required:false,max:4000}),
    registrationEmails:registrationEmails(input.registrationEmails)
  };
}
module.exports={cleanCustomer,cleanLocation,registrationEmails};
```

- [ ] **Step 4: Add failing store-contract tests**

Append source-contract tests verifying:

```js
const storeSrc=fs.readFileSync(new URL('../api/shared/masterdata-store.js',import.meta.url),'utf8');
assert.match(storeSrc,/withTenantMasterdataClient/);
assert.match(storeSrc,/insert into customers/i);
assert.match(storeSrc,/insert into customer_locations/i);
assert.match(storeSrc,/insert into customer_location_registration_emails/i);
assert.doesNotMatch(storeSrc,/delete from customers/i);
assert.doesNotMatch(storeSrc,/delete from customer_locations/i);
for(const event of ['CUSTOMER_CREATED','CUSTOMER_UPDATED','CUSTOMER_ACTIVATED','CUSTOMER_DEACTIVATED','LOCATION_CREATED','LOCATION_UPDATED','LOCATION_ACTIVATED','LOCATION_DEACTIVATED','LOCATION_REGISTRATION_EMAILS_CHANGED']) assert.match(storeSrc,new RegExp(event));
```

- [ ] **Step 5: Implement `masterdata-store.js`**

Use `db.withTenantMasterdataClient` for every operation. `createCustomer` must use one `{write:true}` callback for all inserts and audits:

```js
async function createCustomer(tenantId,actorUserId,input){
  const customer=v.cleanCustomer(input);
  const location=v.cleanLocation(input.location);
  try{
    return await db.withTenantMasterdataClient(tenantId,async client=>{
      const cr=await client.query(
        'insert into customers(tenant_id,account,name,active,updated_at) values($1,$2,$3,true,now()) returning id,account,name,active,created_at,updated_at',
        [tenantId,customer.account,customer.name]
      );
      const c=cr.rows[0];
      const lr=await client.query(
        `insert into customer_locations(tenant_id,customer_id,name,street,house_number,postal_code,city,country,country_iso,contact_name,contact_email,phone,carrier_name,shipping_instructions,address,email,active,updated_at)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$11,true,now()) returning id`,
        [tenantId,c.id,location.name,location.street,location.houseNumber,location.postalCode,location.city,location.country,location.countryIso,location.contactName,location.contactEmail,location.phone,location.carrierName,location.shippingInstructions,`${location.street} ${location.houseNumber}, ${location.postalCode} ${location.city}`]
      );
      const locationId=lr.rows[0].id;
      for(const e of location.registrationEmails) await client.query('insert into customer_location_registration_emails(tenant_id,location_id,email) values($1,$2,$3)',[tenantId,locationId,e]);
      await audit(client,tenantId,actorUserId,'CUSTOMER_CREATED','CUSTOMER',c.id,{account:c.account});
      await audit(client,tenantId,actorUserId,'LOCATION_CREATED','LOCATION',locationId,{customerId:c.id,registrationEmailCount:location.registrationEmails.length});
      return {customerId:c.id,locationId};
    },{write:true});
  }catch(err){
    if(err.code==='23505') throw Object.assign(new Error('Kundennummer existiert bereits.'),{code:'CUSTOMER_EXISTS'});
    throw err;
  }
}
```

Implement the remaining exported functions with the same rules:
- all lookups include `tenant_id=$1`;
- `getCustomer` returns customer, ordered locations and per-location `registrationEmails`;
- `listCustomers` supports case-insensitive account/name search and `active|inactive|all`;
- `listLocations` joins customers and supports customer/location/address/carrier search;
- updates set `updated_at=now()`;
- location create/update calls `cleanLocation`;
- location update replaces the full registration e-mail set inside the same transaction;
- customer/location status functions only update `active`, never delete;
- every mutation calls the approved audit event;
- audit metadata for registration e-mails stores only counts, not full addresses;
- a row absent in the current tenant throws `CUSTOMER_NOT_FOUND` or `LOCATION_NOT_FOUND`.

- [ ] **Step 6: Run focused/full tests and commit**

Run:

```bash
node --test test/masterdata.test.mjs
npm test
```

Expected: PASS.

```bash
git add api/shared/masterdata-validation.js api/shared/masterdata-store.js test/masterdata.test.mjs
git commit -m "Add tenant isolated customer masterdata store"
```

---

### Task 4: Authenticated master-data Azure Functions

**Files:**
- Create all seven `api/masterdata-*` route folders listed in File Map.
- Modify/Test: `test/masterdata.test.mjs`

**Routes:**
- `GET  professional-masterdata/customers`
- `POST professional-masterdata/customers`
- `GET  professional-masterdata/customers/{customerId}`
- `POST professional-masterdata/customers/{customerId}`
- `POST professional-masterdata/customers/{customerId}/status`
- `POST professional-masterdata/customers/{customerId}/locations`
- `POST professional-masterdata/locations/{locationId}`
- `POST professional-masterdata/locations/{locationId}/status`
- `GET  professional-masterdata/locations`

- [ ] **Step 1: Write failing route tests**

Append tests that read every `function.json` and assert exact route/method arrays. Also assert read source contains `customers.read`, write branches contain `customers.write` and `csrf:true`.

Example expected route config for `masterdata-customers/function.json`:

```json
{
  "bindings":[
    {"authLevel":"anonymous","type":"httpTrigger","direction":"in","name":"req","methods":["get","post"],"route":"professional-masterdata/customers"},
    {"type":"http","direction":"out","name":"res"}
  ]
}
```

- [ ] **Step 2: Verify failure**

Run: `node --test test/masterdata.test.mjs`

Expected: FAIL because routes are absent.

- [ ] **Step 3: Implement the mixed customer-list/create route exactly**

`api/masterdata-customers/index.js`:

```js
const authz=require('../shared/authorization');
const store=require('../shared/masterdata-store');
const http=require('../shared/http');
module.exports=async function(context,req){
  try{
    if(String(req.method||'GET').toUpperCase()==='POST'){
      const {session}=await authz.requireSession(req,{permission:'customers.write',csrf:true});
      const data=await store.createCustomer(session.tenant_id,session.user_id,http.bodyOf(req));
      return http.json(context,201,{ok:true,...data});
    }
    const {session}=await authz.requireSession(req,{permission:'customers.read'});
    const data=await store.listCustomers(session.tenant_id,{query:req.query?.q||'',status:req.query?.status||'active'});
    return http.json(context,200,{ok:true,customers:data});
  }catch(err){http.error(context,err);}
};
```

- [ ] **Step 4: Implement the customer detail/update route exactly**

`api/masterdata-customer/index.js` uses `context.bindingData.customerId`. GET calls `getCustomer` after `customers.read`; POST calls `updateCustomer` after `customers.write, csrf:true` and returns `{ok:true,customer:data}`.

- [ ] **Step 5: Implement the five single-purpose routes**

Use these exact calls after session validation:

```js
// customer status
store.setCustomerActive(session.tenant_id,session.user_id,context.bindingData.customerId,http.bodyOf(req).active)

// add location
store.createLocation(session.tenant_id,session.user_id,context.bindingData.customerId,http.bodyOf(req))

// update location
store.updateLocation(session.tenant_id,session.user_id,context.bindingData.locationId,http.bodyOf(req))

// location status
store.setLocationActive(session.tenant_id,session.user_id,context.bindingData.locationId,http.bodyOf(req).active)

// global location GET
store.listLocations(session.tenant_id,{query:req.query?.q||'',status:req.query?.status||'active'})
```

All four mutations require `{permission:'customers.write',csrf:true}`. Global location GET requires `{permission:'customers.read'}`.

- [ ] **Step 6: Run route/security checks and commit**

Run:

```bash
node --test test/masterdata.test.mjs
for f in api/masterdata-*/index.js; do node --check "$f"; done
npm test
```

Expected: PASS.

```bash
git add api/masterdata-* test/masterdata.test.mjs
git commit -m "Add Professional customer masterdata APIs"
```

---

### Task 5: Customers Master-Detail UI and reusable right drawer

**Files:**
- Modify: `index.html`
- Modify: `assets/css/app.css`
- Modify: `assets/js/app.js`
- Create/Test: `test/masterdata-ui.test.mjs`

**Produces:** live customer list, customer detail, multi-open location accordions, new/edit/status flows and reusable drawer.

- [ ] **Step 1: Write failing UI contract tests**

Create `test/masterdata-ui.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('customers view is master detail and uses one drawer',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  for(const id of ['customerSearch','customerStatusFilter','customerMasterList','customerDetailPane','masterdataDrawerBackdrop','masterdataDrawer','masterdataDrawerBody']) assert.match(html,new RegExp(`id="${id}"`));
});

test('customer javascript preserves multiple open location accordions',()=>{
  const js=fs.readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
  assert.match(js,/openLocationIds\s*=\s*new Set/);
  assert.match(js,/function canWriteCustomers/);
  assert.match(js,/loadCustomers/);
  assert.match(js,/renderCustomerDetail/);
});
```

- [ ] **Step 2: Verify failure**

Run: `node --test test/masterdata-ui.test.mjs`

Expected: FAIL because the live UI does not exist.

- [ ] **Step 3: Replace the Customers migration placeholder**

`index.html` Customer view contains:
- header with `#newCustomerBtn`;
- left `.customer-master` with `#customerSearch`, `#customerStatusFilter`, count and `#customerMasterList`;
- right `.customer-detail` with `#customerDetailPane`;
- loading/error/empty content rendered by JS.

Add one global drawer shell inside `#appShell`:

```html
<div id="masterdataDrawerBackdrop" class="drawer-backdrop hidden"></div>
<aside id="masterdataDrawer" class="masterdata-drawer hidden" aria-hidden="true">
  <header class="drawer-head">
    <div><div id="masterdataDrawerKicker" class="kicker"></div><h2 id="masterdataDrawerTitle"></h2></div>
    <button id="closeMasterdataDrawer" class="ghost compact" type="button">Schließen</button>
  </header>
  <div id="masterdataDrawerBody" class="drawer-body"></div>
</aside>
```

- [ ] **Step 4: Add the approved visual system**

In `app.css` add:
- `.customer-workspace{display:grid;grid-template-columns:minmax(280px,320px) minmax(0,1fr);gap:16px}`
- compact selectable master rows;
- location accordion header/body with independent `.open` state;
- `.drawer-backdrop{position:fixed;inset:0;...}` and `.masterdata-drawer{position:fixed;right:0;top:0;height:100vh;width:min(520px,100vw);...}`;
- `.masterdata-drawer.wide{width:min(760px,100vw)}`;
- two-column form grid desktop, one column below 700px;
- responsive Master-Detail stacking below 900px;
- no horizontal body overflow.

Use existing Professional colors, borders, radii and button classes rather than introducing another theme.

- [ ] **Step 5: Add state and read flows in `app.js`**

Add:

```js
let liveCustomers=[],selectedCustomerId=null,selectedCustomer=null,openLocationIds=new Set(),masterdataBusy=false;
function canWriteCustomers(){return !localMigrationLab&&['TENANT_ADMIN','EXPORT_ADMIN','TEAM_LEAD','OPERATOR'].includes(identitySession?.user?.role);}
```

Implement:
- `loadCustomers()` GETs `/api/professional-masterdata/customers` with current search/status;
- `renderCustomerList()` shows account, name and status;
- `selectCustomer(id,{focusLocationId}={})` GETs detail, sets selection and optionally adds `focusLocationId` to `openLocationIds`;
- `toggleLocationAccordion(id)` only toggles that ID in the Set;
- `renderCustomerDetail()` shows compact customer header plus every location. Collapsed summary is location name, city, country, status, carrier. Expanded body shows full address, all registration e-mails, contact, carrier and shipping instructions.

Update `setView(name)` so authenticated `customers` calls `loadCustomers()`.

- [ ] **Step 6: Add drawer forms and mutations**

Implement one `openDrawer({title,kicker,wide,html,onSubmit})` helper plus close behavior.

New customer payload shape:

```js
{
  account,
  name,
  location:{
    name,street,houseNumber,postalCode,city,country,countryIso,
    contactName,contactEmail,phone,carrierName,shippingInstructions,
    registrationEmails
  }
}
```

New customer form starts with one registration e-mail row and allows adding/removing rows, but never permits submitting zero rows.

Edit customer form changes account/name only. New/edit location forms use the same location field set and repeatable registration e-mails.

After a successful mutation: close drawer → refresh list → reselect customer → open affected location. API errors render into a `.drawer-message` inside the drawer. Status actions use confirmation and status endpoints. No delete action exists.

- [ ] **Step 7: Run UI/full tests and commit**

Run:

```bash
node --test test/masterdata-ui.test.mjs
npm test
```

Expected: PASS.

```bash
git add index.html assets/css/app.css assets/js/app.js test/masterdata-ui.test.mjs
git commit -m "Build customer master detail workspace"
```

---

### Task 6: Global Locations search linked to the canonical customer editor

**Files:**
- Modify: `index.html`
- Modify: `assets/js/app.js`
- Modify: `assets/css/app.css`
- Modify/Test: `test/masterdata-ui.test.mjs`

- [ ] **Step 1: Add failing UI test**

```js
test('global locations view opens the canonical customer editor',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const js=fs.readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
  for(const id of ['globalLocationSearch','globalLocationStatusFilter','globalLocationRows']) assert.match(html,new RegExp(`id="${id}"`));
  assert.match(js,/function loadGlobalLocations/);
  assert.match(js,/openCustomerForLocation/);
});
```

- [ ] **Step 2: Verify failure**

Run: `node --test test/masterdata-ui.test.mjs`

Expected: FAIL.

- [ ] **Step 3: Replace the Locations migration placeholder**

Build search + active/inactive/all filter + result list. Result fields: customer account/name, location name, city, country, status and carrier.

Implement:

```js
async function openCustomerForLocation(customerId,locationId){
  setView('customers');
  await loadCustomers();
  await selectCustomer(customerId,{focusLocationId:locationId});
}
```

`loadGlobalLocations()` GETs `/api/professional-masterdata/locations?q=...&status=...`. Clicking a result calls `openCustomerForLocation`; this page has no second edit implementation.

Update `setView('locations')` to call `loadGlobalLocations()` when authenticated.

- [ ] **Step 4: Run tests and commit**

Run: `node --test test/masterdata-ui.test.mjs && npm test`

Expected: PASS.

```bash
git add index.html assets/js/app.js assets/css/app.css test/masterdata-ui.test.mjs
git commit -m "Add global customer location search"
```

---

### Task 7: CI/security regression coverage

**Files:**
- Modify: `.github/workflows/professional-ci.yml`
- Modify: `test/masterdata.test.mjs`
- Modify: `test/masterdata-ui.test.mjs`

- [ ] **Step 1: Add final security assertions**

Assert in tests that:
- write handlers contain `customers.write` and `csrf:true`;
- read handlers contain `customers.read`;
- no master-data handler contains `tenantId` from `req.body` or `req.query`;
- store has no `delete from customers` / `delete from customer_locations`;
- schema RLS array includes `customer_location_registration_emails`;
- UI contains no customer/location delete button;
- warehouse and auditor remain write-denied.

- [ ] **Step 2: Run baseline**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Extend CI runtime validation**

Add these paths to the CI `files=(...)` syntax list:

```text
api/shared/masterdata-validation.js
api/shared/masterdata-store.js
api/masterdata-customers/index.js
api/masterdata-customer/index.js
api/masterdata-customer-status/index.js
api/masterdata-customer-locations/index.js
api/masterdata-location/index.js
api/masterdata-location-status/index.js
api/masterdata-locations/index.js
```

Extend the require-load line with:

```js
require('./shared/masterdata-validation.js');
require('./shared/masterdata-store.js');
```

Do not alter repo identity checks, Node 20, backup protections or deploy target.

- [ ] **Step 4: Run local-equivalent CI and commit**

Run:

```bash
npm test
npm install --prefix api --ignore-scripts --no-audit --no-fund
for f in api/shared/*.js api/masterdata-*/index.js; do node --check "$f"; done
node -e "require('./api/shared/database.js');require('./api/shared/masterdata-validation.js');require('./api/shared/masterdata-store.js');require('./api/shared/authorization.js');require('./api/shared/http.js');console.log('OK')"
```

Expected: all PASS/OK.

```bash
git add .github/workflows/professional-ci.yml test/masterdata.test.mjs test/masterdata-ui.test.mjs
git commit -m "Validate customer masterdata in Professional CI"
```

---

### Task 8: Safe live activation and verification

**Source changes:** none unless verification exposes a defect.

**Live target:** `https://kind-grass-0395b3a03.6.azurestaticapps.net`

- [ ] **Step 1: Verify final `main` CI**

The final `ExportHUB Professional CI` run for the exact `main` SHA must be `success`. Do not enable master-data writes before this passes.

- [ ] **Step 2: Apply the idempotent schema to Professional PostgreSQL**

From an authorized shell that already owns the DB credential:

```bash
psql "$PROFESSIONAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f schema/postgres.sql
```

Expected: exit 0. Existing-object NOTICE messages are acceptable; SQL errors are not.

Verify:

```sql
select column_name
from information_schema.columns
where table_name='customer_locations'
  and column_name in ('street','house_number','postal_code','city','country_iso','contact_email','carrier_name','shipping_instructions','active','updated_at')
order by column_name;

select to_regclass('public.customer_location_registration_emails');
```

Expected: ten requested columns plus a non-null registration-e-mail relation.

- [ ] **Step 3: Enable only the dedicated Azure environment variable**

Set Production:

```text
PROFESSIONAL_ENABLE_MASTERDATA_WRITES=true
```

Keep unchanged:

```text
PROFESSIONAL_DATA_MODE=migration-read-only
PROFESSIONAL_ENABLE_WRITES=false
PROFESSIONAL_ENABLE_CONTROL_WRITES=true
```

- [ ] **Step 4: Deploy and verify workflow success**

Trigger/confirm `ExportHUB Professional Deploy` for the CI-successful SHA. Required: deployment status `success`.

- [ ] **Step 5: Verify safe runtime metadata**

GET `/api/professional-meta`. Required booleans:

```text
database.configured = true
database.masterdataWritesEnabled = true
database.writesEnabled = false
database.controlWritesEnabled = true
```

No credential values may appear.

- [ ] **Step 6: Live CRUD smoke test**

Using an authenticated permitted role:
1. Create one customer with manual account number, first full location and two registration e-mails.
2. Confirm it appears in the left master list.
3. Open its location and verify both registration e-mails and address/carrier data.
4. Add a second location.
5. Keep both accordions open simultaneously.
6. Edit one location using the right drawer and verify refresh.
7. Find it in global Locations search and return to the correct customer/location.
8. Deactivate the second location; confirm it remains visible as Inactive.
9. Deactivate/reactivate the customer; confirm no delete occurs.
10. Verify audit events for create/update/status and confirm registration e-mail audit metadata contains counts, not the full recipient list.

Using `WAREHOUSE` and `AUDITOR` test sessions when available, confirm write controls are absent and direct mutation requests return 403. The automated permission tests remain mandatory even if those live accounts are not yet provisioned.

- [ ] **Step 7: Completion evidence**

Before claiming completion, record the final GitHub SHA, successful CI run ID, successful deploy run ID and smoke-test result. If any one is missing, report the feature as not yet fully verified live.
