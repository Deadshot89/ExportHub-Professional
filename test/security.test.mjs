import test from 'node:test';
import assert from 'node:assert/strict';
import {ROLES,PERMISSIONS,hasPermission} from '../shared/security/permissions.js';
import {createAccessContext,assertTenantMatch,authorize,AccessDeniedError} from '../shared/security/tenant-scope.js';
import {TenantReadOnlyStore} from '../shared/data/read-only-store.js';
import {buildMigrationPackage} from '../shared/migration-core.js';

function sample(){return {type:'ExportHUB_BACKUP',version:'RC826',exportedAt:'2026-08-30T00:00:00Z',users:[{username:'admin',name:'Admin',role:'Admin'}],state:{customers:[{id:'C1',account:'1',name:'A'}],shipments:[{id:'S1',ref:'ABC123',customerId:'C1',status:'Erstellt'}],savedShipments:[],archive:[],tasks:[],abdRequests:[],palletBookings:[]}}}

test('platform admin does not automatically receive tenant shipment access',()=>{
  assert.equal(hasPermission(ROLES.PLATFORM_ADMIN,PERMISSIONS.PLATFORM_TENANTS_MANAGE),true);
  assert.equal(hasPermission(ROLES.PLATFORM_ADMIN,PERMISSIONS.SHIPMENTS_READ),false);
});

test('warehouse role can confirm pickup but cannot manage customers',()=>{
  assert.equal(hasPermission(ROLES.WAREHOUSE,PERMISSIONS.PICKUP_CONFIRM),true);
  assert.equal(hasPermission(ROLES.WAREHOUSE,PERMISSIONS.CUSTOMERS_WRITE),false);
});

test('auditor is read-only',()=>{
  assert.equal(hasPermission(ROLES.AUDITOR,PERMISSIONS.AUDIT_READ),true);
  assert.equal(hasPermission(ROLES.AUDITOR,PERMISSIONS.SHIPMENTS_WRITE),false);
  assert.equal(hasPermission(ROLES.AUDITOR,PERMISSIONS.DOCUMENTS_UPLOAD),false);
});

test('tenant mismatch is blocked',()=>{
  const ctx=createAccessContext({tenantId:'tenant-a',userId:'u1',role:ROLES.TENANT_ADMIN});
  assert.throws(()=>assertTenantMatch(ctx,'tenant-b'),e=>e instanceof AccessDeniedError && e.code==='TENANT_SCOPE_VIOLATION');
});

test('permission is checked after tenant scope',()=>{
  const ctx=createAccessContext({tenantId:'tenant-a',userId:'u1',role:ROLES.WAREHOUSE});
  assert.equal(authorize(ctx,PERMISSIONS.PICKUP_CONFIRM,'tenant-a'),true);
  assert.throws(()=>authorize(ctx,PERMISSIONS.CUSTOMERS_WRITE,'tenant-a'),e=>e.code==='PERMISSION_DENIED');
});

test('migration store only exposes own tenant and never writes',async()=>{
  const payload=sample(),pkg=await buildMigrationPackage(payload,JSON.stringify(payload),{tenantNameHint:'A'});
  const store=new TenantReadOnlyStore(pkg);
  const ctx=createAccessContext({tenantId:pkg.normalized.tenant.id,userId:'u1',role:ROLES.TENANT_ADMIN});
  assert.equal(store.customers(ctx).length,1);
  assert.equal(store.shipments(ctx).length,1);
  assert.throws(()=>store.insert({}),e=>e.code==='WRITE_DISABLED_MIGRATION_MODE');
});

test('migration store rejects foreign tenant context',async()=>{
  const payload=sample(),pkg=await buildMigrationPackage(payload,JSON.stringify(payload));
  const store=new TenantReadOnlyStore(pkg);
  const ctx=createAccessContext({tenantId:'foreign',userId:'u1',role:ROLES.TENANT_ADMIN});
  assert.throws(()=>store.shipments(ctx),e=>e.code==='TENANT_SCOPE_VIOLATION');
});

test('legacy users are normalized into the Professional 0.7 role set',async()=>{
  const payload=sample(); payload.users=[
    {username:'a',role:'Globaler Administrator',permissions:['*']},
    {username:'b',role:'Teamleiter'},
    {username:'c',role:'Lager'},
    {username:'d',role:'Sachbearbeiter'}
  ];
  const pkg=await buildMigrationPackage(payload,JSON.stringify(payload));
  const allowed=new Set(Object.values(ROLES));
  assert.equal(pkg.normalized.users.every(u=>allowed.has(u.professionalRole)),true);
  assert.deepEqual(pkg.normalized.users.map(u=>u.professionalRole),['PLATFORM_ADMIN','TEAM_LEAD','WAREHOUSE','OPERATOR']);
});
