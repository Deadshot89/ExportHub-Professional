const store=require('./auth-store');
const sec=require('./auth-security');

const ROLE_PERMISSIONS={
  TENANT_ADMIN:new Set(['tenant.settings.read','tenant.settings.write','users.read','users.manage','customers.read','customers.write','shipments.read','shipments.write','tasks.read','tasks.write','documents.read','documents.upload','pickup.confirm','pod.upload','pallets.read','pallets.write','reports.read','audit.read']),
  EXPORT_ADMIN:new Set(['tenant.settings.read','users.read','customers.read','customers.write','shipments.read','shipments.write','tasks.read','tasks.write','documents.read','documents.upload','pickup.confirm','pod.upload','pallets.read','pallets.write','reports.read','audit.read']),
  TEAM_LEAD:new Set(['customers.read','shipments.read','shipments.write','tasks.read','tasks.write','documents.read','documents.upload','pickup.confirm','pod.upload','pallets.read','reports.read']),
  OPERATOR:new Set(['customers.read','shipments.read','shipments.write','tasks.read','tasks.write','documents.read','documents.upload','reports.read']),
  WAREHOUSE:new Set(['shipments.read','tasks.read','documents.read','pickup.confirm','pod.upload','pallets.read','pallets.write']),
  AUDITOR:new Set(['tenant.settings.read','users.read','customers.read','shipments.read','tasks.read','documents.read','pallets.read','reports.read','audit.read'])
};
const TENANT_ROLES=Object.freeze(Object.keys(ROLE_PERMISSIONS));

function normalizeRole(value){
  const role=String(value||'').trim().toUpperCase().replace(/[\s-]+/g,'_');
  return TENANT_ROLES.includes(role)?role:'';
}
function hasPermission(role,permission){return !!ROLE_PERMISSIONS[normalizeRole(role)]?.has(String(permission||''));}
function assertPermission(session,permission){
  if(!session||!hasPermission(session.role,permission)) throw Object.assign(new Error('Keine Berechtigung für diese Aktion.'),{code:'FORBIDDEN'});
  return true;
}
function header(req,name){
  const h=req?.headers||{},key=String(name||'').toLowerCase();
  for(const [k,v] of Object.entries(h)) if(String(k).toLowerCase()===key) return String(v||'');
  return '';
}
async function requireSession(req,{permission,csrf=false}={}){
  const raw=sec.sessionTokenFromRequest(req);
  if(!raw) throw Object.assign(new Error('Keine gültige Sitzung.'),{code:'SESSION_INVALID'});
  const session=await store.resolveSession(raw);
  if(!session) throw Object.assign(new Error('Sitzung ist ungültig oder abgelaufen.'),{code:'SESSION_INVALID'});
  if(permission) assertPermission(session,permission);
  if(csrf){
    const got=header(req,'x-professional-csrf');
    const expected=sec.csrfToken(raw);
    if(!sec.safeEqual(got,expected)) throw Object.assign(new Error('Sicherheitsprüfung fehlgeschlagen.'),{code:'CSRF_INVALID'});
  }
  return {raw,session};
}
module.exports={TENANT_ROLES,ROLE_PERMISSIONS,normalizeRole,hasPermission,assertPermission,requireSession};
