const authz=require('../shared/authorization');
const store=require('../shared/masterdata-store');
const http=require('../shared/http');

module.exports=async function(context,req){
  try{
    if(String(req.method||'GET').toUpperCase()==='POST'){
      const {session}=await authz.requireSession(req,{permission:'customers.write',csrf:true});
      const customer=await store.createCustomer(session.tenant_id,session.user_id,http.bodyOf(req));
      return http.json(context,201,{ok:true,customer});
    }
    const {session}=await authz.requireSession(req,{permission:'customers.read'});
    const customers=await store.listCustomers(session.tenant_id,{query:req.query?.q||'',status:req.query?.status||'active'});
    return http.json(context,200,{ok:true,customers});
  }catch(err){http.error(context,err);}
};
