const authz=require('../shared/authorization');
const store=require('../shared/operations-store');
const http=require('../shared/http');

module.exports=async function(context,req){
  try{
    const {session}=await authz.requireSession(req,{permission:'documents.read'});
    const documents=await store.listDocuments(session.tenant_id,{query:req.query?.q||'',shipmentId:req.query?.shipmentId||'',limit:req.query?.limit});
    return http.json(context,200,{ok:true,documents});
  }catch(err){http.error(context,err);}
};
