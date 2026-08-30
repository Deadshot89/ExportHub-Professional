const db=require('../shared/database');
module.exports=async function(context){
  context.res={status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},body:{
    ok:true,product:'ExportHUB Professional',version:'0.5.0',phase:'saas-foundation-read-only',
    tenantIsolation:'SERVER_ENFORCED_DESIGN',roles:['PLATFORM_ADMIN','TENANT_ADMIN','EXPORT_ADMIN','TEAM_LEAD','OPERATOR','WAREHOUSE','AUDITOR'],
    database:db.status(),migrationWrites:false
  }};
};
