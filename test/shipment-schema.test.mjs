import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

test('shipment writes have an independent environment gate',()=>{
  const src=fs.readFileSync(new URL('../api/shared/database.js',import.meta.url),'utf8');
  assert.match(src,/PROFESSIONAL_ENABLE_SHIPMENT_WRITES/);
  assert.match(src,/function shipmentWritesEnabled/);
  assert.match(src,/function withTenantShipmentClient|async function withTenantShipmentClient/);
  assert.doesNotMatch(src,/function shipmentWritesEnabled\([^)]*\)\s*\{[^}]*PROFESSIONAL_ENABLE_WRITES/s);
});

test('shipment schema has source kind revision lock snapshots and tenant indexes',()=>{
  const sql=fs.readFileSync(new URL('../api/shared/shipment-schema.js',import.meta.url),'utf8');
  for(const token of ['source_kind','revision','recipient_snapshot','sender_snapshot','carrier_snapshot','planned_pickup_date','completed_at','archived_at','discarded_at']) assert.match(sql,new RegExp(token,'i'));
  assert.match(sql,/create table if not exists shipment_edit_locks/i);
  assert.match(sql,/create table if not exists shipment_colli/i);
  assert.match(sql,/create table if not exists carriers/i);
  assert.match(sql,/create table if not exists packaging_types/i);
  assert.match(sql,/alter table shipment_edit_locks enable row level security/i);
  assert.match(sql,/alter table shipment_colli enable row level security/i);
  assert.match(sql,/alter table carriers enable row level security/i);
  assert.match(sql,/alter table packaging_types enable row level security/i);
});

test('shipment edit lock user relationship is tenant-safe at database level',()=>{
  const sql=fs.readFileSync(new URL('../api/shared/shipment-schema.js',import.meta.url),'utf8');
  assert.match(sql,/create unique index if not exists app_users_tenant_id_id_uq on app_users\s*\(tenant_id\s*,\s*id\)/i);
  assert.match(sql,/foreign key\s*\(tenant_id\s*,\s*user_id\)[\s\S]*references app_users\s*\(tenant_id\s*,\s*id\)/i);
});

test('shipment schema upgrade executes transaction and advisory lock',async()=>{
  const schema=require('../api/shared/shipment-schema.js');
  assert.equal(typeof schema.applyShipmentSchema,'function');
  const queries=[];
  await schema.applyShipmentSchema({query:async sql=>{queries.push(String(sql));return {rows:[]};}});
  const sql=queries.join('\n');
  assert.match(sql,/BEGIN/i);
  assert.match(sql,/pg_advisory_xact_lock/i);
  assert.match(sql,/exporthub_professional_shipment_schema_v1/);
  assert.match(sql,/create table if not exists shipment_edit_locks/i);
  assert.match(sql,/enable row level security/i);
  assert.match(sql,/COMMIT/i);
});

test('shipment errors have deterministic HTTP mappings',()=>{
  const src=fs.readFileSync(new URL('../api/shared/http.js',import.meta.url),'utf8');
  for(const code of ['SHIPMENT_WRITES_DISABLED','SHIPMENT_SCHEMA_UPGRADE_DISABLED','SHIPMENT_NOT_FOUND','SHIPMENT_READ_ONLY','SHIPMENT_LOCKED','SHIPMENT_LOCK_INVALID','SHIPMENT_REVISION_CONFLICT','SHIPMENT_TRANSITION_INVALID','SHIPMENT_NOT_READY','COLLI_MISMATCH','DOCUMENT_REQUIRED','FX_RATE_UNAVAILABLE']){
    assert.match(src,new RegExp(`${code}:\\d+`),code);
  }
});

test('canonical postgres schema mirrors shipment foundation objects',()=>{
  const sql=fs.readFileSync(new URL('../schema/postgres.sql',import.meta.url),'utf8');
  for(const token of ['source_kind','recipient_snapshot','shipment_edit_locks','shipment_colli','carriers','packaging_types']) assert.match(sql,new RegExp(token,'i'));
  assert.match(sql,/app_users_tenant_id_id_uq/i);
  assert.match(sql,/foreign key\s*\(tenant_id\s*,\s*user_id\)[\s\S]*references app_users\s*\(tenant_id\s*,\s*id\)/i);
});
