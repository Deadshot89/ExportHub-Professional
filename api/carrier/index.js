const authz=require('../shared/authorization');
const store=require('../shared/carrier-store');
const http=require('../shared/http');

module.exports=async function(context,req){
  try{
    const carrierId=req.params?.carrierId;
    if(String(req.method||'GET').toUpperCase()==='POST'){
      const {session}=await authz.requireSession(req,{permission:'carriers.write',csrf:true});
      const carrier=await store.updateCarrier(session.tenant_id,session.user_id,carrierId,http.bodyOf(req));
      return http.json(context,200,{ok:true,carrier});
    }
    const {session}=await authz.requireSession(req,{permission:'carriers.read'});
    const carrier=await store.getCarrier(session.tenant_id,carrierId);
    return http.json(context,200,{ok:true,carrier});
  }catch(err){http.error(context,err);}
};
