const authz=require('../shared/authorization');
const store=require('../shared/shipment-store');
const http=require('../shared/http');

module.exports=async function(context,req){
  try{
    const {session}=await authz.requireSession(req,{permission:'shipments.read'});
    const dashboard=await store.getShipmentDashboard(session.tenant_id,{});
    return http.json(context,200,{ok:true,dashboard});
  }catch(err){http.error(context,err);}
};
