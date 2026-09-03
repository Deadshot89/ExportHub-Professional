const authz=require('../shared/authorization');
const store=require('../shared/carrier-store');
const http=require('../shared/http');

module.exports=async function(context,req){
  try{
    if(String(req.method||'GET').toUpperCase()==='POST'){
      const {session}=await authz.requireSession(req,{permission:'carriers.write',csrf:true});
      const carrier=await store.createCarrier(session.tenant_id,session.user_id,http.bodyOf(req));
      return http.json(context,201,{ok:true,carrier});
    }
    const {session}=await authz.requireSession(req,{permission:'carriers.read'});
    const carriers=await store.listCarriers(session.tenant_id,{status:req.query?.status||'active'});
    return http.json(context,200,{ok:true,carriers});
  }catch(err){http.error(context,err);}
};
