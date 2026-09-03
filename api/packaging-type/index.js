const authz=require('../shared/authorization');
const store=require('../shared/packaging-store');
const http=require('../shared/http');

module.exports=async function(context,req){
  try{
    const packagingTypeId=req.params?.packagingTypeId;
    if(String(req.method||'GET').toUpperCase()==='POST'){
      const {session}=await authz.requireSession(req,{permission:'packaging.write',csrf:true});
      const packagingType=await store.updatePackagingType(session.tenant_id,session.user_id,packagingTypeId,http.bodyOf(req));
      return http.json(context,200,{ok:true,packagingType});
    }
    const {session}=await authz.requireSession(req,{permission:'packaging.read'});
    const packagingType=await store.getPackagingType(session.tenant_id,packagingTypeId);
    return http.json(context,200,{ok:true,packagingType});
  }catch(err){http.error(context,err);}
};
