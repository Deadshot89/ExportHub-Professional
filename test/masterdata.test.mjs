import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const authz=require('../api/shared/authorization.js');

test('customer master-data permissions match approved roles',()=>{
  for(const role of ['TENANT_ADMIN','EXPORT_ADMIN','TEAM_LEAD','OPERATOR']){
    assert.equal(authz.hasPermission(role,'customers.read'),true,`${role} must read customers`);
    assert.equal(authz.hasPermission(role,'customers.write'),true,`${role} must write customers`);
  }
  for(const role of ['WAREHOUSE','AUDITOR']){
    assert.equal(authz.hasPermission(role,'customers.read'),true,`${role} must read customers`);
    assert.equal(authz.hasPermission(role,'customers.write'),false,`${role} must not write customers`);
  }
});

test('master-data writes use a separate environment gate',()=>{
  const src=fs.readFileSync(new URL('../api/shared/database.js',import.meta.url),'utf8');
  assert.match(src,/PROFESSIONAL_ENABLE_MASTERDATA_WRITES/);
  assert.match(src,/function masterdataWritesEnabled/);
  assert.match(src,/withTenantMasterdataClient/);
  assert.match(src,/MASTERDATA_WRITES_DISABLED/);
  assert.doesNotMatch(src,/function masterdataWritesEnabled\([^)]*\)\s*\{[^}]*PROFESSIONAL_ENABLE_WRITES/s);
});

test('database status exposes only the master-data gate boolean',()=>{
  const src=fs.readFileSync(new URL('../api/shared/database.js',import.meta.url),'utf8');
  assert.match(src,/masterdataWritesEnabled:masterdataWritesEnabled\(\)/);
  const meta=fs.readFileSync(new URL('../api/professional-meta/index.js',import.meta.url),'utf8');
  assert.match(meta,/database:db\.status\(\)/);
  assert.doesNotMatch(meta,/PROFESSIONAL_ENABLE_MASTERDATA_WRITES/);
});

test('master-data errors have deterministic HTTP mappings',()=>{
  const src=fs.readFileSync(new URL('../api/shared/http.js',import.meta.url),'utf8');
  assert.match(src,/MASTERDATA_WRITES_DISABLED:503/);
  assert.match(src,/CUSTOMER_EXISTS:409/);
  assert.match(src,/CUSTOMER_NOT_FOUND:404/);
  assert.match(src,/LOCATION_NOT_FOUND:404/);
  assert.match(src,/LOCATION_REQUIRED:400/);
  assert.match(src,/REGISTRATION_EMAIL_REQUIRED:400/);
  assert.match(src,/REGISTRATION_EMAIL_DUPLICATE:409/);
});
