import {hasPermission,normalizeRole} from './permissions.js';

export class AccessDeniedError extends Error{
  constructor(code,message){ super(message||code); this.name='AccessDeniedError'; this.code=code; }
}

export function normalizeTenantId(value){
  const id=String(value||'').trim();
  if(!id) throw new AccessDeniedError('TENANT_REQUIRED','Mandant fehlt.');
  if(id.length>128 || !/^[A-Za-z0-9._:-]+$/.test(id)) throw new AccessDeniedError('TENANT_INVALID','Mandant ist ungültig.');
  return id;
}

export function createAccessContext({tenantId,userId,role,active=true}={}){
  if(active===false) throw new AccessDeniedError('USER_INACTIVE','Benutzer ist deaktiviert.');
  const normalizedRole=normalizeRole(role);
  if(!normalizedRole) throw new AccessDeniedError('ROLE_INVALID','Rolle ist ungültig.');
  return Object.freeze({tenantId:normalizeTenantId(tenantId),userId:String(userId||'').trim(),role:normalizedRole});
}

export function assertTenantMatch(context, entityTenantId){
  if(!context) throw new AccessDeniedError('ACCESS_CONTEXT_REQUIRED');
  const entity=normalizeTenantId(entityTenantId);
  if(context.tenantId!==entity) throw new AccessDeniedError('TENANT_SCOPE_VIOLATION','Mandantenübergreifender Zugriff wurde blockiert.');
  return true;
}

export function authorize(context, permission, entityTenantId=context&&context.tenantId){
  assertTenantMatch(context,entityTenantId);
  if(!hasPermission(context.role,permission)) throw new AccessDeniedError('PERMISSION_DENIED','Berechtigung fehlt: '+permission);
  return true;
}
