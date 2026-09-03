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

test('customer workspace uses compact control-center surfaces',()=>{
  assert.equal(fs.existsSync(new URL('../assets/css/control-center.css',import.meta.url)),true,'focused Control Center stylesheet must exist');
  const css=read('assets/css/app.css')+'\n'+read('assets/css/control-center.css');
  for(const cls of ['customer-summary-strip','customer-summary-stat','location-operational-card','location-detail-section']){
    assert.match(css,new RegExp(`\\.${cls}\\b`));
  }
});
