import {createAutosaveQueue} from './shipment-autosave.js';
import {renderShipmentEditor} from './shipment-editor.js';

const $=selector=>document.querySelector(selector);
const WRITE_ROLES=new Set(['TENANT_ADMIN','EXPORT_ADMIN','TEAM_LEAD','OPERATOR']);
let session=null;
let localMode=false;
let rows=[];
let selectedId='';
let current=null;
let lock=null;
let autosave=null;
let colliAutosave=null;
let packagingTypes=[];
let packagingLoaded=false;
let packagingPromise=null;
let colliDirty=false;
let colliEditVersion=0;
let mutationTail=Promise.resolve();
let loadSequence=0;
let searchTimer=null;
let saveState='idle';
let navigationBypass=false;

function esc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function canWrite(){return !localMode&&!!session&&WRITE_ROLES.has(String(session?.user?.role||''));}
function csrfHeaders(){return session?.csrfToken?{'x-professional-csrf':session.csrfToken}:{};}
async function apiJson(url,options={}){
  const {headers={},...rest}=options;
  const response=await fetch(url,{credentials:'same-origin',...rest,headers:{'content-type':'application/json',...headers}});
  let body={};try{body=await response.json();}catch{}
  if(!response.ok){const error=new Error(body.message||`HTTP ${response.status}`);error.code=body.code||`HTTP_${response.status}`;error.status=response.status;throw error;}
  return body;
}
function setMessage(message='',kind=''){
  const node=$('#shipmentWorkspaceMessage');if(!node)return;
  node.textContent=message;node.className=`shipment-workspace-message ${kind}`.trim();
}
function setSaveState(state,error){
  saveState=state;
  const node=$('#shipmentSaveState');
  if(node){
    const label={saving:'Speichert …',saved:'Gespeichert',error:'Speichern fehlgeschlagen',idle:'Bereit'}[state]||state;
    node.textContent=label;node.className=`shipment-save-state ${state}`;
  }
  if(state==='error')setMessage(error?.message||'Änderungen konnten nicht gespeichert werden. Erneuter Versuch läuft.','warn');
  else if(state==='saved'&&!colliDirty)setMessage('');
}
function syncMode(){
  const live=!localMode&&!!session;
  $('#liveShipmentWorkspace')?.classList.toggle('hidden',!live);
  $('#legacyShipmentMigrationPreview')?.classList.toggle('hidden',live);
  const create=$('#newShipmentBtn');if(create){create.classList.toggle('hidden',!live||!canWrite());create.disabled=!canWrite();}
  return live;
}
function statusClass(status){
  const value=String(status||'');
  if(/POD vorhanden|Abgeschlossen|Archiviert/.test(value))return 'good';
  if(/Abgeholt|Bereit zur Abholung/.test(value))return 'info';
  if(/Wartet|Nachbearbeitung/.test(value))return 'warn';
  if(/Storniert/.test(value))return 'bad';
  return 'neutral';
}
function runShipmentMutation(operation){
  const run=mutationTail.then(operation,operation);
  mutationTail=run.catch(()=>{});
  return run;
}
async function loadPackagingTypes(){
  if(localMode||!session)return [];
  if(packagingLoaded)return packagingTypes;
  if(packagingPromise)return packagingPromise;
  packagingPromise=(async()=>{
    const data=await apiJson('/api/professional-masterdata/packaging-types?status=active',{method:'GET',headers:{}});
    packagingTypes=Array.isArray(data.packagingTypes)?data.packagingTypes:[];
    packagingLoaded=true;
    return packagingTypes;
  })();
  try{return await packagingPromise;}finally{packagingPromise=null;}
}
function renderList(){
  const list=$('#shipmentMasterList'),count=$('#shipmentMasterCount');if(!list)return;
  if(count)count.textContent=`${rows.length} Sendung${rows.length===1?'':'en'}`;
  list.innerHTML=rows.map(shipment=>`<button class="shipment-master-item ${String(shipment.id)===String(selectedId)?'active':''}" type="button" data-shipment-id="${esc(shipment.id)}"><span class="shipment-master-head"><strong>${esc(shipment.reference||'–')}</strong><span class="cc-status ${statusClass(shipment.status)}">${esc(shipment.status||'Entwurf')}</span></span><span class="shipment-master-customer">${esc(shipment.customerName||shipment.customerAccount||'Kunde noch offen')}</span><span class="shipment-master-meta">${esc(shipment.locationName||'Standort offen')}${shipment.plannedPickupDate?` · ${esc(shipment.plannedPickupDate)}`:''}${String(shipment.sourceKind).toUpperCase()==='MIGRATED'?' · Migriert':''}</span></button>`).join('')||'<div class="cc-empty">Keine Sendungen für diesen Filter.</div>';
  list.querySelectorAll('[data-shipment-id]').forEach(button=>button.addEventListener('click',()=>openShipment(button.dataset.shipmentId)));
}
function currentColliRows(){return Array.isArray(current?.colliRows)?current.colliRows:[];}
function packagingFor(id){return packagingTypes.find(item=>String(item?.id||'')===String(id||''))||null;}
function serializableColliRows(){
  return currentColliRows().map(row=>({
    packagingTypeId:String(row.packagingTypeId||''),
    quantity:Number(row.quantity),
    weightKg:Number(row.weightKg),
    lengthCm:row.lengthCm===null||row.lengthCm===undefined||row.lengthCm===''?null:Number(row.lengthCm),
    widthCm:row.widthCm===null||row.widthCm===undefined||row.widthCm===''?null:Number(row.widthCm),
    heightCm:row.heightCm===null||row.heightCm===undefined||row.heightCm===''?null:Number(row.heightCm)
  }));
}
function colliRowsComplete(){
  return currentColliRows().every(row=>{
    const quantity=Number(row.quantity),weight=Number(row.weightKg);
    if(!String(row.packagingTypeId||'').trim()||!Number.isInteger(quantity)||quantity<=0||row.weightKg===null||row.weightKg===undefined||row.weightKg===''||!Number.isFinite(weight)||weight<0)return false;
    return ['lengthCm','widthCm','heightCm'].every(field=>row[field]===null||row[field]===undefined||row[field]===''||(Number.isFinite(Number(row[field]))&&Number(row[field])>0));
  });
}
function queueColliSave(){
  colliDirty=true;
  if(current){current.colliTotals=null;}
  if(!colliRowsComplete()){
    colliAutosave?.dispose();colliAutosave=null;setupColliAutosave();
    setMessage('Colli-Zeile unvollständig. Verpackung, Anzahl und Gewicht müssen vollständig sein.','warn');
    setSaveState('idle');
    return;
  }
  colliAutosave?.queue({colliRows:serializableColliRows(),editVersion:colliEditVersion});
}
function updateColliField(index,field,value){
  if(!current||!Number.isInteger(index)||index<0||index>=currentColliRows().length)return;
  const next=currentColliRows().map(row=>({...row}));
  const row=next[index];
  if(field==='packagingTypeId'){
    row.packagingTypeId=String(value||'');
    const packaging=packagingFor(row.packagingTypeId);
    row.packagingName=packaging?.name||'';
    for(const dimension of ['lengthCm','widthCm','heightCm'])row[dimension]=packaging?.[dimension]??null;
  }else{
    row[field]=value===''?null:value;
  }
  row.ldm=null;
  current={...current,colliRows:next,colliTotals:null};
  colliEditVersion++;
  queueColliSave();
}
function addColliRow(){
  if(!current||!canWrite()||!lock?.lockToken||!packagingTypes.length)return;
  const packaging=packagingTypes[0];
  const next=[...currentColliRows(),{packagingTypeId:packaging.id,packagingName:packaging.name,quantity:1,weightKg:null,lengthCm:packaging.lengthCm??null,widthCm:packaging.widthCm??null,heightCm:packaging.heightCm??null,ldm:null,position:currentColliRows().length}];
  current={...current,colliRows:next,colliTotals:null};colliEditVersion++;colliDirty=true;renderCurrent();
  setMessage('Neue Colli-Zeile angelegt. Bitte Gewicht vervollständigen.','warn');
}
function removeColliRow(index){
  if(!current||!canWrite()||!lock?.lockToken)return;
  const next=currentColliRows().filter((_,position)=>position!==index).map((row,position)=>({...row,position,ldm:null}));
  current={...current,colliRows:next,colliTotals:null};colliEditVersion++;queueColliSave();renderCurrent();
}
function wireColliEditor(root){
  root.querySelectorAll('[data-colli-action="add"]').forEach(button=>button.addEventListener('click',()=>addColliRow()));
  root.querySelectorAll('[data-colli-action="remove"]').forEach(button=>button.addEventListener('click',()=>removeColliRow(Number(button.dataset.colliIndex))));
  root.querySelectorAll('[data-colli-field]').forEach(input=>input.addEventListener('change',event=>{
    const target=event.currentTarget,index=Number(target.dataset.colliIndex),field=target.dataset.colliField;
    updateColliField(index,field,target.value);
    if(field==='packagingTypeId')renderCurrent();
    else target.closest('[data-colli-row]')?.querySelector('[data-colli-ldm]')?.replaceChildren('–');
  }));
}
function renderCurrent(){
  const root=$('#shipmentEditorRoot');if(!root)return;
  renderShipmentEditor(root,{shipment:current,lock,saveState,packagingTypes},{canWrite:canWrite(),lock,saveState});
  root.querySelector('[data-shipment-action="close"]')?.addEventListener('click',()=>closeShipment());
  const pickup=root.querySelector('#shipmentPlannedPickupDate');
  if(pickup&&!pickup.disabled)pickup.addEventListener('change',event=>autosave?.queue({plannedPickupDate:event.currentTarget.value||null}));
  wireColliEditor(root);
}
function clearCurrent(){
  autosave?.dispose();colliAutosave?.dispose();autosave=null;colliAutosave=null;current=null;lock=null;selectedId='';saveState='idle';colliDirty=false;colliEditVersion=0;mutationTail=Promise.resolve();renderList();renderCurrent();
}
async function releaseCurrentLock({silent=false}={}){
  if(!current?.id||!lock?.lockToken||!canWrite())return true;
  const shipmentId=current.id,token=lock.lockToken;
  try{
    await apiJson(`/api/professional-shipments/${encodeURIComponent(shipmentId)}/lock`,{method:'POST',headers:csrfHeaders(),body:JSON.stringify({action:'release',lockToken:token})});
    if(lock?.lockToken===token)lock=null;
    return true;
  }catch(error){
    if(!silent)setMessage(error.message||'Bearbeitungssperre konnte nicht freigegeben werden.','warn');
    return false;
  }
}
async function prepareToLeaveCurrent({silent=false}={}){
  if(!current)return true;
  if(autosave&&!(await autosave.flush())){if(!silent)setMessage('Offene Änderungen konnten nicht gespeichert werden. Die Sendung bleibt geöffnet.','bad');return false;}
  if(colliAutosave&&!(await colliAutosave.flush())){if(!silent)setMessage('Colli konnten nicht gespeichert werden. Die Sendung bleibt geöffnet.','bad');return false;}
  if(colliDirty){if(!silent)setMessage('Colli sind noch unvollständig und wurden nicht gespeichert. Bitte die Colli-Zeilen vervollständigen.','bad');return false;}
  const released=await releaseCurrentLock({silent});
  if(!released)return false;
  autosave?.dispose();colliAutosave?.dispose();autosave=null;colliAutosave=null;
  return true;
}
function setupColliAutosave(){
  if(colliAutosave||!current?.id||!lock?.lockToken||current.readOnly||!canWrite())return;
  colliAutosave=createAutosaveQueue({
    save:async payload=>runShipmentMutation(async()=>{
      const version=Number(payload.editVersion||0);
      const data=await apiJson(`/api/professional-shipments/${encodeURIComponent(current.id)}`,{method:'POST',headers:csrfHeaders(),body:JSON.stringify({lockToken:lock.lockToken,revision:current.revision,colliRows:payload.colliRows})});
      current={...current,...(data.shipment||{})};
      if(version===colliEditVersion){
        current={...current,colliRows:Array.isArray(data.colliRows)?data.colliRows:[],colliTotals:data.totals||{totalColli:0,totalWeightKg:0,totalLdm:0}};
        colliDirty=false;
        renderCurrent();
      }
    }),
    onState:(state,error)=>{if(state==='saved'&&colliDirty)setSaveState('idle');else setSaveState(state,error);}
  });
}
function setupAutosave(){
  autosave?.dispose();colliAutosave?.dispose();autosave=null;colliAutosave=null;
  if(!current?.id||!lock?.lockToken||current.readOnly||!canWrite())return;
  autosave=createAutosaveQueue({
    save:async patch=>runShipmentMutation(async()=>{
      const data=await apiJson(`/api/professional-shipments/${encodeURIComponent(current.id)}`,{method:'POST',headers:csrfHeaders(),body:JSON.stringify({lockToken:lock.lockToken,revision:current.revision,patch})});
      current={...current,...(data.shipment||{})};
      renderCurrent();
    }),
    onState:(state,error)=>setSaveState(state,error)
  });
  setupColliAutosave();
}

export async function loadShipments(filters={}){
  if(!syncMode())return [];
  const sequence=++loadSequence;
  const search=filters.q??$('#shipmentSearch')?.value??'';
  const status=filters.status??$('#shipmentStatusFilter')?.value??'all';
  const source=filters.source??$('#shipmentSourceFilter')?.value??'all';
  const list=$('#shipmentMasterList'),count=$('#shipmentMasterCount');
  if(list)list.innerHTML='<div class="cc-empty">Sendungen werden geladen …</div>';
  if(count)count.textContent='Sendungen werden geladen …';
  try{
    const data=await apiJson(`/api/professional-shipments?q=${encodeURIComponent(String(search).trim())}&status=${encodeURIComponent(status)}&source=${encodeURIComponent(source)}`,{method:'GET',headers:{}});
    if(sequence!==loadSequence)return rows;
    rows=Array.isArray(data.shipments)?data.shipments:[];
    if(selectedId&&!rows.some(row=>String(row.id)===String(selectedId))){
      if(await prepareToLeaveCurrent({silent:false}))clearCurrent();
    }
    renderList();
    return rows;
  }catch(error){
    if(sequence!==loadSequence)return rows;
    rows=[];renderList();if(count)count.textContent='Sendungen konnten nicht geladen werden.';setMessage(error.message||'Sendungen konnten nicht geladen werden.','bad');
    return [];
  }
}

export async function openShipment(id){
  const shipmentId=String(id||'').trim();if(!shipmentId||!syncMode())return null;
  if(current?.id&&String(current.id)===shipmentId)return current;
  if(current?.id&&String(current.id)!==shipmentId){if(!(await prepareToLeaveCurrent()))return current;}
  selectedId=shipmentId;renderList();saveState='idle';setMessage('');colliDirty=false;colliEditVersion=0;mutationTail=Promise.resolve();
  const root=$('#shipmentEditorRoot');if(root)root.innerHTML='<div class="shipment-editor-empty"><div class="kicker">SENDUNGSDETAIL</div><h3>Wird geladen …</h3></div>';
  try{
    const data=await apiJson(`/api/professional-shipments/${encodeURIComponent(shipmentId)}`,{method:'GET',headers:{}});
    current=data.shipment||null;lock=null;
    try{await loadPackagingTypes();}catch(error){setMessage(error.message||'Verpackungsarten konnten nicht geladen werden. Colli bleiben vorerst schreibgeschützt.','warn');}
    if(current&&!current.readOnly&&String(current.sourceKind||'').toUpperCase()==='LIVE'&&canWrite()){
      try{
        const lockData=await apiJson(`/api/professional-shipments/${encodeURIComponent(shipmentId)}/lock`,{method:'POST',headers:csrfHeaders(),body:JSON.stringify({action:'acquire'})});
        lock=lockData.lock||null;
      }catch(error){
        if(error.code!=='SHIPMENT_LOCKED')setMessage(error.message||'Bearbeitungssperre konnte nicht gesetzt werden.','warn');
        else setMessage('Diese Sendung wird bereits von einem anderen Benutzer bearbeitet. Sie bleibt hier schreibgeschützt.','warn');
      }
    }
    setupAutosave();renderCurrent();renderList();return current;
  }catch(error){current=null;lock=null;renderCurrent();setMessage(error.message||'Sendung konnte nicht geöffnet werden.','bad');return null;}
}

export async function createShipment(){
  if(!syncMode()||!canWrite())return null;
  const button=$('#newShipmentBtn');if(button)button.disabled=true;setMessage('Neue Sendung wird angelegt …');
  try{
    if(current&&!(await prepareToLeaveCurrent()))return null;
    try{await loadPackagingTypes();}catch(error){setMessage(error.message||'Verpackungsarten konnten nicht geladen werden.','warn');}
    const data=await apiJson('/api/professional-shipments',{method:'POST',headers:csrfHeaders(),body:'{}'});
    current={...(data.shipment||{}),colliRows:[],colliTotals:{totalColli:0,totalWeightKg:0,totalLdm:0}};lock=data.lock||null;selectedId=current?.id||'';saveState='saved';colliDirty=false;colliEditVersion=0;mutationTail=Promise.resolve();
    setupAutosave();await loadShipments();renderCurrent();setMessage('Neue LIVE-Sendung angelegt.');return current;
  }catch(error){setMessage(error.message||'Neue Sendung konnte nicht angelegt werden.','bad');return null;}
  finally{if(button)button.disabled=!canWrite();}
}

async function closeShipment(){
  if(!(await prepareToLeaveCurrent()))return;
  clearCurrent();setMessage('');
}

function wireFilters(){
  $('#shipmentSearch')?.addEventListener('input',()=>{if(searchTimer)clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadShipments(),250);});
  $('#shipmentStatusFilter')?.addEventListener('change',()=>loadShipments());
  $('#shipmentSourceFilter')?.addEventListener('change',()=>loadShipments());
  $('#newShipmentBtn')?.addEventListener('click',()=>createShipment());
  document.querySelector('[data-nav="shipments"]')?.addEventListener('click',()=>{if(syncMode())loadShipments();});
  document.querySelectorAll('.nav button[data-nav]').forEach(button=>button.addEventListener('click',event=>{
    if(navigationBypass||button.dataset.nav==='shipments'||!current)return;
    event.preventDefault();event.stopImmediatePropagation();
    void (async()=>{
      if(!(await prepareToLeaveCurrent()))return;
      clearCurrent();navigationBypass=true;
      try{button.click();}finally{navigationBypass=false;}
    })();
  },{capture:true}));
}

window.addEventListener('professional:session-ready',event=>{
  localMode=!!event.detail?.local;session=event.detail?.session||null;rows=[];packagingTypes=[];packagingLoaded=false;packagingPromise=null;clearCurrent();syncMode();
});
window.addEventListener('pagehide',()=>{
  if(!current?.id||!lock?.lockToken||!session?.csrfToken)return;
  const shipmentId=current.id,token=lock.lockToken;
  fetch(`/api/professional-shipments/${encodeURIComponent(shipmentId)}/lock`,{method:'POST',credentials:'same-origin',keepalive:true,headers:{'content-type':'application/json','x-professional-csrf':session.csrfToken},body:JSON.stringify({action:'release',lockToken:token})}).catch(()=>{});
});

wireFilters();
