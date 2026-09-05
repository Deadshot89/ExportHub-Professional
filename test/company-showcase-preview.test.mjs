import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const url = path => new URL(`../${path}`, import.meta.url);
const exists = path => fs.existsSync(url(path));
const read = path => fs.readFileSync(url(path), 'utf8');

const DEMO_JS = [
  'demo/demo-data.js',
  'demo/demo-store.js',
  'demo/demo-ui.js',
  'demo/demo-shipments.js',
  'demo/demo-shipment-create.js',
  'demo/demo-documents.js',
  'demo/demo-document-output.js',
  'demo/demo-avis.js',
  'demo/demo-management.js',
  'demo/presentation-guide.js'
];

test('Professional CI watches demo changes and syntax-checks every demo runtime module', () => {
  const ci = read('.github/workflows/professional-ci.yml');
  assert.match(ci, /demo\/\*\*/);
  for (const file of DEMO_JS) {
    assert.match(ci, new RegExp(`node --check ${file.replaceAll('/', '\\/').replaceAll('.', '\\.')}`), `CI does not syntax-check ${file}`);
  }
});

test('company showcase has its own pull-request-only preview workflow', () => {
  assert.equal(exists('.github/workflows/company-showcase-preview.yml'), true, 'preview workflow must exist');
  const workflow = read('.github/workflows/company-showcase-preview.yml');
  assert.match(workflow, /name:\s*ExportHUB Company Showcase Preview/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /demo\/company-showcase/);
  assert.match(workflow, /github\.head_ref\s*==\s*'demo\/company-showcase'/);
  assert.doesNotMatch(workflow, /push:\s*\n\s*branches:\s*\[?main/i, 'showcase preview must not deploy on main push');
});

test('showcase preview verifies tests syntax isolation and DEMO markers before deployment', () => {
  const workflow = read('.github/workflows/company-showcase-preview.yml');
  assert.match(workflow, /npm test/);
  for (const file of DEMO_JS) {
    assert.match(workflow, new RegExp(`node --check ${file.replaceAll('/', '\\/').replaceAll('.', '\\.')}`), `preview does not syntax-check ${file}`);
  }
  assert.match(workflow, /Rheinwerk Industrial Solutions GmbH/);
  assert.match(workflow, /DEMO \/ MUSTER/);
  assert.match(workflow, /fetch\\s\*\\\(/);
  assert.match(workflow, /XMLHttpRequest/);
  assert.match(workflow, /WebSocket/);
  assert.match(workflow, /sendBeacon/);
});

test('showcase preview publishes only the self-contained demo payload under slash demo', () => {
  const workflow = read('.github/workflows/company-showcase-preview.yml');
  assert.match(workflow, /\.showcase-preview\/demo/);
  assert.match(workflow, /cp -R demo\/?\s+\.showcase-preview\/demo/);
  assert.match(workflow, /\.showcase-preview\/index\.html/);
  assert.match(workflow, /\/demo\//);
  assert.match(workflow, /app_location:\s*\.showcase-preview/);
  assert.match(workflow, /skip_app_build:\s*true/);
  assert.doesNotMatch(workflow, /api_location:\s*api/);
});

test('showcase preview smoke-checks the deployed Azure URL and demo markers', () => {
  const workflow = read('.github/workflows/company-showcase-preview.yml');
  assert.match(workflow, /id:\s*deploy/);
  assert.match(workflow, /steps\.deploy\.outputs\.static_web_app_url/);
  assert.match(workflow, /demo_url="[^\n]*\/demo\/"/);
  assert.match(workflow, /curl[^\n]*\$\{demo_url\}/);
  assert.match(workflow, /ExportHUB Professional/);
  assert.match(workflow, /DEMO \/ MUSTER/);
  assert.match(workflow, /Rheinwerk Industrial Solutions GmbH/);
});

test('production deploy remains restricted to successful main CI runs', () => {
  const deploy = read('.github/workflows/professional-deploy.yml');
  assert.match(deploy, /github\.event\.workflow_run\.head_branch\s*==\s*'main'/);
  assert.doesNotMatch(deploy, /demo\/company-showcase/);
});
