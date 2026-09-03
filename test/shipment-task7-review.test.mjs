import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('shipment list escapes quotes with a complete HTML entity',()=>{
  const src=read('assets/js/shipments.js');
  assert.match(src,/&quot;/);
  assert.doesNotMatch(src,/['"]&quot['"]|&quot(?!;)/);
});

test('colli editor has compact responsive control-center styling',()=>{
  const css=read('assets/css/control-center.css');
  for(const marker of ['shipment-colli-editor','shipment-colli-totals','shipment-colli-row','shipment-colli-grid','shipment-colli-output','shipment-colli-actions'])assert.match(css,new RegExp(marker),marker);
  assert.match(css,/@media\s*\(max-width:\s*700px\)[\s\S]*shipment-colli-grid[\s\S]*grid-template-columns:\s*1fr/);
});

test('CI and deploy validate packaging runtime explicitly',()=>{
  const ci=read('.github/workflows/professional-ci.yml');
  const deploy=read('.github/workflows/professional-deploy.yml');
  for(const file of ['api/shared/packaging-store.js','api/packaging-types/index.js','api/packaging-type/index.js','api/packaging-type-status/index.js'])assert.match(ci,new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),file);
  assert.match(ci,/require\('\.\/shared\/packaging-store\.js'\)/);
  assert.match(deploy,/require\('\.\/shared\/packaging-store\.js'\)/);
});
