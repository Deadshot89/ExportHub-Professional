const authz=require('../shared/authorization');
const store=require('../shared/packaging-store');
const http=require('../shared/http');

module.exports=async function(context,req){
  try{
    if(String(req.method||'GET').toUpperCase()==='POST'){
      const {session}=await authz.requireSession(req,{permission:'packaging.write',csrf:true});
      const packagingType=await store.createPackagingType(session.tenant_id,session.user_id,http.bodyOf(req));
      return http.json(context,201,{ok:true,packagingType});
    }
    const {session}=await authz.requireSession(req,{permission:'packaging.read'});
    const packagingTypes=await store.listPackagingTypes(session.tenant_id,{status:req.query?.status||'active'});
    return http.json(context,200,{ok:true,packagingTypes});
  }catch(err){http.error(context,err);}
};
