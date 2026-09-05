import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const url = path => new URL(`../${path}`, import.meta.url);
const exists = path => fs.existsSync(url(path));
const read = path => fs.readFileSync(url(path), 'utf8');

async function pickupModule() {
  assert.equal(exists('demo/demo-pickup.js'), true, 'demo/demo-pickup.js must exist');
  return import('../demo/demo-pickup.js');
}

test('QR pickup preview is local-only and exposes a fictional pickup reference plus four-digit demo PIN', async () => {
  const pickup = await pickupModule();
  const session = pickup.buildDemoPickupSession('sh-002');
  assert.equal(session.demo, true);
  assert.equal(session.shipmentId, 'sh-002');
  assert.match(session.reference, /^DEMO-PICKUP-RWD302$/);
  assert.match(session.previewTarget, /^#demo-pickup\/RWD302$/);
  assert.match(session.pin, /^\d{4}$/);
  assert.equal(session.expectedColli, 2);
  assert.doesNotMatch(JSON.stringify(session), /https?:\/\//i);
});

test('pickup confirmation rejects wrong PIN and wrong physical colli count', async () => {
  const store = await import('../demo/demo-store.js');
  const pickup = await pickupModule();
  store.reset();
  const session = pickup.buildDemoPickupSession('sh-002');
  assert.throws(() => pickup.confirmDemoPickup('sh-002', { pin: '9999', colli: session.expectedColli, driverName: 'Demo Fahrer' }), /PIN_UNGUELTIG/);
  assert.throws(() => pickup.confirmDemoPickup('sh-002', { pin: session.pin, colli: session.expectedColli + 1, driverName: 'Demo Fahrer' }), /COLLI_ABWEICHUNG/);
  assert.equal(store.getState().shipments.find(item => item.id === 'sh-002')?.status, 'Bereit zur Abholung');
});

test('successful QR pickup stores evidence and moves shipment to Abgeholt exactly once', async () => {
  const store = await import('../demo/demo-store.js');
  const pickup = await pickupModule();
  store.reset();
  const session = pickup.buildDemoPickupSession('sh-002');
  const result = pickup.confirmDemoPickup('sh-002', { pin: session.pin, colli: 2, driverName: 'Demo Fahrer' });
  assert.equal(result.status, 'Abgeholt');
  assert.equal(result.actualPickup, '2026-09-03');
  assert.equal(result.pickup?.demo, true);
  assert.equal(result.pickup?.driverName, 'Demo Fahrer');
  assert.equal(result.pickup?.colli, 2);
  assert.match(result.pickup?.confirmedAt || '', /^2026-09-03T\d{2}:\d{2}:\d{2}$/);
  assert.match(result.pickup?.reference || '', /^DEMO-PICKUP-RWD302$/);
  assert.equal(result.attention, 'POD fehlt');
  assert.throws(() => pickup.confirmDemoPickup('sh-002', { pin: session.pin, colli: 2, driverName: 'Demo Fahrer' }), /ABHOLUNG_BEREITS_BESTAETIGT/);
});

test('POD completion is blocked before pickup and then closes the proof gap after pickup', async () => {
  const store = await import('../demo/demo-store.js');
  const pickup = await pickupModule();
  store.reset();
  assert.throws(() => pickup.addDemoPod('sh-002', { receivedBy: 'Demo Lager' }), /POD_VOR_ABHOLUNG/);
  const session = pickup.buildDemoPickupSession('sh-002');
  pickup.confirmDemoPickup('sh-002', { pin: session.pin, colli: 2, driverName: 'Demo Fahrer' });
  const withPod = pickup.addDemoPod('sh-002', { receivedBy: 'Demo Lager' });
  assert.equal(withPod.status, 'POD vorhanden');
  assert.equal(withPod.documents.pod, true);
  assert.equal(withPod.attention, null);
  assert.equal(withPod.pickup?.pod?.demo, true);
  assert.equal(withPod.pickup?.pod?.receivedBy, 'Demo Lager');
});

test('ready and collected shipments open the presentation pickup flow instead of skipping straight through status', () => {
  const shipments = read('demo/demo-shipments.js');
  assert.match(shipments, /QR-Abholung öffnen/);
  assert.match(shipments, /POD-Nachweis öffnen/);
  assert.match(shipments, /data-shipment-action="open-pickup"/);
  assert.match(shipments, /initDemoPickupFlow/);
});

test('demo shell contains a dedicated external pickup presentation drawer and styling', () => {
  const html = read('demo/index.html');
  assert.match(html, /id="demoPickupDrawer"/);
  assert.match(html, /id="demoPickupWorkspace"/);
  assert.match(html, /demo-pickup\.css/);
  assert.match(html, /EXTERNE ABHOLANSICHT|Externe Abholansicht/i);
});

test('pickup runtime remains fully local and uses no camera network auth API or mail transports', () => {
  assert.equal(exists('demo/demo-pickup.js'), true, 'demo/demo-pickup.js must exist');
  const source = read('demo/demo-pickup.js');
  assert.doesNotMatch(source, /\/api\//i);
  assert.doesNotMatch(source, /\/\.auth\//i);
  assert.doesNotMatch(source, /\bfetch\s*\(/i);
  assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource|sendBeacon|getUserMedia/i);
  assert.doesNotMatch(source, /mailto:/i);
  assert.match(source, /DEMO\s*\/\s*MUSTER/i);
});

test('Professional CI and showcase preview syntax-check and isolate the pickup runtime', () => {
  const ci = read('.github/workflows/professional-ci.yml');
  const preview = read('.github/workflows/company-showcase-preview.yml');
  assert.match(ci, /node --check demo\/demo-pickup\.js/);
  assert.match(preview, /node --check demo\/demo-pickup\.js/);
  assert.match(preview, /'demo\/demo-pickup\.js'/);
  assert.match(preview, /getUserMedia/);
  assert.match(preview, /demo-pickup\.css/);
});