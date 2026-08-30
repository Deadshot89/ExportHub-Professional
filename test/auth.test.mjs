import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const sec=require('../api/shared/auth-security.js');

const TENANT='11111111-2222-4333-8444-555555555555';

test('Professional 0.7 hashes new passwords with scrypt and never returns cleartext',async()=>{
  const hash=await sec.hashPassword('SehrSicheresPasswort!2026');
  assert.match(hash,/^scrypt\$16384\$8\$1\$/);
  assert.equal(hash.includes('SehrSicheresPasswort'),false);
  assert.equal(await sec.verifyPassword('SehrSicheresPasswort!2026',hash),true);
  assert.equal(await sec.verifyPassword('Falsch!2026',hash),false);
});

test('password policy requires at least 12 characters',async()=>{
  await assert.rejects(()=>sec.hashPassword('zu-kurz'),e=>e.code==='PASSWORD_TOO_SHORT');
});

test('workspace and login are normalized deterministically',()=>{
  assert.equal(sec.normalizeSlug(' Muster GmbH '),'muster-gmbh');
  assert.equal(sec.normalizeLogin(' USER@Example.COM '),'user@example.com');
  assert.equal(sec.validateSlug('muster-gmbh'),'muster-gmbh');
});

test('session token uses tenant routing prefix and opaque random secret',()=>{
  const token=sec.newSessionToken(TENANT);
  assert.equal(sec.tenantIdFromSessionToken(token),TENANT);
  assert.ok(token.length>70);
  assert.match(sec.tokenHash(token),/^[a-f0-9]{64}$/);
});

test('session cookie is HttpOnly Secure SameSite Strict',()=>{
  const h=sec.cookieHeader(TENANT+'.abc');
  assert.match(h,/HttpOnly/);assert.match(h,/Secure/);assert.match(h,/SameSite=Strict/);assert.match(h,/Path=\//);
});

test('csrf token is derived from session with server secret',()=>{
  const old=process.env.PROFESSIONAL_SESSION_SECRET;process.env.PROFESSIONAL_SESSION_SECRET='0123456789abcdef0123456789abcdef0123456789';
  try{const a=sec.csrfToken('token-a'),b=sec.csrfToken('token-a'),c=sec.csrfToken('token-b');assert.equal(a,b);assert.notEqual(a,c);}
  finally{if(old===undefined)delete process.env.PROFESSIONAL_SESSION_SECRET;else process.env.PROFESSIONAL_SESSION_SECRET=old;}
});

test('bootstrap token comparison denies wrong token',()=>{
  const old=process.env.PROFESSIONAL_BOOTSTRAP_TOKEN;process.env.PROFESSIONAL_BOOTSTRAP_TOKEN='bootstrap-secret-01234567890123456789';
  try{
    assert.throws(()=>sec.assertBootstrapToken({headers:{'x-professional-bootstrap-token':'wrong'}}),e=>e.code==='BOOTSTRAP_DENIED');
    assert.equal(sec.assertBootstrapToken({headers:{'x-professional-bootstrap-token':process.env.PROFESSIONAL_BOOTSTRAP_TOKEN}}),true);
  }finally{if(old===undefined)delete process.env.PROFESSIONAL_BOOTSTRAP_TOKEN;else process.env.PROFESSIONAL_BOOTSTRAP_TOKEN=old;}
});

test('schema contains auth identities, sessions, tenant slug and RLS coverage',()=>{
  const sql=fs.readFileSync(new URL('../schema/postgres.sql',import.meta.url),'utf8');
  assert.match(sql,/create table if not exists app_user_auth/i);
  assert.match(sql,/create table if not exists auth_sessions/i);
  assert.match(sql,/slug text/i);
  assert.match(sql,/app_user_auth.*auth_sessions/s);
  assert.match(sql,/enable row level security/i);
});

test('login API resolves tenant and membership server-side instead of accepting role/tenant from browser',()=>{
  const login=fs.readFileSync(new URL('../api/auth-login/index.js',import.meta.url),'utf8');
  const store=fs.readFileSync(new URL('../api/shared/auth-store.js',import.meta.url),'utf8');
  assert.match(login,/tenantBySlug\(b\.workspace\)/);
  assert.match(login,/loginCandidate\(tenant\.id,b\.login\)/);
  assert.doesNotMatch(login,/b\.role|b\.tenantId|b\.tenant_id/);
  assert.match(store,/join tenant_memberships/i);
  assert.match(store,/where u\.tenant_id=\$1 and a\.login_name=\$2/i);
});

test('five failed password attempts trigger a 30 minute account lock in auth store',()=>{
  const store=fs.readFileSync(new URL('../api/shared/auth-store.js',import.meta.url),'utf8');
  assert.match(store,/failed_attempts\+1>=5/);
  assert.match(store,/interval '30 minutes'/);
});
