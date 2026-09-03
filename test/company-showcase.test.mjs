import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const url = path => new URL(`../${path}`, import.meta.url);
const exists = path => fs.existsSync(url(path));
const read = path => fs.readFileSync(url(path), 'utf8');

const DEMO_RUNTIME_FILES = [
  'demo/demo-data.js',
  'demo/demo-store.js',
  'demo/demo-ui.js',
  'demo/demo-shipments.js',
  'demo/demo-documents.js',
  'demo/demo-avis.js'
];

test('company showcase exposes a dedicated ExportHUB demo entry point', () => {
  assert.equal(exists('demo/index.html'), true, 'demo/index.html must exist');
  const html = read('demo/index.html');
  assert.match(html, /ExportHUB Professional/i);
  assert.match(html, /DEMO\s*[·\/|-]?\s*MUSTER/i);
  assert.match(html, /Rheinwerk Industrial Solutions GmbH/);
  assert.match(html, /Geführte Tour starten/);
  assert.match(html, /Demo frei erkunden/);
  for (const label of ['Übersicht', 'Sendungen', 'Aufgaben', 'Dokumente', 'Kunden', 'Standorte', 'Kunden-Avis', 'Team & Rollen']) {
    assert.match(html, new RegExp(label.replace('&', '&(?:amp;)?'), 'i'), `missing navigation label: ${label}`);
  }
});

test('showcase baseline contains only marked fictional business data', async () => {
  assert.equal(exists('demo/demo-data.js'), true, 'demo/demo-data.js must exist');
  const data = await import('../demo/demo-data.js');
  assert.equal(data.DEMO_COMPANY.name, 'Rheinwerk Industrial Solutions GmbH');
  assert.equal(data.DEMO_COMPANY.workspace, 'rheinwerk-demo');
  assert.equal(data.DEMO_COMPANY.demo, true);
  assert.equal(data.DEMO_EMPLOYEES.length, 12);
  assert.equal(data.DEMO_CUSTOMERS.length, 8);
  assert.equal(data.DEMO_LOCATIONS.length, 12);
  assert.equal(data.DEMO_SHIPMENTS.length, 14);
  assert.ok(data.DEMO_TASKS.length >= 10);
  assert.ok(data.DEMO_SHIPMENTS.some(item => item.requiresAbd === true));
  assert.ok(data.DEMO_SHIPMENTS.some(item => item.status === 'POD vorhanden'));
  for (const email of data.DEMO_EMPLOYEES.map(item => item.email).filter(Boolean)) {
    assert.match(email, /@(example\.com|example\.org|example\.net)$/i, `non-example email in demo: ${email}`);
  }
});

test('showcase dashboard metrics are calculated from the fictional shipment dataset', async () => {
  assert.equal(exists('demo/demo-data.js'), true, 'demo/demo-data.js must exist');
  const data = await import('../demo/demo-data.js');
  const metrics = data.getDemoMetrics();
  assert.equal(typeof metrics.openShipments, 'number');
  assert.equal(typeof metrics.pickupsToday, 'number');
  assert.equal(typeof metrics.missingDocuments, 'number');
  assert.equal(typeof metrics.actionRequired, 'number');
  assert.ok(metrics.openShipments > 0);
  assert.ok(metrics.actionRequired > 0);
  assert.equal(metrics.openShipments, data.DEMO_SHIPMENTS.filter(item => !['Abgeschlossen', 'Archiviert'].includes(item.status)).length);
});

test('showcase runtime is isolated from Professional API, auth and outbound mail/network calls', () => {
  for (const path of DEMO_RUNTIME_FILES) {
    assert.equal(exists(path), true, `${path} must exist`);
    const source = read(path);
    assert.doesNotMatch(source, /\/api\//i, `${path} must not call Professional API`);
    assert.doesNotMatch(source, /\/\.auth\//i, `${path} must not call auth endpoints`);
    assert.doesNotMatch(source, /\bfetch\s*\(/i, `${path} must not use fetch`);
    assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource|sendBeacon/i, `${path} must not use network transports`);
    assert.doesNotMatch(source, /mailto:/i, `${path} must not send/open real mail`);
  }
});

test('showcase shell loads only self-contained demo modules', () => {
  assert.equal(exists('demo/index.html'), true, 'demo/index.html must exist');
  assert.equal(exists('demo/demo.css'), true, 'demo/demo.css must exist');
  assert.equal(exists('demo/demo-ui.js'), true, 'demo/demo-ui.js must exist');
  const html = read('demo/index.html');
  assert.match(html, /\.\/demo\.css/);
  assert.match(html, /\.\/demo-ui\.js/);
  assert.doesNotMatch(html, /assets\/js\/app\.js/);
  assert.doesNotMatch(html, /\.auth\/login|Microsoft/i);
});

test('shipment status progression rejects skipped workflow states', async () => {
  assert.equal(exists('demo/demo-store.js'), true, 'demo/demo-store.js must exist');
  const store = await import('../demo/demo-store.js');
  store.reset();
  assert.throws(
    () => store.transitionShipment('sh-007', 'Bereit zur Abholung'),
    /UNGUELTIGER_STATUSWECHSEL/
  );
  const created = store.transitionShipment('sh-007', 'Erstellt');
  assert.equal(created.status, 'Erstellt');
});

test('ABD-required shipment cannot become ready while ABD is missing', async () => {
  const store = await import('../demo/demo-store.js');
  store.reset();
  assert.throws(
    () => store.transitionShipment('sh-001', 'Bereit zur Abholung'),
    /ABD_FEHLT/
  );
  store.setDocumentState('sh-001', 'abd', true);
  const ready = store.transitionShipment('sh-001', 'Bereit zur Abholung');
  assert.equal(ready.status, 'Bereit zur Abholung');
});

test('POD is only allowed after collection and collected shipments lock normal editing', async () => {
  const store = await import('../demo/demo-store.js');
  store.reset();
  assert.throws(() => store.setDocumentState('sh-002', 'pod', true), /POD_VOR_ABHOLUNG/);
  const collected = store.transitionShipment('sh-002', 'Abgeholt');
  assert.equal(collected.status, 'Abgeholt');
  assert.ok(collected.actualPickup);
  assert.throws(() => store.updateShipment('sh-002', { valueEur: 1 }), /SENDUNG_GESPERRT/);
  const withPod = store.setDocumentState('sh-002', 'pod', true);
  assert.equal(withPod.documents.pod, true);
  const podState = store.transitionShipment('sh-002', 'POD vorhanden');
  assert.equal(podState.status, 'POD vorhanden');
});

test('sendungen view contains filters and a master-detail workspace contract', () => {
  assert.equal(exists('demo/demo-shipments.js'), true, 'demo/demo-shipments.js must exist');
  const html = read('demo/index.html');
  const shipments = read('demo/demo-shipments.js');
  for (const marker of ['shipmentSearch', 'shipmentStatusFilter', 'shipmentOwnerFilter', 'shipmentRegionFilter', 'shipmentAttentionFilter', 'shipmentWorkspace']) {
    assert.match(html + shipments, new RegExp(marker), `missing shipment workspace marker: ${marker}`);
  }
  assert.match(shipments, /Bereit zur Abholung/);
  assert.match(shipments, /Abgeholt/);
  assert.match(shipments, /POD vorhanden/);
  assert.match(shipments, /ABD/);
});

test('task completion is local and survives in demo state until reset', async () => {
  const store = await import('../demo/demo-store.js');
  store.reset();
  const completed = store.completeTask('task-01');
  assert.equal(completed.status, 'Erledigt');
  assert.equal(store.getState().tasks.find(item => item.id === 'task-01')?.status, 'Erledigt');
  store.reset();
  assert.equal(store.getState().tasks.find(item => item.id === 'task-01')?.status, 'Offen');
});

test('document controller explains missing required files and generates DEMO MUSTER preview only', async () => {
  assert.equal(exists('demo/demo-documents.js'), true, 'demo/demo-documents.js must exist');
  const documents = await import('../demo/demo-documents.js');
  const checklist = documents.getDocumentChecklist('sh-001');
  assert.ok(checklist.some(item => item.type === 'abd' && item.required && !item.present));
  const preview = documents.buildDemoDocumentPreview('sh-003', 'delivery');
  assert.match(preview, /DEMO\s*\/\s*MUSTER/i);
  assert.match(preview, /RWD303/);
  assert.doesNotMatch(preview, /https?:\/\//i);
});

test('customer avis remains local-only and produces a non-public demo reference', async () => {
  assert.equal(exists('demo/demo-avis.js'), true, 'demo/demo-avis.js must exist');
  const store = await import('../demo/demo-store.js');
  const avisModule = await import('../demo/demo-avis.js');
  store.reset();
  const avis = avisModule.createDemoAvis('sh-002');
  assert.equal(avis.demo, true);
  assert.equal(avis.shipmentId, 'sh-002');
  assert.match(avis.reference, /^DEMO-AVIS-/);
  assert.match(avis.previewTarget, /^#demo-avis\//);
  assert.doesNotMatch(avis.previewTarget, /https?:\/\//i);
  assert.equal(store.getState().avis.length, 1);
});

test('tasks documents and avis views are real workspaces rather than placeholders', () => {
  const html = read('demo/index.html');
  for (const marker of ['taskWorkspace', 'documentWorkspace', 'avisWorkspace']) {
    assert.match(html, new RegExp(`id="${marker}"`), `missing workspace: ${marker}`);
  }
  assert.match(html, /Lieferschein/);
  assert.match(html, /L1 \/ QR/);
  assert.match(html, /POD/);
  assert.match(html, /Kunden-Avis/);
});
