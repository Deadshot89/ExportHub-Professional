const DATA_MODE=process.env.PROFESSIONAL_DATA_MODE||'migration-read-only';
let pool=null;
function configured(){return !!String(process.env.PROFESSIONAL_DATABASE_URL||'').trim();}
function writesEnabled(){return DATA_MODE==='live' && process.env.PROFESSIONAL_ENABLE_WRITES==='true';}
function controlWritesEnabled(){return process.env.PROFESSIONAL_ENABLE_CONTROL_WRITES==='true';}
function status(){return {configured:configured(),dataMode:DATA_MODE,writesEnabled:writesEnabled(),controlWritesEnabled:controlWritesEnabled()};}
function getPool(){
  if(!configured()) throw Object.assign(new Error('Professional database is not configured.'),{code:'DATABASE_NOT_CONFIGURED'});
  if(!pool){const {Pool}=require('pg');pool=new Pool({connectionString:process.env.PROFESSIONAL_DATABASE_URL,max:Number(process.env.PROFESSIONAL_DB_POOL_MAX||5),ssl:process.env.PROFESSIONAL_DATABASE_SSL==='false'?false:{rejectUnauthorized:true}});}
  return pool;
}
async function transact(client,fn,{write=false,readOnly=false}={}){
  await client.query(readOnly?'BEGIN READ ONLY':'BEGIN');
  try{const result=await fn(client);if(write)await client.query('COMMIT');else await client.query('ROLLBACK');return result;}
  catch(err){try{await client.query('ROLLBACK')}catch{};throw err;}
}
async function withTenantClient(tenantId,fn,{write=false}={}){
  const tid=String(tenantId||'').trim();if(!tid)throw Object.assign(new Error('Tenant required.'),{code:'TENANT_REQUIRED'});
  if(write&&!writesEnabled())throw Object.assign(new Error('Writes are disabled in Professional migration mode.'),{code:'WRITE_DISABLED_MIGRATION_MODE'});
  const client=await getPool().connect();
  try{return await transact(client,async c=>{await c.query("select set_config('app.tenant_id',$1,true)",[tid]);return fn(c);},{write,readOnly:!write});}finally{client.release();}
}
async function withTenantControlClient(tenantId,fn,{write=false}={}){
  const tid=String(tenantId||'').trim();if(!tid)throw Object.assign(new Error('Tenant required.'),{code:'TENANT_REQUIRED'});
  if(write&&!controlWritesEnabled())throw Object.assign(new Error('Control writes are disabled.'),{code:'CONTROL_WRITES_DISABLED'});
  const client=await getPool().connect();
  try{return await transact(client,async c=>{await c.query("select set_config('app.tenant_id',$1,true)",[tid]);return fn(c);},{write,readOnly:!write});}finally{client.release();}
}
async function withControlClient(fn,{write=false}={}){
  if(write&&!controlWritesEnabled())throw Object.assign(new Error('Control writes are disabled.'),{code:'CONTROL_WRITES_DISABLED'});
  const client=await getPool().connect();
  try{return await fn(client);}finally{client.release();}
}
module.exports={configured,writesEnabled,controlWritesEnabled,status,withTenantClient,withTenantControlClient,withControlClient};
