import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rootUrl = new URL('../', import.meta.url);
const fileUrl = path => new URL(path, rootUrl);
const exists = path => fs.existsSync(fileUrl(path));
const read = path => fs.readFileSync(fileUrl(path), 'utf8');

async function outputModule() {
  assert.equal(exists('demo/demo-document-output.js'), true, 'demo document output runtime must exist');
  return import(fileUrl('demo/demo-document-output.js'));
}

function resetModules() {
  return import(`${fileUrl('demo/demo-store.js').href}?doc-output=${Date.now()}-${Math.random()}`);
}

test('document output formats demo dates as TT.MM.JJJJ', async () => {
  const { formatDemoDate } = await outputModule();
  assert.equal(formatDemoDate('2026-09-03'), '03.09.2026');
  assert.equal(formatDemoDate('2026-08-29'), '29.08.2026');
  assert.equal(formatDemoDate(null), '–');
});

test('document output creates deterministic safe DEMO filenames', async () => {
  const { buildDocumentFilename } = await outputModule();
  const filename = buildDocumentFilename({
    reference: 'RWD302',
    customerName: 'Ferroviax Industries Ltd.',
    documentType: 'cmr',
    copy: 2
  });
  assert.equal(filename, 'RWD302_Ferroviax-Industries-Ltd_CMR-2-von-3_DEMO-MUSTER.html');
  assert.doesNotMatch(filename, /[\\/:*?"<>|]/);
});

test('document package contains generated base outputs and three numbered CMR copies for international shipment', async () => {
  const store = await resetModules();
  store.reset();
  const { buildDocumentPackage } = await outputModule();
  const pkg = buildDocumentPackage('sh-002', store.getState());

  assert.equal(pkg.demo, true);
  assert.equal(pkg.marker, 'DEMO / MUSTER');
  assert.deepEqual(pkg.items.filter(item => ['loading','l1','l2'].includes(item.type)).map(item => item.type), ['loading','l1','l2']);
  const cmr = pkg.items.find(item => item.type === 'cmr');
  assert.equal(cmr.relevant, true);
  assert.equal(cmr.copies, 3);
  assert.deepEqual(cmr.copyLabels, ['1/3','2/3','3/3']);
});

test('ABD output is only relevant when shipment requires ABD and never invents an MRN', async () => {
  const store = await resetModules();
  store.reset();
  const { buildDocumentPackage, buildDocumentSheet } = await outputModule();

  const nonEu = buildDocumentPackage('sh-001', store.getState());
  const eu = buildDocumentPackage('sh-003', store.getState());
  assert.equal(nonEu.items.find(item => item.type === 'abd')?.relevant, true);
  assert.equal(eu.items.some(item => item.type === 'abd'), false);

  const sheet = buildDocumentSheet('sh-001', 'abd', { state: store.getState() });
  assert.equal(sheet.status, 'Fehlt');
  assert.match(JSON.stringify(sheet), /ABD fehlt|Ausfuhrbegleitdokument/);
  assert.doesNotMatch(JSON.stringify(sheet), /MRN\s*[:=]\s*[A-Z0-9]{8,}/i);
});

test('POD output only becomes relevant after collection and distinguishes missing from present', async () => {
  const store = await resetModules();
  store.reset();
  const { buildDocumentPackage, buildDocumentSheet } = await outputModule();

  assert.equal(buildDocumentPackage('sh-002', store.getState()).items.some(item => item.type === 'pod'), false);
  const missing = buildDocumentSheet('sh-005', 'pod', { state: store.getState() });
  const present = buildDocumentSheet('sh-006', 'pod', { state: store.getState() });
  assert.equal(missing.status, 'Fehlt');
  assert.equal(present.status, 'Vorhanden');
  assert.equal(missing.marker, 'DEMO / MUSTER');
  assert.equal(present.marker, 'DEMO / MUSTER');
});

test('Ladeliste sheet stays single-page and uses detailed Colli rows when locally created', async () => {
  const store = await resetModules();
  store.reset();
  const created = store.createShipment({
    reference: 'DOC901',
    customerId: 'cus-01',
    locationId: 'loc-01',
    ownerId: 'emp-02',
    plannedPickup: '2026-09-04',
    valueEur: 5000,
    priority: 'P2',
    colli: [
      { packaging: 'Europalette', quantity: 2, weightKg: 400, lengthCm: 120, widthCm: 80, heightCm: 160 },
      { packaging: 'Karton', quantity: 3, weightKg: 45, lengthCm: 60, widthCm: 40, heightCm: 30 }
    ],
    documents: { delivery: true, l1: true, l2: true }
  });
  const { buildDocumentSheet } = await outputModule();
  const sheet = buildDocumentSheet(created.id, 'loading', { state: store.getState() });
  assert.equal(sheet.pageCount, 1);
  assert.equal(sheet.rows.length, 2);
  assert.equal(sheet.summary.totalQuantity, 5);
  assert.equal(sheet.summary.totalLdm, 0.4);
});

test('every document sheet visibly carries DEMO MUSTER and shipment/customer context', async () => {
  const store = await resetModules();
  store.reset();
  const { buildDocumentSheet } = await outputModule();
  for (const type of ['loading','l1','l2','cmr','abd']) {
    const sheet = buildDocumentSheet('sh-002', type, { state: store.getState(), copy: type === 'cmr' ? 1 : undefined });
    assert.equal(sheet.marker, 'DEMO / MUSTER');
    assert.equal(sheet.reference, 'RWD302');
    assert.match(sheet.customer.name, /Ferroviax Industries Ltd\./);
  }
});

test('documents view exposes package trigger and professional preview host with print and local download actions', () => {
  const html = read('demo/index.html');
  assert.match(html, /id="documentOutputDrawer"/);
  assert.match(html, /id="documentOutputPanel"/);
  assert.match(html, /id="documentOutputTabs"/);
  assert.match(html, /id="documentOutputPaper"/);
  assert.match(html, /id="documentPrintBtn"/);
  assert.match(html, /id="documentDownloadBtn"/);

  const workspace = read('demo/demo-documents.js');
  assert.match(workspace, /Dokumentpaket öffnen/);
  assert.match(workspace, /data-doc-package/);
  assert.match(workspace, /initDocumentOutput/);
});

test('document output runtime stays local and supports browser print plus in-memory sample download', () => {
  assert.equal(exists('demo/demo-document-output.js'), true, 'runtime missing');
  const source = read('demo/demo-document-output.js');
  assert.match(source, /window\.print\s*\(/);
  assert.match(source, /Blob\s*\(/);
  assert.match(source, /URL\.createObjectURL/);
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|mailto:|\/api\/|\/\.auth\//i);
});
