import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

const authz=require('../api/shared/authorization.js');
const settings=require('../api/shared/workspace-settings-store.js');

test('workspace shipping permissions are read-wide and tenant-admin write only',()=>{
  assert.equal(authz.hasPermission('TENANT_ADMIN','workspace.shipping.write'),true);
  assert.equal(authz.hasPermission('EXPORT_ADMIN','workspace.shipping.write'),false);
  assert.equal(authz.hasPermission('TEAM_LEAD','workspace.shipping.write'),false);
  assert.equal(authz.hasPermission('OPERATOR','workspace.shipping.write'),false);
  assert.equal(authz.hasPermission('AUDITOR','workspace.shipping.read'),true);
  assert.equal(authz.hasPermission('OPERATOR','workspace.shipping.read'),true);
  assert.equal(authz.hasPermission('WAREHOUSE','workspace.shipping.read'),true);
});

test('shipping settings normalize ISO and expose completeness without forcing incomplete drafts to fake complete',()=>{
  const complete=settings.normalizeShippingSettings({
    companyName:' ExportHUB Professional ',street:' Musterstraße ',houseNumber:' 7 ',postalCode:' 41334 ',city:' Nettetal ',shippingCountry:' Deutschland ',shippingCountryIso:' de ',timezone:' Europe/Berlin '
  });
  assert.equal(complete.companyName,'ExportHUB Professional');
  assert.equal(complete.shippingCountryIso,'DE');
  assert.equal(complete.timezone,'Europe/Berlin');
  assert.equal(complete.complete,true);

  const incomplete=settings.normalizeShippingSettings({companyName:'ExportHUB Professional',shippingCountryIso:'DE',timezone:'Europe/Berlin'});
  assert.equal(incomplete.complete,false);
});

test('invalid country ISO and timezone are rejected deterministically when supplied',()=>{
  assert.throws(()=>settings.validateShippingSettings({shippingCountryIso:'DEU',timezone:'Europe/Berlin'}),e=>e.code==='INPUT_INVALID');
  assert.throws(()=>settings.validateShippingSettings({shippingCountryIso:'DE',timezone:'Mars/Olympus'}),e=>e.code==='INPUT_INVALID');
  assert.doesNotThrow(()=>settings.validateShippingSettings({shippingCountryIso:'de',timezone:'Europe/Berlin'}));
});

test('workspace shipping store uses existing tenant_settings JSON and control-plane tenant scope',()=>{
  const src=read('api/shared/workspace-settings-store.js');
  assert.match(src,/withTenantControlClient/);
  assert.match(src,/tenant_settings/);
  assert.match(src,/settings/);
  assert.match(src,/shipping/);
  assert.doesNotMatch(src,/create table/i);
  assert.match(src,/WORKSPACE_SHIPPING_SETTINGS_UPDATED/);
});

test('workspace shipping API has exact route permissions and CSRF contract',()=>{
  const fn=JSON.parse(read('api/workspace-shipping-settings/function.json'));
  assert.equal(fn.bindings[0].route,'professional-workspace/shipping-settings');
  assert.deepEqual(fn.bindings[0].methods,['get','post']);
  const src=read('api/workspace-shipping-settings/index.js');
  assert.match(src,/permission:'workspace\.shipping\.read'/);
  assert.match(src,/permission:'workspace\.shipping\.write',csrf:true/);
  assert.match(src,/session\.tenant_id/);
  assert.match(src,/session\.user_id/);
  assert.doesNotMatch(src,/body\.tenant|query\.tenant|tenantId\s*=\s*.*body/i);
});

test('shipping settings UI is a dedicated workspace view with blocking completeness warning',()=>{
  const html=read('index.html');
  const js=read('assets/js/workspace-settings.js');
  assert.match(html,/data-nav="workspace-settings"/);
  assert.match(html,/data-view="workspace-settings"/);
  assert.match(html,/id="workspaceShippingForm"/);
  for(const id of ['workspaceCompanyName','workspaceStreet','workspaceHouseNumber','workspacePostalCode','workspaceCity','workspaceShippingCountry','workspaceShippingCountryIso','workspaceTimezone','workspaceShippingCompleteness']){
    assert.match(html,new RegExp(`id="${id}"`));
  }
  assert.match(html,/assets\/js\/workspace-settings\.js/);
  assert.match(js,/professional-workspace\/shipping-settings/);
  assert.match(js,/professional:session-ready/);
  assert.match(js,/TENANT_ADMIN/);
  assert.match(js,/x-professional-csrf/);
  assert.match(js,/Unvollständig|vollständig/i);
});

test('shipping settings frontend and API are explicitly guarded by CI and deploy payload checks',()=>{
  const ci=read('.github/workflows/professional-ci.yml');
  const deploy=read('.github/workflows/professional-deploy.yml');
  assert.match(ci,/node --check assets\/js\/workspace-settings\.js/);
  assert.match(ci,/api\/shared\/workspace-settings-store\.js/);
  assert.match(ci,/api\/workspace-shipping-settings\/index\.js/);
  assert.match(deploy,/\.deploy\/assets\/js\/workspace-settings\.js/);
  assert.match(deploy,/workspace-settings-store\.js/);
});

test('packaging permissions are read-wide and operational-write only',()=>{
  for(const role of ['TENANT_ADMIN','EXPORT_ADMIN','TEAM_LEAD','OPERATOR']){
    assert.equal(authz.hasPermission(role,'packaging.read'),true,`${role} read`);
    assert.equal(authz.hasPermission(role,'packaging.write'),true,`${role} write`);
  }
  for(const role of ['WAREHOUSE','AUDITOR']){
    assert.equal(authz.hasPermission(role,'packaging.read'),true,`${role} read`);
    assert.equal(authz.hasPermission(role,'packaging.write'),false,`${role} write`);
  }
});

test('packaging store validates rules and persists only through masterdata gate with audit',()=>{
  const src=read('api/shared/packaging-store.js');
  for(const fn of ['normalizePackagingType','listPackagingTypes','getPackagingType','createPackagingType','updatePackagingType','setPackagingTypeActive'])assert.match(src,new RegExp(`function ${fn}|async function ${fn}`),fn);
  assert.match(src,/withTenantMasterdataClient/);
  assert.match(src,/PACKAGING_TYPE_CREATED/);
  assert.match(src,/PACKAGING_TYPE_UPDATED/);
  assert.match(src,/PACKAGING_TYPE_(?:ACTIVATED|DEACTIVATED)/);
  assert.match(src,/FIXED_PER_UNIT/);
  assert.match(src,/FOOTPRINT/);
  assert.doesNotMatch(src,/delete from packaging_types/i);
});

test('packaging APIs expose tenant-scoped read/write/status routes with CSRF mutations',()=>{
  const expected={
    'packaging-types':{route:'professional-masterdata/packaging-types',methods:['get','post']},
    'packaging-type':{route:'professional-masterdata/packaging-types/{packagingTypeId}',methods:['get','post']},
    'packaging-type-status':{route:'professional-masterdata/packaging-types/{packagingTypeId}/status',methods:['post']}
  };
  for(const [folder,want] of Object.entries(expected)){
    const fn=JSON.parse(read(`api/${folder}/function.json`));
    const trigger=fn.bindings.find(binding=>binding.type==='httpTrigger');
    assert.equal(trigger.route,want.route,folder);
    assert.deepEqual(trigger.methods,want.methods,folder);
    const src=read(`api/${folder}/index.js`);
    assert.match(src,/session\.tenant_id/,folder);
    assert.doesNotMatch(src,/body\.tenant|query\.tenant|tenantId\s*=\s*.*body/i,folder);
    if(want.methods.includes('post'))assert.match(src,/permission:'packaging\.write',csrf:true/,folder);
    if(want.methods.includes('get'))assert.match(src,/permission:'packaging\.read'/,folder);
  }
});
