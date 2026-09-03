import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const controlCss=()=>read('assets/css/app.css')+'\n'+read('assets/css/control-center.css');

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

test('overview is an operational control center without marketing hero or fake shipment values',()=>{
  const html=read('index.html');
  const overview=html.match(/<section class="view active" data-view="overview">([\s\S]*?)<section class="view" data-view="migration">/)?.[1]||'';
  assert.doesNotMatch(overview,/class="hero"/);
  for(const id of [
    'overviewToday','overviewDate','overviewWorkspace','overviewUser',
    'overviewDatabaseState','overviewDataModeState','overviewMasterdataState',
    'overviewOpenShipments','overviewPickupsToday','overviewMissingDocuments','overviewActionRequired',
    'overviewShippingWork','overviewActionList','overviewQuickActions','overviewRecentActivity'
  ]) assert.match(overview,new RegExp(`id="${id}"`));
  assert.match(overview,/Datenquelle noch nicht live/);
  assert.doesNotMatch(overview,/id="overviewOpenShipments"[^>]*>\s*0\s*</);
  assert.doesNotMatch(overview,/id="overviewPickupsToday"[^>]*>\s*0\s*</);
  assert.doesNotMatch(overview,/id="overviewMissingDocuments"[^>]*>\s*0\s*</);
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

test('overview session fallback uses the canonical Professional auth endpoint',()=>{
  const js=read('assets/js/overview.js');
  assert.match(js,/apiJson\('\/api\/professional-auth\/session'\)/);
  assert.doesNotMatch(js,/apiJson\('\/api\/auth-session'\)/);
});

test('customer workspace uses compact control-center surfaces',()=>{
  const html=read('index.html');
  assert.match(html,/href="\/assets\/css\/control-center\.css"/);
  assert.equal(fs.existsSync(new URL('../assets/css/control-center.css',import.meta.url)),true,'focused Control Center stylesheet must exist');
  const css=controlCss();
  for(const cls of ['customer-summary-strip','customer-summary-stat','location-operational-card','location-detail-section']){
    assert.match(css,new RegExp(`\\.${cls}\\b`));
  }
});

test('locations workspace defines quality, KPI and filter surfaces',()=>{
  const css=read('assets/css/control-center.css');
  for(const cls of ['location-quality','location-kpi-strip','location-filter-bar','live-location-table']){
    assert.match(css,new RegExp(`\\.${cls}\\b`));
  }
  for(const state of ['complete','warning','blocking','inactive']) assert.match(css,new RegExp(`\\.location-quality\\.${state}\\b`));
});

test('control center defines desktop tablet and phone layouts without forced live-masterdata table width',()=>{
  const css=controlCss();
  assert.match(css,/@media\(max-width:1100px\)/);
  assert.match(css,/@media\(max-width:900px\)/);
  assert.match(css,/@media\(max-width:620px\)/);
  assert.match(css,/@media\(max-width:900px\)[\s\S]*?\.cc-overview-workgrid\{grid-template-columns:1fr\}/);
  assert.match(css,/@media\(max-width:900px\)[\s\S]*?\.customer-master-detail\{grid-template-columns:1fr\}/);
  assert.match(css,/@media\(max-width:620px\)[\s\S]*?\.live-location-table\{[^}]*min-width:0/);
});

test('important actions retain visible text labels and future actions are semantically disabled',()=>{
  const html=read('index.html');
  const app=read('assets/js/app.js');
  const locations=read('assets/js/locations.js');
  const overview=read('assets/js/overview.js');
  assert.match(html,/\+ Neuer Kunde|Neuer Kunde/);
  assert.match(html,/Standort suchen/);
  assert.match(app,/Bearbeiten/);
  assert.match(locations,/Öffnen/);
  assert.match(overview,/data-quick-action="shipment" disabled/);
  assert.match(overview,/data-quick-action="documents" disabled/);
});

test('control center keeps keyboard focus visible and honors reduced motion',()=>{
  const css=controlCss();
  assert.match(css,/\.control-center-shell button:focus-visible/);
  assert.match(css,/outline:3px solid rgba\(13,95,145,.22\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
