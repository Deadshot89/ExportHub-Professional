const store=require('../shared/auth-store');const http=require('../shared/http');
module.exports=async function(context){try{const s=await store.onboardingStatus();http.json(context,200,{ok:true,...s});}catch(err){http.error(context,err);}};
