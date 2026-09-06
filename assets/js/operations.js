import {icon} from './ui-kit.js';

const $=selector=>document.querySelector(selector);
let liveSession=false;
let activationSequence=0;

function esc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function fmt(value){return new Intl.NumberFormat('de-DE').format(Number(value||0));}
function dateLabel(value){
  if(!value)return '–';
  const date=new Date(value);if(Number.isNaN(date.getTime()))return esc(String(value));
  return new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}).format(date);
}
function stateKind(value){
  const state=String(value||'').toUpperCase();
  if(/VERIFIED|AVAILABLE|ABGESCHLOSSEN|ARCHIVIERT|POD VORHANDEN/.test(state))return 'good';
  if(/MISSING|ERROR|BLOCK|GESPERRT|FEHLT/.test(state))return 'bad';
  if(/WAIT|REMOTE|OPEN|OFFEN/.test(state))return 'warn';
  return 'neutral';
}
function notifyRendered(view){window.dispatchEvent(new CustomEvent('professional:operations-rendered',{detail:{view}}));}
async function apiJson(url){
  const response=await fetch(url,{credentials:'same-origin',headers:{'content-type':'application/json'}});
  let body={};try{body=await response.json();}catch{}
  if(!response.ok)throw new Error(body.message||`HTTP ${response.status}`);
  return body;
}

async function loadOperationsSummary(){return apiJson('/api/professional-operations/summary');}
async function loadShipments(){const data=await apiJson('/api/professional-operations/shipments?limit=250');return Array.isArray(data.shipments)?data.shipments:[];}
async function loadDocuments(){const data=await apiJson('/api/professional-operations/documents?limit=500');return Array.isArray(data.documents)?data.documents:[];}
async function loadTasks(){const data=await apiJson('/api/professional-operations/tasks');return Array.isArray(data.tasks)?data.tasks:[];}

function activateView(name){
  document.querySelectorAll('[data-nav]').forEach(button=>button.classList.toggle('active',button.dataset.nav===name));
  document.querySelectorAll('.view').forEach(view=>view.classList.toggle('active',view.dataset.view===name));
}
function ensureTasksSurface(){
  const nav=document.querySelector('nav');
  if(nav&&!nav.querySelector('[data-nav="tasks"]')){
    const button=document.createElement('button');button.type='button';button.dataset.nav='tasks';button.textContent='Aufgaben & Planung';
    const documents=nav.querySelector('[data-nav="documents"]');nav.insertBefore(button,documents||null);
    button.addEventListener('click',()=>{activateView('tasks');if(liveSession)loadTasks().then(renderTasksWorkspace).catch(error=>renderTasksWorkspace([],error));});
  }
  if(!$('[data-view="tasks"]')){
    const view=document.createElement('section');view.className='view';view.dataset.view='tasks';
    view.innerHTML='<div data-operational-live="tasks" class="cc-panel"><div class="cc-empty">Aufgaben werden geladen …</div></div>';
    const audit=$('[data-view="audit"]');audit?.parentNode?.insertBefore(view,audit||null);
  }
}
function liveHeader(kicker,title,subtitle,countLabel){
  return `<div class="section-head"><div><div class="kicker">${esc(kicker)}</div><h2>${esc(title)}</h2><p class="muted">${esc(subtitle)}</p></div><span class="cc-status good">${esc(countLabel)}</span></div>`;
}
function renderShipmentsWorkspace(shipments=[],error=null){
  const view=$('[data-view="shipments"]');if(!view||!liveSession)return;
  if(error){view.innerHTML=`<div data-operational-live="shipments" class="cc-panel">${liveHeader('LIVE · READ-ONLY','Sendungsarbeitsplatz','Tenant-isolierte Professional-Daten; operative Schreibaktionen bleiben gesperrt.','nicht verfügbar')}<div class="cc-empty">${esc(error.message||'Sendungen konnten nicht geladen werden.')}</div></div>`;notifyRendered('shipments');return;}
  const rows=shipments.map(shipment=>`<tr><td><strong class="mono">${esc(shipment.reference||'–')}</strong></td><td>${esc(shipment.customer_name||shipment.customer_account||'–')}</td><td>${esc([shipment.location_name,shipment.location_country].filter(Boolean).join(' · ')||'–')}</td><td><span class="cc-status ${stateKind(shipment.status)}">${esc(shipment.status||'–')}</span><small class="muted">${esc(shipment.process_status||shipment.source_status||'')}</small></td><td>${esc(dateLabel(shipment.actual_pickup_date||shipment.picked_up_at))}</td><td>${shipment.pod_evidence?'<span class="cc-status good">vorhanden</span>':'<span class="cc-status neutral">offen</span>'}</td><td>${shipment.locked?`<span class="cc-status bad">gesperrt</span><small class="muted">${esc(shipment.lock_reason||'Bearbeitung gesperrt')}</small>`:'<span class="cc-status good">frei</span>'}</td></tr>`).join('');
  view.innerHTML=`<div data-operational-live="shipments">${liveHeader('LIVE · READ-ONLY','Sendungsarbeitsplatz','Echte Professional-Sendungen aus dem angemeldeten Firmenmandanten. In diesem sicheren Schnitt sind keine Status- oder Datenänderungen freigegeben.',`${fmt(shipments.length)} Sendungen`)}<div class="cc-panel"><div class="table-wrap"><table><thead><tr><th>Referenz</th><th>Kunde</th><th>Standort</th><th>Status</th><th>Abholung</th><th>POD</th><th>Sperre</th></tr></thead><tbody>${rows||'<tr><td colspan="7" class="muted">Noch keine Sendungen im Professional-Bestand.</td></tr>'}</tbody></table></div></div></div>`;
  notifyRendered('shipments');
}
function renderDocumentsWorkspace(documents=[],error=null){
  const view=$('[data-view="documents"]');if(!view||!liveSession)return;
  if(error){view.innerHTML=`<div data-operational-live="documents" class="cc-panel">${liveHeader('LIVE · READ-ONLY','Dokumentenkontrolle','Tenant-isoliertes Professional-Dokumentregister.','nicht verfügbar')}<div class="cc-empty">${esc(error.message||'Dokumente konnten nicht geladen werden.')}</div></div>`;notifyRendered('documents');return;}
  const actions=documents.filter(document=>document.cutover_blocking!==false&&!['VERIFIED_INLINE','VERIFIED','AVAILABLE'].includes(String(document.verification_status||'').toUpperCase())).length;
  const rows=documents.map(document=>`<tr><td><strong class="mono">${esc(document.shipment_reference||'–')}</strong></td><td>${esc(document.kind||'–')}</td><td>${esc(document.original_name||'–')}</td><td><span class="cc-status ${stateKind(document.verification_status)}">${esc(document.verification_status||'–')}</span></td><td>${esc(document.recovery_action||'–')}</td><td>${esc(document.migration_priority||'–')}</td></tr>`).join('');
  view.innerHTML=`<div data-operational-live="documents">${liveHeader('LIVE · READ-ONLY','Dokumentenkontrolle','Pflicht- und Nachweisdokumente werden aus dem echten tenant-isolierten Professional-Register gelesen. Uploads bleiben bis zum Write-Release gesperrt.',`${fmt(actions)} prüfen`)}<div class="cc-panel"><div class="table-wrap"><table><thead><tr><th>Sendung</th><th>Art</th><th>Datei</th><th>Prüfstatus</th><th>Wiederherstellung</th><th>Priorität</th></tr></thead><tbody>${rows||'<tr><td colspan="6" class="muted">Noch keine Dokumente im Professional-Bestand.</td></tr>'}</tbody></table></div></div></div>`;
  notifyRendered('documents');
}
function renderTasksWorkspace(tasks=[],error=null){
  ensureTasksSurface();const view=$('[data-view="tasks"]');if(!view||!liveSession)return;
  if(error){view.innerHTML=`<div data-operational-live="tasks" class="cc-panel">${liveHeader('LIVE · ABGELEITET','Aufgaben & Planung','Aus echten Sendungs- und Dokumentzuständen abgeleitete Arbeitsliste.','nicht verfügbar')}<div class="cc-empty">${esc(error.message||'Aufgaben konnten nicht geladen werden.')}</div></div>`;notifyRendered('tasks');return;}
  const critical=tasks.filter(task=>task.priority==='critical').length;
  const content=tasks.map(task=>`<article class="cc-action-row ${task.priority==='critical'?'bad':'warn'}"><span class="cc-action-icon">${icon(task.source==='shipment'?'shipment':'document')}</span><div><strong>${esc(task.title||'Prüfung erforderlich')}</strong><small>${esc(task.reference||'–')} · ${esc(task.reason||'')}</small></div><span class="cc-status ${task.priority==='critical'?'bad':'warn'}">${esc(task.priority==='critical'?'kritisch':'prüfen')}</span></article>`).join('');
  view.innerHTML=`<div data-operational-live="tasks">${liveHeader('LIVE · ABGELEITET','Aufgaben & Planung','Automatisch aus aktuellen Sendungs- und Dokumentzuständen abgeleitet. Es werden noch keine separaten Aufgaben geschrieben oder als erledigt gespeichert.',`${fmt(tasks.length)} offen`)}<div class="cc-kpi-grid"><article class="cc-kpi" data-kpi-tone="critical"><span class="cc-kpi-icon">${icon('warning')}</span><div><span class="cc-kpi-label">Kritisch</span><strong class="cc-kpi-value">${fmt(critical)}</strong><small>Sperren zuerst prüfen</small></div></article><article class="cc-kpi" data-kpi-tone="warning"><span class="cc-kpi-icon">${icon('document')}</span><div><span class="cc-kpi-label">Gesamt offen</span><strong class="cc-kpi-value">${fmt(tasks.length)}</strong><small>aus echten Zuständen</small></div></article></div><section class="cc-panel"><div class="cc-action-list">${content||'<div class="cc-empty">Aktuell keine aus den Live-Zuständen ableitbaren Aufgaben.</div>'}</div></section></div>`;
  notifyRendered('tasks');
}
async function activateOperationsSession(){
  liveSession=true;ensureTasksSurface();const sequence=++activationSequence;
  const [shipmentsResult,documentsResult,tasksResult]=await Promise.allSettled([loadShipments(),loadDocuments(),loadTasks()]);
  if(sequence!==activationSequence)return;
  shipmentsResult.status==='fulfilled'?renderShipmentsWorkspace(shipmentsResult.value):renderShipmentsWorkspace([],shipmentsResult.reason);
  documentsResult.status==='fulfilled'?renderDocumentsWorkspace(documentsResult.value):renderDocumentsWorkspace([],documentsResult.reason);
  tasksResult.status==='fulfilled'?renderTasksWorkspace(tasksResult.value):renderTasksWorkspace([],tasksResult.reason);
}
async function refreshReadOnlyOperations(kind='all'){
  if(!liveSession)return;
  if(kind==='shipment'||kind==='all')loadShipments().then(renderShipmentsWorkspace).catch(error=>renderShipmentsWorkspace([],error));
  if(kind==='task'||kind==='all')loadTasks().then(renderTasksWorkspace).catch(error=>renderTasksWorkspace([],error));
}

document.querySelector('[data-nav="shipments"]')?.addEventListener('click',()=>{if(liveSession)loadShipments().then(renderShipmentsWorkspace).catch(error=>renderShipmentsWorkspace([],error));});
document.querySelector('[data-nav="documents"]')?.addEventListener('click',()=>{if(liveSession)loadDocuments().then(renderDocumentsWorkspace).catch(error=>renderDocumentsWorkspace([],error));});
window.addEventListener('professional:session-ready',event=>{
  if(event.detail?.local)return;
  if(event.detail?.session)activateOperationsSession();
});
window.addEventListener('professional:operations-changed',event=>refreshReadOnlyOperations(event.detail?.kind||'all'));

export {loadOperationsSummary,loadShipments,loadDocuments,loadTasks,activateOperationsSession,renderShipmentsWorkspace,renderDocumentsWorkspace,renderTasksWorkspace};

import('./operations-write.js').catch(()=>{});
