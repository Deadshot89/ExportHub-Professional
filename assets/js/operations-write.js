import {loadShipments} from './operations.js';

const SHIPMENT_WRITE_ROLES=new Set(['TENANT_ADMIN','EXPORT_ADMIN','TEAM_LEAD','OPERATOR']);
const TASK_WRITE_ROLES=new Set(['TENANT_ADMIN','EXPORT_ADMIN','TEAM_LEAD','OPERATOR']);
let currentSession=null;
let writesEnabled=false;
let enhancementSequence=0;
let sessionSequence=0;
let drawerMode='';

function esc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function role(){return String(currentSession?.user?.role||'');}
function csrfHeaders(){return currentSession?.csrfToken?{'x-professional-csrf':currentSession.csrfToken}:{};}
function canWriteShipments(){return writesEnabled&&SHIPMENT_WRITE_ROLES.has(role())&&!!currentSession?.csrfToken;}
function canWriteTasks(){return writesEnabled&&TASK_WRITE_ROLES.has(role())&&!!currentSession?.csrfToken;}
function dateTimeLabel(value){
  if(!value)return 'ohne Termin';
  const date=new Date(value);if(Number.isNaN(date.getTime()))return String(value);
  return new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(date);
}
async function apiJson(url,options={}){
  const {headers={},...rest}=options;
  const response=await fetch(url,{credentials:'same-origin',...rest,headers:{'content-type':'application/json',...headers}});
  let body={};try{body=await response.json();}catch{}
  if(!response.ok){const error=new Error(body.message||`HTTP ${response.status}`);error.code=body.code||`HTTP_${response.status}`;throw error;}
  return body;
}
async function loadProfessionalMeta(){
  const meta=await apiJson('/api/professional-meta');
  writesEnabled=meta?.database?.writesEnabled===true;
  return meta;
}
async function loadPersistentTasks(){
  const data=await apiJson('/api/professional-tasks?status=all');
  return Array.isArray(data.tasks)?data.tasks:[];
}
function emitChanged(kind){window.dispatchEvent(new CustomEvent('professional:operations-changed',{detail:{kind}}));}

function ensureActionButton(viewName,label,action,allowed){
  const root=document.querySelector(`[data-operational-live="${viewName}"]`),head=root?.querySelector('.section-head');
  if(!head)return null;
  let button=head.querySelector(`[data-operation-write="${action}"]`);
  if(!writesEnabled){button?.remove();return null;}
  if(!button){
    button=document.createElement('button');button.type='button';button.className='btn compact';button.dataset.operationWrite=action;button.textContent=label;
    const status=head.querySelector('.cc-status');status?.before(button);if(!status)head.append(button);
  }
  button.disabled=!allowed;
  button.title=allowed?label:'Keine Schreibberechtigung für diese Rolle.';
  return button;
}
async function enhanceShipments(){
  const button=ensureActionButton('shipments','Sendung erstellen','new-shipment',canWriteShipments());
  if(button&&!button.dataset.wired){button.dataset.wired='true';button.addEventListener('click',openShipmentCreateDrawer);}
}
function persistentTaskRow(task){
  const done=String(task.status||'OPEN').toUpperCase()==='DONE',priority=String(task.priority||'P2').toUpperCase();
  const next=done?'OPEN':'DONE';
  return `<article class="cc-action-row ${done?'good':(['P0','P1'].includes(priority)?'bad':'warn')}"><span class="cc-action-icon">✓</span><div><strong>${esc(task.title||'Aufgabe')}</strong><small>${esc(task.shipment_reference||'ohne Sendung')} · ${esc(priority)} · ${esc(dateTimeLabel(task.due_at))}${task.description?` · ${esc(task.description)}`:''}</small></div><div class="toolbar"><span class="cc-status ${done?'good':'warn'}">${esc(done?'erledigt':priority)}</span>${canWriteTasks()?`<button class="ghost compact" type="button" data-persistent-task-id="${esc(task.id)}" data-next-status="${esc(next)}">${done?'Wieder öffnen':'Erledigt'}</button>`:''}</div></article>`;
}
async function enhanceTasks(){
  const root=document.querySelector('[data-operational-live="tasks"]');if(!root||!writesEnabled)return;
  const button=ensureActionButton('tasks','Aufgabe anlegen','new-task',canWriteTasks());
  if(button&&!button.dataset.wired){button.dataset.wired='true';button.addEventListener('click',openTaskCreateDrawer);}
  const sequence=++enhancementSequence;
  let panel=root.querySelector('[data-persistent-task-panel]');
  if(!panel){panel=document.createElement('section');panel.className='cc-panel section';panel.dataset.persistentTaskPanel='true';root.append(panel);}
  panel.innerHTML='<div class="cc-empty">Persistente Aufgaben werden geladen …</div>';
  try{
    const tasks=await loadPersistentTasks();if(sequence!==enhancementSequence||!document.body.contains(panel))return;
    const open=tasks.filter(task=>String(task.status||'').toUpperCase()==='OPEN').length;
    panel.innerHTML=`<div class="section-head"><div><div class="kicker">PERSISTENTE AUFGABEN</div><h3>Planung & Verantwortung</h3><p class="muted">Tenant-isoliert gespeichert; Systemhinweise darüber bleiben weiterhin automatisch abgeleitet.</p></div><span class="cc-status good">${open} offen</span></div><div class="cc-action-list">${tasks.map(persistentTaskRow).join('')||'<div class="cc-empty">Noch keine persistenten Aufgaben vorhanden.</div>'}</div>`;
    panel.querySelectorAll('[data-persistent-task-id]').forEach(taskButton=>taskButton.addEventListener('click',()=>setTaskStatus(taskButton.dataset.persistentTaskId,taskButton.dataset.nextStatus,taskButton)));
  }catch(error){if(sequence===enhancementSequence)panel.innerHTML=`<div class="cc-empty">${esc(error.message||'Persistente Aufgaben konnten nicht geladen werden.')}</div>`;}
}
async function enhanceRenderedView(view){
  if(!writesEnabled)return;
  if(view==='shipments')await enhanceShipments();
  if(view==='tasks')await enhanceTasks();
}
function enhanceCurrentSurfaces(){enhanceShipments();enhanceTasks();}

function ensureDrawer(){
  let backdrop=document.querySelector('#operationsWriteBackdrop'),drawer=document.querySelector('#operationsWriteDrawer');
  if(backdrop&&drawer)return {backdrop,drawer};
  backdrop=document.createElement('div');backdrop.id='operationsWriteBackdrop';backdrop.className='drawer-backdrop hidden';
  drawer=document.createElement('aside');drawer.id='operationsWriteDrawer';drawer.className='masterdata-drawer hidden';drawer.setAttribute('role','dialog');drawer.setAttribute('aria-modal','true');
  document.body.append(backdrop,drawer);backdrop.addEventListener('click',closeDrawer);
  return {backdrop,drawer};
}
function showDrawer(kicker,title,html){
  const {backdrop,drawer}=ensureDrawer();
  drawer.innerHTML=`<header class="drawer-head"><div><div class="kicker">${esc(kicker)}</div><h2>${esc(title)}</h2></div><button class="ghost compact" type="button" data-write-close>Schließen</button></header><div class="drawer-body">${html}</div>`;
  backdrop.classList.remove('hidden');drawer.classList.remove('hidden');drawer.querySelector('[data-write-close]')?.addEventListener('click',closeDrawer);return drawer;
}
function closeDrawer(){drawerMode='';document.querySelector('#operationsWriteBackdrop')?.classList.add('hidden');document.querySelector('#operationsWriteDrawer')?.classList.add('hidden');}
function showDrawerError(message=''){const node=document.querySelector('#operationsWriteError');if(node){node.textContent=message;node.classList.toggle('hidden',!message);}}

async function activeCustomers(){
  const data=await apiJson('/api/professional-masterdata/customers?q=&status=active');
  return Array.isArray(data.customers)?data.customers:[];
}
async function loadCustomerLocations(customerId,select){
  if(!select)return;
  if(!customerId){select.disabled=true;select.innerHTML='<option value="">Zuerst Kunde auswählen</option>';return;}
  select.disabled=true;select.innerHTML='<option value="">Standorte werden geladen …</option>';
  try{
    const data=await apiJson(`/api/professional-masterdata/customers/${encodeURIComponent(customerId)}`);
    const locations=(Array.isArray(data.customer?.locations)?data.customer.locations:[]).filter(location=>location.active!==false);
    select.innerHTML=`<option value="">Standort auswählen</option>${locations.map(location=>`<option value="${esc(location.id)}">${esc([location.name,location.city,location.country].filter(Boolean).join(' · '))}</option>`).join('')}`;
    select.disabled=locations.length===0;
  }catch(error){select.innerHTML='<option value="">Standorte nicht verfügbar</option>';showDrawerError(error.message||'Standorte konnten nicht geladen werden.');}
}
async function openShipmentCreateDrawer(){
  if(!canWriteShipments())return;
  drawerMode='shipment';const drawer=showDrawer('LIVE · SENDUNG','Sendung erstellen','<div class="cc-empty">Kunden werden geladen …</div>');
  try{
    const customers=await activeCustomers();if(drawerMode!=='shipment')return;
    const body=drawer.querySelector('.drawer-body');
    body.innerHTML=`<form id="shipmentWriteForm" class="masterdata-form"><div id="operationsWriteError" class="drawer-error hidden"></div><section class="masterdata-form-section"><h3>Neue Sendung</h3><p class="muted">Referenz, Kunde und Standort werden serverseitig im aktuellen Firmenmandanten geprüft.</p><div class="masterdata-form-grid"><div class="masterdata-form-field"><label for="writeShipmentReference">Referenz *</label><input id="writeShipmentReference" maxlength="6" minlength="6" pattern="[A-Z0-9]{6}" required placeholder="AB12CD"><div class="drawer-help">Exakt 6 Zeichen A–Z / 0–9.</div></div><div class="masterdata-form-field"><label for="writeShipmentCustomer">Kunde *</label><select id="writeShipmentCustomer" required><option value="">Kunde auswählen</option>${customers.map(customer=>`<option value="${esc(customer.id)}">${esc([customer.account,customer.name].filter(Boolean).join(' · '))}</option>`).join('')}</select></div><div class="masterdata-form-field full"><label for="writeShipmentLocation">Standort *</label><select id="writeShipmentLocation" disabled required><option value="">Zuerst Kunde auswählen</option></select></div></div></section><div class="notice">Die neue Sendung startet im Status <b>Entwurf</b>.</div><div class="drawer-actions"><button class="ghost" type="button" data-write-cancel>Abbrechen</button><button class="btn" type="submit">Sendung erstellen</button></div></form>`;
    const form=body.querySelector('#shipmentWriteForm'),reference=body.querySelector('#writeShipmentReference'),customer=body.querySelector('#writeShipmentCustomer'),location=body.querySelector('#writeShipmentLocation');
    body.querySelector('[data-write-cancel]')?.addEventListener('click',closeDrawer);
    reference.addEventListener('input',()=>{reference.value=reference.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);});
    customer.addEventListener('change',()=>loadCustomerLocations(customer.value,location));
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(!canWriteShipments())return showDrawerError('Schreibzugriff ist nicht freigegeben.');
      const submit=form.querySelector('button[type="submit"]');submit.disabled=true;showDrawerError('');
      try{
        await apiJson('/api/professional-operations/shipments',{method:'POST',headers:csrfHeaders(),body:JSON.stringify({reference:reference.value,customerId:customer.value,locationId:location.value})});
        closeDrawer();emitChanged('shipment');
      }catch(error){showDrawerError(error.message||'Sendung konnte nicht erstellt werden.');}
      finally{submit.disabled=false;}
    });
  }catch(error){if(drawerMode==='shipment')drawer.querySelector('.drawer-body').innerHTML=`<div class="drawer-error">${esc(error.message||'Kunden konnten nicht geladen werden.')}</div>`;}
}

async function openTaskCreateDrawer(){
  if(!canWriteTasks())return;
  drawerMode='task';
  let shipments=[];try{shipments=await loadShipments();}catch{}
  if(drawerMode!=='task')return;
  const drawer=showDrawer('LIVE · PLANUNG','Aufgabe anlegen',`<form id="taskWriteForm" class="masterdata-form"><div id="operationsWriteError" class="drawer-error hidden"></div><section class="masterdata-form-section"><h3>Persistente Aufgabe</h3><p class="muted">Die Aufgabe wird im aktuellen Firmenmandanten gespeichert.</p><div class="masterdata-form-grid"><div class="masterdata-form-field full"><label for="writeTaskTitle">Aufgabe *</label><input id="writeTaskTitle" maxlength="200" required placeholder="z. B. ABD prüfen"></div><div class="masterdata-form-field"><label for="writeTaskPriority">Priorität</label><select id="writeTaskPriority"><option>P0</option><option>P1</option><option selected>P2</option><option>P3</option><option>P4</option></select></div><div class="masterdata-form-field"><label for="writeTaskDue">Termin</label><input id="writeTaskDue" type="datetime-local"></div><div class="masterdata-form-field full"><label for="writeTaskShipment">Sendung</label><select id="writeTaskShipment"><option value="">Keine Sendung verknüpfen</option>${shipments.map(shipment=>`<option value="${esc(shipment.id)}">${esc([shipment.reference,shipment.customer_name||shipment.customer_account].filter(Boolean).join(' · '))}</option>`).join('')}</select></div><div class="masterdata-form-field full"><label for="writeTaskDescription">Beschreibung</label><textarea id="writeTaskDescription" maxlength="2000"></textarea></div></div></section><div class="drawer-actions"><button class="ghost" type="button" data-write-cancel>Abbrechen</button><button class="btn" type="submit">Aufgabe anlegen</button></div></form>`);
  const form=drawer.querySelector('#taskWriteForm');drawer.querySelector('[data-write-cancel]')?.addEventListener('click',closeDrawer);
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!canWriteTasks())return showDrawerError('Schreibzugriff ist nicht freigegeben.');
    const dueRaw=form.querySelector('#writeTaskDue').value;let dueAt=null;
    if(dueRaw){const date=new Date(dueRaw);if(Number.isNaN(date.getTime()))return showDrawerError('Aufgabentermin ist ungültig.');dueAt=date.toISOString();}
    const submit=form.querySelector('button[type="submit"]');submit.disabled=true;showDrawerError('');
    try{
      await apiJson('/api/professional-tasks',{method:'POST',headers:csrfHeaders(),body:JSON.stringify({title:form.querySelector('#writeTaskTitle').value,description:form.querySelector('#writeTaskDescription').value,priority:form.querySelector('#writeTaskPriority').value,dueAt,shipmentId:form.querySelector('#writeTaskShipment').value})});
      closeDrawer();emitChanged('task');
    }catch(error){showDrawerError(error.message||'Aufgabe konnte nicht angelegt werden.');}
    finally{submit.disabled=false;}
  });
}
async function setTaskStatus(taskId,status,button){
  if(!canWriteTasks()||!taskId)return;if(button)button.disabled=true;
  try{await apiJson(`/api/professional-tasks/${encodeURIComponent(taskId)}/status`,{method:'PATCH',headers:csrfHeaders(),body:JSON.stringify({status})});emitChanged('task');}
  catch(error){alert(error.message||'Aufgabenstatus konnte nicht geändert werden.');if(button)button.disabled=false;}
}
async function activateWriteSession(session){
  const sequence=++sessionSequence;currentSession=session||null;writesEnabled=false;
  if(!currentSession)return;
  try{await loadProfessionalMeta();}catch{writesEnabled=false;}
  if(sequence!==sessionSequence)return;
  if(writesEnabled)enhanceCurrentSurfaces();
}

window.addEventListener('professional:session-ready',event=>{
  if(event.detail?.local){sessionSequence++;currentSession=null;writesEnabled=false;closeDrawer();return;}
  if(event.detail?.session)activateWriteSession(event.detail.session);
});
window.addEventListener('professional:operations-rendered',event=>enhanceRenderedView(event.detail?.view));
window.addEventListener('professional:operations-changed',event=>{if(writesEnabled&&event.detail?.kind==='task')setTimeout(()=>enhanceTasks(),0);});

apiJson('/api/professional-auth/session').then(session=>{if(!currentSession)activateWriteSession(session);}).catch(()=>{});

export {loadProfessionalMeta,loadPersistentTasks,enhanceShipments,enhanceTasks};
