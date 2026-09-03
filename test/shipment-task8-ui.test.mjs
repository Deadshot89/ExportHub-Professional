import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const url=path=>new URL(`../${path}`,import.meta.url);
const read=path=>fs.readFileSync(url(path),'utf8');
const exists=path=>fs.existsSync(url(path));

test('carrier workspace is a first-class control-center view without hard delete',()=>{
  assert.equal(exists('assets/js/carriers.js'),true,'assets/js/carriers.js fehlt');
  const html=read('index.html');
  assert.match(html,/data-nav="carriers"[^>]*>\s*Speditionen\s*</i);
  assert.match(html,/data-view="carriers"/);
  for(const id of ['newCarrierBtn','carrierStatusFilter','carrierRows','carrierDrawer','carrierForm','carrierName','carrierAbdDefault','carrierContactName','carrierEmail','carrierPhone','carrierPortalUrl'])assert.match(html,new RegExp(`id="${id}"`),id);
  assert.match(html,/\/assets\/js\/carriers\.js/);
  assert.doesNotMatch(html,/data-carrier-action="delete"|Spedition\s+löschen/i);
});

test('carrier controller uses tenant-session APIs exact roles CSRF and soft status only',()=>{
  const src=read('assets/js/carriers.js');
  assert.match(src,/TENANT_ADMIN/);
  assert.match(src,/EXPORT_ADMIN/);
  assert.match(src,/TEAM_LEAD/);
  assert.match(src,/OPERATOR/);
  assert.doesNotMatch(src,/WAREHOUSE[^\n]{0,120}canWrite|AUDITOR[^\n]{0,120}canWrite/i);
  assert.match(src,/professional-masterdata\/carriers\?status=/);
  assert.match(src,/professional-masterdata\/carriers\//);
  assert.match(src,/\/status/);
  assert.match(src,/x-professional-csrf/i);
  assert.match(src,/professional:session-ready/);
  assert.match(src,/professional:carriers-changed/);
  assert.doesNotMatch(src,/tenantId\s*:|tenant_id\s*:/i);
  assert.doesNotMatch(src,/delete\s*\(|method:\s*['"]DELETE['"]/i);
});

test('shipment editor exposes server-backed carrier selection and one-off conversion action',()=>{
  const src=read('assets/js/shipment-editor.js');
  assert.match(src,/model\.carriers|carriers=Array\.isArray\(model\.carriers\)/);
  assert.match(src,/shipmentCarrierSelect/);
  assert.match(src,/shipmentCarrierRequiresAbd/);
  assert.match(src,/data-shipment-action="convert-one-off"/);
  assert.match(src,/Einmal-Empfänger/);
  assert.doesNotMatch(src,/abdDecision|isEuDestination|NON_EU_VALUE|NON_EU_CARRIER/);
});

test('shipment controller loads carriers and persists only server-owned carrier and conversion operations',()=>{
  const src=read('assets/js/shipments.js');
  assert.match(src,/professional-masterdata\/carriers\?status=active/);
  assert.match(src,/operation:\s*['"]set-carrier['"]/);
  assert.match(src,/carrierId/);
  assert.match(src,/carrierRequiresAbd/);
  assert.match(src,/operation:\s*['"]preview-one-off-recipient['"]/);
  assert.match(src,/operation:\s*['"]convert-one-off-recipient['"]/);
  assert.match(src,/customerAccount/);
  assert.match(src,/customerId/);
  assert.doesNotMatch(src,/operation:\s*['"]convert-one-off-recipient['"][\s\S]{0,500}recipientSnapshot\s*:/);
});

test('one-off modal enforces preview-first duplicate and similar-name workflow with explicit outcomes',()=>{
  const html=read('index.html');
  for(const id of ['oneOffRecipientModal','oneOffCustomerAccount','previewOneOffRecipientBtn','oneOffCandidateResult','convertOneOffNewCustomerBtn','convertOneOffExistingCustomerBtn','closeOneOffRecipientModal'])assert.match(html,new RegExp(`id="${id}"`),id);
  assert.match(html,/Neuer Kunde \+ Standort/);
  assert.match(html,/Neuer Standort bei bestehendem Kunden/);
  const src=read('assets/js/shipments.js');
  assert.match(src,/exactAccount/);
  assert.match(src,/similar/);
  assert.match(src,/Kundennummer[^\n]{0,160}existiert/i);
  assert.match(src,/(?:mode:\s*['"]new-customer['"]|convertOneOffRecipient\(['"]new-customer['"]\))/);
  assert.match(src,/(?:mode:\s*['"]existing-customer['"]|convertOneOffRecipient\(['"]existing-customer['"]\))/);
  assert.match(src,/previewOneOffRecipientBtn/);
  assert.match(src,/convertOneOffNewCustomerBtn/);
  assert.match(src,/convertOneOffExistingCustomerBtn/);
});

test('carrier drawer and one-off modal remain usable under CSP and responsive layout',()=>{
  const html=read('index.html');
  const carrierJs=read('assets/js/carriers.js');
  assert.doesNotMatch(html,/\sonclick\s*=/i,'inline onclick is blocked by current script-src CSP');
  assert.match(carrierJs,/cancelCarrierBtn/);
  assert.equal(exists('assets/css/carriers.css'),true,'assets/css/carriers.css fehlt');
  assert.match(html,/\/assets\/css\/carriers\.css/);
  const css=read('assets/css/carriers.css');
  for(const marker of ['carrier-toolbar','carrier-table','modal-backdrop','one-off-modal','one-off-candidates'])assert.match(css,new RegExp(marker));
  assert.match(css,/@media\s*\(max-width:\s*700px\)/);
});

test('task 8 frontend is syntax checked and deploy payload guarded',()=>{
  const ci=read('.github/workflows/professional-ci.yml');
  const deploy=read('.github/workflows/professional-deploy.yml');
  assert.match(ci,/node --check assets\/js\/carriers\.js/);
  assert.match(deploy,/test -f \.deploy\/assets\/js\/carriers\.js/);
});
