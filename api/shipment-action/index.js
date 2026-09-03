const authz=require('../shared/authorization');
const http=require('../shared/http');

const APPROVED_ACTIONS=new Set(['mark-created','confirm-ready','cancel','set-rework','clear-rework','archive','restore']);

module.exports=async function(context,req){
  try{
    const {session}=await authz.requireSession(req,{permission:'shipments.write',csrf:true});
    const tenantId=session.tenant_id;
    const shipmentId=req.params?.shipmentId;
    const action=String(req.params?.action||'').trim().toLowerCase();
    if(!tenantId||!shipmentId)throw Object.assign(new Error('Sendung wurde nicht gefunden.'),{code:'SHIPMENT_NOT_FOUND'});
    if(!APPROVED_ACTIONS.has(action))throw Object.assign(new Error('Unbekannte Sendungsaktion.'),{code:'SHIPMENT_TRANSITION_INVALID'});
    http.bodyOf(req);
    throw Object.assign(new Error('Diese Lifecycle-Aktion ist noch nicht für LIVE-Schreibzugriffe freigegeben.'),{code:'SHIPMENT_TRANSITION_INVALID'});
  }catch(err){http.error(context,err);}
};
