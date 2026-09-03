const authz=require('../shared/authorization');
const store=require('../shared/carrier-store');
const http=require('../shared/http');

module.exports=async function(context,req){
  try{
    const {session}=await authz.requireSession(req,{permission:'carriers.write',csrf:true});
    const body=http.bodyOf(req);
    if(typeof body.active!=='boolean')throw Object.assign(new Error('Status der Spedition ist ungültig.'),{code:'INPUT_INVALID'});
    const carrier=await store.setCarrierActive(session.tenant_id,session.user_id,req.params?.carrierId,body.active);
    return http.json(context,200,{ok:true,carrier});
  }catch(err){http.error(context,err);}
};
