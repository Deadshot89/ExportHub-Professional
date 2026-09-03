const authz=require('../shared/authorization');
const store=require('../shared/shipment-store');
const http=require('../shared/http');

module.exports=async function(context,req){
  try{
    const {session}=await authz.requireSession(req,{permission:'shipments.write',csrf:true});
    const body=http.bodyOf(req);
    const shipmentId=req.params?.shipmentId;
    if(String(req.method||'POST').toUpperCase()==='DELETE'){
      const lock=await store.releaseEditLock(session.tenant_id,shipmentId,session.user_id,body.lockToken);
      return http.json(context,200,{ok:true,released:true,lock});
    }
    const action=String(body.action||'acquire').trim().toLowerCase();
    if(action==='acquire'){
      const lock=await store.acquireEditLock(session.tenant_id,shipmentId,session.user_id);
      return http.json(context,200,{ok:true,lock});
    }
    if(action==='heartbeat'){
      const lock=await store.heartbeatEditLock(session.tenant_id,shipmentId,session.user_id,body.lockToken);
      return http.json(context,200,{ok:true,lock});
    }
    if(action==='release'){
      const lock=await store.releaseEditLock(session.tenant_id,shipmentId,session.user_id,body.lockToken);
      return http.json(context,200,{ok:true,released:true,lock});
    }
    if(action==='force-release'){
      const result=await store.forceReleaseEditLock(session.tenant_id,shipmentId,session.user_id,{role:session.role,reason:body.reason});
      return http.json(context,200,{ok:true,...result});
    }
    throw Object.assign(new Error('Unbekannte Sperraktion.'),{code:'INPUT_INVALID'});
  }catch(err){http.error(context,err);}
};
