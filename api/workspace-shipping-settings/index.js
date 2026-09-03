'use strict';

const authz=require('../shared/authorization');
const store=require('../shared/workspace-settings-store');
const http=require('../shared/http');

module.exports=async function(context,req){
  try{
    if(String(req.method||'GET').toUpperCase()==='POST'){
      const {session}=await authz.requireSession(req,{permission:'workspace.shipping.write',csrf:true});
      const shipping=await store.updateShippingSettings(session.tenant_id,session.user_id,http.bodyOf(req));
      return http.json(context,200,{ok:true,shipping});
    }
    const {session}=await authz.requireSession(req,{permission:'workspace.shipping.read'});
    const shipping=await store.getShippingSettings(session.tenant_id);
    return http.json(context,200,{ok:true,shipping});
  }catch(err){http.error(context,err);}
};
