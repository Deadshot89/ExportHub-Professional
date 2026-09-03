# Logistics Control Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign ExportHUB Professional into a dense, professional Logistics Control Center across Overview, Customers and Locations without changing customer/location APIs, authorization, tenant isolation or database schema.

**Architecture:** Keep the current static HTML/CSS/ES-module frontend and existing masterdata endpoints. Introduce two focused frontend modules (`ui-kit.js` for icon/status primitives and `overview.js` for the operational dashboard) so `app.js` remains responsible for identity, navigation and canonical customer/location editing while `locations.js` owns the global cross-customer location view. Dashboard and quality indicators use only real current data; unsupported shipment/document metrics render explicit unavailable states rather than fabricated values.

**Tech Stack:** Node.js >=20, Azure Static Web Apps, browser ES modules, plain HTML/CSS/JavaScript, existing Azure Functions APIs, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-03-logistics-control-center-design.md`

## Global Constraints

- Work only in `Deadshot89/ExportHub-Professional`; never modify `Deadshot89/ExportHub`.
- No API contract changes, no schema changes and no authorization changes in this redesign.
- Preserve `PROFESSIONAL_DATA_MODE=migration-read-only`, `PROFESSIONAL_ENABLE_WRITES=false`, `PROFESSIONAL_ENABLE_CONTROL_WRITES=true` and the separate masterdata write gate.
- Preserve all existing customer/location create, edit, activate/deactivate, CSRF, role and tenant-isolation behavior.
- Keep one canonical customer/location editor in `app.js`; the global Locations view only navigates into it.
- Do not display fake shipment, pickup or document metrics. Missing live sources render `–` plus an explicit unavailable explanation.
- Use real customer/location data from the existing GET endpoints for all masterdata counts, warnings and recent-change summaries.
- Do not add an external icon library or new runtime dependency.
- Desktop is primary, but customer/location workflows must remain usable without horizontal scrolling on normal phone widths.
- TDD for each task: failing focused test → minimal implementation → focused test green → full regression → commit.
- Every new frontend module must be included in CI syntax checking and the Azure deploy payload.

---

## File Map

**Modify**
- `index.html` — shell markup, Overview workspace, Customers/Locations structural markup and module loading.
- `assets/css/app.css` — Control Center design tokens, shared components, Overview, Customers, Locations and responsive rules.
- `assets/js/app.js` — session handoff to the dashboard plus upgraded customer/location render templates; existing write flows remain authoritative and unchanged.
- `assets/js/locations.js` — global location filters, enrichment, quality calculation, KPI rendering and canonical open behavior.
- `.github/workflows/professional-ci.yml` — syntax-check all new frontend modules.
- `.github/workflows/professional-deploy.yml` — assert all new frontend modules are present in `.deploy`.
- `test/masterdata-ui.test.mjs` — retain and extend canonical customer/location behavior contracts.

**Create**
- `assets/js/ui-kit.js` — dependency-free SVG icon helper and shared UI-safe status primitives.
- `assets/js/overview.js` — operational dashboard data loading, real masterdata diagnostics, quick-action routing and recent activity rendering.
- `test/control-center-ui.test.mjs` — structural, no-fake-data, module, responsive and design-system contracts.

No `api/**` or `schema/**` file is part of this plan.

---

### Task 1: Control Center foundation and shared UI kit

**Files:**
- Create: `assets/js/ui-kit.js`
- Create/Test: `test/control-center-ui.test.mjs`
- Modify: `assets/css/app.css`
- Modify: `index.html`
- Modify: `.github/workflows/professional-ci.yml`
- Modify: `.github/workflows/professional-deploy.yml`

**Interfaces:**
- Produces: `icon(name, {className='cc-icon', title=''}) -> string`
- Produces CSS building blocks: `.cc-page-head`, `.cc-panel`, `.cc-kpi-grid`, `.cc-kpi`, `.cc-status`, `.cc-toolbar`, `.cc-empty`, `.cc-icon`.
- Does not consume customer/location state.

- [ ] **Step 1: Write the failing Control Center foundation tests**

Create `test/control-center-ui.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('control center has a shared dependency-free UI kit',()=>{
  const html=read('index.html');
  const css=read('assets/css/app.css');
  assert.match(html,/class="shell[^\"]*control-center-shell/);
  for(const cls of ['cc-page-head','cc-panel','cc-kpi-grid','cc-kpi','cc-status','cc-toolbar','cc-empty','cc-icon']){
    assert.match(css,new RegExp(`\\.${cls}\\b`));
  }
  assert.equal(fs.existsSync(new URL('../assets/js/ui-kit.js',import.meta.url)),true);
});

test('new frontend modules are validated and deployed',()=>{
  const ci=read('.github/workflows/professional-ci.yml');
  const deploy=read('.github/workflows/professional-deploy.yml');
  for(const file of ['assets/js/ui-kit.js','assets/js/overview.js']){
    assert.match(ci,new RegExp(`node --check ${file.replaceAll('/','\\/')}`));
    assert.match(deploy,new RegExp(file.replaceAll('/','\\/')));
  }
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test test/control-center-ui.test.mjs
```

Expected: FAIL because `control-center-shell`, shared `cc-*` classes, `ui-kit.js` and `overview.js` CI/deploy assertions do not exist yet.

- [ ] **Step 3: Create the dependency-free icon helper**

Create `assets/js/ui-kit.js` with an immutable SVG path map for these exact names:

```js
const paths={
  customer:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  location:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  shipment:'<path d="M3 3h13v13H3z"/><path d="M16 8h4l3 3v5h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="19" cy="18" r="2"/>',
  document:'<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/>',
  warning:'<path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5"/><circle cx="12" cy="17" r="1"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  activity:'<path d="M3 12h4l2-6 4 12 2-6h6"/>',
  database:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  filter:'<path d="M4 5h16M7 12h10M10 19h4"/>'
};

function icon(name,{className='cc-icon',title=''}={}){
  const body=paths[name]||paths.activity;
  const label=title?`<title>${String(title).replace(/[&<>"']/g,'')}</title>`:'';
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="${title?'false':'true'}">${label}${body}</svg>`;
}

export {icon};
```

Do not import any package or remote asset.

- [ ] **Step 4: Add the Control Center shell class and shared CSS tokens**

In `index.html`, change only the shell class at this step:

```html
<div id="appShell" class="shell control-center-shell hidden">
```

Append a dedicated `/* Logistics Control Center */` section to `assets/css/app.css`. Define exact CSS variables under `.control-center-shell`:

```css
.control-center-shell{
  --cc-bg:#eef2f6;
  --cc-surface:#fff;
  --cc-surface-soft:#f7f9fc;
  --cc-border:#d7e0e9;
  --cc-text:#13283e;
  --cc-muted:#60758a;
  --cc-primary:#0d5f91;
  --cc-primary-soft:#eaf4fb;
  --cc-good:#16633d;
  --cc-good-bg:#e9f7ef;
  --cc-warn:#805800;
  --cc-warn-bg:#fff4d8;
  --cc-bad:#9a2f2f;
  --cc-bad-bg:#fff0f0;
  --cc-inactive:#526174;
  --cc-inactive-bg:#eef1f4;
  background:var(--cc-bg);
}
.cc-panel{background:var(--cc-surface);border:1px solid var(--cc-border);border-radius:12px;box-shadow:0 3px 12px rgba(22,43,64,.05)}
.cc-page-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:14px}
.cc-page-head h1,.cc-page-head h2{margin:0;font-size:22px;line-height:1.2}
.cc-toolbar{display:flex;align-items:end;gap:8px;flex-wrap:wrap}
.cc-kpi-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.cc-kpi{min-height:116px;padding:14px;border:1px solid var(--cc-border);border-radius:11px;background:var(--cc-surface);display:grid;grid-template-columns:auto 1fr;gap:10px;align-content:start}
.cc-kpi-value{font-size:26px;font-weight:900;line-height:1}
.cc-status{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:800}
.cc-empty{padding:22px;text-align:center;color:var(--cc-muted);border:1px dashed var(--cc-border);border-radius:10px;background:var(--cc-surface-soft)}
.cc-icon{width:18px;height:18px;display:inline-block;flex:0 0 auto}
```

Also compact `.side`, `.nav`, `.top`, `.content`, `.card`, `.btn` and `.ghost` only under `.control-center-shell` so the login screen remains visually stable.

- [ ] **Step 5: Extend CI and deploy validation**

In `.github/workflows/professional-ci.yml` add:

```bash
node --check assets/js/ui-kit.js
node --check assets/js/overview.js
```

In `.github/workflows/professional-deploy.yml`, after the existing frontend file assertions, add:

```bash
test -f .deploy/assets/js/ui-kit.js
test -f .deploy/assets/js/overview.js
```

The deploy already copies the complete `assets` directory, so no new copy command is required.

- [ ] **Step 6: Create a temporary minimal `overview.js` module so CI contract can go green**

Create `assets/js/overview.js` with:

```js
import {icon} from './ui-kit.js';

function controlCenterIcon(name){return icon(name);}

export {controlCenterIcon};
```

This is scaffolding owned by the Overview deliverable and is expanded in Task 2.

- [ ] **Step 7: Verify GREEN and commit**

Run:

```bash
node --test test/control-center-ui.test.mjs
node --check assets/js/ui-kit.js
node --check assets/js/overview.js
npm test
```

Expected: PASS.

Commit:

```bash
git add index.html assets/css/app.css assets/js/ui-kit.js assets/js/overview.js test/control-center-ui.test.mjs .github/workflows/professional-ci.yml .github/workflows/professional-deploy.yml
git commit -m "Build Logistics Control Center UI foundation"
```

---

### Task 2: Operative Overview dashboard with real masterdata and explicit unavailable operational metrics

**Files:**
- Modify: `index.html`
- Modify: `assets/js/overview.js`
- Modify: `assets/js/app.js`
- Modify: `assets/css/app.css`
- Modify/Test: `test/control-center-ui.test.mjs`

**Interfaces:**
- Consumes: existing GET `/api/professional-meta`, `/api/professional-masterdata/customers?status=all`, `/api/professional-masterdata/locations?status=all`.
- Consumes session event from `app.js`: `professional:session-ready` with `{local:boolean, session:object|null}`.
- Produces: `loadOverview()` and `renderOverview()`.
- Produces quick-action routing to existing navigation and existing `#newCustomerBtn` only.

- [ ] **Step 1: Add failing Overview contracts**

Append to `test/control-center-ui.test.mjs`:

```js
test('overview is an operational control center without marketing hero or fake shipment values',()=>{
  const html=read('index.html');
  assert.doesNotMatch(html,/data-view="overview"[\s\S]*class="hero"/);
  for(const id of [
    'overviewToday','overviewDate','overviewWorkspace','overviewUser',
    'overviewDatabaseState','overviewDataModeState','overviewMasterdataState',
    'overviewOpenShipments','overviewPickupsToday','overviewMissingDocuments','overviewActionRequired',
    'overviewShippingWork','overviewActionList','overviewQuickActions','overviewRecentActivity'
  ]) assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/Datenquelle noch nicht live/);
  assert.doesNotMatch(html,/id="overviewOpenShipments"[^>]*>\s*0\s*</);
  assert.doesNotMatch(html,/id="overviewPickupsToday"[^>]*>\s*0\s*</);
  assert.doesNotMatch(html,/id="overviewMissingDocuments"[^>]*>\s*0\s*</);
});

test('overview uses real professional meta and masterdata endpoints',()=>{
  const js=read('assets/js/overview.js');
  assert.match(js,/professional-meta/);
  assert.match(js,/professional-masterdata\/customers\?status=all/);
  assert.match(js,/professional-masterdata\/locations\?status=all/);
  assert.match(js,/function buildMasterdataActions/);
  assert.match(js,/function buildRecentActivity/);
  assert.match(js,/professional:session-ready/);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test test/control-center-ui.test.mjs`

Expected: FAIL because the legacy hero still exists and Overview markup/data logic is absent.

- [ ] **Step 3: Replace the Overview hero and explanatory cards with operational markup**

Replace only the current `data-view="overview"` content with a structure using these exact IDs:

```html
<section class="view active" data-view="overview">
  <div id="overviewToday" class="cc-today-bar cc-panel">
    <div><span class="kicker">HEUTE IM EXPORT</span><strong id="overviewDate">–</strong></div>
    <div class="cc-today-meta"><span id="overviewWorkspace">Workspace –</span><span id="overviewUser">Benutzer –</span></div>
    <div class="cc-system-state"><span id="overviewDatabaseState" class="cc-status">Datenbank –</span><span id="overviewDataModeState" class="cc-status">Modus –</span><span id="overviewMasterdataState" class="cc-status">Stammdaten –</span></div>
  </div>

  <div class="cc-kpi-grid cc-overview-kpis">
    <article class="cc-kpi"><span data-cc-icon="shipment"></span><div><span class="cc-kpi-label">Offene Sendungen</span><strong id="overviewOpenShipments" class="cc-kpi-value">–</strong><small>Datenquelle noch nicht live</small></div></article>
    <article class="cc-kpi"><span data-cc-icon="shipment"></span><div><span class="cc-kpi-label">Abholungen heute</span><strong id="overviewPickupsToday" class="cc-kpi-value">–</strong><small>Datenquelle noch nicht live</small></div></article>
    <article class="cc-kpi"><span data-cc-icon="document"></span><div><span class="cc-kpi-label">Fehlende Dokumente</span><strong id="overviewMissingDocuments" class="cc-kpi-value">–</strong><small>Datenquelle noch nicht live</small></div></article>
    <article class="cc-kpi"><span data-cc-icon="warning"></span><div><span class="cc-kpi-label">Handlungsbedarf</span><strong id="overviewActionRequired" class="cc-kpi-value">–</strong><small>aus echten Stammdaten</small></div></article>
  </div>

  <div class="cc-overview-workgrid">
    <section id="overviewShippingWork" class="cc-panel cc-work-panel"><header><div><span class="kicker">HEUTE IM VERSAND</span><h2>Operative Vorgänge</h2></div></header><div class="cc-empty">Sendungsdaten sind noch nicht als Live-Arbeitsquelle verfügbar.</div></section>
    <section class="cc-panel cc-action-panel"><header><div><span class="kicker">PRÜFEN</span><h2>Handlungsbedarf</h2></div></header><div id="overviewActionList"></div></section>
  </div>

  <section id="overviewQuickActions" class="cc-panel cc-quick-actions"></section>
  <section class="cc-panel cc-activity-panel"><header><div><span class="kicker">ZULETZT GEÄNDERT</span><h2>Letzte Aktivitäten</h2></div></header><div id="overviewRecentActivity"></div></section>
</section>
```

- [ ] **Step 4: Hand the authenticated session to Overview without exposing it globally**

In `showApplication({local=false,session=null}={})` in `assets/js/app.js`, after the existing badge/view logic, dispatch:

```js
window.dispatchEvent(new CustomEvent('professional:session-ready',{detail:{local:!!local,session:session||null}}));
```

Do not attach `identitySession` to `window` and do not change authentication logic.

- [ ] **Step 5: Implement real dashboard data loading**

Expand `assets/js/overview.js` with:

```js
import {icon} from './ui-kit.js';
const $=s=>document.querySelector(s);
let sessionState={local:true,session:null};

async function apiJson(url){
  const res=await fetch(url,{credentials:'same-origin',headers:{'content-type':'application/json'}});
  let body={};try{body=await res.json();}catch{}
  if(!res.ok) throw new Error(body.message||`HTTP ${res.status}`);
  return body;
}

function hasRequiredAddress(l){return ['name','street','house_number','postal_code','city','country'].every(k=>String(l?.[k]||'').trim());}
function buildMasterdataActions(locations=[]){
  const actions=[];
  for(const l of locations){
    if(l.active===false) continue;
    if(!hasRequiredAddress(l)) actions.push({kind:'bad',label:`${l.customer_name||'Kunde'} · ${l.name||'Standort'}`,reason:'Pflichtadresse unvollständig',customerId:l.customer_id,locationId:l.id});
    else if(!String(l.carrier_name||'').trim()) actions.push({kind:'warn',label:`${l.customer_name||'Kunde'} · ${l.name||'Standort'}`,reason:'Keine Spedition hinterlegt',customerId:l.customer_id,locationId:l.id});
  }
  return actions;
}

function buildRecentActivity(customers=[],locations=[]){
  return [
    ...customers.map(c=>({type:'Kunde',title:`${c.account||'–'} · ${c.name||'Kunde'}`,updatedAt:c.updated_at||c.created_at||'',customerId:c.id})),
    ...locations.map(l=>({type:'Standort',title:`${l.customer_name||'Kunde'} · ${l.name||'Standort'}`,updatedAt:l.updated_at||'',customerId:l.customer_id,locationId:l.id}))
  ].filter(x=>x.updatedAt).sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).slice(0,8);
}
```

`loadOverview()` must `Promise.all` the three GETs, populate meta/status, action count/list and recent activity. For the three unsupported operational KPI values, it must never replace `–` with `0`.

- [ ] **Step 6: Implement quick actions and canonical routing**

Render four labeled buttons:

- `+ Sendung erstellen` — `disabled` with `title="Sendungs-Livefunktion noch nicht verfügbar"`.
- `+ Kunde` — navigate by clicking `[data-nav="customers"]`, then click `#newCustomerBtn` if visible.
- `Standort suchen` — click `[data-nav="locations"]`, then focus `#globalLocationSearch`.
- `Dokumente prüfen` — `disabled` with `title="Dokumenten-Livefunktion noch nicht verfügbar"`.

For an actionable location warning, route by dispatching a custom browser event:

```js
window.dispatchEvent(new CustomEvent('professional:open-location',{detail:{customerId,locationId}}));
```

Task 4 makes `locations.js` consume this shared routing event; until then the warning action may navigate to Locations and focus search.

- [ ] **Step 7: Add Overview-specific CSS**

Add:

```css
.cc-today-bar{display:grid;grid-template-columns:minmax(180px,1fr) auto auto;gap:16px;align-items:center;padding:14px 16px;margin-bottom:10px}
.cc-today-meta,.cc-system-state{display:flex;gap:7px;align-items:center;flex-wrap:wrap}
.cc-overview-kpis{margin-bottom:10px}
.cc-overview-workgrid{display:grid;grid-template-columns:minmax(0,2fr) minmax(280px,1fr);gap:10px}
.cc-work-panel,.cc-action-panel,.cc-activity-panel{padding:15px}
.cc-work-panel header,.cc-action-panel header,.cc-activity-panel header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.cc-work-panel h2,.cc-action-panel h2,.cc-activity-panel h2{font-size:17px;margin:2px 0 0}
.cc-action-list{display:grid;gap:7px}
.cc-action-row,.cc-activity-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:9px;align-items:center;padding:9px 0;border-bottom:1px solid var(--cc-border)}
.cc-quick-actions{display:flex;gap:8px;flex-wrap:wrap;padding:12px;margin-top:10px}
.cc-activity-panel{margin-top:10px}
```

- [ ] **Step 8: Load the new module and verify GREEN**

At the bottom of `index.html`, alongside the existing module scripts, include:

```html
<script type="module" src="/assets/js/overview.js"></script>
```

Run:

```bash
node --test test/control-center-ui.test.mjs
node --check assets/js/overview.js
node --check assets/js/app.js
npm test
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add index.html assets/js/overview.js assets/js/app.js assets/css/app.css test/control-center-ui.test.mjs
git commit -m "Turn Professional overview into operative control center"
```

---

### Task 3: Premium Customers master/detail workspace

**Files:**
- Modify: `assets/js/app.js`
- Modify: `assets/css/app.css`
- Modify: `index.html`
- Modify/Test: `test/masterdata-ui.test.mjs`
- Modify/Test: `test/control-center-ui.test.mjs`

**Interfaces:**
- Consumes existing `liveCustomers`, `selectedCustomer`, `openLocationIds`, `registrationEmailsOf()`, `canWriteCustomers()`.
- Preserves existing `wireCustomerDetailActions()`, drawer functions and mutation endpoints.
- Produces presentation-only helpers: `customerSummary(customer)` and `locationSummary(location)`.

- [ ] **Step 1: Add failing customer hierarchy tests**

Append to `test/masterdata-ui.test.mjs`:

```js
test('customer detail exposes operational summary without changing canonical editor',()=>{
  const js=fs.readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
  assert.match(js,/function customerSummary/);
  assert.match(js,/registrationEmailCount/);
  assert.match(js,/carrierCount/);
  assert.match(js,/location-email-count/);
  assert.match(js,/location-city-country/);
  assert.match(js,/data-customer-action="new-location"/);
  assert.match(js,/wireCustomerDetailActions\(\)/);
  assert.doesNotMatch(js,/deleteCustomer|deleteLocation/i);
});
```

Append to `test/control-center-ui.test.mjs`:

```js
test('customer workspace uses compact control-center surfaces',()=>{
  const css=read('assets/css/app.css');
  for(const cls of ['customer-summary-strip','customer-summary-stat','location-operational-card','location-detail-section']){
    assert.match(css,new RegExp(`\\.${cls}\\b`));
  }
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test test/masterdata-ui.test.mjs test/control-center-ui.test.mjs
```

Expected: FAIL because the summary helpers/classes do not exist.

- [ ] **Step 3: Add pure presentation summary helpers in `app.js`**

Add directly before `renderCustomerDetail()`:

```js
function customerSummary(customer){
  const locations=Array.isArray(customer?.locations)?customer.locations:[];
  const registrationEmailCount=locations.reduce((sum,l)=>sum+registrationEmailsOf(l).length,0);
  const carriers=new Set(locations.map(l=>String(l.carrier_name||'').trim()).filter(Boolean));
  return {locationCount:locations.length,registrationEmailCount,carrierCount:carriers.size};
}
function locationSummary(location){
  const emails=registrationEmailsOf(location);
  return {
    emailCount:emails.length,
    cityCountry:[location?.city,location?.country].filter(Boolean).join(' · ')||'Ort nicht hinterlegt',
    carrier:String(location?.carrier_name||'').trim()||'Keine Spedition'
  };
}
```

- [ ] **Step 4: Upgrade `renderCustomerList()` markup without changing selection behavior**

Each button remains `data-customer-id` and uses the same click wiring, but render this hierarchy:

```html
<button class="customer-master-item ..." ...>
  <span class="customer-master-item-head"><span class="customer-account">ACCOUNT</span>STATUS</span>
  <strong class="customer-company-name">COMPANY</strong>
  <span class="customer-row-meta"><span>LOCATION_COUNT Standorte</span></span>
</button>
```

Do not add a second click target or a second editor action to the list.

- [ ] **Step 5: Upgrade `renderCustomerDetail()` header and location cards**

Keep all existing action `data-*` attributes exactly unchanged. Add:

```html
<div class="customer-summary-strip">
  <div class="customer-summary-stat"><strong>...</strong><span>Standorte</span></div>
  <div class="customer-summary-stat"><strong>...</strong><span>Anmelde-E-Mails</span></div>
  <div class="customer-summary-stat"><strong>...</strong><span>Speditionen</span></div>
</div>
```

For each collapsed location, include four visible concepts: name, `location-city-country`, carrier and `location-email-count`; preserve `aria-expanded`, `data-location-toggle` and multi-open behavior.

Expanded content becomes grouped sections with classes:

```html
<div class="location-detail-section">Adresse</div>
<div class="location-detail-section">Anmelde-E-Mails</div>
<div class="location-detail-section">Kontakt</div>
<div class="location-detail-section">Spedition</div>
<div class="location-detail-section">Versandvorgaben</div>
```

The actual address/email/contact data is the same current data and remains escaped through `esc()`.

- [ ] **Step 6: Move `+ Standort` into the customer header action group while preserving its selector**

Render the button with the same selector:

```html
<button class="btn compact" type="button" data-customer-action="new-location">+ Standort</button>
```

`wireCustomerDetailActions()` stays the single event-binding implementation.

- [ ] **Step 7: Apply Customers Control Center CSS**

Adjust desktop master/detail to approximately `300px / remaining width`, reduce border radii to 10–12px and define the new classes from the tests. On active customer rows, use a left primary accent plus a subtle blue background rather than a large shadow.

At `max-width:900px`, stack master/detail. At `max-width:620px`, ensure location toggle uses a one-column summary and keeps action buttons touchable.

- [ ] **Step 8: Verify behavior and full regression**

Run:

```bash
node --test test/masterdata-ui.test.mjs test/control-center-ui.test.mjs
node --check assets/js/app.js
npm test
```

Expected: PASS, including existing multi-open accordion, drawer, role-aware controls and no-delete tests.

- [ ] **Step 9: Commit**

```bash
git add assets/js/app.js assets/css/app.css index.html test/masterdata-ui.test.mjs test/control-center-ui.test.mjs
git commit -m "Upgrade customer workspace for Logistics Control Center"
```

---

### Task 4: Global Locations quality workspace with real registration-email counts

**Files:**
- Modify: `index.html`
- Modify: `assets/js/locations.js`
- Modify: `assets/css/app.css`
- Modify/Test: `test/masterdata-ui.test.mjs`
- Modify/Test: `test/control-center-ui.test.mjs`

**Interfaces:**
- Consumes existing GET `/api/professional-masterdata/locations?q=...&status=all`.
- Consumes existing GET `/api/professional-masterdata/customers/{customerId}` to enrich registration-email data; no new API endpoint.
- Produces: `locationQuality(location) -> 'complete'|'warning'|'blocking'|'inactive'`.
- Produces: `enrichLocationRows(rows) -> Promise<rows[]>` with max 6 concurrent customer-detail requests.
- Preserves `openCustomerForLocation(customerId,locationId)` as the only canonical open path.

- [ ] **Step 1: Add failing location quality/filter tests**

Append to `test/masterdata-ui.test.mjs`:

```js
test('global locations adds country carrier quality and email-count presentation',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  for(const id of ['globalLocationCountryFilter','globalLocationCarrierFilter','globalLocationKpiActive','globalLocationKpiNoCarrier','globalLocationKpiMultiEmail','globalLocationKpiIncomplete']){
    assert.match(html,new RegExp(`id="${id}"`));
  }
  const js=fs.readFileSync(new URL('../assets/js/locations.js',import.meta.url),'utf8');
  assert.match(js,/function locationQuality/);
  assert.match(js,/async function enrichLocationRows/);
  assert.match(js,/registration_emails/);
  assert.match(js,/professional-masterdata\/customers\/\$\{encodeURIComponent\(customerId\)\}/);
  assert.match(js,/professional:open-location/);
  assert.match(js,/openCustomerForLocation/);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test test/masterdata-ui.test.mjs`

Expected: FAIL because the new filters, KPI IDs and enrichment functions are absent.

- [ ] **Step 3: Replace the Locations toolbar markup**

Keep existing IDs `liveGlobalLocations`, `globalLocationSearch`, `globalLocationStatusFilter`, `globalLocationCount`, `globalLocationRows` and add:

```html
<select id="globalLocationCountryFilter"><option value="">Alle Länder</option></select>
<select id="globalLocationCarrierFilter"><option value="">Alle Speditionen</option></select>
```

Add four compact KPI cells with exact value IDs:

```html
<strong id="globalLocationKpiActive">–</strong>
<strong id="globalLocationKpiNoCarrier">–</strong>
<strong id="globalLocationKpiMultiEmail">–</strong>
<strong id="globalLocationKpiIncomplete">–</strong>
```

The table/row view remains the primary desktop presentation; on mobile CSS converts each `tr` into a card-like block without changing the DOM action model.

- [ ] **Step 4: Fetch all status rows for the current search and filter client-side**

Change the location GET in `loadGlobalLocations()` to always request:

```js
`/api/professional-masterdata/locations?q=${encodeURIComponent(q)}&status=all`
```

Then apply current `globalLocationStatusFilter`, country and carrier values client-side. This keeps KPI/filter option computation based on one consistent current search result and does not change the backend.

- [ ] **Step 5: Enrich rows from canonical customer details with concurrency limit 6**

Implement:

```js
async function mapLimit(items,limit,worker){
  const out=new Array(items.length);let next=0;
  async function run(){while(next<items.length){const i=next++;out[i]=await worker(items[i],i);}}
  await Promise.all(Array.from({length:Math.min(limit,items.length)},run));
  return out;
}

async function enrichLocationRows(rows){
  const customerIds=[...new Set(rows.map(r=>String(r.customer_id||'')).filter(Boolean))];
  const details=new Map();
  await mapLimit(customerIds,6,async customerId=>{
    try{
      const data=await apiJson(`/api/professional-masterdata/customers/${encodeURIComponent(customerId)}`);
      details.set(customerId,data.customer||null);
    }catch{details.set(customerId,null);}
  });
  return rows.map(row=>{
    const customer=details.get(String(row.customer_id));
    const detail=(customer?.locations||[]).find(l=>String(l.id)===String(row.id));
    return detail?{...row,...detail,customer_account:row.customer_account,customer_name:row.customer_name,customer_active:row.customer_active}:row;
  });
}
```

Failure to enrich one customer must not make the whole Locations page fail; quality for an unenriched active row becomes `warning` with text `Qualität teilweise prüfbar`, not `complete`.

- [ ] **Step 6: Implement deterministic quality calculation**

```js
function locationQuality(location){
  if(location.active===false)return 'inactive';
  const required=['name','street','house_number','postal_code','city','country'];
  if(required.some(k=>!String(location?.[k]||'').trim()))return 'blocking';
  if(Array.isArray(location.registration_emails)&&location.registration_emails.length===0)return 'blocking';
  if(!Array.isArray(location.registration_emails))return 'warning';
  if(!String(location.carrier_name||'').trim())return 'warning';
  return 'complete';
}
```

Quality labels:
- `complete` → `Vollständig`
- `warning` → `Prüfen`
- `blocking` → `Unvollständig`
- `inactive` → `Inaktiv`

- [ ] **Step 7: Render KPIs and filter options from real enriched rows**

Before applying visible filters, compute:

```js
active = rows.filter(x=>x.active!==false).length
noCarrier = rows.filter(x=>x.active!==false&&!String(x.carrier_name||'').trim()).length
multiEmail = rows.filter(x=>x.active!==false&&Array.isArray(x.registration_emails)&&x.registration_emails.length>1).length
incomplete = rows.filter(x=>locationQuality(x)==='blocking').length
```

Populate country/carrier options from unique non-empty values while preserving the currently selected value if it still exists.

- [ ] **Step 8: Upgrade row rendering**

Each row must visibly render:
- location name
- customer name + account
- city + country
- carrier
- registration-email count (`–` if enrichment unavailable; never fabricate `0`)
- quality marker
- active/inactive status
- `Öffnen` button

Keep `data-customer-id`, `data-location-id` and the existing `openCustomerForLocation()` event binding.

- [ ] **Step 9: Wire Overview location events to the canonical open path**

Add:

```js
window.addEventListener('professional:open-location',event=>{
  const {customerId,locationId}=event.detail||{};
  if(customerId&&locationId)openCustomerForLocation(customerId,locationId);
});
```

This avoids any duplicate editor implementation.

- [ ] **Step 10: Add Locations Control Center responsive CSS and verify GREEN**

Define `.location-quality`, `.location-quality.complete`, `.warning`, `.blocking`, `.inactive`, `.location-kpi-strip` and `.location-filter-bar`. At `max-width:700px`, remove the table `min-width` for the live location table and render rows as block cards with `data-label` or nested presentation classes so the main workflow does not require horizontal scrolling.

Run:

```bash
node --test test/masterdata-ui.test.mjs test/control-center-ui.test.mjs
node --check assets/js/locations.js
npm test
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add index.html assets/js/locations.js assets/css/app.css test/masterdata-ui.test.mjs test/control-center-ui.test.mjs
git commit -m "Build operational global locations workspace"
```

---

### Task 5: Cross-page responsive polish, accessibility and no-horizontal-scroll guarantees

**Files:**
- Modify: `assets/css/app.css`
- Modify: `index.html`
- Modify: `assets/js/app.js`
- Modify: `assets/js/overview.js`
- Modify: `assets/js/locations.js`
- Modify/Test: `test/control-center-ui.test.mjs`

**Interfaces:**
- Consumes all `cc-*`, customer and location classes from Tasks 1–4.
- Produces no new data contract.

- [ ] **Step 1: Add failing responsive/accessibility contracts**

Append:

```js
test('control center defines desktop tablet and phone layouts without forced live-masterdata table width',()=>{
  const css=read('assets/css/app.css');
  assert.match(css,/@media\(max-width:1100px\)/);
  assert.match(css,/@media\(max-width:900px\)/);
  assert.match(css,/@media\(max-width:620px\)/);
  assert.match(css,/\.cc-overview-workgrid[\s\S]*grid-template-columns:1fr/);
  assert.match(css,/\.customer-master-detail[\s\S]*grid-template-columns:1fr/);
  assert.match(css,/\.live-location-table[\s\S]*min-width:0/);
});

test('important icon actions retain visible text labels',()=>{
  const html=read('index.html');
  const app=read('assets/js/app.js');
  const locations=read('assets/js/locations.js');
  assert.match(html,/\+ Kunde|Neuer Kunde/);
  assert.match(html,/Standort suchen/);
  assert.match(app,/Bearbeiten/);
  assert.match(locations,/Öffnen/);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test test/control-center-ui.test.mjs`

Expected: FAIL until all responsive contracts are explicit.

- [ ] **Step 3: Add desktop/tablet/phone breakpoints**

Use these layout rules:

```css
@media(max-width:1100px){
  .cc-kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .cc-overview-workgrid{grid-template-columns:minmax(0,1.5fr) minmax(260px,1fr)}
}
@media(max-width:900px){
  .cc-overview-workgrid{grid-template-columns:1fr}
  .customer-master-detail{grid-template-columns:1fr}
  .customer-master-column{position:static;max-height:none}
  .cc-today-bar{grid-template-columns:1fr}
}
@media(max-width:620px){
  .cc-kpi-grid{grid-template-columns:1fr}
  .cc-page-head{align-items:stretch;flex-direction:column}
  .cc-toolbar{display:grid;grid-template-columns:1fr}
  .customer-detail-head{flex-direction:column}
  .customer-detail-actions{justify-content:flex-start}
  .location-accordion-toggle{grid-template-columns:1fr auto}
  .location-summary-meta{grid-column:1/-1}
  .live-location-table{min-width:0}
}
```

Scope `.live-location-table` to the live Locations table only; do not globally remove `table{min-width:680px}` because legacy migration/admin tables still depend on horizontal scrolling.

- [ ] **Step 4: Add focus-visible and reduced-motion behavior**

Add:

```css
.control-center-shell button:focus-visible,.control-center-shell input:focus-visible,.control-center-shell select:focus-visible,.control-center-shell textarea:focus-visible{outline:3px solid rgba(13,95,145,.22);outline-offset:2px}
@media(prefers-reduced-motion:reduce){.control-center-shell *{scroll-behavior:auto!important;transition:none!important}}
```

Do not remove current focus styles from auth forms.

- [ ] **Step 5: Ensure disabled future actions are semantically disabled**

Unsupported quick actions must have the HTML `disabled` attribute, not only disabled styling. Do not attach click listeners to them.

- [ ] **Step 6: Run focused and full regression tests**

Run:

```bash
node --test test/control-center-ui.test.mjs test/masterdata-ui.test.mjs
node --check assets/js/app.js
node --check assets/js/overview.js
node --check assets/js/locations.js
node --check assets/js/ui-kit.js
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add index.html assets/css/app.css assets/js/app.js assets/js/overview.js assets/js/locations.js test/control-center-ui.test.mjs
git commit -m "Polish responsive Logistics Control Center experience"
```

---

### Task 6: Final regression, PR verification and exact-SHA deployment

**Files:**
- Modify only if a verification failure requires a TDD fix.
- No API/schema/config feature expansion is allowed in this task.

**Interfaces:**
- Produces final PR head SHA, successful PR CI run, merged `main` SHA, successful main CI run and successful Azure deploy run.

- [ ] **Step 1: Run the complete repository verification locally/CI-equivalent**

Run:

```bash
npm test
node --check assets/js/app.js
node --check assets/js/locations.js
node --check assets/js/overview.js
node --check assets/js/ui-kit.js
```

Expected: all PASS.

- [ ] **Step 2: Static no-fake/no-duplicate-editor verification**

Run:

```bash
node - <<'NODE'
const fs=require('fs');
const html=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('assets/js/app.js','utf8');
const loc=fs.readFileSync('assets/js/locations.js','utf8');
if(/data-view="overview"[\s\S]*class="hero"/.test(html)) throw new Error('legacy overview hero still present');
for(const id of ['overviewOpenShipments','overviewPickupsToday','overviewMissingDocuments']){
  if(new RegExp(`id="${id}"[^>]*>\\s*0\\s*<`).test(html)) throw new Error(`fake zero metric: ${id}`);
}
if(/deleteCustomer|deleteLocation|Kunde löschen|Standort löschen/i.test(app+loc)) throw new Error('hard-delete UI introduced');
if(/professional-masterdata\/locations\/[^'"`]*method:\s*['"]POST['"]/.test(loc)) throw new Error('duplicate location editor mutation introduced');
console.log('OK: no fake metrics, hard deletes or duplicate location mutation UI');
NODE
```

Expected: `OK`.

- [ ] **Step 3: Review changed-file scope**

The PR should contain only:

```text
.github/workflows/professional-ci.yml
.github/workflows/professional-deploy.yml
index.html
assets/css/app.css
assets/js/app.js
assets/js/locations.js
assets/js/overview.js
assets/js/ui-kit.js
test/masterdata-ui.test.mjs
test/control-center-ui.test.mjs
docs/superpowers/specs/2026-09-03-logistics-control-center-design.md
docs/superpowers/plans/2026-09-03-logistics-control-center.md
```

If any `api/**`, `schema/**`, `TESTVERSION.html`, `production-version.js` or Internal-specific file appears, stop and remove it before merge.

- [ ] **Step 4: Require PR CI success for the exact head SHA**

Confirm the `ExportHUB Professional CI` pull-request run completes `success` and its `head_sha` equals the reviewed PR head SHA.

- [ ] **Step 5: Merge only the verified head to `main`**

Use expected-head protection when merging so a later unreviewed commit cannot be merged accidentally.

- [ ] **Step 6: Require fresh `main` CI success**

Record the new `main` SHA and require the push-triggered `ExportHUB Professional CI` run for that exact SHA to complete `success`.

- [ ] **Step 7: Verify Azure deployment for the exact main SHA**

Require `ExportHUB Professional Deploy` to complete `success` with the same `head_sha` as `main`.

- [ ] **Step 8: Live smoke acceptance**

Using the deployed Professional site:

1. Login still works and shows the same tenant/user/role.
2. Overview opens without the old marketing hero.
3. Unsupported shipment/pickup/document KPIs show `–` and the unavailable text, not zero.
4. Handlungsbedarf uses actual current location data.
5. `+ Kunde` opens the existing customer drawer only for a write-capable role.
6. Customer list selection works; customer header shows location/e-mail/carrier summary.
7. Two location accordions can remain open simultaneously.
8. Location edit/status actions still use the existing drawer and endpoints.
9. Global Locations country/carrier/status/search filters work.
10. A global location `Öffnen` action selects its customer and expands the exact location.
11. WAREHOUSE/AUDITOR still do not receive mutation controls.
12. At phone width the Customer and Locations main workflows do not require horizontal scrolling.

Record final `main` SHA, PR CI run ID, main CI run ID, deploy run ID and smoke result.
