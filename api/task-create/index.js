const authz=require('../shared/authorization');
const store=require('../shared/tasks-store');
const http=require('../shared/http');

module.exports=async function(context,req){
  try{
    const {session}=await authz.requireSession(req,{permission:'tasks.write',csrf:true});
    const body=http.bodyOf(req);
    const task=await store.createTask(session.tenant_id,session.user_id,body);
    return http.json(context,201,{ok:true,task});
  }catch(err){http.error(context,err);}
};
