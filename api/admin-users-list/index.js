const authz=require('../shared/authorization');const users=require('../shared/user-admin-store');const http=require('../shared/http');
module.exports=async function(context,req){try{const {session}=await authz.requireSession(req,{permission:'users.read'});const data=await users.listUsers(session.tenant_id);http.json(context,200,{ok:true,...data});}catch(err){http.error(context,err);}};
