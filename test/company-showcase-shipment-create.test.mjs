import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const moduleUrl = new URL('../demo/demo-shipment-create.js', import.meta.url);
const storeUrl = new URL('../demo/demo-store.js', import.meta.url);
const indexUrl = new URL('../demo/index.html', import.meta.url);
const shipmentsUrl = new URL('../demo/demo-shipments.js', import.meta.url);
const cssUrl = new URL('../demo/demo-shipments.css', import.meta.url);

async function loadCreationModule() {
  assert.equal(fs.existsSync(moduleUrl), true, 'demo/demo-shipment-create.js must exist');
  return import(`${moduleUrl.href}?t=${Date.now()}-${Math.random()}`);
}

test('demo shipment reference requires exactly six uppercase alphanumeric characters', async () => {
  const { isValidReference } = await loadCreationModule();
  assert.equal(isValidReference('RWD315'), true);
  assert.equal(isValidReference('ABC123'), true);
  assert.equal(isValidReference('abc123'), false);
  assert.equal(isValidReference('ABCDE'), false);
  assert.equal(isValidReference('ABC-12'), false);
});

test('colli summary uses physical pallet quantity times 0.20 LDM', async () => {
  const { calculateColliSummary } = await loadCreationModule();
  const result = calculateColliSummary([
    { packaging:'Europalette', quantity:3, weightKg:900, lengthCm:120, widthCm:80, heightCm:145 },
    { packaging:'Karton', quantity:4, weightKg:80, lengthCm:40, widthCm:30, heightCm:25 }
  ]);
  assert.equal(result.totalQuantity, 7);
  assert.equal(result.totalWeightKg, 980);
  assert.equal(result.totalLdm, 0.6);
  assert.equal(result.rows[0].ldm, 0.6);
  assert.equal(result.rows[1].ldm, 0);
});

test('ABD rule is non-EU plus value over 1000 EUR or forwarder requirement', async () => {
  const { requiresAbd } = await loadCreationModule();
  assert.equal(requiresAbd({ nonEu:true, valueEur:1001, forwarderRequiresAbd:false }), true);
  assert.equal(requiresAbd({ nonEu:true, valueEur:500, forwarderRequiresAbd:true }), true);
  assert.equal(requiresAbd({ nonEu:true, valueEur:500, forwarderRequiresAbd:false }), false);
  assert.equal(requiresAbd({ nonEu:false, valueEur:50000, forwarderRequiresAbd:true }), false);
});

test('stowage plan puts higher pallets toward the front/cab side', async () => {
  const { buildStowagePlan } = await loadCreationModule();
  const blocks = buildStowagePlan([
    { packaging:'Europalette', quantity:1, weightKg:300, lengthCm:120, widthCm:80, heightCm:90 },
    { packaging:'Europalette', quantity:2, weightKg:700, lengthCm:120, widthCm:80, heightCm:180 },
    { packaging:'Karton', quantity:5, weightKg:50, lengthCm:30, widthCm:20, heightCm:20 }
  ]);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].heightCm, 180);
  assert.equal(blocks[1].heightCm, 180);
  assert.equal(blocks[2].heightCm, 90);
  assert.equal(blocks.every(block => block.frontOrder >= 1), true);
});

test('createShipment stores a fictional draft and reset removes it', async () => {
  const store = await import(`${storeUrl.href}?t=${Date.now()}-${Math.random()}`);
  assert.equal(typeof store.createShipment, 'function', 'demo-store must export createShipment');
  store.reset();
  const created = store.createShipment({
    reference:'RWD315',
    customerId:'cus-05',
    locationId:'loc-07',
    ownerId:'emp-02',
    plannedPickup:'2026-09-07',
    valueEur:2200,
    forwarderRequiresAbd:false,
    colli:[{ packaging:'Europalette', quantity:2, weightKg:700, lengthCm:120, widthCm:80, heightCm:160 }],
    documents:{ delivery:true, l1:false, l2:false, cmr:true, abd:false, pod:false }
  });
  assert.equal(created.demo, true);
  assert.equal(created.status, 'Entwurf');
  assert.equal(created.reference, 'RWD315');
  assert.equal(created.nonEu, true);
  assert.equal(created.requiresAbd, true);
  assert.equal(created.ldm, 0.4);
  assert.equal(store.getState().shipments.some(item => item.id === created.id), true);
  store.reset();
  assert.equal(store.getState().shipments.some(item => item.id === created.id), false);
});

test('shipment page exposes a complete local creation workspace', () => {
  const html = fs.readFileSync(indexUrl, 'utf8');
  const runtime = fs.readFileSync(shipmentsUrl, 'utf8');
  const css = fs.readFileSync(cssUrl, 'utf8');
  assert.match(html, /id="shipmentCreateBtn"/);
  assert.match(html, /id="shipmentCreateDrawer"/);
  assert.match(runtime, /initShipmentCreator/);
  assert.match(css, /\.shipment-create-drawer/);
});

test('creation runtime stays local and presents colli stowage and mail preview', () => {
  const source = fs.existsSync(moduleUrl) ? fs.readFileSync(moduleUrl, 'utf8') : '';
  assert.match(source, /Kunde & Standort/);
  assert.match(source, /Colli & LDM/);
  assert.match(source, /Dokumente & ABD/);
  assert.match(source, /Stauplan/);
  assert.match(source, /Mailvorschau/);
  assert.match(source, /DEMO \/ MUSTER/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource|sendBeacon|mailto:|\/.auth\//);
});
