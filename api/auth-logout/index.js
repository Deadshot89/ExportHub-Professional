const store=require('../shared/auth-store');const sec=require('../shared/auth-security');const http=require('../shared/http');
module.exports=async function(context,req){try{const raw=sec.sessionTokenFromRequest(req);if(raw)await store.revokeSession(raw);http.json(context,200,{ok:true},{'set-cookie':sec.cookieHeader('',{clear:true})});}catch(err){http.error(context,err);}};
