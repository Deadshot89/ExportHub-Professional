import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

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

test('shipment schema upgrade is idempotent and advisory locked',()=>{
  const src=fs.readFileSync(new URL('../api/shared/shipment-schema.js',import.meta.url),'utf8');
  assert.match(src,/async function applyShipmentSchema/);
  assert.match(src,/pg_advisory_xact_lock/);
  assert.match(src,/exporthub_professional_shipment_schema_v1/);
  assert.match(src,/BEGIN/);
  assert.match(src,/COMMIT/);
  assert.match(src,/ROLLBACK/);
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
});
