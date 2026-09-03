import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

test('masterdata schema bootstrap is explicit, idempotent and tenant-safe',async()=>{
  const moduleUrl=new URL('../api/shared/masterdata-schema.js',import.meta.url);
  assert.equal(fs.existsSync(moduleUrl),true,'masterdata schema bootstrap module must exist');
  const schema=require('../api/shared/masterdata-schema.js');
  assert.equal(typeof schema.applyMasterdataSchema,'function');
  const queries=[];
  await schema.applyMasterdataSchema({query:async sql=>{queries.push(String(sql));return {rows:[]};}});
  const sql=queries.join('\n');
  assert.match(sql,/alter table customers add column if not exists active boolean not null default true/i);
  assert.match(sql,/alter table customer_locations add column if not exists street text/i);
  assert.match(sql,/create table if not exists customer_location_registration_emails/i);
  assert.match(sql,/foreign key\s*\(tenant_id\s*,\s*location_id\)/i);
  assert.match(sql,/enable row level security/i);
  assert.match(sql,/create policy tenant_isolation/i);
  assert.doesNotMatch(sql,/delete from customers|delete from customer_locations/i);
});

test('database ensures masterdata schema once before tenant masterdata access',()=>{
  const src=fs.readFileSync(new URL('../api/shared/database.js',import.meta.url),'utf8');
  assert.match(src,/masterdataSchemaPromise/);
  assert.match(src,/async function ensureMasterdataSchema/);
  assert.match(src,/applyMasterdataSchema/);
  assert.match(src,/withTenantMasterdataClient[\s\S]*await ensureMasterdataSchema\(\)/);
  assert.match(src,/MASTERDATA_SCHEMA_UPGRADE_DISABLED/);
  assert.doesNotMatch(src,/ensureMasterdataSchema[\s\S]{0,500}PROFESSIONAL_ENABLE_WRITES/);
});
