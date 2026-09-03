const authz=require('../shared/authorization');
const store=require('../shared/packaging-store');
const http=require('../shared/http');

module.exports=async function(context,req){
  try{
    const {session}=await authz.requireSession(req,{permission:'packaging.write',csrf:true});
    const body=http.bodyOf(req);
    if(typeof body.active!=='boolean')throw Object.assign(new Error('Status der Verpackungsart ist ungültig.'),{code:'INPUT_INVALID'});
    const packagingType=await store.setPackagingTypeActive(session.tenant_id,session.user_id,req.params?.packagingTypeId,body.active);
    return http.json(context,200,{ok:true,packagingType});
  }catch(err){http.error(context,err);}
};
