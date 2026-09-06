import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('Professional entry screen explains the platform without changing the secure login contract',()=>{
  const html=read('index.html');
  const auth=html.match(/<div id="authGate"[\s\S]*?<div id="appShell"/)?.[0]||'';
  assert.match(auth,/professional-entry-layout/);
  assert.match(auth,/entry-capability-grid/);
  for(const label of ['Exportsteuerung','Dokumentenkontrolle','Rollen & Mandanten','Abholung & Nachweise']) assert.match(auth,new RegExp(label));
  for(const id of ['loginWorkspace','loginName','loginPassword','loginForm']) assert.match(auth,new RegExp(`id="${id}"`));
  assert.doesNotMatch(auth,/DEMO \/ MUSTER|Rheinwerk Industrial Solutions GmbH|ROI|Zeitersparnis/i);
});

test('live overview exposes an operational signal strip and process rail without fake shipment values',()=>{
  const html=read('index.html');
  const overview=html.match(/<section class="view active" data-view="overview">([\s\S]*?)<section class="view" data-view="migration">/)?.[1]||'';
  for(const id of ['overviewSignalStrip','overviewSignalSystem','overviewSignalMasterdata','overviewSignalCoverage','overviewProcessRail']) assert.match(overview,new RegExp(`id="${id}"`));
  for(const marker of ['Stammdaten','Sendungen','Dokumente','Abholung & POD']) assert.match(overview,new RegExp(marker));
  assert.doesNotMatch(overview,/DEMO \/ MUSTER|RWD30\d|Rheinwerk/i);
  assert.doesNotMatch(overview,/id="overviewOpenShipments"[^>]*>\s*0\s*</);
});

test('overview KPI cards carry decision context and explicit visual tones',()=>{
  const html=read('index.html');
  const overview=html.match(/<section class="view active" data-view="overview">([\s\S]*?)<section class="view" data-view="migration">/)?.[1]||'';
  const tones=[...overview.matchAll(/data-kpi-tone="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(tones,['info','positive','warning','critical']);
  assert.equal((overview.match(/cc-kpi-context/g)||[]).length,4);
});

test('overview runtime derives live operational signals from meta and masterdata only',()=>{
  const source=read('assets/js/overview.js');
  assert.match(source,/function buildOperationalSignals/);
  assert.match(source,/function renderOperationalSignals/);
  assert.match(source,/overviewSignalSystem/);
  assert.match(source,/overviewSignalMasterdata/);
  assert.match(source,/overviewSignalCoverage/);
  assert.match(source,/buildOperationalSignals\(meta,locations/);
  assert.doesNotMatch(source,/DEMO|Rheinwerk|Math\.random/);
});

test('Professional homepage styling supports entry, signal and process surfaces responsively',()=>{
  const css=read('assets/css/control-center.css');
  for(const cls of ['professional-entry-layout','entry-capability-grid','cc-signal-strip','cc-process-rail','cc-kpi-context']) assert.match(css,new RegExp(`\\.${cls}\\b`));
  assert.match(css,/@media\(max-width:900px\)[\s\S]*?\.professional-entry-layout/);
  assert.match(css,/@media\(max-width:620px\)[\s\S]*?\.cc-signal-strip/);
});