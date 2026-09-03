'use strict';

const db=require('./database');

function packagingError(code,message){return Object.assign(new Error(message),{code});}
function text(value){return value==null?'':String(value).trim();}
function optionalNumber(value,label){
  if(value===null||value===undefined||String(value).trim()==='')return null;
  const n=Number(value);
  if(!Number.isFinite(n)||n<=0)throw packagingError('INPUT_INVALID',`${label} muss größer als 0 sein.`);
  return n;
}
function nonNegativeNumber(value,label){
  if(value===null||value===undefined||String(value).trim()==='')return null;
  const n=Number(value);
  if(!Number.isFinite(n)||n<0)throw packagingError('INPUT_INVALID',`${label} darf nicht negativ sein.`);
  return n;
}
function bool(value,fallback=false){return value===undefined?fallback:value===true;}
function filterStatus(value){
  const v=text(value).toLowerCase();
  return v==='active'?true:(v==='inactive'?false:null);
}
function normalizeRow(row={}){
  return {
    id:text(row.id),name:text(row.name),active:row.active!==false,
    lengthCm:row.length_cm==null?null:Number(row.length_cm),
    widthCm:row.width_cm==null?null:Number(row.width_cm),
    heightCm:row.height_cm==null?null:Number(row.height_cm),
    ldmMode:text(row.ldm_mode).toUpperCase(),
    fixedLdmPerUnit:row.fixed_ldm_per_unit==null?null:Number(row.fixed_ldm_per_unit),
    allowLength:row.allow_length===true,allowWidth:row.allow_width===true,allowHeight:row.allow_height!==false,
    createdAt:row.created_at??null,updatedAt:row.updated_at??null
  };
}
function normalizePackagingType(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))throw packagingError('INPUT_INVALID','Verpackungsart ist ungültig.');
  const name=text(input.name);
  if(!name)throw packagingError('INPUT_INVALID','Name der Verpackungsart fehlt.');
  const ldmMode=text(input.ldmMode??input.ldm_mode).toUpperCase();
  if(!['FIXED_PER_UNIT','FOOTPRINT'].includes(ldmMode))throw packagingError('INPUT_INVALID','LDM-Regel muss FIXED_PER_UNIT oder FOOTPRINT sein.');
  const allowLength=bool(input.allowLength??input.allow_length,false);
  const allowWidth=bool(input.allowWidth??input.allow_width,false);
  const allowHeight=bool(input.allowHeight??input.allow_height,true);
  const lengthCm=optionalNumber(input.lengthCm??input.length_cm,'Länge');
  const widthCm=optionalNumber(input.widthCm??input.width_cm,'Breite');
  const heightCm=optionalNumber(input.heightCm??input.height_cm,'Höhe');
  let fixedLdmPerUnit=nonNegativeNumber(input.fixedLdmPerUnit??input.fixed_ldm_per_unit,'Feste LDM pro Einheit');
  if(ldmMode==='FIXED_PER_UNIT'){
    if(fixedLdmPerUnit===null)throw packagingError('INPUT_INVALID','Für FIXED_PER_UNIT ist eine feste LDM pro Einheit erforderlich.');
  }else{
    fixedLdmPerUnit=null;
    if(!allowLength&&lengthCm===null)throw packagingError('INPUT_INVALID','Für FOOTPRINT ist eine feste Länge oder eine freigegebene Längeneingabe erforderlich.');
    if(!allowWidth&&widthCm===null)throw packagingError('INPUT_INVALID','Für FOOTPRINT ist eine feste Breite oder eine freigegebene Breiteneingabe erforderlich.');
  }
  return {name,lengthCm,widthCm,heightCm,ldmMode,fixedLdmPerUnit,allowLength,allowWidth,allowHeight};
}
function mapDatabaseError(err){
  if(err?.code==='23505'&&String(err.constraint||'').includes('packaging_types'))return packagingError('PACKAGING_TYPE_EXISTS','Diese Verpackungsart existiert bereits.');
  return err;
}
async function withPackagingClient(tenantId,fn,{write=false}={}){
  await db.ensureShipmentSchema();
  return db.withTenantMasterdataClient(tenantId,fn,{write});
}
async function audit(client,tenantId,userId,eventType,entityId,metadata={}){
  await client.query('insert into audit_events(tenant_id,user_id,event_type,entity_type,entity_id,metadata) values($1,$2,$3,\'PACKAGING_TYPE\',$4,$5::jsonb)',[tenantId,userId||null,eventType,entityId,JSON.stringify(metadata)]);
}
async function getPackagingTypeInClient(client,tenantId,packagingTypeId){
  const result=await client.query(`select id,name,active,length_cm,width_cm,height_cm,ldm_mode,fixed_ldm_per_unit,allow_length,allow_width,allow_height,created_at,updated_at
    from packaging_types where tenant_id=$1 and id=$2 limit 1`,[tenantId,packagingTypeId]);
  return result.rows?.[0]?normalizeRow(result.rows[0]):null;
}
async function listPackagingTypes(tenantId,{status='active'}={}){
  const active=filterStatus(status);
  return withPackagingClient(tenantId,async client=>{
    const params=[tenantId],where=['tenant_id=$1'];
    if(active!==null){params.push(active);where.push(`active=$${params.length}`);}
    const result=await client.query(`select id,name,active,length_cm,width_cm,height_cm,ldm_mode,fixed_ldm_per_unit,allow_length,allow_width,allow_height,created_at,updated_at
      from packaging_types where ${where.join(' and ')} order by lower(name),created_at`,params);
    return (result.rows||[]).map(normalizeRow);
  });
}
async function getPackagingType(tenantId,packagingTypeId){
  return withPackagingClient(tenantId,async client=>{
    const value=await getPackagingTypeInClient(client,tenantId,packagingTypeId);
    if(!value)throw packagingError('PACKAGING_TYPE_NOT_FOUND','Verpackungsart wurde nicht gefunden.');
    return value;
  });
}
async function createPackagingType(tenantId,userId,input={}){
  const value=normalizePackagingType(input);
  try{
    return await withPackagingClient(tenantId,async client=>{
      const result=await client.query(`insert into packaging_types(tenant_id,name,active,length_cm,width_cm,height_cm,ldm_mode,fixed_ldm_per_unit,allow_length,allow_width,allow_height,updated_at)
        values($1,$2,true,$3,$4,$5,$6,$7,$8,$9,$10,now())
        returning id,name,active,length_cm,width_cm,height_cm,ldm_mode,fixed_ldm_per_unit,allow_length,allow_width,allow_height,created_at,updated_at`,[
        tenantId,value.name,value.lengthCm,value.widthCm,value.heightCm,value.ldmMode,value.fixedLdmPerUnit,value.allowLength,value.allowWidth,value.allowHeight
      ]);
      const created=normalizeRow(result.rows[0]);
      await audit(client,tenantId,userId,'PACKAGING_TYPE_CREATED',created.id,{name:created.name,ldmMode:created.ldmMode});
      return created;
    },{write:true});
  }catch(err){throw mapDatabaseError(err);}
}
async function updatePackagingType(tenantId,userId,packagingTypeId,input={}){
  const value=normalizePackagingType(input);
  try{
    return await withPackagingClient(tenantId,async client=>{
      const result=await client.query(`update packaging_types set name=$3,length_cm=$4,width_cm=$5,height_cm=$6,ldm_mode=$7,fixed_ldm_per_unit=$8,allow_length=$9,allow_width=$10,allow_height=$11,updated_at=now()
        where tenant_id=$1 and id=$2
        returning id,name,active,length_cm,width_cm,height_cm,ldm_mode,fixed_ldm_per_unit,allow_length,allow_width,allow_height,created_at,updated_at`,[
        tenantId,packagingTypeId,value.name,value.lengthCm,value.widthCm,value.heightCm,value.ldmMode,value.fixedLdmPerUnit,value.allowLength,value.allowWidth,value.allowHeight
      ]);
      if(!result.rows?.[0])throw packagingError('PACKAGING_TYPE_NOT_FOUND','Verpackungsart wurde nicht gefunden.');
      const updated=normalizeRow(result.rows[0]);
      await audit(client,tenantId,userId,'PACKAGING_TYPE_UPDATED',updated.id,{name:updated.name,ldmMode:updated.ldmMode});
      return updated;
    },{write:true});
  }catch(err){throw mapDatabaseError(err);}
}
async function setPackagingTypeActive(tenantId,userId,packagingTypeId,active){
  const next=active===true;
  return withPackagingClient(tenantId,async client=>{
    const result=await client.query(`update packaging_types set active=$3,updated_at=now() where tenant_id=$1 and id=$2
      returning id,name,active,length_cm,width_cm,height_cm,ldm_mode,fixed_ldm_per_unit,allow_length,allow_width,allow_height,created_at,updated_at`,[tenantId,packagingTypeId,next]);
    if(!result.rows?.[0])throw packagingError('PACKAGING_TYPE_NOT_FOUND','Verpackungsart wurde nicht gefunden.');
    const updated=normalizeRow(result.rows[0]);
    await audit(client,tenantId,userId,next?'PACKAGING_TYPE_ACTIVATED':'PACKAGING_TYPE_DEACTIVATED',updated.id,{name:updated.name});
    return updated;
  },{write:true});
}

module.exports={normalizePackagingType,listPackagingTypes,getPackagingType,createPackagingType,updatePackagingType,setPackagingTypeActive};
