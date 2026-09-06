const db=require('./database');

const FINISHED_STATUSES=new Set(['ABGESCHLOSSEN','ARCHIVIERT','STORNIERT','CANCELLED']);
const VERIFIED_DOCUMENT_STATUSES=new Set(['VERIFIED_INLINE','VERIFIED','AVAILABLE']);

function clampLimit(value,fallback,max){
  const n=Number(value);
  if(!Number.isFinite(n)||n<1)return fallback;
  return Math.min(Math.trunc(n),max);
}
function normalized(value){return String(value||'').trim();}
function upper(value){return normalized(value).toUpperCase();}
function dateOnly(value){
  if(!value)return '';
  if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}/.test(value))return value.slice(0,10);
  const date=new Date(value);if(Number.isNaN(date.getTime()))return '';
  return date.toISOString().slice(0,10);
}
function todayInBerlin(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const value=Object.fromEntries(parts.filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
function needsDocumentAction(document){
  if(!document||document.cutover_blocking===false)return false;
  return !VERIFIED_DOCUMENT_STATUSES.has(upper(document.verification_status));
}
function recoveryReason(document){
  const action=upper(document?.recovery_action),status=upper(document?.verification_status);
  if(action==='SOURCE_FILE_REQUIRED')return 'Quelldatei bzw. Nachweis muss ergänzt werden.';
  if(action==='REMOTE_CAPTURE_REQUIRED')return 'Remote gespeicherter Nachweis muss gesichert werden.';
  if(status==='CONTENT_MISSING')return 'Dateiinhalt fehlt.';
  if(status==='HASH_ERROR')return 'Dateiprüfung ist fehlgeschlagen.';
  return normalized(document?.recovery_action)||normalized(document?.verification_status)||'Dokument erfordert Prüfung.';
}
function buildOperationalTasks(shipments=[],documents=[]){
  const tasks=[];
  for(const shipment of shipments){
    if(shipment?.locked!==true)continue;
    const reference=normalized(shipment.reference)||'ohne Referenz';
    tasks.push({
      id:`shipment:${shipment.id}:lock`,source:'shipment',sourceId:shipment.id,reference,
      kind:'SHIPMENT_LOCK',priority:'critical',title:`Sendung ${reference} gesperrt`,
      reason:normalized(shipment.lock_reason)||'Sendung ist für die weitere Bearbeitung gesperrt.',
      status:normalized(shipment.status),createdAt:shipment.created_at||null
    });
  }
  for(const document of documents){
    if(!needsDocumentAction(document))continue;
    const reference=normalized(document.shipment_reference)||'ohne Sendungsreferenz';
    const kind=normalized(document.kind)||'Dokument';
    tasks.push({
      id:`document:${document.id}:recovery`,source:'document',sourceId:document.id,shipmentId:document.shipment_id||null,reference,
      kind:'DOCUMENT_RECOVERY',priority:upper(document.migration_priority)==='BLOCKING'?'critical':'warning',
      title:`Dokument ${kind} prüfen`,reason:recoveryReason(document),
      verificationStatus:normalized(document.verification_status),createdAt:document.created_at||null
    });
  }
  return tasks;
}
function buildOperationsSummary(shipments=[],documents=[],tasks=[],today=todayInBerlin()){
  return {
    totalShipments:shipments.length,
    openShipments:shipments.filter(shipment=>!FINISHED_STATUSES.has(upper(shipment.status))).length,
    pickupsToday:shipments.filter(shipment=>dateOnly(shipment.actual_pickup_date)===today).length,
    totalDocuments:documents.length,
    documentActions:documents.filter(needsDocumentAction).length,
    actionRequired:tasks.length,
    lockedShipments:shipments.filter(shipment=>shipment?.locked===true).length
  };
}
async function listShipments(tenantId,{limit=250,query='',status=''}={}){
  const take=clampLimit(limit,250,500),q=normalized(query),state=normalized(status);
  return db.withTenantClient(tenantId,async client=>{
    const params=[],where=[];
    if(q){params.push(`%${q}%`);where.push(`(s.reference ilike $${params.length} or coalesce(c.account,'') ilike $${params.length} or coalesce(c.name,'') ilike $${params.length} or coalesce(l.name,'') ilike $${params.length})`);}
    if(state){params.push(state);where.push(`s.status=$${params.length}`);}
    params.push(take);
    const result=await client.query(`
      select s.id,s.reference,s.status,s.source_status,s.process_status,s.pod_evidence,s.locked,s.lock_reason,
             s.picked_up_at,s.actual_pickup_date,s.created_at,
             c.account as customer_account,c.name as customer_name,
             l.name as location_name,l.country as location_country
        from shipments s
        left join customers c on c.id=s.customer_id and c.tenant_id=s.tenant_id
        left join customer_locations l on l.id=s.location_id and l.tenant_id=s.tenant_id
        ${where.length?`where ${where.join(' and ')}`:''}
       order by s.created_at desc,s.reference asc
       limit $${params.length}` ,params);
    return result.rows;
  });
}
async function listDocuments(tenantId,{limit=500,query='',shipmentId=''}={}){
  const take=clampLimit(limit,500,1000),q=normalized(query),sid=normalized(shipmentId);
  return db.withTenantClient(tenantId,async client=>{
    const params=[],where=[];
    if(q){params.push(`%${q}%`);where.push(`(coalesce(s.reference,'') ilike $${params.length} or d.original_name ilike $${params.length} or d.kind ilike $${params.length})`);}
    if(sid){params.push(sid);where.push(`d.shipment_id::text=$${params.length}`);}
    params.push(take);
    const result=await client.query(`
      select d.id,d.shipment_id,d.customer_id,d.kind,d.original_name,d.sha256,d.storage_key,d.verification_status,
             d.migration_priority,d.cutover_blocking,d.remote_source_class,d.recovery_action,d.created_at,
             s.reference as shipment_reference,c.account as customer_account,c.name as customer_name
        from documents d
        left join shipments s on s.id=d.shipment_id and s.tenant_id=d.tenant_id
        left join customers c on c.id=d.customer_id and c.tenant_id=d.tenant_id
        ${where.length?`where ${where.join(' and ')}`:''}
       order by d.created_at desc,d.original_name asc
       limit $${params.length}` ,params);
    return result.rows;
  });
}
async function listTasks(tenantId){
  const [shipments,documents]=await Promise.all([listShipments(tenantId,{limit:500}),listDocuments(tenantId,{limit:1000})]);
  return buildOperationalTasks(shipments,documents);
}
async function getOperationsSnapshot(tenantId){
  const [shipments,documents]=await Promise.all([listShipments(tenantId,{limit:500}),listDocuments(tenantId,{limit:1000})]);
  const tasks=buildOperationalTasks(shipments,documents);
  return {
    live:true,source:'professional-postgresql-readonly',generatedAt:new Date().toISOString(),
    summary:buildOperationsSummary(shipments,documents,tasks),
    shipments:shipments.slice(0,8),tasks:tasks.slice(0,10)
  };
}

module.exports={listShipments,listDocuments,listTasks,buildOperationalTasks,buildOperationsSummary,getOperationsSnapshot,needsDocumentAction,todayInBerlin};
