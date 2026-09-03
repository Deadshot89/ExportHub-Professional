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
let loadSequence=0;
let searchTimer=null;
let saveState='idle';

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
function renderList(){
  const list=$('#shipmentMasterList'),count=$('#shipmentMasterCount');if(!list)return;
  if(count)count.textContent=`${rows.length} Sendung${rows.length===1?'':'en'}`;
  list.innerHTML=rows.map(shipment=>`<button class="shipment-master-item ${String(shipment.id)===String(selectedId)?'active':''}" type="button" data-shipment-id="${esc(shipment.id)}"><span class="shipment-master-head"><strong>${esc(shipment.reference||'–')}</strong><span class="cc-status ${statusClass(shipment.status)}">${esc(shipment.status||'Entwurf')}</span></span><span class="shipment-master-customer">${esc(shipment.customerName||shipment.customerAccount||'Kunde noch offen')}</span><span class="shipment-master-meta">${esc(shipment.locationName||'Standort offen')}${shipment.plannedPickupDate?` · ${esc(shipment.plannedPickupDate)}`:''}${String(shipment.sourceKind).toUpperCase()==='MIGRATED'?' · Migriert':''}</span></button>`).join('')||'<div class="cc-empty">Keine Sendungen für diesen Filter.</div>';
  list.querySelectorAll('[data-shipment-id]').forEach(button=>button.addEventListener('click',()=>openShipment(button.dataset.shipmentId)));
}
function renderCurrent(){
  const root=$('#shipmentEditorRoot');if(!root)return;
  renderShipmentEditor(root,{shipment:current,lock,saveState},{canWrite:canWrite(),lock,saveState});
  root.querySelector('[data-shipment-action="close"]')?.addEventListener('click',()=>closeShipment());
  const pickup=root.querySelector('#shipmentPlannedPickupDate');
  if(pickup&&!pickup.disabled)pickup.addEventListener('change',event=>autosave?.queue({plannedPickupDate:event.currentTarget.value||null}));
}
function clearCurrent(){
  autosave?.dispose();autosave=null;current=null;lock=null;selectedId='';saveState='idle';renderList();renderCurrent();
}
async function releaseCurrentLock({silent=false}={}){
  if(!current?.id||!lock?.lockToken||!canWrite())return;
  const shipmentId=current.id,token=lock.lockToken;
  lock=null;
  try{
    await apiJson(`/api/professional-shipments/${encodeURIComponent(shipmentId)}/lock`,{method:'POST',headers:csrfHeaders(),body:JSON.stringify({action:'release',lockToken:token})});
  }catch(error){if(!silent)setMessage(error.message||'Bearbeitungssperre konnte nicht freigegeben werden.','warn');}
}
function setupAutosave(){
  autosave?.dispose();autosave=null;
  if(!current?.id||!lock?.lockToken||current.readOnly||!canWrite())return;
  autosave=createAutosaveQueue({
    save:async patch=>{
      const data=await apiJson(`/api/professional-shipments/${encodeURIComponent(current.id)}`,{method:'POST',headers:csrfHeaders(),body:JSON.stringify({lockToken:lock.lockToken,revision:current.revision,patch})});
      current=data.shipment||current;
      renderCurrent();
    },
    onState:(state,error)=>{
      saveState=state;
      if(state==='error')setMessage(error?.message||'Änderungen konnten nicht gespeichert werden. Erneuter Versuch läuft.','warn');
      else if(state==='saved')setMessage('');
      renderCurrent();
    }
  });
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
    if(selectedId&&!rows.some(row=>String(row.id)===String(selectedId))){await releaseCurrentLock({silent:true});clearCurrent();}
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
  if(current?.id&&String(current.id)!==shipmentId){await releaseCurrentLock({silent:true});autosave?.dispose();autosave=null;}
  selectedId=shipmentId;renderList();saveState='idle';setMessage('');
  const root=$('#shipmentEditorRoot');if(root)root.innerHTML='<div class="shipment-editor-empty"><div class="kicker">SENDUNGSDETAIL</div><h3>Wird geladen …</h3></div>';
  try{
    const data=await apiJson(`/api/professional-shipments/${encodeURIComponent(shipmentId)}`,{method:'GET',headers:{}});
    current=data.shipment||null;lock=null;
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
    await releaseCurrentLock({silent:true});autosave?.dispose();autosave=null;
    const data=await apiJson('/api/professional-shipments',{method:'POST',headers:csrfHeaders(),body:'{}'});
    current=data.shipment||null;lock=data.lock||null;selectedId=current?.id||'';saveState='saved';
    setupAutosave();await loadShipments();renderCurrent();setMessage('Neue LIVE-Sendung angelegt.');return current;
  }catch(error){setMessage(error.message||'Neue Sendung konnte nicht angelegt werden.','bad');return null;}
  finally{if(button)button.disabled=!canWrite();}
}

async function closeShipment(){
  await releaseCurrentLock();clearCurrent();setMessage('');
}

function wireFilters(){
  $('#shipmentSearch')?.addEventListener('input',()=>{if(searchTimer)clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadShipments(),250);});
  $('#shipmentStatusFilter')?.addEventListener('change',()=>loadShipments());
  $('#shipmentSourceFilter')?.addEventListener('change',()=>loadShipments());
  $('#newShipmentBtn')?.addEventListener('click',()=>createShipment());
  document.querySelector('[data-nav="shipments"]')?.addEventListener('click',()=>{if(syncMode())loadShipments();});
}

window.addEventListener('professional:session-ready',event=>{
  localMode=!!event.detail?.local;session=event.detail?.session||null;rows=[];clearCurrent();syncMode();
});
window.addEventListener('pagehide',()=>{
  if(!current?.id||!lock?.lockToken||!session?.csrfToken)return;
  const shipmentId=current.id,token=lock.lockToken;
  fetch(`/api/professional-shipments/${encodeURIComponent(shipmentId)}/lock`,{method:'POST',credentials:'same-origin',keepalive:true,headers:{'content-type':'application/json','x-professional-csrf':session.csrfToken},body:JSON.stringify({action:'release',lockToken:token})}).catch(()=>{});
});

wireFilters();
