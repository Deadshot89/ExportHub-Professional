import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const sec=require('../api/shared/auth-security.js');
const authz=require('../api/shared/authorization.js');

const TENANT='11111111-2222-4333-8444-555555555555';

test('Professional 0.7 scoped invitation/reset tokens are tenant-routable and opaque',()=>{
  const token=sec.newScopedToken(TENANT);
  assert.equal(sec.tenantIdFromSessionToken(token),TENANT);
  assert.ok(token.length>70);
  assert.match(sec.tokenHash(token),/^[a-f0-9]{64}$/);
  assert.equal(sec.tokenHash(token).includes(token),false);
});

test('tenant admin can manage users while lower roles cannot',()=>{
  assert.equal(authz.hasPermission('TENANT_ADMIN','users.manage'),true);
  assert.equal(authz.hasPermission('EXPORT_ADMIN','users.manage'),false);
  assert.equal(authz.hasPermission('TEAM_LEAD','users.manage'),false);
  assert.equal(authz.hasPermission('WAREHOUSE','users.manage'),false);
});

test('authorization helper requires CSRF on mutating admin endpoints',()=>{
  const files=['admin-user-invite','admin-user-role','admin-user-status','admin-password-reset'];
  for(const name of files){
    const src=fs.readFileSync(new URL(`../api/${name}/index.js`,import.meta.url),'utf8');
    assert.match(src,/permission:'users\.manage',csrf:true/);
  }
});

test('user admin store stores only invitation/reset token hashes and single-use state',()=>{
  const src=fs.readFileSync(new URL('../api/shared/user-admin-store.js',import.meta.url),'utf8');
  assert.match(src,/token_hash/);
  assert.match(src,/sec\.tokenHash\(raw\)/);
  assert.match(src,/accepted_at is null/);
  assert.match(src,/used_at is null/);
  assert.match(src,/expires_at>now\(\)/);
  assert.doesNotMatch(src,/insert into user_invitations[^;]*\btoken\b(?!_hash)/i);
});

test('invitation redemption creates server-side tenant membership and password hash',()=>{
  const src=fs.readFileSync(new URL('../api/shared/user-admin-store.js',import.meta.url),'utf8');
  assert.match(src,/insert into app_users/);
  assert.match(src,/insert into tenant_memberships/);
  assert.match(src,/insert into app_user_auth/);
  assert.match(src,/hashPassword\(password\)/);
});

test('role and status changes protect the last tenant admin and self-deactivation',()=>{
  const src=fs.readFileSync(new URL('../api/shared/user-admin-store.js',import.meta.url),'utf8');
  assert.match(src,/LAST_TENANT_ADMIN/);
  assert.match(src,/SELF_ADMIN_CHANGE_DENIED/);
  assert.match(src,/countActiveTenantAdmins/);
});

test('password reset forces reset state and revokes existing sessions',()=>{
  const src=fs.readFileSync(new URL('../api/shared/user-admin-store.js',import.meta.url),'utf8');
  assert.match(src,/password_reset_required=true/);
  assert.match(src,/update auth_sessions set revoked_at=now\(\)/);
  assert.match(src,/PASSWORD_RESET_ISSUED/);
  assert.match(src,/PASSWORD_RESET_REDEEMED/);
});

test('identity administration events are audit logged',()=>{
  const src=fs.readFileSync(new URL('../api/shared/user-admin-store.js',import.meta.url),'utf8');
  for(const event of ['USER_INVITED','USER_INVITE_REDEEMED','USER_ROLE_CHANGED','USER_ACTIVATED','USER_DEACTIVATED','PASSWORD_RESET_ISSUED','PASSWORD_RESET_REDEEMED']) assert.match(src,new RegExp(event));
});

test('schema includes RLS-protected invitations and reset tokens',()=>{
  const sql=fs.readFileSync(new URL('../schema/postgres.sql',import.meta.url),'utf8');
  assert.match(sql,/create table if not exists user_invitations/i);
  assert.match(sql,/create table if not exists password_reset_tokens/i);
  assert.match(sql,/user_invitations.*password_reset_tokens.*tenant_settings/s);
  assert.match(sql,/array\['app_users'.*'user_invitations'.*'password_reset_tokens'/s);
});

test('one-time browser links use URL fragments instead of query parameters',()=>{
  const js=fs.readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
  assert.match(js,/`\$\{location\.origin\}\$\{location\.pathname\}#\$\{kind\}=/);
  assert.match(js,/parseCredentialAction/);
  assert.match(js,/professional-auth\/invite\/redeem/);
  assert.match(js,/professional-auth\/password-reset\/redeem/);
});

test('admin API routes are present and identity scoped',()=>{
  const expected={
    'admin-users-list':'professional-admin/users',
    'admin-user-invite':'professional-admin/users/invite',
    'admin-user-role':'professional-admin/users/role',
    'admin-user-status':'professional-admin/users/status',
    'admin-password-reset':'professional-admin/users/password-reset',
    'admin-identity-audit':'professional-admin/identity-audit',
    'invite-redeem':'professional-auth/invite/redeem',
    'password-reset-redeem':'professional-auth/password-reset/redeem'
  };
  for(const [folder,route] of Object.entries(expected)){
    const fn=JSON.parse(fs.readFileSync(new URL(`../api/${folder}/function.json`,import.meta.url),'utf8'));
    assert.equal(fn.bindings[0].route,route);
  }
});
