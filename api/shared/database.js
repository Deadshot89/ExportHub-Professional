const DATA_MODE=process.env.PROFESSIONAL_DATA_MODE||'migration-read-only';
const {applyMasterdataSchema}=require('./masterdata-schema');
const {applyShipmentSchema}=require('./shipment-schema');
let pool=null;
let masterdataSchemaPromise=null;
let masterdataSchemaReady=false;
let shipmentSchemaPromise=null;
let shipmentSchemaReady=false;
function configured(){return !!String(process.env.PROFESSIONAL_DATABASE_URL||'').trim();}
function writesEnabled(){return DATA_MODE==='live' && process.env.PROFESSIONAL_ENABLE_WRITES==='true';}
function controlWritesEnabled(){return process.env.PROFESSIONAL_ENABLE_CONTROL_WRITES==='true';}
function masterdataWritesEnabled(){return process.env.PROFESSIONAL_ENABLE_MASTERDATA_WRITES==='true';}
function shipmentWritesEnabled(){return process.env.PROFESSIONAL_ENABLE_SHIPMENT_WRITES==='true';}
function status(){return {configured:configured(),dataMode:DATA_MODE,writesEnabled:writesEnabled(),controlWritesEnabled:controlWritesEnabled(),masterdataWritesEnabled:masterdataWritesEnabled(),shipmentWritesEnabled:shipmentWritesEnabled()};}
function getPool(){
  if(!configured()) throw Object.assign(new Error('Professional database is not configured.'),{code:'DATABASE_NOT_CONFIGURED'});
  if(!pool){const {Pool}=require('pg');pool=new Pool({connectionString:process.env.PROFESSIONAL_DATABASE_URL,max:Number(process.env.PROFESSIONAL_DB_POOL_MAX||5),ssl:process.env.PROFESSIONAL_DATABASE_SSL==='false'?false:{rejectUnauthorized:true}});}
  return pool;
}
async function ensureMasterdataSchema(){
  if(masterdataSchemaReady)return true;
  if(!controlWritesEnabled())throw Object.assign(new Error('Stammdaten-Schemaaktualisierung ist deaktiviert.'),{code:'MASTERDATA_SCHEMA_UPGRADE_DISABLED'});
  if(!masterdataSchemaPromise){
    masterdataSchemaPromise=(async()=>{
      const client=await getPool().connect();
      try{await applyMasterdataSchema(client);masterdataSchemaReady=true;return true;}
      finally{client.release();}
    })().catch(err=>{masterdataSchemaPromise=null;throw err;});
  }
  return masterdataSchemaPromise;
}
async function ensureShipmentSchema(){
  if(shipmentSchemaReady)return true;
  if(!controlWritesEnabled())throw Object.assign(new Error('Sendungs-Schemaaktualisierung ist deaktiviert.'),{code:'SHIPMENT_SCHEMA_UPGRADE_DISABLED'});
  if(!shipmentSchemaPromise){
    shipmentSchemaPromise=(async()=>{
      const client=await getPool().connect();
      try{await applyShipmentSchema(client);shipmentSchemaReady=true;return true;}
      finally{client.release();}
    })().catch(err=>{shipmentSchemaPromise=null;throw err;});
  }
  return shipmentSchemaPromise;
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
async function withTenantMasterdataClient(tenantId,fn,{write=false}={}){
  const tid=String(tenantId||'').trim();if(!tid)throw Object.assign(new Error('Tenant required.'),{code:'TENANT_REQUIRED'});
  if(write&&!masterdataWritesEnabled())throw Object.assign(new Error('Stammdaten-Schreibzugriffe sind deaktiviert.'),{code:'MASTERDATA_WRITES_DISABLED'});
  await ensureMasterdataSchema();
  const client=await getPool().connect();
  try{return await transact(client,async c=>{await c.query("select set_config('app.tenant_id',$1,true)",[tid]);return fn(c);},{write,readOnly:!write});}finally{client.release();}
}
async function withTenantShipmentClient(tenantId,fn,{write=false}={}){
  const tid=String(tenantId||'').trim();if(!tid)throw Object.assign(new Error('Tenant required.'),{code:'TENANT_REQUIRED'});
  if(write&&!shipmentWritesEnabled())throw Object.assign(new Error('Sendungs-Schreibzugriffe sind deaktiviert.'),{code:'SHIPMENT_WRITES_DISABLED'});
  await ensureShipmentSchema();
  const client=await getPool().connect();
  try{return await transact(client,async c=>{await c.query("select set_config('app.tenant_id',$1,true)",[tid]);return fn(c);},{write,readOnly:!write});}finally{client.release();}
}
async function withControlClient(fn,{write=false}={}){
  if(write&&!controlWritesEnabled())throw Object.assign(new Error('Control writes are disabled.'),{code:'CONTROL_WRITES_DISABLED'});
  const client=await getPool().connect();
  try{return await fn(client);}finally{client.release();}
}
module.exports={configured,writesEnabled,controlWritesEnabled,masterdataWritesEnabled,shipmentWritesEnabled,status,ensureShipmentSchema,withTenantClient,withTenantControlClient,withTenantMasterdataClient,withTenantShipmentClient,withControlClient};
