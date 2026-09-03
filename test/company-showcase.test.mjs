import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const url = path => new URL(`../${path}`, import.meta.url);
const exists = path => fs.existsSync(url(path));
const read = path => fs.readFileSync(url(path), 'utf8');

const DEMO_RUNTIME_FILES = [
  'demo/demo-data.js',
  'demo/demo-ui.js'
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
