const authz=require('../shared/authorization');
const store=require('../shared/shipment-store');
const http=require('../shared/http');

module.exports=async function(context,req){
  try{
    if(String(req.method||'GET').toUpperCase()==='POST'){
      const {session}=await authz.requireSession(req,{permission:'shipments.write',csrf:true});
      const body=http.bodyOf(req);
      const operation=String(body.operation||'').trim().toLowerCase();
      if(operation==='set-carrier'){
        const shipment=await store.setShipmentCarrier(session.tenant_id,req.params?.shipmentId,session.user_id,{
          lockToken:body.lockToken,revision:body.revision,carrierId:body.carrierId,carrierRequiresAbd:body.carrierRequiresAbd
        });
        return http.json(context,200,{ok:true,shipment});
      }
      if(operation==='preview-one-off-recipient'){
        const preview=await store.previewOneOffRecipient(session.tenant_id,req.params?.shipmentId,{customerAccount:body.customerAccount});
        return http.json(context,200,{ok:true,preview});
      }
      if(operation==='convert-one-off-recipient'){
        const shipment=await store.convertOneOffRecipient(session.tenant_id,req.params?.shipmentId,session.user_id,{
          lockToken:body.lockToken,revision:body.revision,mode:body.mode,customerAccount:body.customerAccount,customerId:body.customerId
        });
        return http.json(context,200,{ok:true,shipment});
      }
      if(Object.prototype.hasOwnProperty.call(body,'colliRows')){
        const result=await store.replaceColliRows(session.tenant_id,req.params?.shipmentId,session.user_id,{
          lockToken:body.lockToken,
          revision:body.revision,
          rows:body.colliRows
        });
        return http.json(context,200,{ok:true,...result});
      }
      const shipment=await store.updateShipment(session.tenant_id,req.params?.shipmentId,session.user_id,{
        lockToken:body.lockToken,
        revision:body.revision,
        patch:body.patch
      });
      return http.json(context,200,{ok:true,shipment});
    }
    const {session}=await authz.requireSession(req,{permission:'shipments.read'});
    const shipment=await store.getShipment(session.tenant_id,req.params?.shipmentId);
    return http.json(context,200,{ok:true,shipment});
  }catch(err){http.error(context,err);}
};
