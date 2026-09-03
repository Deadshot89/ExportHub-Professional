import {icon} from './ui-kit.js';

const $=s=>document.querySelector(s);
let sessionState={local:true,session:null};
let overviewSequence=0;

function controlCenterIcon(name){return icon(name);}
function esc(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function fmt(value){return new Intl.NumberFormat('de-DE').format(Number(value||0));}
function dateLabel(value){
  const d=value?new Date(value):new Date();
  if(Number.isNaN(d.getTime()))return '–';
  return new Intl.DateTimeFormat('de-DE',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'}).format(d);
}
function dateTimeLabel(value){
  const d=new Date(value);if(Number.isNaN(d.getTime()))return '–';
  return new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d);
}
async function apiJson(url){
  const res=await fetch(url,{credentials:'same-origin',headers:{'content-type':'application/json'}});
  let body={};try{body=await res.json();}catch{}
  if(!res.ok)throw new Error(body.message||`HTTP ${res.status}`);
  return body;
}
function hasRequiredAddress(location){
  return ['name','street','house_number','postal_code','city','country'].every(key=>String(location?.[key]||'').trim());
}
function buildMasterdataActions(locations=[]){
  const actions=[];
  for(const location of locations){
    if(location.active===false)continue;
    const label=`${location.customer_name||'Kunde'} · ${location.name||'Standort'}`;
    if(!hasRequiredAddress(location)){
      actions.push({source:'masterdata',kind:'bad',label,reason:'Pflichtadresse unvollständig',customerId:location.customer_id,locationId:location.id});
    }else if(!String(location.carrier_name||'').trim()){
      actions.push({source:'masterdata',kind:'warn',label,reason:'Keine Spedition hinterlegt',customerId:location.customer_id,locationId:location.id});
    }
  }
  return actions;
}
function buildRecentActivity(customers=[],locations=[]){
  return [
    ...customers.map(customer=>({type:'Kunde',title:`${customer.account||'–'} · ${customer.name||'Kunde'}`,updatedAt:customer.updated_at||customer.created_at||'',customerId:customer.id})),
    ...locations.map(location=>({type:'Standort',title:`${location.customer_name||'Kunde'} · ${location.name||'Standort'}`,updatedAt:location.updated_at||'',customerId:location.customer_id,locationId:location.id}))
  ].filter(item=>item.updatedAt).sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).slice(0,8);
}
function renderIcons(){
  document.querySelectorAll('[data-cc-icon]').forEach(host=>{host.innerHTML=icon(host.dataset.ccIcon||'activity');});
}
function setStatus(id,text,kind='neutral'){
  const node=$(id);if(!node)return;
  node.className=`cc-status ${kind}`;node.textContent=text;
}
function setKpi(id,value,caption){
  const node=$(id);if(!node)return;
  node.textContent=value===null||value===undefined?'–':fmt(value);
  const small=node.parentElement?.querySelector('small');if(small&&caption)small.textContent=caption;
}
function shipmentActionsOf(shipmentDashboard){
  return Array.isArray(shipmentDashboard?.actionItems)?shipmentDashboard.actionItems.map(item=>({...item,source:'shipment'})):[];
}
function renderActionRows(actions){
  return actions.slice(0,12).map(action=>{
    const shipment=action.source==='shipment';
    const attributes=shipment
      ?`data-overview-open-shipment="${esc(action.shipmentId)}"`
      :`data-overview-open-location="${esc(action.locationId)}" data-customer-id="${esc(action.customerId)}"`;
    return `<div class="cc-action-row ${esc(action.kind||'warn')}"><span class="cc-action-icon">${icon('warning')}</span><div><strong>${esc(action.label||'Prüfung erforderlich')}</strong><small>${esc(action.reason||'Bitte prüfen')}</small></div><button class="ghost compact" type="button" ${attributes}>Öffnen</button></div>`;
  }).join('');
}
function renderShippingWork(shipmentDashboard,shipmentError){
  const host=$('#overviewShippingWork');if(!host)return;
  if(shipmentError){
    host.innerHTML=`<header><div><span class="kicker">HEUTE IM VERSAND</span><h2>Operative Vorgänge</h2></div><span class="cc-status bad">Nicht verfügbar</span></header><div class="cc-empty">${esc(shipmentError.message||'Sendungsdaten konnten nicht geladen werden.')}</div>`;
    return;
  }
  if(!shipmentDashboard){
    host.innerHTML='<header><div><span class="kicker">HEUTE IM VERSAND</span><h2>Operative Vorgänge</h2></div><span class="cc-status neutral">Wird geladen</span></header><div class="cc-empty">Sendungsdaten werden geladen …</div>';
    return;
  }
  const rows=Array.isArray(shipmentDashboard.todayRows)?shipmentDashboard.todayRows:[];
  const body=rows.length?`<div class="cc-activity-list">${rows.map(row=>`<div class="cc-activity-row"><span class="cc-activity-icon">${icon('shipment')}</span><div><strong>${esc(row.reference||'Sendung')} · ${esc(row.customerName||row.locationName||'Empfänger')}</strong><small>${esc(row.status||'Status unbekannt')}${row.sourceKind==='MIGRATED'?' · Migriert':''}</small></div><button class="ghost compact" type="button" data-overview-open-shipment="${esc(row.id)}">Öffnen</button></div>`).join('')}</div>`:'<div class="cc-empty">Für heute sind keine Sendungen mit geplantem Abholtag vorhanden.</div>';
  host.innerHTML=`<header><div><span class="kicker">HEUTE IM VERSAND</span><h2>Operative Vorgänge</h2></div><span class="cc-status ${rows.length?'good':'neutral'}">${fmt(rows.length)} Vorgänge</span></header>${body}`;
  host.querySelectorAll('[data-overview-open-shipment]').forEach(button=>button.addEventListener('click',()=>openShipment(button.dataset.overviewOpenShipment)));
}
function renderOverview({meta=null,customers=[],locations=[],shipmentDashboard=null,shipmentError=null,error=null}={}){
  const session=sessionState.session;
  if($('#overviewDate'))$('#overviewDate').textContent=dateLabel();
  if($('#overviewWorkspace'))$('#overviewWorkspace').textContent=`Workspace ${session?.tenant?.name||session?.tenant?.slug||'–'}`;
  if($('#overviewUser'))$('#overviewUser').textContent=session?.user?.displayName||session?.user?.username||'Benutzer –';
  const db=meta?.database||{};
  setStatus('#overviewDatabaseState',db.configured?'Datenbank verbunden':'Datenbank nicht konfiguriert',db.configured?'good':'bad');
  setStatus('#overviewDataModeState',db.dataMode?`Modus ${db.dataMode}`:'Modus –',db.dataMode==='migration-read-only'?'warn':'neutral');
  setStatus('#overviewMasterdataState',db.masterdataWritesEnabled?'Stammdaten Schreiben aktiv':'Stammdaten Schreiben gesperrt',db.masterdataWritesEnabled?'good':'warn');

  if(error||shipmentError){
    setKpi('#overviewOpenShipments',null,'Sendungsdaten nicht verfügbar');
    setKpi('#overviewPickupsToday',null,'Sendungsdaten nicht verfügbar');
    setKpi('#overviewMissingDocuments',null,'Sendungsdaten nicht verfügbar');
  }else if(shipmentDashboard){
    setKpi('#overviewOpenShipments',shipmentDashboard.openShipments,'aktive Vorgänge');
    setKpi('#overviewPickupsToday',shipmentDashboard.pickupsToday,`${fmt(shipmentDashboard.pickupsTodayOpen||0)} offen · ${fmt(shipmentDashboard.pickupsTodayPicked||0)} abgeholt`);
    if(shipmentDashboard.missingDocumentsAvailable===false)setKpi('#overviewMissingDocuments',null,'historisch nicht vollständig ableitbar');
    else setKpi('#overviewMissingDocuments',shipmentDashboard.missingDocuments,'serverseitig geprüft');
  }else{
    setKpi('#overviewOpenShipments',null,'Sendungsdaten werden geladen');
    setKpi('#overviewPickupsToday',null,'Sendungsdaten werden geladen');
    setKpi('#overviewMissingDocuments',null,'Sendungsdaten werden geladen');
  }

  const masterdataActions=buildMasterdataActions(locations);
  const shipmentActions=shipmentActionsOf(shipmentDashboard);
  const actions=[...shipmentActions,...masterdataActions];
  if($('#overviewActionRequired'))$('#overviewActionRequired').textContent=error||shipmentError||!shipmentDashboard?'–':fmt(actions.length);
  const actionHost=$('#overviewActionList');
  if(actionHost){
    if(error)actionHost.innerHTML=`<div class="cc-empty">${esc(error.message||'Übersicht konnte nicht geladen werden.')}</div>`;
    else{
      const shipmentNotice=shipmentError?`<div class="cc-empty">${esc(shipmentError.message||'Sendungs-Handlungsbedarf ist nicht verfügbar.')}</div>`:'';
      const actionRows=actions.length?`<div class="cc-action-list">${renderActionRows(actions)}</div>`:'<div class="cc-empty">Keine offenen Handlungsbedarfe.</div>';
      actionHost.innerHTML=shipmentNotice+actionRows;
    }
  }
  actionHost?.querySelectorAll('[data-overview-open-location]').forEach(button=>button.addEventListener('click',()=>openLocation(button.dataset.customerId,button.dataset.overviewOpenLocation)));
  actionHost?.querySelectorAll('[data-overview-open-shipment]').forEach(button=>button.addEventListener('click',()=>openShipment(button.dataset.overviewOpenShipment)));

  renderShippingWork(shipmentDashboard,shipmentError||error);
  const activity=buildRecentActivity(customers,locations),activityHost=$('#overviewRecentActivity');
  if(activityHost){
    activityHost.innerHTML=activity.length?`<div class="cc-activity-list">${activity.map(item=>`<div class="cc-activity-row"><span class="cc-activity-icon">${icon(item.type==='Kunde'?'customer':'location')}</span><div><strong>${esc(item.title)}</strong><small>${esc(item.type)}</small></div><time>${esc(dateTimeLabel(item.updatedAt))}</time></div>`).join('')}</div>`:'<div class="cc-empty">Noch keine aktuellen Stammdatenänderungen vorhanden.</div>';
  }
  renderQuickActions();renderIcons();
}
function renderQuickActions(){
  const host=$('#overviewQuickActions');if(!host)return;
  host.innerHTML=`<div class="cc-quick-title"><span class="kicker">SCHNELLAKTIONEN</span><strong>Direkt weiterarbeiten</strong></div><div class="cc-quick-buttons"><button class="btn" type="button" data-quick-action="shipment" disabled title="Live-Sendungserstellung folgt nach dem sicheren Read-only-Ausbau">+ Sendung erstellen</button><button class="btn" type="button" data-quick-action="customer">+ Kunde</button><button class="ghost" type="button" data-quick-action="location">Standort suchen</button><button class="ghost" type="button" data-quick-action="documents" disabled title="Dokumenten-Livefunktion noch nicht verfügbar">Dokumente prüfen</button></div>`;
  host.querySelector('[data-quick-action="customer"]')?.addEventListener('click',()=>{
    document.querySelector('[data-nav="customers"]')?.click();
    setTimeout(()=>$('#newCustomerBtn')?.click(),0);
  });
  host.querySelector('[data-quick-action="location"]')?.addEventListener('click',()=>{
    document.querySelector('[data-nav="locations"]')?.click();
    setTimeout(()=>$('#globalLocationSearch')?.focus(),0);
  });
}
function openLocation(customerId,locationId){
  const event=new CustomEvent('professional:open-location',{detail:{customerId,locationId},cancelable:true});
  const unhandled=window.dispatchEvent(event);
  if(unhandled){
    document.querySelector('[data-nav="locations"]')?.click();
    setTimeout(()=>{const search=$('#globalLocationSearch');if(search){search.value='';search.focus();}},0);
  }
}
function openShipment(shipmentId){
  document.querySelector('[data-nav="shipments"]')?.click();
  window.dispatchEvent(new CustomEvent('professional:open-shipment',{detail:{shipmentId}}));
}
async function loadOverview(){
  if(sessionState.local||!sessionState.session)return;
  const seq=++overviewSequence;
  renderOverview({meta:null,customers:[],locations:[],shipmentDashboard:null});
  const [baseResult,shipmentResult]=await Promise.allSettled([
    Promise.all([
      apiJson('/api/professional-meta'),
      apiJson('/api/professional-masterdata/customers?status=all'),
      apiJson('/api/professional-masterdata/locations?status=all')
    ]),
    apiJson('/api/professional-shipment-dashboard')
  ]);
  if(seq!==overviewSequence)return;
  if(baseResult.status==='rejected'){
    renderOverview({error:baseResult.reason,shipmentError:shipmentResult.status==='rejected'?shipmentResult.reason:null});
    return;
  }
  const [meta,customerData,locationData]=baseResult.value;
  const shipmentError=shipmentResult.status==='rejected'?shipmentResult.reason:null;
  const shipmentDashboard=shipmentResult.status==='fulfilled'?shipmentResult.value?.dashboard||null:null;
  renderOverview({meta,customers:Array.isArray(customerData.customers)?customerData.customers:[],locations:Array.isArray(locationData.locations)?locationData.locations:[],shipmentDashboard,shipmentError});
}
async function resolveSessionAndLoad(){
  const shell=$('#appShell');if(!shell||shell.classList.contains('hidden'))return;
  if($('#identityBadge')?.textContent?.includes('Lokales Migrationslabor')){sessionState={local:true,session:null};return;}
  try{
    const session=await apiJson('/api/professional-auth/session');
    sessionState={local:false,session};await loadOverview();
  }catch{}
}

window.addEventListener('professional:session-ready',event=>{
  sessionState={local:!!event.detail?.local,session:event.detail?.session||null};
  if(!sessionState.local&&sessionState.session)loadOverview();
});
document.querySelector('[data-nav="overview"]')?.addEventListener('click',()=>setTimeout(resolveSessionAndLoad,0));
const shell=$('#appShell');if(shell)new MutationObserver(()=>{if(!shell.classList.contains('hidden'))resolveSessionAndLoad();}).observe(shell,{attributes:true,attributeFilter:['class']});
setTimeout(resolveSessionAndLoad,0);

export {controlCenterIcon,buildMasterdataActions,buildRecentActivity,loadOverview,renderOverview};
