const db=require('./database');
const sec=require('./auth-security');
const authz=require('./authorization');

const INVITE_HOURS=Math.min(168,Math.max(1,Number(process.env.PROFESSIONAL_INVITE_HOURS||48)));
const RESET_MINUTES=Math.min(1440,Math.max(15,Number(process.env.PROFESSIONAL_RESET_MINUTES||60)));

function cleanName(value,label='Name'){
  const v=String(value||'').trim();
  if(v.length<2||v.length>160) throw Object.assign(new Error(`${label} ist ungültig.`),{code:'INPUT_INVALID'});
  return v;
}
function cleanEmail(value){
  const v=String(value||'').trim().toLowerCase();
  if(!v||v.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw Object.assign(new Error('E-Mail-Adresse ist ungültig.'),{code:'EMAIL_INVALID'});
  return v;
}
async function audit(client,tenantId,userId,eventType,{entityType=null,entityId=null,metadata={}}={}){
  await client.query('insert into audit_events(tenant_id,user_id,event_type,entity_type,entity_id,metadata) values($1,$2,$3,$4,$5,$6::jsonb)',[tenantId,userId||null,eventType,entityType,entityId,JSON.stringify(metadata||{})]);
}
async function listUsers(tenantId){
  return db.withTenantControlClient(tenantId,async client=>{
    const users=await client.query(`select u.id,u.username,u.display_name,u.email,u.active,u.password_reset_required,u.created_at,m.role,
      a.login_name,a.failed_attempts,a.locked_until,a.password_changed_at
      from app_users u join tenant_memberships m on m.tenant_id=u.tenant_id and m.user_id=u.id
      left join app_user_auth a on a.tenant_id=u.tenant_id and a.user_id=u.id
      where u.tenant_id=$1 order by lower(u.display_name),lower(u.username)`,[tenantId]);
    const invites=await client.query(`select id,display_name,email,login_name,role,expires_at,accepted_at,revoked_at,created_at
      from user_invitations where tenant_id=$1 and accepted_at is null and revoked_at is null and expires_at>now()
      order by created_at desc`,[tenantId]);
    return {users:users.rows,invites:invites.rows};
  });
}
async function createInvitation(tenantId,actorUserId,input){
  const displayName=cleanName(input.displayName,'Anzeigename'),email=cleanEmail(input.email),login=sec.validateLogin(input.login||email),role=authz.normalizeRole(input.role);
  if(!role) throw Object.assign(new Error('Rolle ist ungültig.'),{code:'ROLE_INVALID'});
  const raw=sec.newScopedToken(tenantId),hash=sec.tokenHash(raw),expiresAt=new Date(Date.now()+INVITE_HOURS*3600*1000);
  return db.withTenantControlClient(tenantId,async client=>{
    const dup=await client.query(`select 1 from app_user_auth where tenant_id=$1 and login_name=$2
      union all select 1 from user_invitations where tenant_id=$1 and login_name=$2 and accepted_at is null and revoked_at is null and expires_at>now() limit 1`,[tenantId,login]);
    if(dup.rowCount) throw Object.assign(new Error('Benutzer oder aktive Einladung mit diesem Anmeldenamen existiert bereits.'),{code:'USER_EXISTS'});
    const r=await client.query(`insert into user_invitations(tenant_id,email,login_name,display_name,role,token_hash,expires_at,created_by)
      values($1,$2,$3,$4,$5,$6,$7,$8) returning id,email,login_name,display_name,role,expires_at`,[tenantId,email,login,displayName,role,hash,expiresAt,actorUserId]);
    await audit(client,tenantId,actorUserId,'USER_INVITED',{entityType:'USER_INVITATION',entityId:r.rows[0].id,metadata:{login,role,email}});
    return {invitation:r.rows[0],token:raw};
  },{write:true});
}
async function redeemInvitation(rawToken,password){
  const tenantId=sec.tenantIdFromSessionToken(rawToken);
  if(!tenantId) throw Object.assign(new Error('Einladung ist ungültig oder abgelaufen.'),{code:'TOKEN_INVALID'});
  const hash=sec.tokenHash(rawToken),passwordHash=await sec.hashPassword(password);
  return db.withTenantControlClient(tenantId,async client=>{
    const r=await client.query(`select i.*,t.slug as tenant_slug,t.name as tenant_name from user_invitations i join tenants t on t.id=i.tenant_id
      where i.tenant_id=$1 and i.token_hash=$2 and i.accepted_at is null and i.revoked_at is null and i.expires_at>now() for update`,[tenantId,hash]);
    const inv=r.rows[0]; if(!inv) throw Object.assign(new Error('Einladung ist ungültig oder abgelaufen.'),{code:'TOKEN_INVALID'});
    const exists=await client.query('select 1 from app_user_auth where tenant_id=$1 and login_name=$2 limit 1',[tenantId,inv.login_name]);
    if(exists.rowCount) throw Object.assign(new Error('Benutzer existiert bereits.'),{code:'USER_EXISTS'});
    const ur=await client.query('insert into app_users(tenant_id,username,display_name,email,active,password_reset_required) values($1,$2,$3,$4,true,false) returning id,username,display_name,email',[tenantId,inv.login_name,inv.display_name,inv.email]);
    const user=ur.rows[0];
    await client.query('insert into tenant_memberships(tenant_id,user_id,role,active) values($1,$2,$3,true)',[tenantId,user.id,inv.role]);
    await client.query('insert into app_user_auth(tenant_id,user_id,login_name,password_hash,password_changed_at) values($1,$2,$3,$4,now())',[tenantId,user.id,inv.login_name,passwordHash]);
    await client.query('update user_invitations set accepted_at=now(),accepted_user_id=$3 where tenant_id=$1 and id=$2',[tenantId,inv.id,user.id]);
    await audit(client,tenantId,user.id,'USER_INVITE_REDEEMED',{entityType:'USER',entityId:user.id,metadata:{invitationId:inv.id,role:inv.role}});
    return {tenant:{id:tenantId,slug:inv.tenant_slug,name:inv.tenant_name},user,role:inv.role};
  },{write:true});
}
async function countActiveTenantAdmins(client,tenantId){
  const r=await client.query(`select count(*)::int as n from tenant_memberships m join app_users u on u.id=m.user_id and u.tenant_id=m.tenant_id
    where m.tenant_id=$1 and m.role='TENANT_ADMIN' and m.active=true and u.active=true`,[tenantId]);
  return Number(r.rows[0]?.n||0);
}
async function changeRole(tenantId,actorUserId,targetUserId,role){
  const next=authz.normalizeRole(role);if(!next)throw Object.assign(new Error('Rolle ist ungültig.'),{code:'ROLE_INVALID'});
  if(String(targetUserId)===String(actorUserId)) throw Object.assign(new Error('Die eigene Rolle kann in dieser Version nicht geändert werden.'),{code:'SELF_ADMIN_CHANGE_DENIED'});
  return db.withTenantControlClient(tenantId,async client=>{
    const cur=await client.query('select role from tenant_memberships where tenant_id=$1 and user_id=$2 for update',[tenantId,targetUserId]);
    if(!cur.rowCount) throw Object.assign(new Error('Benutzer wurde nicht gefunden.'),{code:'USER_NOT_FOUND'});
    if(cur.rows[0].role==='TENANT_ADMIN'&&next!=='TENANT_ADMIN'&&(await countActiveTenantAdmins(client,tenantId))<=1) throw Object.assign(new Error('Der letzte aktive Firmen-Admin kann nicht herabgestuft werden.'),{code:'LAST_TENANT_ADMIN'});
    await client.query('update tenant_memberships set role=$3 where tenant_id=$1 and user_id=$2',[tenantId,targetUserId,next]);
    await audit(client,tenantId,actorUserId,'USER_ROLE_CHANGED',{entityType:'USER',entityId:targetUserId,metadata:{from:cur.rows[0].role,to:next}});
    return {userId:targetUserId,role:next};
  },{write:true});
}
async function changeStatus(tenantId,actorUserId,targetUserId,active){
  const next=active===true;
  if(String(targetUserId)===String(actorUserId)&&!next) throw Object.assign(new Error('Das eigene Konto kann nicht deaktiviert werden.'),{code:'SELF_ADMIN_CHANGE_DENIED'});
  return db.withTenantControlClient(tenantId,async client=>{
    const cur=await client.query(`select u.active,m.role from app_users u join tenant_memberships m on m.tenant_id=u.tenant_id and m.user_id=u.id
      where u.tenant_id=$1 and u.id=$2 for update`,[tenantId,targetUserId]);
    if(!cur.rowCount) throw Object.assign(new Error('Benutzer wurde nicht gefunden.'),{code:'USER_NOT_FOUND'});
    if(!next&&cur.rows[0].role==='TENANT_ADMIN'&&(await countActiveTenantAdmins(client,tenantId))<=1) throw Object.assign(new Error('Der letzte aktive Firmen-Admin kann nicht deaktiviert werden.'),{code:'LAST_TENANT_ADMIN'});
    await client.query('update app_users set active=$3 where tenant_id=$1 and id=$2',[tenantId,targetUserId,next]);
    await client.query('update tenant_memberships set active=$3 where tenant_id=$1 and user_id=$2',[tenantId,targetUserId,next]);
    if(!next) await client.query('update auth_sessions set revoked_at=now() where tenant_id=$1 and user_id=$2 and revoked_at is null',[tenantId,targetUserId]);
    await audit(client,tenantId,actorUserId,next?'USER_ACTIVATED':'USER_DEACTIVATED',{entityType:'USER',entityId:targetUserId});
    return {userId:targetUserId,active:next};
  },{write:true});
}
async function issuePasswordReset(tenantId,actorUserId,targetUserId){
  const raw=sec.newScopedToken(tenantId),hash=sec.tokenHash(raw),expiresAt=new Date(Date.now()+RESET_MINUTES*60*1000);
  return db.withTenantControlClient(tenantId,async client=>{
    const user=await client.query('select id,username,email,active from app_users where tenant_id=$1 and id=$2 limit 1',[tenantId,targetUserId]);
    if(!user.rowCount) throw Object.assign(new Error('Benutzer wurde nicht gefunden.'),{code:'USER_NOT_FOUND'});
    await client.query('update password_reset_tokens set revoked_at=now() where tenant_id=$1 and user_id=$2 and used_at is null and revoked_at is null',[tenantId,targetUserId]);
    const rr=await client.query('insert into password_reset_tokens(tenant_id,user_id,token_hash,expires_at,created_by) values($1,$2,$3,$4,$5) returning id,expires_at',[tenantId,targetUserId,hash,expiresAt,actorUserId]);
    await client.query('update app_users set password_reset_required=true where tenant_id=$1 and id=$2',[tenantId,targetUserId]);
    await client.query('update auth_sessions set revoked_at=now() where tenant_id=$1 and user_id=$2 and revoked_at is null',[tenantId,targetUserId]);
    await audit(client,tenantId,actorUserId,'PASSWORD_RESET_ISSUED',{entityType:'USER',entityId:targetUserId,metadata:{resetId:rr.rows[0].id}});
    return {user:user.rows[0],reset:rr.rows[0],token:raw};
  },{write:true});
}
async function redeemPasswordReset(rawToken,password){
  const tenantId=sec.tenantIdFromSessionToken(rawToken);
  if(!tenantId) throw Object.assign(new Error('Passwort-Link ist ungültig oder abgelaufen.'),{code:'TOKEN_INVALID'});
  const hash=sec.tokenHash(rawToken),passwordHash=await sec.hashPassword(password);
  return db.withTenantControlClient(tenantId,async client=>{
    const r=await client.query(`select p.*,u.username,t.slug as tenant_slug,t.name as tenant_name from password_reset_tokens p
      join app_users u on u.id=p.user_id and u.tenant_id=p.tenant_id join tenants t on t.id=p.tenant_id
      where p.tenant_id=$1 and p.token_hash=$2 and p.used_at is null and p.revoked_at is null and p.expires_at>now() for update`,[tenantId,hash]);
    const reset=r.rows[0];if(!reset)throw Object.assign(new Error('Passwort-Link ist ungültig oder abgelaufen.'),{code:'TOKEN_INVALID'});
    await client.query('update app_user_auth set password_hash=$3,password_changed_at=now(),failed_attempts=0,locked_until=null where tenant_id=$1 and user_id=$2',[tenantId,reset.user_id,passwordHash]);
    await client.query('update app_users set password_reset_required=false where tenant_id=$1 and id=$2',[tenantId,reset.user_id]);
    await client.query('update password_reset_tokens set used_at=now() where tenant_id=$1 and id=$2',[tenantId,reset.id]);
    await client.query('update auth_sessions set revoked_at=now() where tenant_id=$1 and user_id=$2 and revoked_at is null',[tenantId,reset.user_id]);
    await audit(client,tenantId,reset.user_id,'PASSWORD_RESET_REDEEMED',{entityType:'USER',entityId:reset.user_id,metadata:{resetId:reset.id}});
    return {tenant:{id:tenantId,slug:reset.tenant_slug,name:reset.tenant_name},login:reset.username};
  },{write:true});
}
async function listIdentityAudit(tenantId,limit=100){
  const n=Math.min(200,Math.max(1,Number(limit)||100));
  return db.withTenantControlClient(tenantId,async client=>{
    const r=await client.query(`select a.id,a.occurred_at,a.event_type,a.entity_type,a.entity_id,a.metadata,u.display_name as actor_name,u.username as actor_username
      from audit_events a left join app_users u on u.id=a.user_id and u.tenant_id=a.tenant_id
      where a.tenant_id=$1 and a.event_type in ('USER_INVITED','USER_INVITE_REDEEMED','USER_ROLE_CHANGED','USER_ACTIVATED','USER_DEACTIVATED','PASSWORD_RESET_ISSUED','PASSWORD_RESET_REDEEMED','TENANT_ONBOARDED')
      order by a.occurred_at desc limit $2`,[tenantId,n]);
    return r.rows;
  });
}
module.exports={INVITE_HOURS,RESET_MINUTES,listUsers,createInvitation,redeemInvitation,changeRole,changeStatus,issuePasswordReset,redeemPasswordReset,listIdentityAudit};
