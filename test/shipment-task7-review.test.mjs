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

test('packaging load failure leaves shipment readable but disables colli mutation controls',async()=>{
  const {renderShipmentEditor}=await import('../assets/js/shipment-editor.js');
  const root={innerHTML:''};
  renderShipmentEditor(root,{
    shipment:{id:'s1',reference:'PKG001',sourceKind:'LIVE',status:'Entwurf',revision:1,plannedPickupDate:'2026-09-04',colliRows:[{packagingTypeId:'p1',packagingName:'Euro Palette',quantity:1,weightKg:100,lengthCm:120,widthCm:80,heightCm:150,ldm:0.2}],colliTotals:{totalColli:1,totalWeightKg:100,totalLdm:0.2}},
    packagingTypes:[],packagingReady:false
  },{canWrite:true,lock:{lockToken:'lock-1'},saveState:'saved'});
  assert.match(root.innerHTML,/id="shipmentPlannedPickupDate"[^>]*(?!disabled)/);
  assert.match(root.innerHTML,/data-colli-field="quantity"[^>]*disabled/);
  assert.match(root.innerHTML,/data-colli-field="weightKg"[^>]*disabled/);
  assert.doesNotMatch(root.innerHTML,/data-colli-action="add"/);
});
