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

test('schema upgrades customers and locations without removing legacy fields',()=>{
  const sql=fs.readFileSync(new URL('../schema/postgres.sql',import.meta.url),'utf8');
  assert.match(sql,/alter table customers add column if not exists active boolean not null default true/i);
  assert.match(sql,/alter table customers add column if not exists updated_at timestamptz not null default now\(\)/i);
  for(const column of ['street','house_number','postal_code','city','country_iso','contact_email','carrier_name','shipping_instructions']){
    assert.match(sql,new RegExp(`alter table customer_locations add column if not exists ${column} text`,'i'));
  }
  assert.match(sql,/alter table customer_locations add column if not exists active boolean not null default true/i);
  assert.match(sql,/alter table customer_locations add column if not exists updated_at timestamptz not null default now\(\)/i);
  assert.match(sql,/\baddress text\b/i);
  assert.match(sql,/\bemail text\b/i);
  assert.match(sql,/derived_main boolean/i);
});

test('schema stores registration emails relationally with tenant isolation',()=>{
  const sql=fs.readFileSync(new URL('../schema/postgres.sql',import.meta.url),'utf8');
  assert.match(sql,/create table if not exists customer_location_registration_emails/i);
  assert.match(sql,/foreign key\s*\(tenant_id\s*,\s*location_id\)[\s\S]*references customer_locations\s*\(tenant_id\s*,\s*id\)/i);
  assert.match(sql,/customer_location_registration_emails_uq[\s\S]*lower\(email\)/i);
  assert.match(sql,/array\[[^\]]*'customer_location_registration_emails'/s);
  assert.match(sql,/customers_tenant_id_id_uq/i);
  assert.match(sql,/customer_locations_tenant_id_id_uq/i);
});
