import {icon} from './ui-kit.js';

const $=selector=>document.querySelector(selector);
const SHIPMENT_WRITE_ROLES=new Set(['TENANT_ADMIN','EXPORT_ADMIN','TEAM_LEAD','OPERATOR']);
const TASK_WRITE_ROLES=new Set(['TENANT_ADMIN','EXPORT_ADMIN','TEAM_LEAD','OPERATOR']);
let liveSession=false;
let activationSequence=0;
let currentSession=null;
let operationsMeta=null;
let writesEnabled=false;
let shipmentCache=[];
let drawerMode='';

function esc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function fmt(value){return new Intl.NumberFormat('de-DE').format(Number(value||0));}
function dateLabel(value){
  if(!value)return '–';
  const date=new Date(value);if(Number.isNaN(date.getTime()))return esc(String(value));
  return new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}).format(date);
}
function dateTimeLabel(value){
  if(!value)return 'ohne Termin';
  const date=new Date(value);if(Number.isNaN(date.getTime()))return esc(String(value));
  return new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(date);
}
function stateKind(value){
  const state=String(value||'').toUpperCase();
  if(/VERIFIED|AVAILABLE|ABGESCHLOSSEN|ARCHIVIERT|POD VORHANDEN|DONE/.test(state))return 'good';
  if(/MISSING|ERROR|BLOCK|GESPERRT|FEHLT/.test(state))return 'bad';
  if(/WAIT|REMOTE|OPEN|OFFEN|P0|P1/.test(state))return 'warn';
  return 'neutral';
}
function role(){return String(currentSession?.user?.role||'');}
function csrfHeaders(){return currentSession?.csrfToken?{'x-professional-csrf':currentSession.csrfToken}:{};}
function canWriteShipments(){return liveSession&&writesEnabled&&SHIPMENT_WRITE_ROLES.has(role())&&!!currentSession?.csrfToken;}
function canWriteTasks(){return liveSession&&writesEnabled&&TASK_WRITE_ROLES.has(role())&&!!currentSession?.csrfToken;}
function writeGateLabel(){return writesEnabled?'Operative Writes serverseitig freigegeben':'Produktiver Write-Gate geschlossen';}

async function apiJson(url,options={}){
  const {headers={},...rest}=options;
  const response=await fetch(url,{credentials:'same-origin',...rest,headers:{'content-type':'application/json',...headers}});
  let body={};try{body=await response.json();}catch{}
  if(!response.ok){const error=new Error(body.message||`HTTP ${response.status}`);error.code=body.code||`HTTP_${response.status}`;throw error;}
  return body;
}

async function loadProfessionalMeta(){
  const meta=await apiJson('/api/professional-meta');
  operationsMeta=meta;
  writesEnabled=meta?.database?.writesEnabled===true;
  return meta;
}
async function loadOperationsSummary(){return apiJson('/api/professional-operations/summary');}
async function loadShipments(){const data=await apiJson('/api/professional-operations/shipments?limit=250');return Array.isArray(data.shipments)?data.shipments:[];}
async function loadDocuments(){const data=await apiJson('/api/professional-operations/documents?limit=500');return Array.isArray(data.documents)?data.documents:[];}
async function loadTasks(){const data=await apiJson('/api/professional-operations/tasks');return Array.isArray(data.tasks)?data.tasks:[];}
async function loadPersistentTasks(){
  if(!writesEnabled)return [];
  const data=await apiJson('/api/professional-tasks?status=all');
  return Array.isArray(data.tasks)?data.tasks:[];
}
async function loadTaskWorkspace(){
  const derived=await loadTasks();
  if(!writesEnabled)return {derived,persistent:[],persistentError:null};
  try{return {derived,persistent:await loadPersistentTasks(),persistentError:null};}
  catch(error){return {derived,persistent:[],persistentError:error};}
}

function activateView(name){
  document.querySelectorAll('[data-nav]').forEach(button=>button.classList.toggle('active',button.dataset.nav===name));
  document.querySelectorAll('.view').forEach(view=>view.classList.toggle('active',view.dataset.view===name));
}
function ensureTasksSurface(){
  const nav=document.querySelector('nav');
  if(nav&&!nav.querySelector('[data-nav="tasks"]')){
    const button=document.createElement('button');button.type='button';button.dataset.nav='tasks';button.textContent='Aufgaben & Planung';
    const documents=nav.querySelector('[data-nav="documents"]');nav.insertBefore(button,documents||null);
    button.addEventListener('click',()=>{activateView('tasks');if(liveSession)refreshTasksWorkspace();});
  }
  if(!$('[data-view="tasks"]')){
    const view=document.createElement('section');view.className='view';view.dataset.view='tasks';
    view.innerHTML='<div data-operational-live="tasks" class="cc-panel"><div class="cc-empty">Aufgaben werden geladen …</div></div>';
    const audit=$('[data-view="audit"]');audit?.parentNode?.insertBefore(view,audit||null);
  }
}
function liveHeader(kicker,title,subtitle,countLabel,actionHtml=''){
  return `<div class="section-head"><div><div class="kicker">${esc(kicker)}</div><h2>${esc(title)}</h2><p class="muted">${esc(subtitle)}</p></div><div class="toolbar">${actionHtml}<span class="cc-status good">${esc(countLabel)}</span></div></div>`;
}
function shipmentWriteButton(){
  const allowed=canWriteShipments();
  return `<button class="btn compact" type="button" data-operation-action="new-shipment" ${allowed?'':'disabled'} title="${esc(allowed?'Neue Sendung im aktuellen Firmenmandanten anlegen':writeGateLabel())}">Sendung erstellen</button>`;
}
function taskWriteButton(){
  const allowed=canWriteTasks();
  return `<button class="btn compact" type="button" data-operation-action="new-task" ${allowed?'':'disabled'} title="${esc(allowed?'Neue persistente Aufgabe anlegen':writeGateLabel())}">Aufgabe anlegen</button>`;
}
function renderShipmentsWorkspace(shipments=[],error=null){
  const view=$('[data-view="shipments"]');if(!view||!liveSession)return;
  shipmentCache=Array.isArray(shipments)?shipments:[];
  const mode=writesEnabled?'LIVE · WRITE-GATED':'LIVE · READ-ONLY';
  const subtitle=writesEnabled?'Echte Professional-Sendungen. Schreibaktionen bleiben zusätzlich rollen- und CSRF-geschützt.':'Echte Professional-Sendungen aus dem angemeldeten Firmenmandanten. Der produktive Write-Gate ist geschlossen.';
  if(error){view.innerHTML=`<div data-operational-live="shipments" class="cc-panel">${liveHeader(mode,'Sendungsarbeitsplatz',subtitle,'nicht verfügbar',shipmentWriteButton())}<div class="cc-empty">${esc(error.message||'Sendungen konnten nicht geladen werden.')}</div></div>`;return;}
  const rows=shipmentCache.map(shipment=>`<tr><td><strong class="mono">${esc(shipment.reference||'–')}</strong></td><td>${esc(shipment.customer_name||shipment.customer_account||'–')}</td><td>${esc([shipment.location_name,shipment.location_country].filter(Boolean).join(' · ')||'–')}</td><td><span class="cc-status ${stateKind(shipment.status)}">${esc(shipment.status||'–')}</span><small class="muted">${esc(shipment.process_status||shipment.source_status||'')}</small></td><td>${esc(dateLabel(shipment.actual_pickup_date||shipment.picked_up_at))}</td><td>${shipment.pod_evidence?'<span class="cc-status good">vorhanden</span>':'<span class="cc-status neutral">offen</span>'}</td><td>${shipment.locked?`<span class="cc-status bad">gesperrt</span><small class="muted">${esc(shipment.lock_reason||'Bearbeitung gesperrt')}</small>`:'<span class="cc-status good">frei</span>'}</td></tr>`).join('');
  view.innerHTML=`<div data-operational-live="shipments">${liveHeader(mode,'Sendungsarbeitsplatz',subtitle,`${fmt(shipmentCache.length)} Sendungen`,shipmentWriteButton())}<div class="cc-panel"><div class="table-wrap"><table><thead><tr><th>Referenz</th><th>Kunde</th><th>Standort</th><th>Status</th><th>Abholung</th><th>POD</th><th>Sperre</th></tr></thead><tbody>${rows||'<tr><td colspan="7" class="muted">Noch keine Sendungen im Professional-Bestand.</td></tr>'}</tbody></table></div></div></div>`;
  view.querySelector('[data-operation-action="new-shipment"]')?.addEventListener('click',openShipmentCreateDrawer);
}
function renderDocumentsWorkspace(documents=[],error=null){
  const view=$('[data-view="documents"]');if(!view||!liveSession)return;
  if(error){view.innerHTML=`<div data-operational-live="documents" class="cc-panel">${liveHeader('LIVE · READ-ONLY','Dokumentenkontrolle','Tenant-isoliertes Professional-Dokumentregister.','nicht verfügbar')}<div class="cc-empty">${esc(error.message||'Dokumente konnten nicht geladen werden.')}</div></div>`;return;}
  const actions=documents.filter(document=>document.cutover_blocking!==false&&!['VERIFIED_INLINE','VERIFIED','AVAILABLE'].includes(String(document.verification_status||'').toUpperCase())).length;
  const rows=documents.map(document=>`<tr><td><strong class="mono">${esc(document.shipment_reference||'–')}</strong></td><td>${esc(document.kind||'–')}</td><td>${esc(document.original_name||'–')}</td><td><span class="cc-status ${stateKind(document.verification_status)}">${esc(document.verification_status||'–')}</span></td><td>${esc(document.recovery_action||'–')}</td><td>${esc(document.migration_priority||'–')}</td></tr>`).join('');
  view.innerHTML=`<div data-operational-live="documents">${liveHeader('LIVE · READ-ONLY','Dokumentenkontrolle','Pflicht- und Nachweisdokumente werden aus dem echten tenant-isolierten Professional-Register gelesen. Uploads bleiben bis zu ihrem eigenen Write-Release gesperrt.',`${fmt(actions)} prüfen`)}<div class="cc-panel"><div class="table-wrap"><table><thead><tr><th>Sendung</th><th>Art</th><th>Datei</th><th>Prüfstatus</th><th>Wiederherstellung</th><th>Priorität</th></tr></thead><tbody>${rows||'<tr><td colspan="6" class="muted">Noch keine Dokumente im Professional-Bestand.</td></tr>'}</tbody></table></div></div></div>`;
}
function persistentTaskHtml(task){
  const status=String(task.status||'OPEN').toUpperCase(),done=status==='DONE',priority=String(task.priority||'P2').toUpperCase();
  const next=done?'OPEN':'DONE';
  return `<article class="cc-action-row ${done?'good':(['P0','P1'].includes(priority)?'bad':'warn')}"><span class="cc-action-icon">${icon('task')}</span><div><strong>${esc(task.title||'Aufgabe')}</strong><small>${esc(task.shipment_reference||'ohne Sendung')} · ${esc(priority)} · ${esc(dateTimeLabel(task.due_at))}${task.description?` · ${esc(task.description)}`:''}</small></div><div class="toolbar"><span class="cc-status ${done?'good':stateKind(priority)}">${esc(done?'erledigt':priority)}</span>${canWriteTasks()?`<button class="ghost compact" type="button" data-task-status-id="${esc(task.id)}" data-task-next-status="${esc(next)}">${done?'Wieder öffnen':'Erledigt'}</button>`:''}</div></article>`;
}
function derivedTaskHtml(task){
  const critical=task.priority==='critical';
  return `<article class="cc-action-row ${critical?'bad':'warn'}"><span class="cc-action-icon">${icon(task.source==='shipment'?'shipment':'document')}</span><div><strong>${esc(task.title||'Prüfung erforderlich')}</strong><small>${esc(task.reference||'–')} · ${esc(task.reason||'')}</small></div><span class="cc-status ${critical?'bad':'warn'}">${esc(critical?'kritisch':'prüfen')}</span></article>`;
}
function renderTasksWorkspace(tasks=[],error=null,persistentTasks=[],persistentError=null){
  ensureTasksSurface();const view=$('[data-view="tasks"]');if(!view||!liveSession)return;
  const derived=Array.isArray(tasks)?tasks:[],persistent=Array.isArray(persistentTasks)?persistentTasks:[];
  if(error){view.innerHTML=`<div data-operational-live="tasks" class="cc-panel">${liveHeader('LIVE · AUFGABEN','Aufgaben & Planung','Aus echten Sendungs- und Dokumentzuständen abgeleitete Arbeitsliste.','nicht verfügbar',taskWriteButton())}<div class="cc-empty">${esc(error.message||'Aufgaben konnten nicht geladen werden.')}</div></div>`;return;}
  const openPersistent=persistent.filter(task=>String(task.status||'').toUpperCase()==='OPEN');
  const critical=derived.filter(task=>task.priority==='critical').length+openPersistent.filter(task=>['P0','P1'].includes(String(task.priority||'').toUpperCase())).length;
  const persistentSection=writesEnabled?`<section class="cc-panel section"><div class="section-head"><div><div class="kicker">PERSISTENTE AUFGABEN</div><h3>Planung & Verantwortung</h3><p class="muted">Aufgaben werden tenant-isoliert gespeichert und können dauerhaft erledigt bzw. wieder geöffnet werden.</p></div><span class="cc-status ${persistentError?'bad':'good'}">${persistentError?'nicht verfügbar':`${fmt(openPersistent.length)} offen`}</span></div>${persistentError?`<div class="cc-empty">${esc(persistentError.message||'Persistente Aufgaben konnten nicht geladen werden.')}</div>`:`<div class="cc-action-list">${persistent.map(persistentTaskHtml).join('')||'<div class="cc-empty">Noch keine persistenten Aufgaben vorhanden.</div>'}</div>`}</section>`:'';
  const derivedContent=derived.map(derivedTaskHtml).join('');
  const subtitle=writesEnabled?'Systemhinweise bleiben automatisch abgeleitet; zusätzlich stehen persistente Aufgaben hinter Rollen- und CSRF-Schutz bereit.':'Automatisch aus aktuellen Sendungs- und Dokumentzuständen abgeleitet. Persistente Aufgaben bleiben bei geschlossenem Write-Gate deaktiviert.';
  view.innerHTML=`<div data-operational-live="tasks">${liveHeader(writesEnabled?'LIVE · WRITE-GATED':'LIVE · ABGELEITET','Aufgaben & Planung',subtitle,`${fmt(derived.length+openPersistent.length)} offen`,taskWriteButton())}<div class="cc-kpi-grid"><article class="cc-kpi" data-kpi-tone="critical"><span class="cc-kpi-icon">${icon('warning')}</span><div><span class="cc-kpi-label">Kritisch P0/P1</span><strong class="cc-kpi-value">${fmt(critical)}</strong><small>Sperren und P0/P1 zuerst</small></div></article><article class="cc-kpi" data-kpi-tone="warning"><span class="cc-kpi-icon">${icon('document')}</span><div><span class="cc-kpi-label">Systemhinweise</span><strong class="cc-kpi-value">${fmt(derived.length)}</strong><small>aus echten Zuständen</small></div></article><article class="cc-kpi" data-kpi-tone="neutral"><span class="cc-kpi-icon">${icon('task')}</span><div><span class="cc-kpi-label">Persistente Aufgaben</span><strong class="cc-kpi-value">${fmt(openPersistent.length)}</strong><small>${esc(writesEnabled?'dauerhaft geplant':'Write-Gate geschlossen')}</small></div></article></div>${persistentSection}<section class="cc-panel section"><div class="section-head"><div><div class="kicker">SYSTEMHINWEISE</div><h3>Automatisch erkannter Handlungsbedarf</h3></div><span class="cc-status warn">${fmt(derived.length)} offen</span></div><div class="cc-action-list">${derivedContent||'<div class="cc-empty">Aktuell keine aus den Live-Zuständen ableitbaren Aufgaben.</div>'}</div></section></div>`;
  view.querySelector('[data-operation-action="new-task"]')?.addEventListener('click',openTaskCreateDrawer);
  view.querySelectorAll('[data-task-status-id]').forEach(button=>button.addEventListener('click',()=>setPersistentTaskStatus(button.dataset.taskStatusId,button.dataset.taskNextStatus,button)));
}

function ensureOperationsDrawer(){
  let backdrop=$('#operationsDrawerBackdrop'),drawer=$('#operationsDrawer');
  if(backdrop&&drawer)return {backdrop,drawer};
  backdrop=document.createElement('div');backdrop.id='operationsDrawerBackdrop';backdrop.className='drawer-backdrop hidden';
  drawer=document.createElement('aside');drawer.id='operationsDrawer';drawer.className='masterdata-drawer hidden';drawer.setAttribute('aria-live','polite');
  document.body.append(backdrop,drawer);
  backdrop.addEventListener('click',closeOperationsDrawer);
  return {backdrop,drawer};
}
function showOperationsDrawer(kicker,title,bodyHtml){
  const {backdrop,drawer}=ensureOperationsDrawer();
  drawer.innerHTML=`<header class="drawer-head"><div><div class="kicker">${esc(kicker)}</div><h2>${esc(title)}</h2></div><button class="ghost compact" type="button" data-operation-drawer-close>Schließen</button></header><div class="drawer-body">${bodyHtml}</div>`;
  backdrop.classList.remove('hidden');drawer.classList.remove('hidden');
  drawer.querySelector('[data-operation-drawer-close]')?.addEventListener('click',closeOperationsDrawer);
  return drawer;
}
function closeOperationsDrawer(){
  drawerMode='';$('#operationsDrawerBackdrop')?.classList.add('hidden');$('#operationsDrawer')?.classList.add('hidden');
}
function drawerError(message=''){
  const target=$('#operationsDrawerError');if(!target)return;
  target.textContent=message;target.classList.toggle('hidden',!message);
}

async function activeCustomerOptions(){
  const data=await apiJson('/api/professional-masterdata/customers?q=&status=active');
  return Array.isArray(data.customers)?data.customers:[];
}
async function loadCustomerLocations(customerId,select){
  if(!select)return;
  if(!customerId){select.innerHTML='<option value="">Zuerst Kunde auswählen</option>';select.disabled=true;return;}
  select.disabled=true;select.innerHTML='<option value="">Standorte werden geladen …</option>';
  try{
    const data=await apiJson(`/api/professional-masterdata/customers/${encodeURIComponent(customerId)}`);
    const locations=(Array.isArray(data.customer?.locations)?data.customer.locations:[]).filter(location=>location.active!==false);
    select.innerHTML=`<option value="">Standort auswählen</option>${locations.map(location=>`<option value="${esc(location.id)}">${esc([location.name,location.city,location.country].filter(Boolean).join(' · '))}</option>`).join('')}`;
    select.disabled=locations.length===0;
    if(!locations.length)select.innerHTML='<option value="">Keine aktiven Standorte vorhanden</option>';
  }catch(error){select.innerHTML='<option value="">Standorte nicht verfügbar</option>';drawerError(error.message||'Standorte konnten nicht geladen werden.');}
}
async function openShipmentCreateDrawer(){
  if(!canWriteShipments())return;
  drawerMode='shipment';
  const drawer=showOperationsDrawer('LIVE · SENDUNG','Sendung erstellen','<div class="cc-empty">Kunden und Standorte werden geladen …</div>');
  try{
    const customers=await activeCustomerOptions();if(drawerMode!=='shipment')return;
    const body=drawer.querySelector('.drawer-body');if(!body)return;
    body.innerHTML=`<form id="shipmentCreateForm" class="masterdata-form"><div id="operationsDrawerError" class="drawer-error hidden"></div><section class="masterdata-form-section"><h3>Neue Sendung</h3><p class="muted">Die Referenz wird serverseitig erneut geprüft. Kunde und Standort müssen zum aktuellen Firmenmandanten gehören.</p><div class="masterdata-form-grid"><div class="masterdata-form-field"><label for="shipmentReference">Referenz *</label><input id="shipmentReference" name="reference" maxlength="6" minlength="6" pattern="[A-Z0-9]{6}" autocomplete="off" required placeholder="AB12CD"><div class="drawer-help">Exakt 6 Zeichen A–Z / 0–9.</div></div><div class="masterdata-form-field"><label for="shipmentCustomer">Kunde *</label><select id="shipmentCustomer" name="customerId" required><option value="">Kunde auswählen</option>${customers.map(customer=>`<option value="${esc(customer.id)}">${esc([customer.account,customer.name].filter(Boolean).join(' · '))}</option>`).join('')}</select></div><div class="masterdata-form-field full"><label for="shipmentLocation">Standort *</label><select id="shipmentLocation" name="locationId" disabled required><option value="">Zuerst Kunde auswählen</option></select></div></div></section><div class="notice">Neue Sendungen starten kontrolliert im Status <b>Entwurf</b>. Statuswechsel, Dokument-Upload und Abholung sind nicht Bestandteil dieses Write-Blocks.</div><div class="drawer-actions"><button class="ghost" type="button" data-operation-drawer-cancel>Abbrechen</button><button class="btn" type="submit">Sendung erstellen</button></div></form>`;
    const form=body.querySelector('#shipmentCreateForm'),customer=body.querySelector('#shipmentCustomer'),location=body.querySelector('#shipmentLocation'),reference=body.querySelector('#shipmentReference');
    body.querySelector('[data-operation-drawer-cancel]')?.addEventListener('click',closeOperationsDrawer);
    reference?.addEventListener('input',()=>{reference.value=reference.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);});
    customer?.addEventListener('change',()=>loadCustomerLocations(customer.value,location));
    form?.addEventListener('submit',async event=>{
      event.preventDefault();if(!canWriteShipments())return drawerError(writeGateLabel());
      const submit=form.querySelector('button[type="submit"]');submit.disabled=true;drawerError('');
      try{
        await apiJson('/api/professional-operations/shipments',{method:'POST',headers:csrfHeaders(),body:JSON.stringify({reference:reference.value,customerId:customer.value,locationId:location.value})});
        closeOperationsDrawer();
        const shipments=await loadShipments();renderShipmentsWorkspace(shipments);
        window.dispatchEvent(new CustomEvent('professional:operations-changed',{detail:{kind:'shipment'}}));
      }catch(error){drawerError(error.message||'Sendung konnte nicht angelegt werden.');}
      finally{submit.disabled=false;}
    });
  }catch(error){if(drawerMode==='shipment')drawer.querySelector('.drawer-body').innerHTML=`<div class="drawer-error">${esc(error.message||'Kunden konnten nicht geladen werden.')}</div>`;}
}

async function openTaskCreateDrawer(){
  if(!canWriteTasks())return;
  drawerMode='task';
  const drawer=showOperationsDrawer('LIVE · PLANUNG','Aufgabe anlegen',`<form id="taskCreateForm" class="masterdata-form"><div id="operationsDrawerError" class="drawer-error hidden"></div><section class="masterdata-form-section"><h3>Persistente Aufgabe</h3><p class="muted">Die Aufgabe wird im aktuellen Firmenmandanten gespeichert und bleibt bis zur Erledigung sichtbar.</p><div class="masterdata-form-grid"><div class="masterdata-form-field full"><label for="taskTitle">Aufgabe *</label><input id="taskTitle" name="title" maxlength="200" required placeholder="z. B. ABD prüfen"></div><div class="masterdata-form-field"><label for="taskPriority">Priorität</label><select id="taskPriority" name="priority"><option>P0</option><option>P1</option><option selected>P2</option><option>P3</option><option>P4</option></select></div><div class="masterdata-form-field"><label for="taskDueAt">Termin</label><input id="taskDueAt" name="dueAt" type="datetime-local"></div><div class="masterdata-form-field full"><label for="taskShipment">Sendung</label><select id="taskShipment" name="shipmentId"><option value="">Keine Sendung verknüpfen</option>${shipmentCache.map(shipment=>`<option value="${esc(shipment.id)}">${esc([shipment.reference,shipment.customer_name||shipment.customer_account].filter(Boolean).join(' · '))}</option>`).join('')}</select></div><div class="masterdata-form-field full"><label for="taskDescription">Beschreibung</label><textarea id="taskDescription" name="description" maxlength="2000" placeholder="Optionaler Arbeits- oder Übergabehinweis"></textarea></div></div></section><div class="drawer-actions"><button class="ghost" type="button" data-operation-drawer-cancel>Abbrechen</button><button class="btn" type="submit">Aufgabe anlegen</button></div></form>`);
  const form=drawer.querySelector('#taskCreateForm');
  drawer.querySelector('[data-operation-drawer-cancel]')?.addEventListener('click',closeOperationsDrawer);
  form?.addEventListener('submit',async event=>{
    event.preventDefault();if(!canWriteTasks())return drawerError(writeGateLabel());
    const submit=form.querySelector('button[type="submit"]');submit.disabled=true;drawerError('');
    const dueRaw=form.elements.dueAt.value;
    let dueAt=null;if(dueRaw){const parsed=new Date(dueRaw);if(Number.isNaN(parsed.getTime())){submit.disabled=false;return drawerError('Aufgabentermin ist ungültig.');}dueAt=parsed.toISOString();}
    try{
      await apiJson('/api/professional-tasks',{method:'POST',headers:csrfHeaders(),body:JSON.stringify({title:form.elements.title.value,description:form.elements.description.value,priority:form.elements.priority.value,dueAt,shipmentId:form.elements.shipmentId.value})});
      closeOperationsDrawer();await refreshTasksWorkspace();
      window.dispatchEvent(new CustomEvent('professional:operations-changed',{detail:{kind:'task'}}));
    }catch(error){drawerError(error.message||'Aufgabe konnte nicht angelegt werden.');}
    finally{submit.disabled=false;}
  });
}
async function setPersistentTaskStatus(taskId,status,button){
  if(!canWriteTasks()||!taskId)return;
  if(button)button.disabled=true;
  try{
    await apiJson(`/api/professional-tasks/${encodeURIComponent(taskId)}/status`,{method:'PATCH',headers:csrfHeaders(),body:JSON.stringify({status})});
    await refreshTasksWorkspace();window.dispatchEvent(new CustomEvent('professional:operations-changed',{detail:{kind:'task'}}));
  }catch(error){alert(error.message||'Aufgabenstatus konnte nicht geändert werden.');if(button)button.disabled=false;}
}
async function refreshTasksWorkspace(){
  if(!liveSession)return;
  try{const data=await loadTaskWorkspace();renderTasksWorkspace(data.derived,null,data.persistent,data.persistentError);}
  catch(error){renderTasksWorkspace([],error,[],null);}
}

async function activateOperationsSession(session=currentSession){
  currentSession=session||currentSession;liveSession=true;ensureTasksSurface();const sequence=++activationSequence;
  try{await loadProfessionalMeta();}catch{operationsMeta=null;writesEnabled=false;}
  const [shipmentsResult,documentsResult,tasksResult]=await Promise.allSettled([loadShipments(),loadDocuments(),loadTaskWorkspace()]);
  if(sequence!==activationSequence)return;
  shipmentsResult.status==='fulfilled'?renderShipmentsWorkspace(shipmentsResult.value):renderShipmentsWorkspace([],shipmentsResult.reason);
  documentsResult.status==='fulfilled'?renderDocumentsWorkspace(documentsResult.value):renderDocumentsWorkspace([],documentsResult.reason);
  if(tasksResult.status==='fulfilled')renderTasksWorkspace(tasksResult.value.derived,null,tasksResult.value.persistent,tasksResult.value.persistentError);
  else renderTasksWorkspace([],tasksResult.reason,[],null);
}

document.querySelector('[data-nav="shipments"]')?.addEventListener('click',()=>{if(liveSession)loadShipments().then(renderShipmentsWorkspace).catch(error=>renderShipmentsWorkspace([],error));});
document.querySelector('[data-nav="documents"]')?.addEventListener('click',()=>{if(liveSession)loadDocuments().then(renderDocumentsWorkspace).catch(error=>renderDocumentsWorkspace([],error));});
window.addEventListener('professional:session-ready',event=>{
  if(event.detail?.local){liveSession=false;currentSession=null;operationsMeta=null;writesEnabled=false;closeOperationsDrawer();return;}
  if(event.detail?.session)activateOperationsSession(event.detail.session);
});

export {loadProfessionalMeta,loadOperationsSummary,loadShipments,loadDocuments,loadTasks,loadPersistentTasks,activateOperationsSession,renderShipmentsWorkspace,renderDocumentsWorkspace,renderTasksWorkspace};
