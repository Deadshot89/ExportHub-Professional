const authz=require('../shared/authorization');
const store=require('../shared/operations-store');
const http=require('../shared/http');

module.exports=async function(context,req){
  try{
    const {session}=await authz.requireSession(req,{permission:'shipments.read'});
    const shipments=await store.listShipments(session.tenant_id,{query:req.query?.q||'',status:req.query?.status||'',limit:req.query?.limit});
    return http.json(context,200,{ok:true,shipments});
  }catch(err){http.error(context,err);}
};
