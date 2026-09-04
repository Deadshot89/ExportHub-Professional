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
  assert.match(html, /Abholung & POD/);
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
