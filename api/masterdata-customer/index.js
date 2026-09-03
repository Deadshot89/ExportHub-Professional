const authz=require('../shared/authorization');
const store=require('../shared/masterdata-store');
const http=require('../shared/http');

module.exports=async function(context,req){
  try{
    const customerId=context.bindingData?.customerId;
    if(String(req.method||'GET').toUpperCase()==='POST'){
      const {session}=await authz.requireSession(req,{permission:'customers.write',csrf:true});
      const customer=await store.updateCustomer(session.tenant_id,session.user_id,customerId,http.bodyOf(req));
      return http.json(context,200,{ok:true,customer});
    }
    const {session}=await authz.requireSession(req,{permission:'customers.read'});
    const customer=await store.getCustomer(session.tenant_id,customerId);
    return http.json(context,200,{ok:true,customer});
  }catch(err){http.error(context,err);}
};
