const db=require('../shared/database');
module.exports=async function(context){context.res={status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},body:{ok:true,product:'ExportHUB Professional',version:'0.6.0',phase:'identity-and-tenant-onboarding',operationalWrites:db.writesEnabled(),controlWrites:db.controlWritesEnabled(),tenantIsolation:true}};};
