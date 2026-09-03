const $=s=>document.querySelector(s);
let globalLocationSearchTimer=null;
let globalLocationRows=[];
let globalLocationLoadSequence=0;
const locationSearchInput=$('#globalLocationSearch');
if(locationSearchInput)locationSearchInput.placeholder='Standort suchen: Kunde, Standort, Ort oder Land';

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
function locationQuality(location){
  if(location?.active===false)return 'inactive';
  const required=['name','street','house_number','postal_code','city','country'];
  if(required.some(key=>!String(location?.[key]||'').trim()))return 'blocking';
  if(Array.isArray(location?.registration_emails)&&location.registration_emails.length===0)return 'blocking';
  if(!Array.isArray(location?.registration_emails))return 'warning';
  if(!String(location?.carrier_name||'').trim())return 'warning';
  return 'complete';
}
function qualityLabel(value){return ({complete:'Vollständig',warning:'Prüfen',blocking:'Unvollständig',inactive:'Inaktiv'})[value]||'Prüfen';}
async function mapLimit(items,limit,worker){
  const out=new Array(items.length);let next=0;
  async function run(){while(next<items.length){const i=next++;out[i]=await worker(items[i],i);}}
  await Promise.all(Array.from({length:Math.min(limit,items.length)},run));
  return out;
}
async function enrichLocationRows(rows){
  const customerIds=[...new Set((rows||[]).map(row=>String(row.customer_id||'')).filter(Boolean))];
  const details=new Map();
  await mapLimit(customerIds,6,async customerId=>{
    try{
      const data=await apiJson(`/api/professional-masterdata/customers/${encodeURIComponent(customerId)}`);
      details.set(customerId,data.customer||null);
    }catch{details.set(customerId,null);}
  });
  return (rows||[]).map(row=>{
    const customer=details.get(String(row.customer_id));
    const detail=(customer?.locations||[]).find(location=>String(location.id)===String(row.id));
    return detail?{...row,...detail,customer_account:row.customer_account,customer_name:row.customer_name,customer_active:row.customer_active}:row;
  });
}
function setSelectOptions(id,values,placeholder){
  const select=$(id);if(!select)return;
  const previous=select.value;
  select.innerHTML=`<option value="">${esc(placeholder)}</option>`+values.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('');
  select.value=values.includes(previous)?previous:'';
}
function populateLocationFilters(rows){
  const countries=[...new Set(rows.map(row=>String(row.country||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'de'));
  const carriers=[...new Set(rows.map(row=>String(row.carrier_name||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'de'));
  setSelectOptions('#globalLocationCountryFilter',countries,'Alle Länder');
  setSelectOptions('#globalLocationCarrierFilter',carriers,'Alle Speditionen');
}
function renderLocationKpis(rows){
  const active=rows.filter(row=>row.active!==false).length;
  const noCarrier=rows.filter(row=>row.active!==false&&!String(row.carrier_name||'').trim()).length;
  const multiEmail=rows.filter(row=>row.active!==false&&Array.isArray(row.registration_emails)&&row.registration_emails.length>1).length;
  const incomplete=rows.filter(row=>locationQuality(row)==='blocking').length;
  const values={globalLocationKpiActive:active,globalLocationKpiNoCarrier:noCarrier,globalLocationKpiMultiEmail:multiEmail,globalLocationKpiIncomplete:incomplete};
  for(const [id,value] of Object.entries(values)){const node=$(`#${id}`);if(node)node.textContent=String(value);}
}
function visibleLocationRows(){
  const status=$('#globalLocationStatusFilter')?.value||'active';
  const country=$('#globalLocationCountryFilter')?.value||'';
  const carrier=$('#globalLocationCarrierFilter')?.value||'';
  return globalLocationRows.filter(row=>{
    if(status==='active'&&row.active===false)return false;
    if(status==='inactive'&&row.active!==false)return false;
    if(country&&String(row.country||'')!==country)return false;
    if(carrier&&String(row.carrier_name||'')!==carrier)return false;
    return true;
  });
}
function renderGlobalLocationRows(rows){
  const host=$('#globalLocationRows');if(!host)return;
  host.innerHTML=(rows||[]).map(location=>{
    const quality=locationQuality(location);
    const emails=Array.isArray(location.registration_emails)?location.registration_emails:null;
    const emailCount=emails?String(emails.length):'–';
    const emailTitle=emails?`${emails.length} Anmelde-E-Mail${emails.length===1?'':'s'}`:'Qualität teilweise prüfbar';
    return `<tr data-customer-id="${esc(location.customer_id)}" data-location-id="${esc(location.id)}">
      <td data-label="Standort"><b>${esc(location.name||'Standort')}</b><div class="muted">${esc(location.city||'–')} · ${esc(location.country||'–')}</div></td>
      <td data-label="Kunde"><b>${esc(location.customer_name||'Kunde')}</b><div class="muted">${esc(location.customer_account||'–')}</div></td>
      <td data-label="Spedition">${esc(location.carrier_name||'Keine Spedition')}</td>
      <td data-label="Anmelde-E-Mails"><span class="location-email-value" title="${esc(emailTitle)}">${esc(emailCount)}</span></td>
      <td data-label="Qualität"><span class="location-quality ${quality}">${esc(qualityLabel(quality))}</span>${quality==='warning'&&!emails?'<small class="location-quality-note">Qualität teilweise prüfbar</small>':''}</td>
      <td data-label="Status">${statusPill(location.active!==false)}</td>
      <td data-label="Aktion"><button class="ghost compact" type="button">Öffnen</button></td>
    </tr>`;
  }).join('')||'<tr><td colspan="7" class="muted">Keine Standorte für diesen Filter.</td></tr>';
  host.querySelectorAll('tr[data-customer-id][data-location-id]').forEach(row=>row.querySelector('button')?.addEventListener('click',()=>openCustomerForLocation(row.dataset.customerId,row.dataset.locationId)));
}
function applyGlobalLocationFilters(){
  const rows=visibleLocationRows();
  const count=$('#globalLocationCount');
  if(count)count.textContent=rows.length===globalLocationRows.length?`${rows.length} Standort${rows.length===1?'':'e'}`:`${rows.length} von ${globalLocationRows.length} Standorten`;
  renderGlobalLocationRows(rows);
}
function setLocationsLoading(){
  const host=$('#globalLocationRows'),count=$('#globalLocationCount');
  if(host)host.innerHTML='<tr><td colspan="7" class="muted">Standorte werden geladen …</td></tr>';
  if(count)count.textContent='Standorte werden geladen …';
  for(const id of ['globalLocationKpiActive','globalLocationKpiNoCarrier','globalLocationKpiMultiEmail','globalLocationKpiIncomplete']){const node=$(`#${id}`);if(node)node.textContent='–';}
}
async function loadGlobalLocations(){
  if(!syncLocationViewMode())return;
  const seq=++globalLocationLoadSequence;setLocationsLoading();
  try{
    const q=($('#globalLocationSearch')?.value||'').trim();
    const data=await apiJson(`/api/professional-masterdata/locations?q=${encodeURIComponent(q)}&status=all`);
    const raw=Array.isArray(data.locations)?data.locations:[];
    const rows=await enrichLocationRows(raw);
    if(seq!==globalLocationLoadSequence)return;
    globalLocationRows=rows;
    populateLocationFilters(rows);
    renderLocationKpis(rows);
    applyGlobalLocationFilters();
  }catch(err){
    if(seq!==globalLocationLoadSequence)return;
    globalLocationRows=[];
    const host=$('#globalLocationRows'),count=$('#globalLocationCount');
    if(count)count.textContent='Standorte konnten nicht geladen werden.';
    if(host)host.innerHTML=`<tr><td colspan="7"><div class="drawer-error">${esc(err.message||'Standorte konnten nicht geladen werden.')}</div></td></tr>`;
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
$('#globalLocationStatusFilter')?.addEventListener('change',applyGlobalLocationFilters);
$('#globalLocationCountryFilter')?.addEventListener('change',applyGlobalLocationFilters);
$('#globalLocationCarrierFilter')?.addEventListener('change',applyGlobalLocationFilters);
document.querySelector('[data-nav="locations"]')?.addEventListener('click',()=>setTimeout(loadGlobalLocations,0));
window.addEventListener('professional:open-location',event=>{
  const {customerId,locationId}=event.detail||{};
  if(customerId&&locationId){event.preventDefault();openCustomerForLocation(customerId,locationId);}
});

export {loadGlobalLocations,openCustomerForLocation,locationQuality,enrichLocationRows};
