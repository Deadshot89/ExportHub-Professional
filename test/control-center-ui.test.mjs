import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('control center has a shared dependency-free UI kit',()=>{
  const html=read('index.html');
  const css=read('assets/css/app.css');
  assert.match(html,/class="shell[^\"]*control-center-shell/);
  for(const cls of ['cc-page-head','cc-panel','cc-kpi-grid','cc-kpi','cc-status','cc-toolbar','cc-empty','cc-icon']){
    assert.match(css,new RegExp(`\\.${cls}\\b`));
  }
  assert.equal(fs.existsSync(new URL('../assets/js/ui-kit.js',import.meta.url)),true);
});

test('new frontend modules are validated and deployed',()=>{
  const ci=read('.github/workflows/professional-ci.yml');
  const deploy=read('.github/workflows/professional-deploy.yml');
  for(const file of ['assets/js/ui-kit.js','assets/js/overview.js']){
    assert.match(ci,new RegExp(`node --check ${file.replaceAll('/','\\/')}`));
    assert.match(deploy,new RegExp(file.replaceAll('/','\\/')));
  }
});
