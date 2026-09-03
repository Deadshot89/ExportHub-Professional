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
  host.innerHTML=(rows||[]).map(location=>`<tr data-customer-id="${esc(location.customer_id)}" data-location-id="${esc(location.id)}"><td><b>${esc(location.customer_account||'–')}</b><div class="muted">${esc(location.customer_name||'Kunde')}</div></td><td><b>${esc(location.name||'Standort')}</b><div class="muted">${esc(location.city||'–')}</div></td><td>${esc(location.country||'–')}</td><td>${statusPill(location.active!==false)}</td><td>${esc(location.carrier_name||'Keine Spedition')}</td><td><button class="ghost compact" type="button">Öffnen</button></td></tr>`).join('')||'<tr><td colspan="6" class="muted">Keine Standorte für diesen Filter.</td></tr>';
  host.querySelectorAll('tr[data-customer-id][data-location-id]').forEach(row=>row.querySelector('button')?.addEventListener('click',()=>openCustomerForLocation(row.dataset.customerId,row.dataset.locationId)));
}
async function loadGlobalLocations(){
  if(!syncLocationViewMode())return;
  const host=$('#globalLocationRows'),count=$('#globalLocationCount');
  if(host)host.innerHTML='<tr><td colspan="6" class="muted">Standorte werden geladen …</td></tr>';
  try{
    const q=($('#globalLocationSearch')?.value||'').trim();
    const status=$('#globalLocationStatusFilter')?.value||'active';
    const data=await apiJson(`/api/professional-masterdata/locations?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`);
    const rows=Array.isArray(data.locations)?data.locations:[];
    if(count)count.textContent=`${rows.length} Standort${rows.length===1?'':'e'}`;
    renderGlobalLocationRows(rows);
  }catch(err){
    if(count)count.textContent='Standorte konnten nicht geladen werden.';
    if(host)host.innerHTML=`<tr><td colspan="6"><div class="drawer-error">${esc(err.message||'Standorte konnten nicht geladen werden.')}</div></td></tr>`;
  }
}
async function openCustomerForLocation(customerId,locationId){
  const customerNav=document.querySelector('[data-nav="customers"]');
  if(!customerNav||!customerId||!locationId)return;
  const search=$('#customerSearch'),status=$('#customerStatusFilter');
  if(search)search.value='';if(status)status.value='all';
  customerNav.click();
  const waitFor=async(selector,limit=80)=>{
    for(let i=0;i<limit;i++){
      const node=document.querySelector(selector);if(node)return node;
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

export {loadGlobalLocations,openCustomerForLocation};
