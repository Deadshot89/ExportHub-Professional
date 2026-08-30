const crypto=require('crypto');
const {promisify}=require('util');
const scryptAsync=promisify(crypto.scrypt);

const SESSION_COOKIE='exporthub_professional_session';
const DUMMY_PASSWORD_HASH='scrypt$16384$8$1$RXhwb3J0SFVCRHVtbXlTYWx0IQ$OBTU1EX-VyU28xpA-hXOfSBV-p8kvjm0YBc4gwcp8pyh5S0Evskt2gQ3tnwX7jfkkMJmm0wQeZAD-4dp1Sy0Gg';
const SESSION_HOURS=Math.min(24,Math.max(1,Number(process.env.PROFESSIONAL_SESSION_HOURS||8)));
const SCRYPT_N=16384, SCRYPT_R=8, SCRYPT_P=1, KEY_LEN=64;

function normalizeLogin(value){
  return String(value||'').normalize('NFKC').trim().toLowerCase();
}
function normalizeSlug(value){
  return String(value||'').normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'').replace(/-{2,}/g,'');
}
function validatePassword(value){
  const p=String(value||'');
  if(p.length<12) throw Object.assign(new Error('Passwort muss mindestens 12 Zeichen lang sein.'),{code:'PASSWORD_TOO_SHORT'});
  if(p.length>200) throw Object.assign(new Error('Passwort ist zu lang.'),{code:'PASSWORD_TOO_LONG'});
  return p;
}
function validateLogin(value){
  const v=normalizeLogin(value);
  if(v.length<3 || v.length>120) throw Object.assign(new Error('Anmeldename ist ungültig.'),{code:'LOGIN_INVALID'});
  return v;
}
function validateSlug(value){
  const v=normalizeSlug(value);
  if(v.length<3 || v.length>60 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(v)) throw Object.assign(new Error('Workspace-ID ist ungültig.'),{code:'TENANT_SLUG_INVALID'});
  return v;
}
async function hashPassword(password){
  const p=validatePassword(password),salt=crypto.randomBytes(16);
  const key=await scryptAsync(p,salt,KEY_LEN,{N:SCRYPT_N,r:SCRYPT_R,p:SCRYPT_P,maxmem:64*1024*1024});
  return ['scrypt',SCRYPT_N,SCRYPT_R,SCRYPT_P,salt.toString('base64url'),Buffer.from(key).toString('base64url')].join('$');
}
async function verifyPassword(password,encoded){
  try{
    const [alg,n,r,p,saltB64,keyB64]=String(encoded||'').split('$');
    if(alg!=='scrypt') return false;
    const N=Number(n),R=Number(r),P=Number(p);
    if(N!==SCRYPT_N||R!==SCRYPT_R||P!==SCRYPT_P) return false;
    const expected=Buffer.from(keyB64,'base64url');
    if(expected.length!==KEY_LEN) return false;
    const key=await scryptAsync(String(password||''),Buffer.from(saltB64,'base64url'),KEY_LEN,{N,R,p:P,maxmem:64*1024*1024});
    return crypto.timingSafeEqual(expected,Buffer.from(key));
  }catch{return false;}
}
function sessionSecret(){
  const s=String(process.env.PROFESSIONAL_SESSION_SECRET||'');
  if(s.length<32) throw Object.assign(new Error('PROFESSIONAL_SESSION_SECRET ist nicht sicher konfiguriert.'),{code:'SESSION_SECRET_NOT_CONFIGURED'});
  return s;
}
function newSessionToken(tenantId){
  const tid=String(tenantId||'').trim();
  if(!/^[0-9a-f-]{36}$/i.test(tid)) throw Object.assign(new Error('Tenant-ID ist ungültig.'),{code:'TENANT_INVALID'});
  return tid+'.'+crypto.randomBytes(32).toString('base64url');
}
function tenantIdFromSessionToken(token){
  const tid=String(token||'').split('.',1)[0];
  return /^[0-9a-f-]{36}$/i.test(tid)?tid:'';
}
function tokenHash(token){return crypto.createHash('sha256').update(String(token||''),'utf8').digest('hex');}
function csrfToken(token){return crypto.createHmac('sha256',sessionSecret()).update('csrf:'+String(token||'')).digest('base64url');}
function sessionExpiresAt(){return new Date(Date.now()+SESSION_HOURS*3600*1000);}
function cookieHeader(token,{clear=false}={}){
  const maxAge=clear?0:SESSION_HOURS*3600;
  return `${SESSION_COOKIE}=${clear?'':encodeURIComponent(String(token||''))}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
function parseCookies(req){
  const raw=String(req?.headers?.cookie||req?.headers?.Cookie||'');
  const out={}; raw.split(';').forEach(part=>{const i=part.indexOf('=');if(i>0)out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim())});return out;
}
function sessionTokenFromRequest(req){return parseCookies(req)[SESSION_COOKIE]||'';}
function safeEqual(a,b){
  const aa=Buffer.from(String(a||'')),bb=Buffer.from(String(b||''));
  return aa.length===bb.length && crypto.timingSafeEqual(aa,bb);
}
function assertBootstrapToken(req){
  const expected=String(process.env.PROFESSIONAL_BOOTSTRAP_TOKEN||'');
  if(expected.length<24) throw Object.assign(new Error('Bootstrap ist nicht konfiguriert.'),{code:'BOOTSTRAP_NOT_CONFIGURED'});
  const got=String(req?.headers?.['x-professional-bootstrap-token']||req?.headers?.['X-Professional-Bootstrap-Token']||'');
  if(!safeEqual(got,expected)) throw Object.assign(new Error('Bootstrap-Berechtigung abgelehnt.'),{code:'BOOTSTRAP_DENIED'});
  return true;
}
module.exports={SESSION_COOKIE,SESSION_HOURS,DUMMY_PASSWORD_HASH,normalizeLogin,normalizeSlug,validatePassword,validateLogin,validateSlug,hashPassword,verifyPassword,newSessionToken,tenantIdFromSessionToken,tokenHash,csrfToken,sessionExpiresAt,cookieHeader,sessionTokenFromRequest,assertBootstrapToken};
