const store=require('../shared/auth-store');const sec=require('../shared/auth-security');const http=require('../shared/http');
module.exports=async function(context,req){
  try{const raw=sec.sessionTokenFromRequest(req);if(!raw)throw Object.assign(new Error('Keine Sitzung.'),{code:'SESSION_INVALID'});const s=await store.resolveSession(raw);if(!s)throw Object.assign(new Error('Sitzung ist ungültig oder abgelaufen.'),{code:'SESSION_INVALID'});http.json(context,200,{ok:true,user:{id:s.user_id,username:s.username,displayName:s.display_name,email:s.email,role:s.role},tenant:{id:s.tenant_id,slug:s.tenant_slug,name:s.tenant_name},expiresAt:new Date(s.expires_at).toISOString(),csrfToken:s.csrfToken});}catch(err){http.error(context,err);}
};
