import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('customers view is master-detail with reusable right drawer',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/id="liveCustomerMasterdata"/);
  assert.match(html,/id="customerMasterList"/);
  assert.match(html,/id="customerDetailPane"/);
  assert.match(html,/id="customerSearch"/);
  assert.match(html,/id="customerStatusFilter"/);
  assert.match(html,/id="newCustomerBtn"/);
  assert.match(html,/id="masterdataDrawer"/);
  assert.match(html,/id="masterdataDrawerBackdrop"/);
  assert.match(html,/id="masterdataDrawerBody"/);
});

test('customer UI supports multiple open locations and role-aware write controls',()=>{
  const js=fs.readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
  assert.match(js,/openLocationIds\s*=\s*new Set/);
  assert.match(js,/function canWriteCustomers/);
  assert.match(js,/async function loadCustomers/);
  assert.match(js,/async function selectCustomer/);
  assert.match(js,/function renderCustomerList/);
  assert.match(js,/function renderCustomerDetail/);
  assert.match(js,/function toggleLocationAccordion/);
  assert.match(js,/function openCustomerDrawer/);
  assert.match(js,/function openLocationDrawer/);
  assert.match(js,/function closeMasterdataDrawer/);
  assert.match(js,/async function saveCustomerDrawer/);
  assert.match(js,/async function saveLocationDrawer/);
});

test('new customer drawer includes first required location and repeatable registration emails',()=>{
  const js=fs.readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
  assert.match(js,/registrationEmails/);
  assert.match(js,/locationFormFieldsHtml\(\{\},'customer-location'\)/);
  for(const field of ['name','street','house-number','postal-code','city','country']){
    assert.match(js,new RegExp(`\\$\\{prefix\\}-${field}`));
  }
  assert.match(js,/add-registration-email/);
});

test('customer masterdata styles define desktop master-detail and responsive drawer',()=>{
  const css=fs.readFileSync(new URL('../assets/css/app.css',import.meta.url),'utf8');
  assert.match(css,/\.customer-master-detail/);
  assert.match(css,/\.customer-master-column/);
  assert.match(css,/\.location-accordion/);
  assert.match(css,/\.masterdata-drawer/);
  assert.match(css,/\.masterdata-drawer\.wide/);
  assert.match(css,/@media\(max-width:900px\)/);
});

test('global locations view opens the canonical customer editor',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  for(const id of ['liveGlobalLocations','globalLocationSearch','globalLocationStatusFilter','globalLocationRows']) assert.match(html,new RegExp(`id="${id}"`));
  const moduleUrl=new URL('../assets/js/locations.js',import.meta.url);
  assert.equal(fs.existsSync(moduleUrl),true,'global locations module must exist');
  const js=fs.readFileSync(moduleUrl,'utf8');
  assert.match(js,/async function loadGlobalLocations/);
  assert.match(js,/async function openCustomerForLocation/);
  assert.match(js,/professional-masterdata\/locations/);
  assert.match(js,/data-nav="customers"/);
  assert.doesNotMatch(js,/professional-masterdata\/locations\/[^'"`]*\{locationId\}[^'"`]*method:'POST'/);
});
