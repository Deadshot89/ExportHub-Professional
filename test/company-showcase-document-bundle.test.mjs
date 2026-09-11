import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rootUrl = new URL('../', import.meta.url);
const fileUrl = path => new URL(path, rootUrl);
const exists = path => fs.existsSync(fileUrl(path));
const read = path => fs.readFileSync(fileUrl(path), 'utf8');

async function bundleModule() {
  assert.equal(exists('demo/demo-document-bundle.js'), true, 'demo total-output runtime must exist');
  return import(`${fileUrl('demo/demo-document-bundle.js').href}?bundle=${Date.now()}-${Math.random()}`);
}

async function resetStore() {
  const store = await import(`${fileUrl('demo/demo-store.js').href}?bundle-store=${Date.now()}-${Math.random()}`);
  store.reset();
  return store;
}

test('international non-EU total output expands CMR into three pages and includes required ABD', async () => {
  const store = await resetStore();
  const { buildShipmentBundleManifest } = await bundleModule();
  const manifest = buildShipmentBundleManifest('sh-002', store.getState());

  assert.equal(manifest.marker, 'DEMO / MUSTER');
  assert.equal(manifest.reference, 'RWD302');
  assert.equal(manifest.totalPages, 7);
  assert.deepEqual(manifest.pages.map(page => page.key), [
    'cover', 'l1', 'l2', 'cmr-1', 'cmr-2', 'cmr-3', 'abd'
  ]);
  assert.deepEqual(manifest.pages.filter(page => page.type === 'cmr').map(page => page.copyLabel), ['1/3','2/3','3/3']);
  assert.equal(manifest.pages.some(page => page.type === 'pod'), false);
});

test('domestic collected shipment omits CMR and ABD but adds POD after collection', async () => {
  const store = await resetStore();
  const { buildShipmentBundleManifest } = await bundleModule();
  const manifest = buildShipmentBundleManifest('sh-006', store.getState());

  assert.deepEqual(manifest.pages.map(page => page.key), ['cover','l1','l2','pod']);
  assert.equal(manifest.totalPages, 4);
  assert.equal(manifest.pages.some(page => page.type === 'cmr'), false);
  assert.equal(manifest.pages.some(page => page.type === 'abd'), false);
  assert.equal(manifest.pages.at(-1).status, 'Vorhanden');
});

test('collected international shipment keeps three CMR copies and appends missing POD page', async () => {
  const store = await resetStore();
  const { buildShipmentBundleManifest } = await bundleModule();
  const manifest = buildShipmentBundleManifest('sh-005', store.getState());

  assert.deepEqual(manifest.pages.map(page => page.key), ['cover','l1','l2','cmr-1','cmr-2','cmr-3','pod']);
  assert.equal(manifest.pages.at(-1).status, 'Fehlt');
  assert.match(manifest.warnings.join(' '), /POD/i);
});

test('bundle cover exposes shipment context, total pages and open required documents', async () => {
  const store = await resetStore();
  const { buildShipmentBundleCover } = await bundleModule();
  const cover = buildShipmentBundleCover('sh-001', store.getState());

  assert.equal(cover.type, 'cover');
  assert.equal(cover.marker, 'DEMO / MUSTER');
  assert.equal(cover.reference, 'RWD301');
  assert.equal(cover.customer.name, 'Elystra Automation AG');
  assert.equal(cover.location.country, 'CH');
  assert.equal(cover.totalPages, 7);
  assert.match(cover.warnings.join(' '), /ABD fehlt/i);
  assert.equal(cover.releaseState, 'Handlungsbedarf');
});

test('bundle filename is deterministic safe and identifies total output', async () => {
  const { buildShipmentBundleFilename } = await bundleModule();
  const filename = buildShipmentBundleFilename({ reference:'RWD302', customerName:'Ferroviax Industries Ltd.' });
  assert.equal(filename, 'RWD302_Ferroviax-Industries-Ltd_Gesamtausgabe_DEMO-MUSTER.html');
  assert.doesNotMatch(filename, /[\\/:*?"<>|]/);
});

test('rendered total output is one printable document with numbered pages and three CMR copies', async () => {
  const store = await resetStore();
  const { buildShipmentBundleManifest, renderShipmentBundleHtml } = await bundleModule();
  const manifest = buildShipmentBundleManifest('sh-002', store.getState());
  const html = renderShipmentBundleHtml(manifest, store.getState());

  assert.match(html, /Gesamtausgabe/);
  assert.match(html, /Deckblatt/);
  assert.match(html, /data-bundle-page="1"/);
  assert.match(html, /data-bundle-page="7"/);
  assert.match(html, /Ausfertigung 1\/3/);
  assert.match(html, /Ausfertigung 2\/3/);
  assert.match(html, /Ausfertigung 3\/3/);
  assert.equal((html.match(/DEMO \/ MUSTER/g) || []).length >= 7, true);
});

test('documents workspace exposes a one-click total-output action beside the existing package viewer', () => {
  const source = read('demo/demo-documents.js');
  assert.match(source, /initDocumentBundle/);
  assert.match(source, /data-doc-bundle/);
  assert.match(source, /Gesamtausgabe öffnen/);
  assert.match(source, /documentBundle\.open/);
});

test('total-output runtime stays local and supports print plus in-memory download', () => {
  assert.equal(exists('demo/demo-document-bundle.js'), true, 'runtime missing');
  const source = read('demo/demo-document-bundle.js');
  assert.match(source, /window\.print\s*\(/);
  assert.match(source, /Blob\s*\(/);
  assert.match(source, /URL\.createObjectURL/);
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|mailto:|\/api\/|\/\.auth\//i);
});

test('CI and isolated preview validate the total-output module and stylesheet', () => {
  const ci = read('.github/workflows/professional-ci.yml');
  const preview = read('.github/workflows/company-showcase-preview.yml');
  for (const source of [ci, preview]) {
    assert.match(source, /demo\/demo-document-bundle\.js/);
  }
  assert.match(preview, /demo\/demo-document-bundle\.css/);
});
