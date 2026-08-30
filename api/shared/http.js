function json(context,status,body,headers={}){
  context.res={status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers},body};
}
function error(context,err,status){
  const code=String(err&&err.code||'INTERNAL_ERROR');
  const map={
    INPUT_INVALID:400,LOGIN_INVALID:400,PASSWORD_TOO_SHORT:400,PASSWORD_TOO_LONG:400,TENANT_SLUG_INVALID:400,EMAIL_INVALID:400,ROLE_INVALID:400,
    AUTH_INVALID:401,SESSION_INVALID:401,SESSION_EXPIRED:401,TOKEN_INVALID:400,AUTH_LOCKED:423,PASSWORD_RESET_REQUIRED:403,BOOTSTRAP_DENIED:403,FORBIDDEN:403,CSRF_INVALID:403,SELF_ADMIN_CHANGE_DENIED:409,LAST_TENANT_ADMIN:409,USER_EXISTS:409,USER_NOT_FOUND:404,ONBOARDING_ALREADY_COMPLETED:409,
    DATABASE_NOT_CONFIGURED:503,CONTROL_WRITES_DISABLED:503,SESSION_SECRET_NOT_CONFIGURED:503,BOOTSTRAP_NOT_CONFIGURED:503
  };
  json(context,status||map[code]||500,{ok:false,code,message:(status||map[code])&&Number(status||map[code])<500?String(err&&err.message||code):'Serverfunktion derzeit nicht verfügbar.'});
}
function bodyOf(req){
  const b=req&&req.body;
  if(!b) return {};
  if(typeof b==='object') return b;
  try{return JSON.parse(String(b));}catch{throw Object.assign(new Error('JSON-Anfrage ist ungültig.'),{code:'INPUT_INVALID'});}
}
module.exports={json,error,bodyOf};
