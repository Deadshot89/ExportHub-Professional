const $=selector=>document.querySelector(selector);
const WRITE_ROLES=new Set(['TENANT_ADMIN','EXPORT_ADMIN','TEAM_LEAD','OPERATOR']);
let session=null;
let localMode=false;
let rows=[];
let editingId='';

function esc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function canWrite(){return !localMode&&!!session&&WRITE_ROLES.has(String(session?.user?.role||''));}
function csrfHeaders(){return session?.csrfToken?{'x-professional-csrf':session.csrfToken}:{};}
async function apiJson(url,options={}){
  const {headers={},...rest}=options;
  const response=await fetch(url,{credentials:'same-origin',...rest,headers:{'content-type':'application/json',...headers}});
  let body={};try{body=await response.json();}catch{}
  if(!response.ok){const error=new Error(body.message||`HTTP ${response.status}`);error.code=body.code||`HTTP_${response.status}`;throw error;}
  return body;
}
function setMessage(message='',kind=''){
  const node=$('#carrierMessage');if(!node)return;
  node.textContent=message;node.className=`carrier-message ${kind}`.trim();
}
function syncMode(){
  const live=!localMode&&!!session;
  $('#carrierLiveWorkspace')?.classList.toggle('hidden',!live);
  const create=$('#newCarrierBtn');if(create){create.classList.toggle('hidden',!live||!canWrite());create.disabled=!canWrite();}
  return live;
}
function renderRows(){
  const body=$('#carrierRows'),count=$('#carrierCount');if(!body)return;
  if(count)count.textContent=`${rows.length} Spedition${rows.length===1?'':'en'}`;
  body.innerHTML=rows.map(carrier=>`<tr>
    <td><strong>${esc(carrier.name||'–')}</strong>${carrier.portalUrl?`<div class="muted"><a href="${esc(carrier.portalUrl)}" target="_blank" rel="noopener noreferrer">Portal öffnen</a></div>`:''}</td>
    <td>${carrier.abdRequiredDefault?'<span class="cc-status warn">ABD standardmäßig</span>':'<span class="cc-status neutral">Kein ABD-Standard</span>'}</td>
    <td><strong>${esc(carrier.contactName||'–')}</strong><div class="muted">${esc(carrier.email||'')}${carrier.phone?` · ${esc(carrier.phone)}`:''}</div></td>
    <td>${carrier.active!==false?'<span class="cc-status good">Aktiv</span>':'<span class="cc-status neutral">Inaktiv</span>'}</td>
    <td class="carrier-row-actions">${canWrite()?`<button type="button" class="ghost compact" data-carrier-action="edit" data-carrier-id="${esc(carrier.id)}">Bearbeiten</button><button type="button" class="ghost compact" data-carrier-action="status" data-carrier-id="${esc(carrier.id)}" data-next-active="${carrier.active===false?'true':'false'}">${carrier.active===false?'Aktivieren':'Deaktivieren'}</button>`:''}</td>
  </tr>`).join('')||'<tr><td colspan="5" class="muted">Keine Speditionen für diesen Filter.</td></tr>';
  body.querySelectorAll('[data-carrier-action="edit"]').forEach(button=>button.addEventListener('click',()=>openCarrierDrawer(rows.find(row=>String(row.id)===String(button.dataset.carrierId))||null)));
  body.querySelectorAll('[data-carrier-action="status"]').forEach(button=>button.addEventListener('click',()=>setCarrierStatus(button)));
}
export async function loadCarriers(){
  if(!syncMode())return [];
  const status=$('#carrierStatusFilter')?.value||'active';
  setMessage('Speditionen werden geladen …');
  try{
    const data=await apiJson(`/api/professional-masterdata/carriers?status=${encodeURIComponent(status)}`,{method:'GET',headers:{}});
    rows=Array.isArray(data.carriers)?data.carriers:[];renderRows();setMessage('');return rows;
  }catch(error){rows=[];renderRows();setMessage(error.message||'Speditionen konnten nicht geladen werden.','bad');return []}
}
function fillForm(carrier={}){
  $('#carrierName').value=carrier.name||'';
  $('#carrierAbdDefault').checked=carrier.abdRequiredDefault===true;
  $('#carrierContactName').value=carrier.contactName||'';
  $('#carrierEmail').value=carrier.email||'';
  $('#carrierPhone').value=carrier.phone||'';
  $('#carrierPortalUrl').value=carrier.portalUrl||'';
}
function openCarrierDrawer(carrier=null){
  if(!canWrite())return;
  editingId=carrier?.id||'';fillForm(carrier||{});
  $('#carrierDrawerTitle').textContent=editingId?'Spedition bearbeiten':'Neue Spedition';
  $('#carrierDrawer')?.classList.remove('hidden');
  $('#carrierDrawer')?.setAttribute('aria-hidden','false');
  $('#carrierDrawerBackdrop')?.classList.remove('hidden');
}
function closeCarrierDrawer(){
  editingId='';$('#carrierDrawer')?.classList.add('hidden');$('#carrierDrawer')?.setAttribute('aria-hidden','true');$('#carrierDrawerBackdrop')?.classList.add('hidden');
}
async function saveCarrier(event){
  event.preventDefault();if(!canWrite())return;
  const button=$('#saveCarrierBtn');if(button)button.disabled=true;
  const payload={name:$('#carrierName').value,abdRequiredDefault:$('#carrierAbdDefault').checked,contactName:$('#carrierContactName').value,email:$('#carrierEmail').value,phone:$('#carrierPhone').value,portalUrl:$('#carrierPortalUrl').value};
  try{
    const url=editingId?`/api/professional-masterdata/carriers/${encodeURIComponent(editingId)}`:'/api/professional-masterdata/carriers';
    await apiJson(url,{method:'POST',headers:csrfHeaders(),body:JSON.stringify(payload)});
    closeCarrierDrawer();await loadCarriers();window.dispatchEvent(new CustomEvent('professional:carriers-changed'));setMessage('Spedition gespeichert.');
  }catch(error){setMessage(error.message||'Spedition konnte nicht gespeichert werden.','bad');}
  finally{if(button)button.disabled=false;}
}
async function setCarrierStatus(button){
  if(!canWrite())return;const id=button.dataset.carrierId,next=button.dataset.nextActive==='true';
  button.disabled=true;
  try{
    await apiJson(`/api/professional-masterdata/carriers/${encodeURIComponent(id)}/status`,{method:'POST',headers:csrfHeaders(),body:JSON.stringify({active:next})});
    await loadCarriers();window.dispatchEvent(new CustomEvent('professional:carriers-changed'));
  }catch(error){setMessage(error.message||'Status konnte nicht geändert werden.','bad');}
  finally{button.disabled=false;}
}

$('#newCarrierBtn')?.addEventListener('click',()=>openCarrierDrawer());
$('#carrierStatusFilter')?.addEventListener('change',()=>loadCarriers());
$('#carrierForm')?.addEventListener('submit',saveCarrier);
$('#closeCarrierDrawer')?.addEventListener('click',closeCarrierDrawer);
$('#carrierDrawerBackdrop')?.addEventListener('click',closeCarrierDrawer);
document.querySelector('[data-nav="carriers"]')?.addEventListener('click',()=>{if(syncMode())loadCarriers();});
window.addEventListener('professional:session-ready',event=>{localMode=!!event.detail?.local;session=event.detail?.session||null;rows=[];editingId='';closeCarrierDrawer();syncMode();});
