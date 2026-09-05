import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const url = path => new URL(`../${path}`, import.meta.url);
const read = path => fs.readFileSync(url(path), 'utf8');

test('showcase exposes dedicated management and presentation conclusion views', () => {
  const html = read('demo/index.html');
  assert.match(html, /data-view="management"/);
  assert.match(html, /data-demo-view="management"/);
  assert.match(html, /id="managementWorkspace"/);
  assert.match(html, /data-view="conclusion"/);
  assert.match(html, /data-demo-view="conclusion"/);
  assert.match(html, /id="conclusionWorkspace"/);
});

test('management snapshot is calculated from the fictional baseline instead of hardcoded KPI values', async () => {
  const { getManagementSnapshot } = await import(url('demo/demo-management.js'));
  const { DEMO_SHIPMENTS, DEMO_TASKS } = await import(url('demo/demo-data.js'));
  const snapshot = getManagementSnapshot({ shipments: DEMO_SHIPMENTS, tasks: DEMO_TASKS });
  assert.equal(snapshot.openShipments, 12);
  assert.equal(snapshot.readyForPickup, 3);
  assert.equal(snapshot.openCriticalTasks, 5);
  assert.equal(snapshot.nonEuOpen, 4);
  assert.equal(snapshot.podGap, 2);
  assert.ok(snapshot.documentCompleteness > 0 && snapshot.documentCompleteness < 100);
  assert.ok(snapshot.actionRequired > 0);
});

test('management presentation explains operational meaning without inventing ROI or time-savings claims', () => {
  const runtime = read('demo/demo-management.js');
  assert.match(runtime, /Management-Lagebild/);
  assert.match(runtime, /Dokumentenquote/);
  assert.match(runtime, /kritische Aufgaben/i);
  assert.match(runtime, /Nicht-EU/i);
  assert.match(runtime, /Demo-Bestand|Beispieldaten/i);
  assert.doesNotMatch(runtime, /ROI|Zeitersparnis|Kostenersparnis|\d+\s*%\s*(?:schneller|weniger|mehr Produktivität)/i);
});

test('management view contains decision-oriented signals and drill-down actions', () => {
  const runtime = read('demo/demo-management.js');
  assert.match(runtime, /management-signal-grid/);
  assert.match(runtime, /management-priority-list/);
  assert.match(runtime, /data-management-open-view/);
  assert.match(runtime, /Heute entscheiden/);
  assert.match(runtime, /Prozessstabilität/);
});

test('presentation conclusion gives a reusable customer-meeting close instead of a generic thank-you screen', () => {
  const runtime = read('demo/demo-management.js');
  assert.match(runtime, /Was ExportHUB im gezeigten Ablauf verbindet/);
  assert.match(runtime, /Nächster sinnvoller Schritt/);
  assert.match(runtime, /Sendungssteuerung/);
  assert.match(runtime, /Dokumenten- und ABD-Kontrolle/);
  assert.match(runtime, /Abholung und POD/);
  assert.match(runtime, /Rollen und Verantwortlichkeiten/);
});

test('guided presentation includes management framing and a conclusion as twelve valid steps', async () => {
  const { TOUR_STEPS } = await import(url('demo/presentation-guide.js'));
  assert.equal(TOUR_STEPS.length, 12);
  assert.equal(TOUR_STEPS[0].view, 'management');
  assert.equal(TOUR_STEPS.at(-1).view, 'conclusion');
  assert.match(TOUR_STEPS[0].title, /Management/i);
  assert.match(TOUR_STEPS.at(-1).title, /Abschluss|Entscheidung/i);
});

test('management runtime and styles are wired into shell and isolated preview validation', () => {
  const html = read('demo/index.html');
  const ci = read('.github/workflows/professional-ci.yml');
  const preview = read('.github/workflows/company-showcase-preview.yml');
  const css = read('demo/demo-management.css');
  assert.match(html, /demo-management\.css/);
  assert.match(html, /demo-management\.js/);
  assert.match(css, /\.management-kpi-grid/);
  assert.match(css, /\.management-signal-grid/);
  assert.match(css, /\.conclusion-value-grid/);
  assert.match(ci, /node --check demo\/demo-management\.js/);
  assert.match(preview, /node --check demo\/demo-management\.js/);
  assert.match(preview, /'demo\/demo-management\.js'/);
}
);