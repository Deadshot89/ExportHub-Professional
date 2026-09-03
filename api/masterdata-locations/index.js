const authz=require('../shared/authorization');
const store=require('../shared/masterdata-store');
const http=require('../shared/http');

module.exports=async function(context,req){
  try{
    const {session}=await authz.requireSession(req,{permission:'customers.read'});
    const locations=await store.listLocations(session.tenant_id,{query:req.query?.q||'',status:req.query?.status||'active'});
    return http.json(context,200,{ok:true,locations});
  }catch(err){http.error(context,err);}
};
