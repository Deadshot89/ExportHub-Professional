const authz=require('../shared/authorization');
const store=require('../shared/masterdata-store');
const http=require('../shared/http');

module.exports=async function(context,req){
  try{
    const {session}=await authz.requireSession(req,{permission:'customers.write',csrf:true});
    const customer=await store.setCustomerActive(session.tenant_id,session.user_id,context.bindingData?.customerId,http.bodyOf(req).active);
    return http.json(context,200,{ok:true,customer});
  }catch(err){http.error(context,err);}
};
