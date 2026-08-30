const store=require('../shared/auth-store');const sec=require('../shared/auth-security');const http=require('../shared/http');
module.exports=async function(context,req){
  try{
    const b=http.bodyOf(req),tenant=await store.tenantBySlug(b.workspace);
    if(!tenant||tenant.status!=='ACTIVE'){
      await sec.verifyPassword(b.password,sec.DUMMY_PASSWORD_HASH);
      throw Object.assign(new Error('Workspace, Benutzer oder Passwort ist falsch.'),{code:'AUTH_INVALID'});
    }
    const candidate=await store.loginCandidate(tenant.id,b.login);
    if(!candidate){
      await sec.verifyPassword(b.password,sec.DUMMY_PASSWORD_HASH);
      throw Object.assign(new Error('Workspace, Benutzer oder Passwort ist falsch.'),{code:'AUTH_INVALID'});
    }
    if(candidate.locked_until&&new Date(candidate.locked_until).getTime()>Date.now()) throw Object.assign(new Error('Konto ist vorübergehend gesperrt.'),{code:'AUTH_LOCKED'});
    const passwordValid=await sec.verifyPassword(b.password,candidate.password_hash);
    const valid=candidate.active!==false&&candidate.membership_active!==false&&passwordValid;
    if(!valid){await store.recordLoginFailure(tenant.id,candidate.user_id);throw Object.assign(new Error('Workspace, Benutzer oder Passwort ist falsch.'),{code:'AUTH_INVALID'});}
    await store.resetLoginFailures(tenant.id,candidate.user_id);
    if(candidate.password_reset_required===true) throw Object.assign(new Error('Für dieses Konto muss zuerst ein neues Passwort gesetzt werden.'),{code:'PASSWORD_RESET_REQUIRED'});
    const session=await store.createSession(tenant.id,candidate.user_id);
    http.json(context,200,{ok:true,user:{id:candidate.user_id,username:candidate.username,displayName:candidate.display_name,email:candidate.email,role:candidate.role},tenant:{id:tenant.id,slug:tenant.slug,name:tenant.name},expiresAt:session.expiresAt,csrfToken:session.csrfToken},{'set-cookie':sec.cookieHeader(session.token)});
  }catch(err){http.error(context,err);}
};
