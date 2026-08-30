const BACKUP_TYPE = 'ExportHUB_BACKUP';
const PROFESSIONAL_VERSION = '0.5.0';

function q(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return q(v).toLowerCase(); }
function obj(v){ return !!v && typeof v === 'object' && !Array.isArray(v); }
function arr(v){ return Array.isArray(v) ? v : []; }
function clone(v){ return JSON.parse(JSON.stringify(v)); }
function normalizeKey(v){ return q(v).normalize('NFKC').toLowerCase().replace(/\s+/g,' '); }

function refOf(sh){ return q(sh && (sh.ref || sh.reference || sh.referenceNumber || sh.folderRef || sh.shipmentRef)); }
function shipmentIdOf(sh){ return q(sh && (sh.id || sh.shipmentId || sh.uuid || sh.savedShipmentId || sh.__savedShipmentId)); }
function customerIdOf(c){ return q(c && (c.id || c.customerId)); }
function customerAccountOf(c){ return q(c && (c.account || c.customerNumber || c.customerAccount || c.customerNo)); }
function customerNameOf(c){ return q(c && (c.name || c.customerName)); }
function userNameOf(u,key){ return q(u && (u.username || u.login || u.user || u.name || u.displayName || key)); }
function userDisplayNameOf(u,key){ return q(u && (u.name || u.displayName || u.user || u.username || u.login || key)); }

function looksLikeShipment(x){
  if(!obj(x)) return false;
  const ref = refOf(x);
  if(/^[A-Z0-9]{6}$/i.test(ref)) return true;
  return !!(shipmentIdOf(x) && (Array.isArray(x.rows) || q(x.customerName) || q(x.customerId) || q(x.pickupDate) || q(x.status) || Array.isArray(x.podFiles)));
}

function looksLikeLegacyBackup(payload){
  if(!obj(payload) || !obj(payload.state)) return false;
  const s=payload.state;
  return Array.isArray(s.shipments) && Array.isArray(s.customers) && (Array.isArray(payload.users) || obj(payload.users));
}

function looksLikeFile(x){
  if(!obj(x)) return false;
  const name = q(x.name || x.filename || x.fileName || x.originalName || x.title);
  if(!name) return false;
  return !!(q(x.data || x.dataUrl || x.base64 || x.url || x.downloadUrl || x.href || x.webUrl || x.podCloudBackupWebUrl || x.sharePointUrl || x.remoteUrl || x.cloudUrl) || x.contentStored === true || Number(x.size || 0) > 0 || q(x.mimeType) || /\.(pdf|docx?|xlsx?|csv|txt|zip|png|jpe?g|webp)$/i.test(name));
}

function fileNameOf(x){ return q(x.name || x.filename || x.fileName || x.originalName || x.title) || 'Dokument'; }
function filePayloadOf(x){ return q(x.data || x.dataUrl || x.base64); }
function fileUrlOf(x){ return q(x.url || x.downloadUrl || x.href || x.webUrl || x.podCloudBackupWebUrl || x.sharePointUrl || x.remoteUrl || x.cloudUrl); }
function fileMimeOf(x){ return q(x.type || x.mimeType); }

function classifyDocument(path, file){
  const s = low(path + ' ' + fileNameOf(file) + ' ' + q(file.kind || file.docKind || file.documentKind || file.source));
  if(/pod|proof.of.delivery|unterschrift|signed-loadlist/.test(s)) return 'POD';
  if(/lieferschein|delivery.?note|packing.?slip|dnc/.test(s)) return 'LIEFERSCHEIN';
  if(/(?:^|[^a-z0-9])abd(?:[^a-z0-9]|$)|ausfuhr|export.?declaration/.test(s)) return 'ABD';
  if(/(?:^|[^a-z0-9])cmr(?:[^a-z0-9]|$)/.test(s)) return 'CMR';
  if(/rechnung|invoice/.test(s)) return 'RECHNUNG';
  if(/ladeliste|load.?list/.test(s)) return 'LADELISTE';
  return 'DOKUMENT';
}

function shipmentCollections(state){
  const out=[];
  [['shipments', state.shipments], ['savedShipments', state.savedShipments], ['archive', state.archive]].forEach(([name,list])=>{
    arr(list).forEach((value,index)=>{
      if(name !== 'archive' || looksLikeShipment(value)) out.push({sourceCollection:name, sourceIndex:index, value});
    });
  });
  return out;
}

function shipmentIdentity(sh, pointer){
  const id=shipmentIdOf(sh), ref=refOf(sh);
  if(id) return 'id:'+normalizeKey(id);
  if(ref) return 'ref:'+normalizeKey(ref);
  return 'pointer:'+pointer;
}
function customerIdentity(c, pointer){
  const id=customerIdOf(c), acc=customerAccountOf(c), name=customerNameOf(c);
  if(id) return 'id:'+normalizeKey(id);
  if(acc) return 'account:'+normalizeKey(acc);
  if(name) return 'name:'+normalizeKey(name);
  return 'pointer:'+pointer;
}

function pickupEvidence(sh){
  if(!obj(sh)) return false;
  const raw=low([sh.status,sh.processStatus,sh.pickupStatus,sh.readinessStatus].join(' '));
  return !!(q(sh.pickedUpAt)||q(sh.actualPickupDate)||sh.pickupConfirmed===true||sh.warehouseCollected===true||/abgeholt|picked|collected/.test(raw));
}
function podEvidence(sh){
  if(!obj(sh)) return false;
  const raw=low([sh.status,sh.processStatus,sh.podStatus,sh.readinessStatus].join(' '));
  return !!(arr(sh.podFiles).length||sh.podConfirmed===true||sh.podAvailable===true||sh.podScanConfirmed===true||sh.signatureAvailable===true||/pod\s*vorhanden/.test(raw));
}
function canonicalStatusOf(sh){
  // Bei Bestandsmigration hat der aktuell gespeicherte Prozessstatus Vorrang vor alten Hilfsfeldern.
  // So werden historische completedAt/done-Felder nicht fälschlich zu einem neuen Status hochgestuft.
  const direct=q(sh&&sh.processStatus)||q(sh&&sh.status);
  const directLow=low(direct);
  if(/^(pod\s*vorhanden)$/.test(directLow)) return 'POD vorhanden';
  if(/^(abgeholt|picked(?:\s*up)?)$/.test(directLow)) return 'Abgeholt';
  if(/^(bereit\s*zur\s*abholung|ready\s*for\s*pickup)$/.test(directLow)) return 'Bereit zur Abholung';
  if(/^(vorbereitet)$/.test(directLow)) return 'Vorbereitet';
  if(/^(wartet\s*auf\s*abd)$/.test(directLow)) return 'Wartet auf ABD';
  if(/^(erstellt|created)$/.test(directLow)) return 'Erstellt';
  if(/^(abgeschlossen|completed|erledigt)$/.test(directLow)) return 'Abgeschlossen';
  if(/^(archiviert|archived)$/.test(directLow)) return 'Archiviert';
  if(/storn|cancel/.test(directLow)) return 'Storniert';
  if(/nachbearbeit/.test(directLow)) return 'Nachbearbeitung erforderlich';
  const raw=low([sh&&sh.status,sh&&sh.processStatus,sh&&sh.freigabe,sh&&sh.abdStatus,sh&&sh.readinessStatus].join(' '));
  if(/storn|cancel/.test(raw)) return 'Storniert';
  if(/archiv/.test(raw)) return 'Archiviert';
  if(/nachbearbeit/.test(raw)) return 'Nachbearbeitung erforderlich';
  if(podEvidence(sh)||/pod\s*vorhanden/.test(raw)) return 'POD vorhanden';
  if(pickupEvidence(sh)||/abgeholt|picked/.test(raw)) return 'Abgeholt';
  if(sh&&sh.warehousePrepared===true||/vorbereitet/.test(raw)) return 'Vorbereitet';
  if(sh&&sh.readyForPickup===true||/bereit.*abhol|ready.*pickup/.test(raw)) return 'Bereit zur Abholung';
  if(/wartet.*abd|abd.*wart/.test(raw)) return 'Wartet auf ABD';
  if(/abgeschlossen|completed|erledigt/.test(raw)) return 'Abgeschlossen';
  if(/erstellt|created/.test(raw)) return 'Erstellt';
  return 'Entwurf';
}
function sourcePriority(r){ return r.sourceCollection==='shipments'?0:r.sourceCollection==='savedShipments'?1:2; }
function updateStamp(sh){ return q(sh&& (sh._syncUpdatedAt || sh.updatedAt || sh.statusUpdatedAt || sh.updated || sh.createdIso || sh.created)); }
function choosePrimary(records){
  return records.slice().sort((a,b)=>{
    const p=sourcePriority(a)-sourcePriority(b); if(p) return p;
    return updateStamp(b.value).localeCompare(updateStamp(a.value));
  })[0];
}

function findDocuments(root, basePath, ownerType, ownerPointer, canonicalOwnerKey){
  const docs=[];
  const seen=new WeakSet();
  function walk(v,path,depth){
    if(depth>14 || v == null) return;
    if(obj(v)){
      if(seen.has(v)) return;
      seen.add(v);
      if(looksLikeFile(v)){
        docs.push({
          sourcePath:path,
          ownerType,
          ownerPointer,
          canonicalOwnerKey:q(canonicalOwnerKey),
          name:fileNameOf(v),
          kind:classifyDocument(path,v),
          mimeType:fileMimeOf(v),
          size:Number(v.size||0)||0,
          inlinePayload:filePayloadOf(v),
          remoteUrl:fileUrlOf(v),
          contentStored:v.contentStored === true,
          sourceId:q(v.id || v.remoteId || v.driveItemId || v.podCloudBackupDriveItemId),
          declaredHash:q(v.hash || v.sha256 || v.podCloudBackupHash),
          uploadedAt:q(v.uploadedAt || v.createdAt || v.savedAt || v.podBackupAt),
          uploadedBy:q(v.uploadedBy || v.user || v.createdBy)
        });
        return;
      }
      Object.keys(v).forEach(k=>walk(v[k], path ? path+'.'+k : k, depth+1));
      return;
    }
    if(Array.isArray(v)) v.forEach((x,i)=>walk(x, path+'['+i+']', depth+1));
  }
  walk(root,basePath,0);
  return docs;
}

function documentIdentity(d){
  const owner=q(d.canonicalOwnerKey||d.ownerPointer), id=q(d.sourceId), hash=q(d.declaredHash), name=normalizeKey(d.name), size=Number(d.size||0), kind=q(d.kind);
  if(id) return owner+'|id:'+normalizeKey(id);
  if(hash) return owner+'|hash:'+normalizeKey(hash);
  return owner+'|'+kind+'|'+name+'|'+size;
}

function knownAuditArrays(state){
  const names=['audit','auditLog','auditTrail','activityLog','history','logs','protocol','protokoll','protokolle'];
  const out=[];
  for(const name of names){ if(Array.isArray(state[name])) out.push({name, count:state[name].length}); }
  return out;
}

export function validateBackupPayload(payload, options={}){
  const errors=[], warnings=[];
  if(!obj(payload)) errors.push('BACKUP_NOT_OBJECT');
  if(obj(payload) && !obj(payload.state)) errors.push('BACKUP_STATE_MISSING');
  const typed=obj(payload)&&payload.type===BACKUP_TYPE;
  const legacy=looksLikeLegacyBackup(payload);
  if(obj(payload) && !typed && !legacy) errors.push('BACKUP_FORMAT_UNSUPPORTED');
  if(legacy && !typed) warnings.push('LEGACY_BACKUP_WITHOUT_METADATA');
  if(obj(payload) && !payload.version && !q(options.sourceVersionHint)) warnings.push('SOURCE_VERSION_MISSING');
  if(obj(payload) && !payload.exportedAt) warnings.push('SOURCE_TIMESTAMP_MISSING');
  if(obj(payload) && payload.users != null && !Array.isArray(payload.users) && !obj(payload.users)) warnings.push('USERS_FORMAT_UNKNOWN');
  return {ok:errors.length===0, errors, warnings, format:typed?'typed-exporthub-backup':(legacy?'legacy-state-users':'unknown')};
}

export function inventoryBackup(payload, options={}){
  const validation=validateBackupPayload(payload,options);
  if(!validation.ok) return {validation, inventory:null};
  const state=payload.state;
  const customers=arr(state.customers).map((value,index)=>({sourceCollection:'customers',sourceIndex:index,value}));
  const shipments=shipmentCollections(state);
  const users=Array.isArray(payload.users) ? payload.users.map((value,index)=>({sourceCollection:'users',sourceIndex:index,value})) : (obj(payload.users) ? Object.keys(payload.users).map((key,index)=>({sourceCollection:'users',sourceIndex:index,sourceKey:key,value:payload.users[key]})) : []);

  const semanticShipmentGroups=new Map();
  shipments.forEach(r=>{
    const pointer=`${r.sourceCollection}[${r.sourceIndex}]`, key=shipmentIdentity(r.value,pointer);
    if(!semanticShipmentGroups.has(key)) semanticShipmentGroups.set(key,[]);
    semanticShipmentGroups.get(key).push(r);
  });
  const semanticCustomerGroups=new Map();
  customers.forEach(r=>{
    const pointer=`customers[${r.sourceIndex}]`, key=customerIdentity(r.value,pointer);
    if(!semanticCustomerGroups.has(key)) semanticCustomerGroups.set(key,[]);
    semanticCustomerGroups.get(key).push(r);
  });

  const shipmentDocs=[];
  shipments.forEach(r=>{
    const pointer=`${r.sourceCollection}[${r.sourceIndex}]`, key=shipmentIdentity(r.value,pointer);
    shipmentDocs.push(...findDocuments(r.value,pointer,'shipment',pointer,key));
  });
  const abdDocs=[];
  arr(state.abdRequests).forEach((v,i)=>abdDocs.push(...findDocuments(v,`abdRequests[${i}]`,'abdRequest',`abdRequests[${i}]`,`abdRequest:${i}`)));
  const customerDocs=[];
  customers.forEach(r=>customerDocs.push(...findDocuments(r.value,`customers[${r.sourceIndex}]`,'customer',`customers[${r.sourceIndex}]`,customerIdentity(r.value,`customers[${r.sourceIndex}]`))));
  const documentSources=[...shipmentDocs,...abdDocs,...customerDocs];
  const canonicalDocumentGroups=new Map();
  documentSources.forEach(d=>{ const key=documentIdentity(d); if(!canonicalDocumentGroups.has(key)) canonicalDocumentGroups.set(key,[]); canonicalDocumentGroups.get(key).push(d); });

  const canonicalShipments=[...semanticShipmentGroups.entries()].map(([key,records])=>({key,records,primary:choosePrimary(records)}));
  const canonicalCustomers=[...semanticCustomerGroups.entries()].map(([key,records])=>({key,records,primary:records[0]}));
  const statusCounts={};
  let podEvidenceShipments=0,podFileShipments=0;
  canonicalShipments.forEach(g=>{
    const st=canonicalStatusOf(g.primary.value); statusCounts[st]=(statusCounts[st]||0)+1;
    if(g.records.some(r=>podEvidence(r.value))) podEvidenceShipments++;
    if(g.records.some(r=>arr(r.value.podFiles).length>0)) podFileShipments++;
  });
  const primaryPodFiles=arr(state.shipments).flatMap(sh=>arr(sh&&sh.podFiles));
  const primaryPodStats={entries:primaryPodFiles.length,inline:0,remote:0,metadataOnly:0};
  primaryPodFiles.forEach(f=>{if(filePayloadOf(f))primaryPodStats.inline++;else if(fileUrlOf(f))primaryPodStats.remote++;else primaryPodStats.metadataOnly++;});

  const collectionCounts={};
  Object.keys(state).forEach(k=>{ if(Array.isArray(state[k])) collectionCounts[k]=state[k].length; });
  const version=q(payload.version)||q(options.sourceVersionHint)||'unbekannt';
  return {
    validation,
    inventory:{
      source:{type:q(payload.type)||'LEGACY_EXPORT',format:validation.format,version,versionSource:q(payload.version)?'backup-metadata':(q(options.sourceVersionHint)?'user-confirmed-hint':'unknown'),exportedAt:q(payload.exportedAt),exportedBy:q(payload.exportedBy)},
      counts:{
        customers:customers.length,
        canonicalCustomers:canonicalCustomers.length,
        shipmentSourceRecords:shipments.length,
        canonicalShipmentGroups:canonicalShipments.length,
        users:users.length,
        documentSourceRecords:documentSources.length,
        documents:canonicalDocumentGroups.size,
        pods:[...canonicalDocumentGroups.values()].filter(g=>g[0].kind==='POD').length,
        podSourceRecords:documentSources.filter(d=>d.kind==='POD').length,
        podEvidenceShipments,
        podFileShipments,
        podFileEntries:primaryPodStats.entries,
        podFileInline:primaryPodStats.inline,
        podFileRemote:primaryPodStats.remote,
        podFileMetadataOnly:primaryPodStats.metadataOnly,
        deliveryNotes:[...canonicalDocumentGroups.values()].filter(g=>g[0].kind==='LIEFERSCHEIN').length,
        abdDocuments:[...canonicalDocumentGroups.values()].filter(g=>g[0].kind==='ABD').length,
        tasks:arr(state.tasks).length,
        abdRequests:arr(state.abdRequests).length,
        palletBookings:arr(state.palletBookings).length + arr(state.palletAccount).length,
        archiveEntries:arr(state.archive).length
      },
      statusCounts,
      collectionCounts,
      auditArrays:knownAuditArrays(state),
      duplicateShipmentGroups:canonicalShipments.filter(g=>g.records.length>1).map(g=>({key:g.key,pointers:g.records.map(r=>`${r.sourceCollection}[${r.sourceIndex}]`)})),
      duplicateCustomerGroups:canonicalCustomers.filter(g=>g.records.length>1).map(g=>({key:g.key,pointers:g.records.map(r=>`customers[${r.sourceIndex}]`)})),
      duplicateDocumentGroups:[...canonicalDocumentGroups.entries()].filter(([,g])=>g.length>1).map(([key,g])=>({key,pointers:g.map(d=>d.sourcePath)})),
      documentSources,
      canonicalDocumentGroups,
      shipments,
      canonicalShipments,
      customers,
      canonicalCustomers,
      users
    }
  };
}

function professionalRole(u){
  const role=low(u&&u.role), perms=arr(u&&u.permissions).map(low);
  if(/global.*admin|globaler administrator|plattform/.test(role)||perms.includes('*')) return 'PLATFORM_ADMIN';
  if(/funktions.*admin|tenant.*admin|firmen.*admin|admin/.test(role)) return 'TENANT_ADMIN';
  if(/export.*admin|exportleitung/.test(role)) return 'EXPORT_ADMIN';
  if(/team.*lead|teamleit/.test(role)) return 'TEAM_LEAD';
  if(/lager|warehouse|verlad/.test(role)) return 'WAREHOUSE';
  if(/audit|leser|reader/.test(role)) return 'AUDITOR';
  return 'OPERATOR';
}

function remoteSourceClass(url){
  const u=q(url);
  if(!u) return '';
  if(/^\/api\//i.test(u)) return 'EXPORTHUB_API';
  if(/sharepoint\.com/i.test(u)) return 'SHAREPOINT';
  if(/^https?:\/\//i.test(u)) return 'EXTERNAL_HTTP';
  return 'OTHER_REMOTE';
}
function documentMigrationStatus(group){
  if(group.some(x=>x.inlinePayload)) return 'VERIFIED_INLINE';
  if(group.some(x=>x.remoteUrl)) return 'REMOTE_CAPTURE_REQUIRED';
  return 'CONTENT_MISSING';
}
function migrationPriority(kind,status){
  if(kind==='POD' && status!=='VERIFIED_INLINE') return 'P0';
  if(kind==='ABD' && status!=='VERIFIED_INLINE') return 'P0';
  if(status==='REMOTE_CAPTURE_REQUIRED') return 'P1';
  if(status==='CONTENT_MISSING') return 'P1';
  return 'OK';
}

function locationNameOf(x){ return q(x && (x.name || x.locationName || x.siteName || x.standort || x.title)) || 'Standort'; }
function locationAddressOf(x){ return q(x && (x.address || x.recipientAddress || x.streetAddress || x.fullAddress)); }
function locationCountryOf(x){ return q(x && (x.country || x.land || x.destinationCountry || x.recipientCountry)); }
function locationIdOf(x){ return q(x && (x.id || x.locationId || x.siteId || x.uuid)); }
function locationIdentity(x){
  const id=locationIdOf(x); if(id) return 'id:'+normalizeKey(id);
  return 'nameaddr:'+normalizeKey(locationNameOf(x))+'|'+normalizeKey(locationAddressOf(x))+'|'+normalizeKey(locationCountryOf(x));
}
function collectLocations(inventory, customerTargetByLegacy, tenantId){
  const locations=[], byCustomerLegacy=new Map(); let pos=0;
  inventory.canonicalCustomers.forEach((g,index)=>{
    const c=g.primary.value||{}, legacyId=customerIdOf(c), acc=customerAccountOf(c);
    const customerId=customerTargetByLegacy.get('id:'+normalizeKey(legacyId))||customerTargetByLegacy.get('account:'+normalizeKey(acc))||('cust-'+String(index+1).padStart(6,'0'));
    const candidates=[];
    ['locations','sites','standorte'].forEach(k=>arr(c[k]).forEach((x,i)=>{ if(obj(x)) candidates.push({value:x,pointer:`customers[${g.primary.sourceIndex}].${k}[${i}]`,derivedMain:false}); }));
    const main={id:q(c.mainLocationId),name:'Hauptadresse',address:q(c.address),country:q(c.country||c.land),_derivedMain:true};
    if(main.address){
      const mainKey=locationIdentity(main), exists=candidates.some(r=>locationIdentity(r.value)===mainKey || (normalizeKey(locationAddressOf(r.value))===normalizeKey(main.address)&&normalizeKey(locationCountryOf(r.value))===normalizeKey(main.country)));
      if(!exists) candidates.unshift({value:main,pointer:`customers[${g.primary.sourceIndex}].address`,derivedMain:true});
    }
    const seen=new Map();
    candidates.forEach(r=>{
      const key=locationIdentity(r.value); if(seen.has(key)) { seen.get(key).sourcePointers.push(r.pointer); return; }
      const id='loc-'+String(++pos).padStart(7,'0'), legacyLocationId=locationIdOf(r.value);
      const row={id,tenantId,customerId,legacyLocationId,name:locationNameOf(r.value),address:locationAddressOf(r.value),country:locationCountryOf(r.value),contactName:q(r.value.contactName||r.value.contact||r.value.ansprechpartner),email:q(r.value.email||r.value.mail||r.value.contactEmail),phone:q(r.value.phone||r.value.telefon||r.value.contactPhone),openingHours:q(r.value.openingHours||r.value.zeiten),notes:q(r.value.note||r.value.notes),derivedMain:!!(r.derivedMain||r.value._derivedMain),sourcePointers:[r.pointer]};
      locations.push(row); seen.set(key,row);
      if(legacyLocationId) byCustomerLegacy.set(customerId+'|id:'+normalizeKey(legacyLocationId),id);
      byCustomerLegacy.set(customerId+'|name:'+normalizeKey(row.name),id);
      if(row.address) byCustomerLegacy.set(customerId+'|addr:'+normalizeKey(row.address),id);
    });
  });
  return {locations,byCustomerLegacy};
}
function resolveShipmentLocation(sh,customerId,index){
  if(!customerId||!index) return '';
  const legacy=q(sh.locationId||sh.selectedLocationId||sh.siteId||(sh.location&&locationIdOf(sh.location))||(sh.locationData&&locationIdOf(sh.locationData)));
  const name=q(sh.locationName||sh.site||sh.standort||sh.recipientName||sh.destinationName||(sh.location&&locationNameOf(sh.location)));
  const address=q(sh.recipientAddress||(sh.location&&locationAddressOf(sh.location))||(sh.locationData&&locationAddressOf(sh.locationData)));
  return (legacy&&index.get(customerId+'|id:'+normalizeKey(legacy)))||(name&&index.get(customerId+'|name:'+normalizeKey(name)))||(address&&index.get(customerId+'|addr:'+normalizeKey(address)))||'';
}
const AUDIT_SECRET_KEY=/pass(word|wort)?|token|session|authorization|secret|connection.?string|api.?key|cookie|credential|base64|dataurl|filedata/i;
function safeAuditValue(v,key='',depth=0){
  if(AUDIT_SECRET_KEY.test(q(key))) return '[REDACTED_FOR_MIGRATION]';
  if(depth>8) return '[TRUNCATED_STRUCTURE]';
  if(Array.isArray(v)) return v.map((x,i)=>safeAuditValue(x,String(i),depth+1));
  if(obj(v)){ const out={}; Object.keys(v).forEach(k=>{out[k]=safeAuditValue(v[k],k,depth+1)}); return out; }
  return v;
}
function auditCategory(action,type){
  const s=low(q(type)+' '+q(action));
  if(/login|logout|auth/.test(s)) return 'AUTH';
  if(/pod|abhol|pickup/.test(s)) return 'POD_PICKUP';
  if(/liefer|dokument|abd|cmr|datei|file/.test(s)) return 'DOCUMENT';
  if(/kunde|customer/.test(s)) return 'CUSTOMER';
  if(/sendung|shipment/.test(s)) return 'SHIPMENT';
  if(/task|aufgabe|plan/.test(s)) return 'TASK';
  return 'GENERAL';
}
function collectAuditEvents(state,tenantId){
  const out=[]; let pos=0;
  arr(state.audit).forEach((x,i)=>{ if(!obj(x)) return; const action=q(x.action||x.type||'Audit'); out.push({id:'audit-'+String(++pos).padStart(9,'0'),tenantId,sourcePointer:`audit[${i}]`,legacyId:q(x.id),at:q(x.at||x.time||x.timestamp),actor:q(x.user||x.actor||x.by),action,category:auditCategory(action,x.type),detail:q(x.detail||x.message),details:safeAuditValue(x.details||{},'details'),source:'LEGACY_AUDIT'}); });
  arr(state.auditLog).forEach((x,i)=>{ if(!obj(x)) return; const action=q(x.type||x.action||'Audit'); out.push({id:'audit-'+String(++pos).padStart(9,'0'),tenantId,sourcePointer:`auditLog[${i}]`,legacyId:q(x.id),at:q(x.at||x.time||x.timestamp),actor:q(x.actor||x.user||x.by),action,category:auditCategory(action,x.type),detail:q(x.detail||x.message),details:safeAuditValue(x.details||{},'details'),source:'SECURITY_AUDIT'}); });
  return out;
}
function collectGeneratedArtifacts(inventory,tenantId,shipmentTargetByKey,shipmentReferenceById){
  const out=[], seen=new Set(); let pos=0;
  inventory.canonicalShipments.forEach(g=>{
    const shipmentId=shipmentTargetByKey.get(g.key)||'', reference=shipmentReferenceById.get(shipmentId)||'';
    g.records.forEach(r=>arr(r.value&&r.value.generatedDocuments).forEach((d,i)=>{
      if(!obj(d)) return; const key=[shipmentId,q(d.id),q(d.type),q(d.version),q(d.signature)].join('|'); if(seen.has(key)) return; seen.add(key);
      out.push({id:'artifact-'+String(++pos).padStart(8,'0'),tenantId,shipmentId,reference,legacyId:q(d.id),type:q(d.type),version:Number(d.version||0)||0,status:q(d.status),signature:q(d.signature),generatedAt:q(d.generatedAt),replacedAt:q(d.replacedAt),replacedReason:q(d.replacedReason),sourcePointer:`${r.sourceCollection}[${r.sourceIndex}].generatedDocuments[${i}]`});
    }));
  });
  return out;
}
function documentRecoveryAction(d){
  if(d.migrationStatus==='VERIFIED_INLINE') return 'NONE';
  if(d.migrationStatus==='REMOTE_CAPTURE_REQUIRED'){
    if(d.remoteSourceClass==='SHAREPOINT') return 'CAPTURE_SHAREPOINT_AUTHORIZED';
    if(d.remoteSourceClass==='EXPORTHUB_API') return 'CAPTURE_LEGACY_API';
    return 'CAPTURE_AUTHORIZED_REMOTE';
  }
  if(d.migrationStatus==='CONTENT_MISSING' && (d.kind==='CMR'||d.kind==='LADELISTE')) return 'REGENERATE_FROM_LOCKED_SNAPSHOT';
  return 'SOURCE_FILE_REQUIRED';
}

export function createNormalizedSkeleton(payload, inventory, options={}){
  const tenantId='tenant-legacy-import';
  const tenantName=q(options.tenantNameHint)||'Legacy ExportHUB Import';
  const migrationMap=[];
  const customerTargetByLegacy=new Map();
  const customers=inventory.canonicalCustomers.map((g,index)=>{
    const r=g.primary, pointer=`customers[${r.sourceIndex}]`, c=r.value, id='cust-'+String(index+1).padStart(6,'0');
    g.records.forEach(x=>migrationMap.push({sourcePointer:`customers[${x.sourceIndex}]`,targetType:'customer',targetId:id,duplicateAlias:x!==r}));
    const legacyId=customerIdOf(c),account=customerAccountOf(c);
    if(legacyId) customerTargetByLegacy.set('id:'+normalizeKey(legacyId),id);
    if(account) customerTargetByLegacy.set('account:'+normalizeKey(account),id);
    return {id,tenantId,legacy:{pointers:g.records.map(x=>`customers[${x.sourceIndex}]`),id:legacyId,account},account,name:customerNameOf(c),country:q(c.country||c.land),iso:q(c.iso),address:q(c.address),carrier:q(c.carrier||c.spedition||c.carrierName||c.speditionName)};
  });

  const locationBuild=collectLocations(inventory,customerTargetByLegacy,tenantId);
  const locations=locationBuild.locations;

  const shipmentTargetByKey=new Map();
  const shipmentTargetByRef=new Map();
  const shipmentReferenceById=new Map();
  const shipments=inventory.canonicalShipments.map((g,index)=>{
    const sh=g.primary.value, id='ship-'+String(index+1).padStart(7,'0'), pointers=g.records.map(r=>`${r.sourceCollection}[${r.sourceIndex}]`);
    shipmentTargetByKey.set(g.key,id);
    const shipmentRef=refOf(sh);
    if(shipmentRef) shipmentTargetByRef.set(normalizeKey(shipmentRef),id);
    shipmentReferenceById.set(id,shipmentRef);
    g.records.forEach(r=>migrationMap.push({sourcePointer:`${r.sourceCollection}[${r.sourceIndex}]`,targetType:'shipment',targetId:id,duplicateAlias:r!==g.primary}));
    const customerLegacyId=q(sh.customerId || (sh.customer&&sh.customer.id) || (sh.customerData&&sh.customerData.id));
    const customerAccount=q(sh.customerAccount||sh.customerNumber||sh.customerNo||(sh.customer&&customerAccountOf(sh.customer))||(sh.customerData&&customerAccountOf(sh.customerData)));
    const customerId=customerTargetByLegacy.get('id:'+normalizeKey(customerLegacyId))||customerTargetByLegacy.get('account:'+normalizeKey(customerAccount))||'';
    const canonicalStatus=canonicalStatusOf(sh), hasPod=g.records.some(r=>podEvidence(r.value)), picked=g.records.some(r=>pickupEvidence(r.value));
    return {
      id,tenantId,customerId,reference:refOf(sh),legacyShipmentId:shipmentIdOf(sh),canonicalStatus,
      sourceStatus:q(sh.status),processStatus:q(sh.processStatus),readinessStatus:q(sh.readinessStatus),podStatus:q(sh.podStatus),
      locked:hasPod||picked||['POD vorhanden','Abgeholt','Abgeschlossen','Archiviert'].includes(canonicalStatus),lockReason:hasPod?'POD_OR_SIGNATURE_EVIDENCE':(picked?'PICKUP_EVIDENCE':''),
      pickupDate:q(sh.pickupDate),actualPickupDate:q(sh.actualPickupDate),actualPickupTime:q(sh.actualPickupTime),pickedUpAt:q(sh.pickedUpAt),pickupMethod:q(sh.pickupMethod),pickupConfirmedBy:q(sh.pickupConfirmedBy),
      podEvidence:hasPod,podConfirmed:g.records.some(r=>r.value&&r.value.podConfirmed===true),podAvailable:g.records.some(r=>r.value&&r.value.podAvailable===true),podScanConfirmed:g.records.some(r=>r.value&&r.value.podScanConfirmed===true),signatureAvailable:g.records.some(r=>r.value&&r.value.signatureAvailable===true),
      customerLegacyId,customerAccount,customerName:q(sh.customerName||(sh.customer&&customerNameOf(sh.customer))||(sh.customerData&&customerNameOf(sh.customerData))),carrier:q(sh.carrier||sh.carrierName||sh.spedition),destinationCountry:q(sh.destinationCountry||sh.recipientCountry||(sh.customer&&sh.customer.country)),
      locationId:resolveShipmentLocation(sh,customerId,locationBuild.byCustomerLegacy),legacyLocationId:q(sh.locationId||sh.selectedLocationId||sh.siteId),locationName:q(sh.locationName||sh.site||sh.standort||sh.recipientName||sh.destinationName),recipientAddress:q(sh.recipientAddress),
      sourcePointers:pointers
    };
  });

  const users=inventory.users.map((r,index)=>{
    const pointer=r.sourceKey?`users.${r.sourceKey}`:`users[${r.sourceIndex}]`, u=r.value||{}, id='user-'+String(index+1).padStart(5,'0');
    migrationMap.push({sourcePointer:pointer,targetType:'user',targetId:id});
    return {id,tenantId,username:userNameOf(u,r.sourceKey),displayName:userDisplayNameOf(u,r.sourceKey),legacyRole:q(u.role),professionalRole:professionalRole(u),active:u.active!==false,locked:u.locked===true,mustChangeLegacyPassword:u.mustChange===true,passwordMigration:'RESET_REQUIRED',legacyPointer:pointer};
  });

  const documents=[];
  let docIndex=0;
  for(const [,group] of inventory.canonicalDocumentGroups.entries()){
    const d=group[0], id='doc-'+String(++docIndex).padStart(8,'0');
    group.forEach(src=>migrationMap.push({sourcePointer:src.sourcePath,targetType:'document',targetId:id,duplicateAlias:src!==d}));
    let shipmentId=d.ownerType==='shipment'?shipmentTargetByKey.get(d.canonicalOwnerKey)||'':'';
    let customerId=d.ownerType==='customer'?customerTargetByLegacy.get(d.canonicalOwnerKey)||'':'';
    let ownerReference='';
    if(d.ownerType==='abdRequest'){
      const m=/abdRequests\[(\d+)\]/.exec(d.ownerPointer||'');
      const req=m ? arr(payload.state.abdRequests)[Number(m[1])] : null;
      ownerReference=q(req&&(req.ref||req.reference||req.shipmentRef));
      shipmentId=shipmentTargetByRef.get(normalizeKey(ownerReference))||'';
      const reqCustomerId=q(req&&req.customerId), reqAccount=q(req&&(req.customerNumber||req.customerAccount||req.customerNo));
      customerId=customerTargetByLegacy.get('id:'+normalizeKey(reqCustomerId))||customerTargetByLegacy.get('account:'+normalizeKey(reqAccount))||'';
    }
    if(shipmentId && !ownerReference) ownerReference=shipmentReferenceById.get(shipmentId)||'';
    const inline=group.find(x=>x.inlinePayload), remote=group.find(x=>x.remoteUrl), declared=group.find(x=>x.declaredHash);
    const migrationStatus=documentMigrationStatus(group), remoteUrl=q(remote&&remote.remoteUrl), sourceClass=remoteSourceClass(remoteUrl);
    documents.push({
      id,tenantId,shipmentId,customerId,reference:ownerReference,kind:d.kind,name:d.name,mimeType:d.mimeType,size:d.size,
      sourcePointers:group.map(x=>x.sourcePath),sourceRecordCount:group.length,
      storage:inline?'inline-source':(remote?'remote-source':'metadata-only'),migrationStatus,migrationPriority:migrationPriority(d.kind,migrationStatus),cutoverBlocking:migrationStatus!=='VERIFIED_INLINE',
      remoteSourceClass:sourceClass,remoteUrl,declaredHash:q(declared&&declared.declaredHash),uploadedAt:d.uploadedAt||'',uploadedBy:d.uploadedBy||''
    });
  }

  documents.forEach(d=>{d.recoveryAction=documentRecoveryAction(d);});
  const auditEvents=collectAuditEvents(payload.state,tenantId);
  const generatedArtifacts=collectGeneratedArtifacts(inventory,tenantId,shipmentTargetByKey,shipmentReferenceById);
  return {
    schemaVersion:'professional-0.5',
    tenant:{id:tenantId,name:tenantName,migrationOnly:true},
    users,customers,locations,shipments,documents,auditEvents,generatedArtifacts,
    tasks:arr(payload.state.tasks).map((x,i)=>({id:'task-'+String(i+1).padStart(7,'0'),tenantId,sourcePointer:`tasks[${i}]`,title:q(x&&x.title),status:q(x&&x.status)})),
    migrationMap
  };
}

function bytesFromDataUrl(payload){
  const raw=q(payload);
  const comma=raw.indexOf(',');
  const body=comma>=0?raw.slice(comma+1):raw;
  if(!body) return new Uint8Array();
  const isB64=comma>=0 ? /;base64/i.test(raw.slice(0,comma)) : /^[A-Za-z0-9+/=\r\n]+$/.test(body);
  if(isB64){
    if(typeof Buffer!=='undefined') return new Uint8Array(Buffer.from(body.replace(/\s+/g,''),'base64'));
    const bin=atob(body.replace(/\s+/g,'')); const out=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i); return out;
  }
  return new TextEncoder().encode(decodeURIComponent(body));
}

export async function sha256Hex(input){
  let bytes;
  if(typeof input==='string') bytes=new TextEncoder().encode(input);
  else if(input instanceof Uint8Array) bytes=input;
  else if(input instanceof ArrayBuffer) bytes=new Uint8Array(input);
  else throw new Error('Unsupported hash input');
  if(globalThis.crypto && globalThis.crypto.subtle){
    const hash=await globalThis.crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  const {createHash}=await import('node:crypto');
  return createHash('sha256').update(bytes).digest('hex');
}

export async function buildMigrationPackage(payload, sourceText, options={}){
  const invResult=inventoryBackup(payload,options);
  if(!invResult.validation.ok) throw new Error('Ungültiges ExportHUB-Backup: '+invResult.validation.errors.join(', '));
  const inv=invResult.inventory;
  const normalized=createNormalizedSkeleton(payload,inv,options);
  const sourceSha256=await sha256Hex(sourceText ?? JSON.stringify(payload));
  const docVerification=[];
  let inlineCount=0, remoteCount=0, missingCount=0, hashErrors=0, docPos=0;
  for(const [,group] of inv.canonicalDocumentGroups.entries()){
    const d=group[0];
    const inline=group.find(x=>x.inlinePayload), remote=group.find(x=>x.remoteUrl), declared=group.find(x=>x.declaredHash);
    const rec={sourcePointers:group.map(x=>x.sourcePath),name:d.name,kind:d.kind,storage:inline?'inline':(remote?'remote':'metadata-only'),sha256:'',declaredHash:q(declared&&declared.declaredHash),status:''};
    if(inline){
      inlineCount++;
      try{ rec.sha256=await sha256Hex(bytesFromDataUrl(inline.inlinePayload)); rec.status='HASHED'; }
      catch(e){ rec.status='HASH_ERROR'; rec.error=q(e&&e.message||e); hashErrors++; }
    }else if(remote){ remoteCount++; rec.status='REMOTE_CAPTURE_REQUIRED'; rec.remoteUrl=remote.remoteUrl; }
    else{ missingCount++; rec.status='CONTENT_MISSING'; }
    docVerification.push(rec);
    const normalizedDoc=normalized.documents[docPos++];
    if(normalizedDoc){
      normalizedDoc.sha256=rec.sha256||'';
      normalizedDoc.migrationStatus=rec.status==='HASHED'?'VERIFIED_INLINE':rec.status;
      normalizedDoc.cutoverBlocking=rec.status!=='HASHED';
      normalizedDoc.migrationPriority=migrationPriority(normalizedDoc.kind,normalizedDoc.migrationStatus);
      if(rec.remoteUrl && !normalizedDoc.remoteUrl) normalizedDoc.remoteUrl=rec.remoteUrl;
      normalizedDoc.recoveryAction=documentRecoveryAction(normalizedDoc);
    }
  }
  const sourceCoverage=normalized.migrationMap.length;
  const expectedCoverage=inv.customers.length+inv.shipments.length+inv.users.length+inv.documentSources.length;
  const readOnlyErrors=[];
  if(sourceCoverage!==expectedCoverage) readOnlyErrors.push('SOURCE_MAPPING_INCOMPLETE');
  if(hashErrors) readOnlyErrors.push('INLINE_DOCUMENT_HASH_ERROR');
  if(normalized.shipments.length!==inv.counts.canonicalShipmentGroups) readOnlyErrors.push('CANONICAL_SHIPMENT_COUNT_MISMATCH');
  if(normalized.customers.length!==inv.counts.canonicalCustomers) readOnlyErrors.push('CANONICAL_CUSTOMER_COUNT_MISMATCH');
  if(normalized.documents.length!==inv.counts.documents) readOnlyErrors.push('CANONICAL_DOCUMENT_COUNT_MISMATCH');
  const cutoverBlockers=[...readOnlyErrors];
  if(remoteCount) cutoverBlockers.push('REMOTE_DOCUMENTS_REQUIRE_CAPTURE');
  if(missingCount) cutoverBlockers.push('DOCUMENT_CONTENT_MISSING');
  const documentByKind={}, documentByStatus={}, remoteBySource={};
  for(const d of normalized.documents){
    documentByKind[d.kind]=(documentByKind[d.kind]||0)+1;
    documentByStatus[d.migrationStatus]=(documentByStatus[d.migrationStatus]||0)+1;
    if(d.remoteSourceClass) remoteBySource[d.remoteSourceClass]=(remoteBySource[d.remoteSourceClass]||0)+1;
  }
  const podDocs=normalized.documents.filter(d=>d.kind==='POD');
  const podReady=podDocs.every(d=>d.migrationStatus==='VERIFIED_INLINE');
  const podBlockers=podDocs.filter(d=>d.migrationStatus!=='VERIFIED_INLINE').length;
  if(podBlockers) cutoverBlockers.push('POD_DOCUMENTS_NOT_FULLY_CAPTURED');
  const manifest={
    professionalVersion:PROFESSIONAL_VERSION,
    generatedAt:new Date().toISOString(),
    sourceSha256,
    sourceMetadata:inv.source,
    sourceCounts:inv.counts,
    statusCounts:inv.statusCounts,
    collectionCounts:inv.collectionCounts,
    mapping:{expected:expectedCoverage,mapped:sourceCoverage,complete:sourceCoverage===expectedCoverage},
    documents:{total:inv.counts.documents,sourceRecords:inv.counts.documentSourceRecords,inlineHashed:inlineCount,remoteCaptureRequired:remoteCount,contentMissing:missingCount,hashErrors,byKind:documentByKind,byStatus:documentByStatus,remoteBySource,podGate:{total:podDocs.length,ready:podReady,blockers:podBlockers},verification:docVerification},
    duplicates:{shipmentGroups:inv.duplicateShipmentGroups,customerGroups:inv.duplicateCustomerGroups,documentGroups:inv.duplicateDocumentGroups},
    locations:{total:normalized.locations.length,customersWithLocations:new Set(normalized.locations.map(x=>x.customerId)).size,derivedMain:normalized.locations.filter(x=>x.derivedMain).length,shipmentsResolved:normalized.shipments.filter(x=>x.locationId).length,shipmentsUnresolved:normalized.shipments.filter(x=>x.locationName&&!x.locationId).length},
    audit:{total:normalized.auditEvents.length,legacyAudit:normalized.auditEvents.filter(x=>x.source==='LEGACY_AUDIT').length,securityAudit:normalized.auditEvents.filter(x=>x.source==='SECURITY_AUDIT').length,redactionPolicy:'SECRET_KEYS_REDACTED'},
    recovery:{captureRequired:normalized.documents.filter(x=>/^CAPTURE_/.test(x.recoveryAction)).length,sourceFileRequired:normalized.documents.filter(x=>x.recoveryAction==='SOURCE_FILE_REQUIRED').length,regenerableDocuments:normalized.documents.filter(x=>x.recoveryAction==='REGENERATE_FROM_LOCKED_SNAPSHOT').length,generatedArtifacts:normalized.generatedArtifacts.length,actions:normalized.documents.reduce((a,x)=>(a[x.recoveryAction]=(a[x.recoveryAction]||0)+1,a),{})},
    security:{legacyPasswordsMigrated:false,passwordPolicy:'RESET_REQUIRED',sourceSnapshotContainsLegacySensitiveFields:true,auditSecretFieldsRedactedInNormalizedView:true},
    gates:{
      readOnlyReady:readOnlyErrors.length===0,
      readOnlyErrors,
      cutoverReady:cutoverBlockers.length===0,
      cutoverBlockers
    }
  };
  return {
    type:'ExportHUB_Professional_Migration_Package',
    version:PROFESSIONAL_VERSION,
    mode:'READ_ONLY',
    manifest,
    normalized,
    sourceSnapshot:clone(payload)
  };
}

export function summarizePackage(pkg){
  const m=pkg&&pkg.manifest||{}, c=m.sourceCounts||{}, d=m.documents||{}, g=m.gates||{};
  return {
    sourceVersion:q(m.sourceMetadata&&m.sourceMetadata.version),
    sourceFormat:q(m.sourceMetadata&&m.sourceMetadata.format),
    customers:Number(c.canonicalCustomers||c.customers||0),
    shipmentSourceRecords:Number(c.shipmentSourceRecords||0),
    canonicalShipments:Number(c.canonicalShipmentGroups||0),
    podEvidenceShipments:Number(c.podEvidenceShipments||0),
    podFileEntries:Number(c.podFileEntries||0),
    pods:Number(c.pods||0),
    documents:Number(c.documents||0),
    users:Number(c.users||0),
    inlineHashed:Number(d.inlineHashed||0),
    remoteCaptureRequired:Number(d.remoteCaptureRequired||0),
    readOnlyReady:!!g.readOnlyReady,
    cutoverReady:!!g.cutoverReady
  };
}

export { BACKUP_TYPE, PROFESSIONAL_VERSION, canonicalStatusOf, podEvidence, pickupEvidence };
