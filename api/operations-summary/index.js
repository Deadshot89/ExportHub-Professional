const authz=require('../shared/authorization');
const store=require('../shared/operations-store');
const http=require('../shared/http');

module.exports=async function(context,req){
  try{
    const {session}=await authz.requireSession(req,{permission:'shipments.read'});
    const snapshot=await store.getOperationsSnapshot(session.tenant_id);
    return http.json(context,200,{ok:true,...snapshot});
  }catch(err){http.error(context,err);}
};
