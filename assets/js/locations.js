const $=s=>document.querySelector(s);
let globalLocationSearchTimer=null;

function esc(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function statusPill(active){return active===false?'<span class="status-pill lock">Inaktiv</span>':'<span class="status-pill good">Aktiv</span>';}
async function apiJson(url){
  const res=await fetch(url,{credentials:'same-origin',headers:{'content-type':'application/json'}});
  let body={};try{body=await res.json();}catch{}
  if(!res.ok){const err=new Error(body.message||`HTTP ${res.status}`);err.code=body.code||`HTTP_${res.status}`;throw err;}
  return body;
}
function liveLocationsEnabled(){return !$('#appShell')?.classList.contains('hidden')&&!$('#identityBadge')?.textContent?.includes('Lokales Migrationslabor');}
function syncLocationViewMode(){
  const live=liveLocationsEnabled();
  $('#liveGlobalLocations')?.classList.toggle('hidden',!live);
  $('#legacyLocationMigrationPreview')?.classList.toggle('hidden',live);
  return live;
}
function renderGlobalLocationRows(rows){
  const host=$('#globalLocationRows');if(!host)return;
  host.innerHTML=(rows||[]).map(location=>`<button class="global-location-row" type="button" data-customer-id="${esc(location.customer_id)}" data-location-id="${esc(location.id)}"><span><b>${esc(location.customer_account||'–')} · ${esc(location.customer_name||'Kunde')}</b><small>${esc(location.name||'Standort')}</small></span><span>${esc(location.city||'–')}</span><span>${esc(location.country||'–')}</span><span>${statusPill(location.active!==false)}</span><span>${esc(location.carrier_name||'Keine Spedition')}</span><span class="global-location-open">Öffnen ›</span></button>`).join('')||'<div class="empty compact-empty">Keine Standorte für diesen Filter.</div>';
  host.querySelectorAll('[data-customer-id][data-location-id]').forEach(button=>button.addEventListener('click',()=>openCustomerForLocation(button.dataset.customerId,button.dataset.locationId)));
}
async function loadGlobalLocations(){
  if(!syncLocationViewMode())return;
  const host=$('#globalLocationRows'),count=$('#globalLocationCount');
  if(host)host.innerHTML='<div class="empty compact-empty">Standorte werden geladen …</div>';
  try{
    const q=($('#globalLocationSearch')?.value||'').trim();
    const status=$('#globalLocationStatusFilter')?.value||'active';
    const data=await apiJson(`/api/professional-masterdata/locations?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`);
    const rows=Array.isArray(data.locations)?data.locations:[];
    if(count)count.textContent=`${rows.length} Standort${rows.length===1?'':'e'}`;
    renderGlobalLocationRows(rows);
  }catch(err){
    if(count)count.textContent='Standorte konnten nicht geladen werden.';
    if(host)host.innerHTML=`<div class="drawer-error">${esc(err.message||'Standorte konnten nicht geladen werden.')}</div>`;
  }
}
async function openCustomerForLocation(customerId,locationId){
  const customerNav=document.querySelector('[data-nav="customers"]');
  if(!customerNav||!customerId||!locationId)return;
  customerNav.click();
  const search=$('#customerSearch'),status=$('#customerStatusFilter');
  if(search)search.value='';if(status)status.value='all';
  const waitFor=async(selector,predicate=()=>true,limit=80)=>{
    for(let i=0;i<limit;i++){
      const node=document.querySelector(selector);
      if(node&&predicate(node))return node;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    return null;
  };
  const customerButton=await waitFor(`[data-customer-id="${CSS.escape(String(customerId))}"]`);
  if(customerButton)customerButton.click();
  const accordion=await waitFor(`[data-location-id="${CSS.escape(String(locationId))}"]`);
  if(!accordion)return;
  const toggle=accordion.querySelector('[data-location-toggle]');
  if(toggle&&toggle.getAttribute('aria-expanded')!=='true')toggle.click();
  accordion.scrollIntoView({block:'center',behavior:'smooth'});
}

$('#globalLocationSearch')?.addEventListener('input',()=>{clearTimeout(globalLocationSearchTimer);globalLocationSearchTimer=setTimeout(loadGlobalLocations,180);});
$('#globalLocationStatusFilter')?.addEventListener('change',loadGlobalLocations);
document.querySelector('[data-nav="locations"]')?.addEventListener('click',()=>setTimeout(loadGlobalLocations,0));
window.addEventListener('exporthub:session-ready',()=>{if(document.querySelector('.view.active')?.dataset.view==='locations')loadGlobalLocations();});

export {loadGlobalLocations,openCustomerForLocation};
