const db=require('./database');
const sec=require('./auth-security');

async function tenantBySlug(slug){
  const s=sec.validateSlug(slug);
  return db.withControlClient(async client=>{
    const r=await client.query('select id,slug,name,status from tenants where slug=$1 limit 1',[s]);
    return r.rows[0]||null;
  });
}
async function loginCandidate(tenantId,login){
  const key=sec.validateLogin(login);
  return db.withTenantControlClient(tenantId,async client=>{
    const r=await client.query(`
      select u.id as user_id,u.username,u.display_name,u.email,u.active,
             m.role,m.active as membership_active,a.password_hash,a.failed_attempts,a.locked_until
      from app_users u
      join tenant_memberships m on m.tenant_id=u.tenant_id and m.user_id=u.id
      join app_user_auth a on a.tenant_id=u.tenant_id and a.user_id=u.id
      where u.tenant_id=$1 and a.login_name=$2
      limit 1`,[tenantId,key]);
    return r.rows[0]||null;
  });
}

async function recordLoginFailure(tenantId,userId){
  if(!userId)return;
  await db.withTenantControlClient(tenantId,client=>client.query(`
    update app_user_auth
       set failed_attempts=failed_attempts+1,
           locked_until=case when failed_attempts+1>=5 then now()+interval '30 minutes' else locked_until end
     where tenant_id=$1 and user_id=$2`,[tenantId,userId]),{write:true});
}
async function resetLoginFailures(tenantId,userId){
  await db.withTenantControlClient(tenantId,client=>client.query('update app_user_auth set failed_attempts=0,locked_until=null where tenant_id=$1 and user_id=$2',[tenantId,userId]),{write:true});
}

async function createSession(tenantId,userId){
  const raw=sec.newSessionToken(tenantId),hash=sec.tokenHash(raw),expires=sec.sessionExpiresAt();
  await db.withTenantControlClient(tenantId,client=>client.query(
    `insert into auth_sessions(tenant_id,user_id,session_hash,expires_at,last_seen_at) values($1,$2,$3,$4,now())`,
    [tenantId,userId,hash,expires]
  ),{write:true});
  return {token:raw,expiresAt:expires.toISOString(),csrfToken:sec.csrfToken(raw)};
}
async function resolveSession(rawToken){
  const tenantId=sec.tenantIdFromSessionToken(rawToken);
  if(!tenantId) return null;
  const hash=sec.tokenHash(rawToken);
  return db.withTenantControlClient(tenantId,async client=>{
    const r=await client.query(`
      select s.id,s.expires_at,t.id as tenant_id,t.slug as tenant_slug,t.name as tenant_name,t.status as tenant_status,
             u.id as user_id,u.username,u.display_name,u.email,u.active,m.role,m.active as membership_active
      from auth_sessions s
      join tenants t on t.id=s.tenant_id
      join app_users u on u.id=s.user_id and u.tenant_id=s.tenant_id
      join tenant_memberships m on m.user_id=u.id and m.tenant_id=u.tenant_id
      where s.tenant_id=$1 and s.session_hash=$2 and s.revoked_at is null
      limit 1`,[tenantId,hash]);
    const row=r.rows[0]; if(!row)return null;
    if(new Date(row.expires_at).getTime()<=Date.now()) return null;
    if(row.tenant_status!=='ACTIVE'||row.active===false||row.membership_active===false) return null;
    return {...row,csrfToken:sec.csrfToken(rawToken)};
  });
}
async function revokeSession(rawToken){
  const tenantId=sec.tenantIdFromSessionToken(rawToken); if(!tenantId)return;
  await db.withTenantControlClient(tenantId,client=>client.query('update auth_sessions set revoked_at=now() where tenant_id=$1 and session_hash=$2 and revoked_at is null',[tenantId,sec.tokenHash(rawToken)]),{write:true});
}
async function onboardingStatus(){
  if(!db.configured()) return {databaseConfigured:false,controlWritesEnabled:db.controlWritesEnabled(),bootstrapConfigured:String(process.env.PROFESSIONAL_BOOTSTRAP_TOKEN||'').length>=24,tenantCount:null};
  return db.withControlClient(async client=>{
    const r=await client.query('select count(*)::int as n from tenants');
    return {databaseConfigured:true,controlWritesEnabled:db.controlWritesEnabled(),bootstrapConfigured:String(process.env.PROFESSIONAL_BOOTSTRAP_TOKEN||'').length>=24,tenantCount:r.rows[0]?.n||0};
  });
}
async function createFirstTenant({companyName,workspace,adminName,adminLogin,adminEmail,password}){
  if(!db.controlWritesEnabled()) throw Object.assign(new Error('Control-Plane-Schreibzugriff ist deaktiviert.'),{code:'CONTROL_WRITES_DISABLED'});
  const name=String(companyName||'').trim(),slug=sec.validateSlug(workspace),login=sec.validateLogin(adminLogin||adminEmail),display=String(adminName||'').trim();
  if(name.length<2||name.length>160||display.length<2||display.length>160) throw Object.assign(new Error('Firmen- oder Administratorname ist ungültig.'),{code:'INPUT_INVALID'});
  const hash=await sec.hashPassword(password),email=String(adminEmail||'').trim().toLowerCase();
  return db.withControlClient(async client=>{
    const count=await client.query('select count(*)::int as n from tenants');
    if((count.rows[0]?.n||0)>0) throw Object.assign(new Error('Erst-Onboarding wurde bereits abgeschlossen.'),{code:'ONBOARDING_ALREADY_COMPLETED'});
    await client.query('BEGIN');
    try{
      const tr=await client.query('insert into tenants(name,slug,status) values($1,$2,\'ACTIVE\') returning id,slug,name',[name,slug]);
      const tenant=tr.rows[0];
      await client.query("select set_config('app.tenant_id',$1,true)",[tenant.id]);
      const ur=await client.query('insert into app_users(tenant_id,username,display_name,email,active,password_reset_required) values($1,$2,$3,$4,true,false) returning id,username,display_name,email',[tenant.id,login,display,email||null]);
      const user=ur.rows[0];
      await client.query('insert into tenant_memberships(tenant_id,user_id,role,active) values($1,$2,\'TENANT_ADMIN\',true)',[tenant.id,user.id]);
      await client.query('insert into app_user_auth(tenant_id,user_id,login_name,password_hash,password_changed_at) values($1,$2,$3,$4,now())',[tenant.id,user.id,login,hash]);
      await client.query('insert into audit_events(tenant_id,user_id,event_type,metadata) values($1,$2,\'TENANT_ONBOARDED\',$3::jsonb)',[tenant.id,user.id,JSON.stringify({workspace:slug})]);
      await client.query('COMMIT');
      return {tenant,user,role:'TENANT_ADMIN'};
    }catch(err){try{await client.query('ROLLBACK')}catch{};throw err;}
  },{write:true});
}
module.exports={tenantBySlug,loginCandidate,recordLoginFailure,resetLoginFailures,createSession,resolveSession,revokeSession,onboardingStatus,createFirstTenant};
