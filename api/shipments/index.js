const authz=require('../shared/authorization');
const store=require('../shared/shipment-store');
const http=require('../shared/http');

module.exports=async function(context,req){
  try{
    if(String(req.method||'GET').toUpperCase()==='POST'){
      const {session}=await authz.requireSession(req,{permission:'shipments.write',csrf:true});
      const result=await store.createDraft(session.tenant_id,session.user_id);
      return http.json(context,201,{ok:true,...result});
    }
    const {session}=await authz.requireSession(req,{permission:'shipments.read'});
    const shipments=await store.listShipments(session.tenant_id,{query:req.query?.q||'',status:req.query?.status||'all',source:req.query?.source||'all'});
    return http.json(context,200,{ok:true,shipments});
  }catch(err){http.error(context,err);}
};
