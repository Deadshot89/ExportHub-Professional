const authz=require('../shared/authorization');
const store=require('../shared/masterdata-store');
const http=require('../shared/http');

module.exports=async function(context,req){
  try{
    const {session}=await authz.requireSession(req,{permission:'customers.write',csrf:true});
    const location=await store.updateLocation(session.tenant_id,session.user_id,context.bindingData?.locationId,http.bodyOf(req));
    return http.json(context,200,{ok:true,location});
  }catch(err){http.error(context,err);}
};
