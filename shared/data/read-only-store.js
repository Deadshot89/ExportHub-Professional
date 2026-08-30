import {authorize,assertTenantMatch} from '../security/tenant-scope.js';
import {PERMISSIONS} from '../security/permissions.js';

function arr(v){ return Array.isArray(v)?v:[]; }
function frozenCopy(v){ return Object.freeze(JSON.parse(JSON.stringify(v))); }

export class TenantReadOnlyStore{
  constructor(migrationPackage){
    if(!migrationPackage || migrationPackage.mode!=='READ_ONLY') throw new Error('READ_ONLY_MIGRATION_PACKAGE_REQUIRED');
    this.pkg=migrationPackage;
  }
  tenantId(){ return String(this.pkg.normalized?.tenant?.id||''); }
  _scope(context){ assertTenantMatch(context,this.tenantId()); }
  _list(context,key,permission){
    this._scope(context); authorize(context,permission,this.tenantId());
    return frozenCopy(arr(this.pkg.normalized?.[key]).filter(x=>String(x.tenantId||'')===this.tenantId()));
  }
  customers(context){ return this._list(context,'customers',PERMISSIONS.CUSTOMERS_READ); }
  shipments(context){ return this._list(context,'shipments',PERMISSIONS.SHIPMENTS_READ); }
  documents(context){ return this._list(context,'documents',PERMISSIONS.DOCUMENTS_READ); }
  users(context){ return this._list(context,'users',PERMISSIONS.USERS_READ); }
  audit(context){ return this._list(context,'auditEvents',PERMISSIONS.AUDIT_READ); }
  getShipment(context,id){
    const found=this.shipments(context).find(x=>x.id===id || x.reference===id);
    return found||null;
  }
  insert(){ throw Object.assign(new Error('Professional 0.7 migration store is read-only.'),{code:'WRITE_DISABLED_MIGRATION_MODE'}); }
  update(){ return this.insert(); }
  delete(){ return this.insert(); }
}
