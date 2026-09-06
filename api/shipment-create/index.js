const authz=require('../shared/authorization');
const store=require('../shared/operations-store');
const http=require('../shared/http');

module.exports=async function(context,req){
  try{
    const {session}=await authz.requireSession(req,{permission:'shipments.write',csrf:true});
    const body=http.bodyOf(req);
    const shipment=await store.createShipment(session.tenant_id,body);
    return http.json(context,201,{ok:true,shipment});
  }catch(err){http.error(context,err);}
};
