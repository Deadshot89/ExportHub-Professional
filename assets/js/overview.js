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
function renderIcons(){
  document.querySelectorAll('[data-cc-icon]').forEach(host=>{host.innerHTML=icon(host.dataset.ccIcon||'activity');});
}
function setStatus(id,text,kind='neutral'){
  const node=$(id);if(!node)return;
  node.className=`cc-status ${kind}`;node.textContent=text;
}
function renderOverview({meta=null,customers=[],locations=[],error=null}={}){
  const session=sessionState.session;
  if($('#overviewDate'))$('#overviewDate').textContent=dateLabel();
  if($('#overviewWorkspace'))$('#overviewWorkspace').textContent=`Workspace ${session?.tenant?.name||session?.tenant?.slug||'–'}`;
  if($('#overviewUser'))$('#overviewUser').textContent=session?.user?.displayName||session?.user?.username||'Benutzer –';
  const db=meta?.database||{};
  setStatus('#overviewDatabaseState',db.configured?'Datenbank verbunden':'Datenbank nicht konfiguriert',db.configured?'good':'bad');
  setStatus('#overviewDataModeState',db.dataMode?`Modus ${db.dataMode}`:'Modus –',db.dataMode==='migration-read-only'?'warn':'neutral');
  setStatus('#overviewMasterdataState',db.masterdataWritesEnabled?'Stammdaten Schreiben aktiv':'Stammdaten Schreiben gesperrt',db.masterdataWritesEnabled?'good':'warn');
  const actions=buildMasterdataActions(locations);
  if($('#overviewActionRequired'))$('#overviewActionRequired').textContent=error?'–':fmt(actions.length);
  const actionHost=$('#overviewActionList');
  if(actionHost){
    if(error)actionHost.innerHTML=`<div class="cc-empty">${esc(error.message||'Übersicht konnte nicht geladen werden.')}</div>`;
    else if(!actions.length)actionHost.innerHTML='<div class="cc-empty">Keine offenen Stammdatenhinweise.</div>';
    else actionHost.innerHTML=`<div class="cc-action-list">${actions.slice(0,10).map(action=>`<div class="cc-action-row ${action.kind}"><span class="cc-action-icon">${icon('warning')}</span><div><strong>${esc(action.label)}</strong><small>${esc(action.reason)}</small></div><button class="ghost compact" type="button" data-overview-open-location="${esc(action.locationId)}" data-customer-id="${esc(action.customerId)}">Öffnen</button></div>`).join('')}</div>`;
  }
  actionHost?.querySelectorAll('[data-overview-open-location]').forEach(button=>button.addEventListener('click',()=>openLocation(button.dataset.customerId,button.dataset.overviewOpenLocation)));
  const activity=buildRecentActivity(customers,locations),activityHost=$('#overviewRecentActivity');
  if(activityHost){
    activityHost.innerHTML=activity.length?`<div class="cc-activity-list">${activity.map(item=>`<div class="cc-activity-row"><span class="cc-activity-icon">${icon(item.type==='Kunde'?'customer':'location')}</span><div><strong>${esc(item.title)}</strong><small>${esc(item.type)}</small></div><time>${esc(dateTimeLabel(item.updatedAt))}</time></div>`).join('')}</div>`:'<div class="cc-empty">Noch keine aktuellen Stammdatenänderungen vorhanden.</div>';
  }
  renderQuickActions();renderIcons();
}
function renderQuickActions(){
  const host=$('#overviewQuickActions');if(!host)return;
  host.innerHTML=`<div class="cc-quick-title"><span class="kicker">SCHNELLAKTIONEN</span><strong>Direkt weiterarbeiten</strong></div><div class="cc-quick-buttons"><button class="btn" type="button" data-quick-action="shipment" disabled title="Sendungs-Livefunktion noch nicht verfügbar">+ Sendung erstellen</button><button class="btn" type="button" data-quick-action="customer">+ Kunde</button><button class="ghost" type="button" data-quick-action="location">Standort suchen</button><button class="ghost" type="button" data-quick-action="documents" disabled title="Dokumenten-Livefunktion noch nicht verfügbar">Dokumente prüfen</button></div>`;
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
    setTimeout(()=>{
      const search=$('#globalLocationSearch');if(search){search.value='';search.focus();}
    },0);
  }
}
async function loadOverview(){
  if(sessionState.local||!sessionState.session)return;
  const seq=++overviewSequence;
  renderOverview({meta:null,customers:[],locations:[]});
  try{
    const [meta,customerData,locationData]=await Promise.all([
      apiJson('/api/professional-meta'),
      apiJson('/api/professional-masterdata/customers?status=all'),
      apiJson('/api/professional-masterdata/locations?status=all')
    ]);
    if(seq!==overviewSequence)return;
    renderOverview({meta,customers:Array.isArray(customerData.customers)?customerData.customers:[],locations:Array.isArray(locationData.locations)?locationData.locations:[]});
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

export {controlCenterIcon,buildMasterdataActions,buildRecentActivity,loadOverview,renderOverview};
