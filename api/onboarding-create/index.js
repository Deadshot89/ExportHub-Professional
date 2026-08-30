const store=require('../shared/auth-store');const sec=require('../shared/auth-security');const http=require('../shared/http');
module.exports=async function(context,req){try{sec.assertBootstrapToken(req);const result=await store.createFirstTenant(http.bodyOf(req));http.json(context,201,{ok:true,tenant:result.tenant,user:result.user,role:result.role});}catch(err){http.error(context,err);}};
