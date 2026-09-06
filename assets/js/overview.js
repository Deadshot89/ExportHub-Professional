import {icon} from './ui-kit.js';
import {loadOperationsSummary} from './operations.js';

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
      actions.push({kind:'bad',label,reason:'Pflichtadresse unvollständig',customerId:location.customer_id,locationId:location.id});
    }else if(!String(location.carrier_name||'').trim()){
      actions.push({kind:'warn',label,reason:'Keine Spedition hinterlegt',customerId:location.customer_id,locationId:location.id});
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
function buildOperationalSignals(meta,locations=[],operations=null,error=null){
  const db=meta?.database||{};
  const activeLocations=locations.filter(location=>location.active!==false);
  const actions=buildMasterdataActions(locations);
  if(error){
    return {
      system:{kind:'bad',label:'Systemstatus nicht verfügbar',detail:'Live-Status konnte nicht geladen werden.'},
      masterdata:{kind:'bad',label:'Stammdaten nicht geprüft',detail:'Kunden- und Standortdaten konnten nicht ausgewertet werden.'},
      coverage:{kind:'neutral',label:'Live-Abdeckung unbekannt',detail:'Keine Funktionsfreigabe wird vorgetäuscht.'}
    };
  }
  const system=db.configured
    ? {kind:'good',label:'Datenbank verbunden',detail:db.dataMode?`Aktiver Modus: ${db.dataMode}`:'Professional-Datenbank ist erreichbar.'}
    : {kind:'bad',label:'Datenbank nicht konfiguriert',detail:'Operative Live-Daten stehen noch nicht bereit.'};
  let masterdata;
  if(!activeLocations.length){
    masterdata={kind:'neutral',label:'Noch keine aktiven Standorte',detail:'Stammdaten können nach der Einrichtung aufgebaut werden.'};
  }else if(actions.length){
    masterdata={kind:'warn',label:`${fmt(actions.length)} Stammdatenhinweise`,detail:`${fmt(activeLocations.length)} aktive Standorte wurden geprüft.`};
  }else{
    masterdata={kind:'good',label:'Stammdaten ohne offene Hinweise',detail:`${fmt(activeLocations.length)} aktive Standorte wurden geprüft.`};
  }
  let coverage;
  if(operations?.live){
    coverage={kind:'good',label:'Operative Livequelle aktiv',detail:'Sendungen, Dokumente und abgeleitete Aufgaben werden tenant-sicher read-only geladen.'};
  }else if(db.masterdataWritesEnabled){
    coverage={kind:'warn',label:'Operative Livequelle nicht verfügbar',detail:'Stammdaten bleiben nutzbar; Sendungs- und Dokumentwerte werden nicht simuliert.'};
  }else{
    coverage={kind:'warn',label:'Stammdaten schreibgeschützt',detail:'Nicht verfügbare operative Kennzahlen werden nicht vorgetäuscht.'};
  }
  return {system,masterdata,coverage};
}
function renderIcons(){
  document.querySelectorAll('[data-cc-icon]').forEach(host=>{host.innerHTML=icon(host.dataset.ccIcon||'activity');});
}
function setStatus(id,text,kind='neutral'){
  const node=$(id);if(!node)return;
  node.className=`cc-status ${kind}`;node.textContent=text;
}
function setOperationalSignal(id,signal){
  const node=$(id);if(!node||!signal)return;
  node.className=`cc-signal ${signal.kind||'neutral'}`;
  const strong=node.querySelector('strong');if(strong)strong.textContent=signal.label||'–';
  const small=node.querySelector('small');if(small)small.textContent=signal.detail||'';
}
function renderOperationalSignals(meta,locations=[],operations=null,error=null){
  const signals=buildOperationalSignals(meta,locations,operations,error);
  setOperationalSignal('#overviewSignalSystem',signals.system);
  setOperationalSignal('#overviewSignalMasterdata',signals.masterdata);
  setOperationalSignal('#overviewSignalCoverage',signals.coverage);
  return signals;
}
function setMetric(id,value,description,context){
  const node=$(id);if(!node)return;
  node.textContent=value;
  const card=node.closest('.cc-kpi');if(!card)return;
  const smalls=card.querySelectorAll('small');
  if(smalls[0])smalls[0].textContent=description;
  const contextNode=card.querySelector('.cc-kpi-context');if(contextNode)contextNode.textContent=context;
}
function renderOperationsMetrics(operations){
  if(operations?.summary){
    setMetric('#overviewOpenShipments',fmt(operations.summary.openShipments),'aus Professional Live','offene Vorgänge priorisieren');
    setMetric('#overviewPickupsToday',fmt(operations.summary.pickupsToday),'heute tatsächlich abgeholt','Nachweiskette im Blick');
    setMetric('#overviewMissingDocuments',fmt(operations.summary.documentActions),'blockierend oder ungeprüft','Dokumente vor Abschluss prüfen');
    setMetric('#overviewActionRequired',fmt(operations.summary.actionRequired),'aus echten Prozesszuständen','kritische Punkte zuerst');
  }else{
    setMetric('#overviewOpenShipments','–','Livequelle nicht verfügbar','keine Platzhalterwerte');
    setMetric('#overviewPickupsToday','–','Livequelle nicht verfügbar','keine Platzhalterwerte');
    setMetric('#overviewMissingDocuments','–','Livequelle nicht verfügbar','keine Platzhalterwerte');
  }
}
function renderProcessCoverage(operations){
  const rail=$('#overviewProcessRail');if(!rail)return;
  const state=rail.querySelector('.cc-process-state');
  if(state){state.className=`cc-status ${operations?.live?'good':'neutral'} cc-process-state`;state.textContent=operations?.live?'Live · read-only':'ohne Platzhalterdaten';}
  rail.querySelectorAll('.cc-process-step').forEach(step=>{
    const title=step.querySelector('strong')?.textContent||'';
    if(!operations?.live||!['Sendungen','Dokumente'].includes(title))return;
    step.classList.remove('prepared');step.classList.add('live');
    const small=step.querySelector('small');if(small)small.textContent=title==='Sendungen'?'02 · live read-only':'03 · live read-only';
    const text=step.querySelector('span');if(text)text.textContent=title==='Sendungen'?'Echte tenant-isolierte Sendungen sind als Arbeitsquelle verfügbar; Schreibaktionen bleiben gesperrt.':'Das echte Professional-Dokumentregister ist lesbar; offene Nachweise fließen in den Handlungsbedarf ein.';
  });
}
function renderShippingWork(operations){
  const host=$('#overviewShippingWork');if(!host)return;
  if(!operations?.live){host.innerHTML='<header><div><span class="kicker">HEUTE IM VERSAND</span><h2>Operative Vorgänge</h2></div><span class="cc-status neutral">Livequelle nicht verfügbar</span></header><div class="cc-empty">Es werden keine Platzhalter-Sendungen erzeugt.</div>';return;}
  const shipments=Array.isArray(operations.shipments)?operations.shipments:[];
  const rows=shipments.slice(0,6).map(shipment=>`<div class="cc-action-row"><span class="cc-action-icon">${icon('shipment')}</span><div><strong>${esc(shipment.reference||'–')} · ${esc(shipment.customer_name||shipment.customer_account||'Kunde –')}</strong><small>${esc(shipment.status||'–')}${shipment.locked?` · ${esc(shipment.lock_reason||'gesperrt')}`:''}</small></div></div>`).join('');
  host.innerHTML=`<header><div><span class="kicker">HEUTE IM VERSAND</span><h2>Operative Vorgänge</h2></div><span class="cc-status good">Live · read-only</span></header>${rows?`<div class="cc-action-list">${rows}</div>`:'<div class="cc-empty">Noch keine Sendungen im Professional-Bestand.</div>'}<div class="toolbar" style="margin-top:12px"><button class="ghost compact" type="button" data-open-live-shipments>Sendungsarbeitsplatz öffnen</button></div>`;
  host.querySelector('[data-open-live-shipments]')?.addEventListener('click',()=>document.querySelector('[data-nav="shipments"]')?.click());
}
function renderActionList(masterdataActions=[],operations=null,error=null){
  const host=$('#overviewActionList');if(!host)return;
  if(error){host.innerHTML=`<div class="cc-empty">${esc(error.message||'Übersicht konnte nicht geladen werden.')}</div>`;return;}
  const operationalTasks=Array.isArray(operations?.tasks)?operations.tasks:[];
  const operationalRows=operationalTasks.map(task=>`<div class="cc-action-row ${task.priority==='critical'?'bad':'warn'}"><span class="cc-action-icon">${icon(task.source==='shipment'?'shipment':'document')}</span><div><strong>${esc(task.title||'Prüfung erforderlich')}</strong><small>${esc(task.reference||'–')} · ${esc(task.reason||'')}</small></div><button class="ghost compact" type="button" data-overview-open-task>Aufgaben</button></div>`);
  const masterdataRows=masterdataActions.map(action=>`<div class="cc-action-row ${action.kind}"><span class="cc-action-icon">${icon('warning')}</span><div><strong>${esc(action.label)}</strong><small>${esc(action.reason)}</small></div><button class="ghost compact" type="button" data-overview-open-location="${esc(action.locationId)}" data-customer-id="${esc(action.customerId)}">Öffnen</button></div>`);
  const rows=[...operationalRows,...masterdataRows].slice(0,10);
  host.innerHTML=rows.length?`<div class="cc-action-list">${rows.join('')}</div>`:'<div class="cc-empty">Keine offenen Live- oder Stammdatenhinweise.</div>';
  host.querySelectorAll('[data-overview-open-location]').forEach(button=>button.addEventListener('click',()=>openLocation(button.dataset.customerId,button.dataset.overviewOpenLocation)));
  host.querySelectorAll('[data-overview-open-task]').forEach(button=>button.addEventListener('click',()=>document.querySelector('[data-nav="tasks"]')?.click()));
}
function renderOverview({meta=null,customers=[],locations=[],operations=null,error=null}={}){
  const session=sessionState.session;
  if($('#overviewDate'))$('#overviewDate').textContent=dateLabel();
  if($('#overviewWorkspace'))$('#overviewWorkspace').textContent=`Workspace ${session?.tenant?.name||session?.tenant?.slug||'–'}`;
  if($('#overviewUser'))$('#overviewUser').textContent=session?.user?.displayName||session?.user?.username||'Benutzer –';
  const db=meta?.database||{};
  setStatus('#overviewDatabaseState',db.configured?'Datenbank verbunden':'Datenbank nicht konfiguriert',db.configured?'good':'bad');
  setStatus('#overviewDataModeState',db.dataMode?`Modus ${db.dataMode}`:'Modus –',db.dataMode==='migration-read-only'?'warn':'neutral');
  setStatus('#overviewMasterdataState',db.masterdataWritesEnabled?'Stammdaten Schreiben aktiv':'Stammdaten Schreiben gesperrt',db.masterdataWritesEnabled?'good':'warn');
  const actions=buildMasterdataActions(locations);
  renderOperationalSignals(meta,locations,operations,error);
  renderOperationsMetrics(operations);
  if(!operations?.summary&&$('#overviewActionRequired'))$('#overviewActionRequired').textContent=error?'–':fmt(actions.length);
  renderActionList(actions,operations,error);
  renderShippingWork(operations);
  renderProcessCoverage(operations);
  const activity=buildRecentActivity(customers,locations),activityHost=$('#overviewRecentActivity');
  if(activityHost){
    activityHost.innerHTML=activity.length?`<div class="cc-activity-list">${activity.map(item=>`<div class="cc-activity-row"><span class="cc-activity-icon">${icon(item.type==='Kunde'?'customer':'location')}</span><div><strong>${esc(item.title)}</strong><small>${esc(item.type)}</small></div><time>${esc(dateTimeLabel(item.updatedAt))}</time></div>`).join('')}</div>`:'<div class="cc-empty">Noch keine aktuellen Stammdatenänderungen vorhanden.</div>';
  }
  renderQuickActions();renderIcons();
}
function renderQuickActions(){
  const host=$('#overviewQuickActions');if(!host)return;
  host.innerHTML=`<div class="cc-quick-title"><span class="kicker">SCHNELLAKTIONEN</span><strong>Direkt weiterarbeiten</strong></div><div class="cc-quick-buttons"><button class="btn" type="button" data-quick-action="shipment" disabled title="Operative Sendungsschreibfunktion noch nicht freigegeben">+ Sendung erstellen</button><button class="btn" type="button" data-quick-action="customer">+ Kunde</button><button class="ghost" type="button" data-quick-action="location">Standort suchen</button><button class="ghost" type="button" data-quick-action="documents" disabled title="Dokument-Upload noch nicht freigegeben">Dokument hochladen</button><button class="ghost" type="button" data-quick-action="tasks">Aufgaben prüfen</button></div>`;
  host.querySelector('[data-quick-action="customer"]')?.addEventListener('click',()=>{
    document.querySelector('[data-nav="customers"]')?.click();
    setTimeout(()=>$('#newCustomerBtn')?.click(),0);
  });
  host.querySelector('[data-quick-action="location"]')?.addEventListener('click',()=>{
    document.querySelector('[data-nav="locations"]')?.click();
    setTimeout(()=>$('#globalLocationSearch')?.focus(),0);
  });
  host.querySelector('[data-quick-action="tasks"]')?.addEventListener('click',()=>document.querySelector('[data-nav="tasks"]')?.click());
}
function openLocation(customerId,locationId){
  const event=new CustomEvent('professional:open-location',{detail:{customerId,locationId},cancelable:true});
  const unhandled=window.dispatchEvent(event);
  if(unhandled){
    document.querySelector('[data-nav="locations"]')?.click();
    setTimeout(()=>{
      const search=$('#globalLocationSearch');if(search){search.value='';search.focus();}
    },0);
  }
}
async function loadOverview(){
  if(sessionState.local||!sessionState.session)return;
  const seq=++overviewSequence;
  renderOverview({meta:null,customers:[],locations:[],operations:null});
  try{
    const [meta,customerData,locationData,operations]=await Promise.all([
      apiJson('/api/professional-meta'),
      apiJson('/api/professional-masterdata/customers?status=all'),
      apiJson('/api/professional-masterdata/locations?status=all'),
      loadOperationsSummary().catch(()=>null)
    ]);
    if(seq!==overviewSequence)return;
    renderOverview({meta,customers:Array.isArray(customerData.customers)?customerData.customers:[],locations:Array.isArray(locationData.locations)?locationData.locations:[],operations});
  }catch(error){
    if(seq!==overviewSequence)return;
    renderOverview({error});
  }
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

export {controlCenterIcon,buildMasterdataActions,buildRecentActivity,buildOperationalSignals,renderOperationalSignals,loadOverview,renderOverview};
