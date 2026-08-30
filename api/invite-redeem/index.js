const users=require('../shared/user-admin-store');const http=require('../shared/http');
module.exports=async function(context,req){try{const b=http.bodyOf(req);const result=await users.redeemInvitation(b.token,b.password);http.json(context,200,{ok:true,...result});}catch(err){http.error(context,err);}};
