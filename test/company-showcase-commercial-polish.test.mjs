import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const url = path => new URL(`../${path}`, import.meta.url);
const read = path => fs.readFileSync(url(path), 'utf8');

test('showcase intro communicates four concrete business outcomes before the app', () => {
  const html = read('demo/index.html');
  assert.match(html, /showcase-proof-grid/);
  assert.match(html, /Zentrale Steuerung/);
  assert.match(html, /Klare Verantwortung/);
  assert.match(html, /Dokumentensicherheit/);
  assert.match(html, /Nachvollziehbarer Abschluss/);
});

test('overview adds an operational signal strip with useful daily context', () => {
  const html = read('demo/index.html');
  assert.match(html, /operations-signal-strip/);
  assert.match(html, /Exportstatus/);
  assert.match(html, /Dokumentenlage/);
  assert.match(html, /Abholung (?:&|&amp;) POD/);
});

test('dashboard KPI cards expose context labels instead of number-only tiles', () => {
  const html = read('demo/index.html');
  assert.match(html, /kpi-context/);
  assert.match(html, /data-kpi-tone="info"/);
  assert.match(html, /data-kpi-tone="positive"/);
  assert.match(html, /data-kpi-tone="warning"/);
  assert.match(html, /data-kpi-tone="critical"/);
});

test('shipment detail uses a presentation-grade summary and visible workflow progress meter', () => {
  const runtime = read('demo/demo-shipments.js');
  const css = read('demo/demo-shipments.css');
  assert.match(runtime, /shipment-detail-hero/);
  assert.match(runtime, /shipment-route-summary/);
  assert.match(runtime, /shipment-progress-meter/);
  assert.match(runtime, /Prozessfortschritt/);
  assert.match(css, /\.shipment-detail-hero/);
  assert.match(css, /\.shipment-progress-meter/);
});

test('document control explains internal L1 and L2 names instead of showing unexplained abbreviations', () => {
  const html = read('demo/index.html');
  const runtime = read('demo/demo-documents.js');
  const css = read('demo/demo-operations.css');
  assert.match(html, /document-guide-grid/);
  assert.match(html, /Interne L1-Ausgabe/);
  assert.match(html, /QR-Code für Abholung/);
  assert.match(html, /Interne L2-Ausgabe/);
  assert.match(html, /Versand-\/Speditionsunterlage/);
  assert.match(runtime, /DOCUMENT_DESCRIPTIONS/);
  assert.match(runtime, /doc-pill-copy/);
  assert.match(css, /\.document-guide-grid/);
});

test('task planning exposes operational counts for open critical and completed work', () => {
  const runtime = read('demo/demo-ui.js');
  const css = read('demo/demo-operations.css');
  assert.match(runtime, /task-control-strip/);
  assert.match(runtime, /Kritisch P0\/P1/);
  assert.match(runtime, /Offen/);
  assert.match(runtime, /Erledigt/);
  assert.match(css, /\.task-control-strip/);
});

test('customer avis preview explains the external handoff and its safety state', () => {
  const runtime = read('demo/demo-avis.js');
  const css = read('demo/demo-operations.css');
  assert.match(runtime, /avis-process-strip/);
  assert.match(runtime, /Sichere Kundenansicht/);
  assert.match(runtime, /Freigegebene Unterlagen/);
  assert.match(runtime, /Lokale Demo-Vorschau/);
  assert.match(css, /\.avis-process-strip/);
});

test('customer workspace exposes portfolio pressure and selected-customer operational context', () => {
  const runtime = read('demo/demo-ui.js');
  const css = read('demo/demo-presentation.css');
  assert.match(runtime, /customer-signal-strip/);
  assert.match(runtime, /Kunden mit offenen Sendungen/);
  assert.match(runtime, /Handlungsbedarf/);
  assert.match(runtime, /Nächster operativer Schritt/);
  assert.match(css, /\.customer-signal-strip/);
  assert.match(css, /\.customer-next-action/);
});

test('location workspace makes export relevance and operational usage visible', () => {
  const runtime = read('demo/demo-ui.js');
  const css = read('demo/demo-presentation.css');
  assert.match(runtime, /location-filter-strip/);
  assert.match(runtime, /Nicht-EU/);
  assert.match(runtime, /Operativ genutzt/);
  assert.match(runtime, /Exportrelevant/);
  assert.match(css, /\.location-filter-strip/);
  assert.match(css, /\.location-export-badge/);
});

test('team workspace quantifies role impact and shows the active team context', () => {
  const runtime = read('demo/demo-ui.js');
  const css = read('demo/demo-presentation.css');
  assert.match(runtime, /role-impact-strip/);
  assert.match(runtime, /Freigegebene Aktionen/);
  assert.match(runtime, /Gesperrt/);
  assert.match(runtime, /Teamkontext/);
  assert.match(css, /\.role-impact-strip/);
  assert.match(css, /\.role-team-context/);
});
