import {inventoryBackup,buildMigrationPackage,summarizePackage} from '../../shared/migration-core.js';

const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
let sourceText='', sourcePayload=null, migrationPackage=null, currentInventory=null, currentDocumentRows=[];

let identitySession=null, localMigrationLab=false, credentialAction=null;
let liveCustomers=[],selectedCustomerId='',selectedCustomer=null,openLocationIds=new Set(),masterdataBusy=false,masterdataDrawerState=null;
let customerLoadSequence=0,customerDetailSequence=0,customerSearchTimer=null;

async function apiJson(url,options={}){
  const {headers={},...rest}=options;const res=await fetch(url,{credentials:'same-origin',...rest,headers:{'content-type':'application/json',...headers}});
  let body={}; try{body=await res.json()}catch{}
  if(!res.ok){const e=new Error(body.message||('HTTP '+res.status));e.code=body.code||('HTTP_'+res.status);e.status=res.status;throw e;}
  return body;
}
const TENANT_ROLE_LABELS={TENANT_ADMIN:'Firmen-Admin',EXPORT_ADMIN:'Export-Admin',TEAM_LEAD:'Teamleiter',OPERATOR:'Sachbearbeiter',WAREHOUSE:'Lager',AUDITOR:'Auditor'};
function csrfHeaders(){return identitySession?.csrfToken?{'x-professional-csrf':identitySession.csrfToken}:{};}
function roleLabel(role){return TENANT_ROLE_LABELS[String(role||'')]||String(role||'–');}
function canManageUsers(){return !localMigrationLab&&identitySession?.user?.role==='TENANT_ADMIN';}
function canWriteCustomers(){return !localMigrationLab&&['TENANT_ADMIN','EXPORT_ADMIN','TEAM_LEAD','OPERATOR'].includes(String(identitySession?.user?.role||''));}

function syncCustomerViewMode(){
  const useLive=!localMigrationLab&&!!identitySession;
  $('#liveCustomerMasterdata')?.classList.toggle('hidden',!useLive);
  $('#legacyCustomerMigrationPreview')?.classList.toggle('hidden',useLive);
  $('#newCustomerBtn')?.classList.toggle('hidden',!useLive||!canWriteCustomers());
  return useLive;
}
function activePill(active){return active?'<span class="status-pill good">Aktiv</span>':'<span class="status-pill lock">Inaktiv</span>';}
function registrationEmailsOf(location){return Array.isArray(location?.registration_emails)?location.registration_emails:(Array.isArray(location?.registrationEmails)?location.registrationEmails:[]);}
function customerLocationAddress(location){
  const line1=[location?.street,location?.house_number].filter(Boolean).join(' ').trim();
  const line2=[location?.postal_code,location?.city].filter(Boolean).join(' ').trim();
  return [line1,line2,location?.country].filter(Boolean).join(', ')||'Keine strukturierte Adresse hinterlegt';
}
async function loadCustomers({selectId=selectedCustomerId,focusLocationId=null}={}){
  if(!syncCustomerViewMode())return;
  const seq=++customerLoadSequence, list=$('#customerMasterList'),count=$('#customerMasterCount');
  if(list)list.innerHTML='<div class="empty compact-empty">Kunden werden geladen …</div>';
  if(count)count.textContent='Kunden werden geladen …';
  try{
    const q=($('#customerSearch')?.value||'').trim(),status=$('#customerStatusFilter')?.value||'active';
    const data=await apiJson(`/api/professional-masterdata/customers?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`,{method:'GET',headers:{}});
    if(seq!==customerLoadSequence)return;
    liveCustomers=Array.isArray(data.customers)?data.customers:[];
    if(count)count.textContent=`${fmt(liveCustomers.length)} Kunde${liveCustomers.length===1?'':'n'}`;
    const preferred=liveCustomers.find(c=>String(c.id)===String(selectId))?.id||liveCustomers[0]?.id||'';
    selectedCustomerId=preferred||'';
    renderCustomerList();
    if(preferred)await selectCustomer(preferred,{focusLocationId});
    else{selectedCustomer=null;openLocationIds=new Set();renderCustomerDetail();}
  }catch(err){
    if(seq!==customerLoadSequence)return;
    liveCustomers=[];selectedCustomer=null;selectedCustomerId='';
    if(count)count.textContent='Kunden konnten nicht geladen werden.';
    if(list)list.innerHTML=`<div class="drawer-error">${esc(err.message||'Kunden konnten nicht geladen werden.')}</div>`;
    renderCustomerDetail();
  }
}
function renderCustomerList(){
  const list=$('#customerMasterList');if(!list)return;
  list.innerHTML=liveCustomers.map(c=>`<button class="customer-master-item ${String(c.id)===String(selectedCustomerId)?'active':''}" type="button" data-customer-id="${esc(c.id)}"><span class="customer-master-item-head"><b>${esc(c.account||'–')}</b>${activePill(c.active!==false)}</span><small>${esc(c.name||'Unbenannter Kunde')}</small><small>${fmt(c.location_count||0)} Standort${Number(c.location_count||0)===1?'':'e'}</small></button>`).join('')||'<div class="empty compact-empty">Keine Kunden für diesen Filter.</div>';
  list.querySelectorAll('[data-customer-id]').forEach(btn=>btn.addEventListener('click',()=>selectCustomer(btn.dataset.customerId)));
}
async function selectCustomer(id,{focusLocationId=null}={}){
  if(!id||localMigrationLab||!identitySession)return;
  selectedCustomerId=String(id);renderCustomerList();
  const pane=$('#customerDetailPane'),seq=++customerDetailSequence;
  if(pane)pane.innerHTML='<div class="customer-detail-empty"><div class="kicker">KUNDENDETAIL</div><h3>Wird geladen …</h3></div>';
  try{
    const data=await apiJson(`/api/professional-masterdata/customers/${encodeURIComponent(id)}`,{method:'GET',headers:{}});
    if(seq!==customerDetailSequence)return;
    selectedCustomer=data.customer||null;
    if(focusLocationId)openLocationIds.add(String(focusLocationId));
    renderCustomerDetail();renderCustomerList();
  }catch(err){
    if(seq!==customerDetailSequence)return;
    selectedCustomer=null;
    if(pane)pane.innerHTML=`<div class="customer-detail-empty"><div class="drawer-error">${esc(err.message||'Kundendetail konnte nicht geladen werden.')}</div></div>`;
  }
}
function renderCustomerDetail(){
  const pane=$('#customerDetailPane');if(!pane)return;
  const c=selectedCustomer;
  if(!c){pane.innerHTML='<div class="customer-detail-empty"><div class="kicker">KUNDENDETAIL</div><h3>Kunde auswählen</h3><p class="muted">Links einen Kunden auswählen, um seine Standorte und Versanddaten zu sehen.</p></div>';return;}
  const locations=Array.isArray(c.locations)?c.locations:[],write=canWriteCustomers();
  const customerActions=write?`<button class="ghost compact" type="button" data-customer-action="edit">Bearbeiten</button><button class="ghost compact" type="button" data-customer-action="status" data-next-active="${c.active===false?'true':'false'}">${c.active===false?'Aktivieren':'Deaktivieren'}</button>`:'';
  const locationHtml=locations.map(l=>{
    const id=String(l.id),open=openLocationIds.has(id),emails=registrationEmailsOf(l);
    return `<article class="location-accordion ${open?'open':''}" data-location-id="${esc(id)}">
      <button class="location-accordion-toggle" type="button" data-location-toggle="${esc(id)}" aria-expanded="${open?'true':'false'}">
        <span class="location-summary-main"><b>${esc(l.name||'Standort')}</b><small>${esc(l.city||'Ort nicht hinterlegt')} · ${activePill(l.active!==false)}</small></span>
        <span class="location-summary-meta location-country-summary">${esc(l.country||'–')}</span>
        <span class="location-summary-meta location-carrier-summary">${esc(l.carrier_name||'Keine Spedition')}</span>
        <span class="location-caret">${open?'▴':'▾'}</span>
      </button>
      <div class="location-accordion-content ${open?'':'hidden'}">
        <div class="location-detail-grid">
          <div class="location-detail-box"><h4>Adresse</h4><p>${esc(customerLocationAddress(l))}</p></div>
          <div class="location-detail-box"><h4>Kontakt</h4><p>${esc(l.contact_name||'Kein Ansprechpartner')}${l.contact_email?`\n${esc(l.contact_email)}`:''}${l.phone?`\n${esc(l.phone)}`:''}</p></div>
          <div class="location-detail-box full"><h4>Anmelde-E-Mail</h4><div class="registration-email-chips">${emails.map(e=>`<span class="registration-email-chip">${esc(e)}</span>`).join('')||'<span class="muted">Keine Anmelde-E-Mail hinterlegt.</span>'}</div></div>
          <div class="location-detail-box"><h4>Spedition</h4><p>${esc(l.carrier_name||'Keine Spedition hinterlegt')}</p></div>
          <div class="location-detail-box"><h4>Versandvorgaben</h4><p>${esc(l.shipping_instructions||'Keine besonderen Vorgaben')}</p></div>
        </div>
        ${write?`<div class="location-actions"><button class="ghost compact" type="button" data-location-action="edit" data-location-id="${esc(id)}">Bearbeiten</button><button class="ghost compact" type="button" data-location-action="status" data-location-id="${esc(id)}" data-next-active="${l.active===false?'true':'false'}">${l.active===false?'Aktivieren':'Deaktivieren'}</button></div>`:''}
      </div>
    </article>`;
  }).join('')||'<div class="empty compact-empty">Keine Standorte vorhanden.</div>';
  pane.innerHTML=`<header class="customer-detail-head"><div><div class="kicker">KUNDE</div><h2>${esc(c.account||'–')} · ${esc(c.name||'Unbenannter Kunde')}</h2><div>${activePill(c.active!==false)}</div></div><div class="customer-detail-actions">${customerActions}</div></header><div class="customer-location-area"><div class="customer-location-area-head"><div><div class="kicker">STANDORTE</div><h3>${fmt(locations.length)} Standort${locations.length===1?'':'e'}</h3></div>${write?'<button class="btn" type="button" data-customer-action="new-location">+ Standort</button>':''}</div><div class="location-stack">${locationHtml}</div></div>`;
  wireCustomerDetailActions();
}
function toggleLocationAccordion(id){
  const key=String(id||'');if(!key)return;
  if(openLocationIds.has(key))openLocationIds.delete(key);else openLocationIds.add(key);
  renderCustomerDetail();
}
function wireCustomerDetailActions(){
  const pane=$('#customerDetailPane');if(!pane)return;
  pane.querySelectorAll('[data-location-toggle]').forEach(btn=>btn.addEventListener('click',()=>toggleLocationAccordion(btn.dataset.locationToggle)));
  pane.querySelector('[data-customer-action="edit"]')?.addEventListener('click',()=>openCustomerDrawer('edit',selectedCustomer));
  pane.querySelector('[data-customer-action="new-location"]')?.addEventListener('click',()=>openLocationDrawer('create',null));
  pane.querySelector('[data-customer-action="status"]')?.addEventListener('click',async e=>{
    if(!canWriteCustomers()||!selectedCustomer)return;const btn=e.currentTarget,next=btn.dataset.nextActive==='true';
    if(!confirm(next?'Kunden wieder aktivieren?':'Kunden deaktivieren? Historische Verknüpfungen bleiben erhalten.'))return;
    btn.disabled=true;try{await apiJson(`/api/professional-masterdata/customers/${encodeURIComponent(selectedCustomer.id)}/status`,{method:'POST',headers:csrfHeaders(),body:JSON.stringify({active:next})});await loadCustomers({selectId:selectedCustomer.id});}catch(err){alert(err.message||'Status konnte nicht geändert werden.');}finally{btn.disabled=false;}
  });
  pane.querySelectorAll('[data-location-action="edit"]').forEach(btn=>btn.addEventListener('click',()=>{const l=(selectedCustomer?.locations||[]).find(x=>String(x.id)===String(btn.dataset.locationId));if(l)openLocationDrawer('edit',l);}));
  pane.querySelectorAll('[data-location-action="status"]').forEach(btn=>btn.addEventListener('click',async()=>{
    if(!canWriteCustomers()||!selectedCustomer)return;const locationId=btn.dataset.locationId,next=btn.dataset.nextActive==='true';
    if(!confirm(next?'Standort wieder aktivieren?':'Standort deaktivieren? Er bleibt in historischen Sendungen sichtbar.'))return;
    btn.disabled=true;try{await apiJson(`/api/professional-masterdata/locations/${encodeURIComponent(locationId)}/status`,{method:'POST',headers:csrfHeaders(),body:JSON.stringify({active:next})});openLocationIds.add(String(locationId));await loadCustomers({selectId:selectedCustomer.id,focusLocationId:locationId});}catch(err){alert(err.message||'Standortstatus konnte nicht geändert werden.');}finally{btn.disabled=false;}
  }));
}
function registrationEmailRowsHtml(emails=[]){
  const values=emails.length?emails:[''];
  return values.map(email=>`<div class="registration-email-row"><input class="registration-email-input" type="email" value="${esc(email)}" placeholder="anmeldung@kunde.de" required><button class="ghost compact remove-registration-email" type="button">Entfernen</button></div>`).join('');
}
function locationFormFieldsHtml(location={},prefix='location'){
  return `<div class="masterdata-form-grid">
    <div class="masterdata-form-field full"><label for="${prefix}-name">Standortname *</label><input id="${prefix}-name" name="name" value="${esc(location.name||'')}" required></div>
    <div class="masterdata-form-field"><label for="${prefix}-street">Straße *</label><input id="${prefix}-street" name="street" value="${esc(location.street||'')}" required></div>
    <div class="masterdata-form-field"><label for="${prefix}-house-number">Hausnummer *</label><input id="${prefix}-house-number" name="houseNumber" value="${esc(location.house_number||location.houseNumber||'')}" required></div>
    <div class="masterdata-form-field"><label for="${prefix}-postal-code">PLZ *</label><input id="${prefix}-postal-code" name="postalCode" value="${esc(location.postal_code||location.postalCode||'')}" required></div>
    <div class="masterdata-form-field"><label for="${prefix}-city">Ort *</label><input id="${prefix}-city" name="city" value="${esc(location.city||'')}" required></div>
    <div class="masterdata-form-field"><label for="${prefix}-country">Land *</label><input id="${prefix}-country" name="country" value="${esc(location.country||'')}" required></div>
    <div class="masterdata-form-field"><label for="${prefix}-country-iso">Länder-ISO</label><input id="${prefix}-country-iso" name="countryIso" maxlength="2" value="${esc(location.country_iso||location.countryIso||'')}"></div>
    <div class="masterdata-form-field"><label for="${prefix}-contact-name">Ansprechpartner</label><input id="${prefix}-contact-name" name="contactName" value="${esc(location.contact_name||location.contactName||'')}"></div>
    <div class="masterdata-form-field"><label for="${prefix}-contact-email">Kontakt-E-Mail</label><input id="${prefix}-contact-email" name="contactEmail" type="email" value="${esc(location.contact_email||location.contactEmail||'')}"></div>
    <div class="masterdata-form-field"><label for="${prefix}-phone">Telefon</label><input id="${prefix}-phone" name="phone" value="${esc(location.phone||'')}"></div>
    <div class="masterdata-form-field"><label for="${prefix}-carrier">Spedition</label><input id="${prefix}-carrier" name="carrierName" value="${esc(location.carrier_name||location.carrierName||'')}"></div>
    <div class="masterdata-form-field full"><label for="${prefix}-shipping">Versandvorgaben</label><textarea id="${prefix}-shipping" name="shippingInstructions">${esc(location.shipping_instructions||location.shippingInstructions||'')}</textarea></div>
  </div>`;
}
function registrationEmailEditorHtml(emails=[]){return `<div class="registration-email-editor"><div class="registration-email-list">${registrationEmailRowsHtml(emails)}</div><div><button class="ghost compact add-registration-email" type="button">+ Anmelde-E-Mail</button></div><div class="drawer-help">Alle hier hinterlegten Adressen werden später automatisch für die Anmeldung der Sendung übernommen.</div></div>`;}
function wireRegistrationEmailEditor(container){
  const list=container?.querySelector('.registration-email-list'),add=container?.querySelector('.add-registration-email');if(!list||!add)return;
  const wireRemove=()=>list.querySelectorAll('.remove-registration-email').forEach(btn=>{btn.onclick=()=>{const rows=list.querySelectorAll('.registration-email-row');if(rows.length<=1){const input=btn.closest('.registration-email-row')?.querySelector('input');if(input)input.value='';return;}btn.closest('.registration-email-row')?.remove();};});
  add.onclick=()=>{list.insertAdjacentHTML('beforeend',registrationEmailRowsHtml(['']));wireRemove();list.querySelector('.registration-email-row:last-child input')?.focus();};wireRemove();
}
function openMasterdataDrawer({title,kicker='STAMMDATEN',wide=false,body=''}){
  const drawer=$('#masterdataDrawer'),backdrop=$('#masterdataDrawerBackdrop');if(!drawer||!backdrop)return;
  $('#masterdataDrawerTitle').textContent=title;$('#masterdataDrawerKicker').textContent=kicker;$('#masterdataDrawerBody').innerHTML=body;
  drawer.classList.toggle('wide',wide);drawer.classList.remove('hidden');backdrop.classList.remove('hidden');drawer.setAttribute('aria-hidden','false');backdrop.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
}
function closeMasterdataDrawer(){
  const drawer=$('#masterdataDrawer'),backdrop=$('#masterdataDrawerBackdrop');drawer?.classList.add('hidden');backdrop?.classList.add('hidden');drawer?.classList.remove('wide');drawer?.setAttribute('aria-hidden','true');backdrop?.setAttribute('aria-hidden','true');if($('#masterdataDrawerBody'))$('#masterdataDrawerBody').innerHTML='';masterdataDrawerState=null;masterdataBusy=false;document.body.style.overflow='';
}
function drawerActionsHtml(label){return `<div id="masterdataDrawerError" class="drawer-error hidden"></div><div class="drawer-actions"><button class="ghost" type="button" data-drawer-cancel>Abbrechen</button><button class="btn" type="submit">${esc(label)}</button></div>`;}
function openCustomerDrawer(mode,entity=null){
  if(!canWriteCustomers())return;const create=mode==='create';masterdataDrawerState={kind:'customer',mode:create?'create':'edit',customerId:create?null:entity?.id||selectedCustomer?.id||null};
  const customer=entity||{};
  const core=`<div class="masterdata-form-section"><div class="masterdata-form-grid"><div class="masterdata-form-field"><label for="customer-account">Kundennummer *</label><input id="customer-account" name="account" value="${esc(customer.account||'')}" required></div><div class="masterdata-form-field"><label for="customer-name">Firmenname *</label><input id="customer-name" name="customerName" value="${esc(customer.name||'')}" required></div></div></div>`;
  const firstLocation=create?`<div class="masterdata-form-section"><h3>Erster Standort</h3><p class="muted">Ein neuer Kunde kann nur gemeinsam mit einem vollständigen Standort gespeichert werden.</p>${locationFormFieldsHtml({},'customer-location')}</div><div class="masterdata-form-section"><h3>Anmelde-E-Mail</h3><p class="muted">Mindestens eine Adresse ist Pflicht; mehrere sind möglich.</p>${registrationEmailEditorHtml([])}</div>`:'';
  openMasterdataDrawer({title:create?'Neuer Kunde':'Kunde bearbeiten',kicker:create?'NEUER KUNDE':'KUNDE',wide:create,body:`<form id="masterdataDrawerForm" class="masterdata-form">${core}${firstLocation}${drawerActionsHtml(create?'Kunde anlegen':'Änderungen speichern')}</form>`});
  const form=$('#masterdataDrawerForm');wireRegistrationEmailEditor(form);form?.querySelector('[data-drawer-cancel]')?.addEventListener('click',closeMasterdataDrawer);form?.addEventListener('submit',saveCustomerDrawer);form?.querySelector('input')?.focus();
}
function openLocationDrawer(mode,entity=null){
  if(!canWriteCustomers()||!selectedCustomer)return;const create=mode==='create';const location=entity||{};masterdataDrawerState={kind:'location',mode:create?'create':'edit',customerId:selectedCustomer.id,locationId:create?null:location.id};
  openMasterdataDrawer({title:create?'Neuer Standort':'Standort bearbeiten',kicker:'STANDORT',wide:false,body:`<form id="masterdataDrawerForm" class="masterdata-form"><div class="masterdata-form-section">${locationFormFieldsHtml(location,'location')}</div><div class="masterdata-form-section"><h3>Anmelde-E-Mail</h3><p class="muted">Alle hinterlegten Anmelde-Adressen werden später automatisch übernommen.</p>${registrationEmailEditorHtml(registrationEmailsOf(location))}</div>${drawerActionsHtml(create?'Standort anlegen':'Änderungen speichern')}</form>`});
  const form=$('#masterdataDrawerForm');wireRegistrationEmailEditor(form);form?.querySelector('[data-drawer-cancel]')?.addEventListener('click',closeMasterdataDrawer);form?.addEventListener('submit',saveLocationDrawer);form?.querySelector('input')?.focus();
}
function readRegistrationEmails(form){return Array.from(form.querySelectorAll('.registration-email-input')).map(i=>i.value.trim()).filter(Boolean);}
function readLocationPayload(form,prefix){
  const value=id=>form.querySelector(`#${prefix}-${id}`)?.value||'';
  return {name:value('name'),street:value('street'),houseNumber:value('house-number'),postalCode:value('postal-code'),city:value('city'),country:value('country'),countryIso:value('country-iso'),contactName:value('contact-name'),contactEmail:value('contact-email'),phone:value('phone'),carrierName:value('carrier'),shippingInstructions:value('shipping'),registrationEmails:readRegistrationEmails(form)};
}
function setDrawerError(message=''){
  const box=$('#masterdataDrawerError');if(!box)return;box.textContent=message;box.classList.toggle('hidden',!message);
}
async function saveCustomerDrawer(e){
  e.preventDefault();if(masterdataBusy||!masterdataDrawerState)return;const form=e.currentTarget,submit=form.querySelector('button[type=submit]');masterdataBusy=true;if(submit)submit.disabled=true;setDrawerError('');
  try{
    const payload={account:$('#customer-account').value,name:$('#customer-name').value};let result;
    if(masterdataDrawerState.mode==='create'){
      payload.location=readLocationPayload(form,'customer-location');result=await apiJson('/api/professional-masterdata/customers',{method:'POST',headers:csrfHeaders(),body:JSON.stringify(payload)});
    }else{
      result=await apiJson(`/api/professional-masterdata/customers/${encodeURIComponent(masterdataDrawerState.customerId)}`,{method:'POST',headers:csrfHeaders(),body:JSON.stringify(payload)});
    }
    const targetId=result.customer?.id||masterdataDrawerState.customerId;closeMasterdataDrawer();selectedCustomerId=targetId||'';await loadCustomers({selectId:targetId});
  }catch(err){setDrawerError(err.message||'Kunde konnte nicht gespeichert werden.');}
  finally{masterdataBusy=false;if(submit&&document.body.contains(submit))submit.disabled=false;}
}
async function saveLocationDrawer(e){
  e.preventDefault();if(masterdataBusy||!masterdataDrawerState)return;const state={...masterdataDrawerState},form=e.currentTarget,submit=form.querySelector('button[type=submit]');masterdataBusy=true;if(submit)submit.disabled=true;setDrawerError('');
  try{
    const payload=readLocationPayload(form,'location');let result;
    if(state.mode==='create')result=await apiJson(`/api/professional-masterdata/customers/${encodeURIComponent(state.customerId)}/locations`,{method:'POST',headers:csrfHeaders(),body:JSON.stringify(payload)});
    else result=await apiJson(`/api/professional-masterdata/locations/${encodeURIComponent(state.locationId)}`,{method:'POST',headers:csrfHeaders(),body:JSON.stringify(payload)});
    const locationId=result.location?.id||state.locationId;closeMasterdataDrawer();if(locationId)openLocationIds.add(String(locationId));await loadCustomers({selectId:state.customerId,focusLocationId:locationId});
  }catch(err){setDrawerError(err.message||'Standort konnte nicht gespeichert werden.');}
  finally{masterdataBusy=false;if(submit&&document.body.contains(submit))submit.disabled=false;}
}

function oneTimeUrl(kind,token){return `${location.origin}${location.pathname}#${kind}=${encodeURIComponent(token)}`;}
function showOneTimeLink(title,url){
  $('#oneTimeLinkTitle').textContent=title;$('#oneTimeLinkOutput').value=url;$('#oneTimeLinkBox').classList.remove('hidden');
}
function clearOneTimeLink(){if($('#oneTimeLinkOutput'))$('#oneTimeLinkOutput').value='';$('#oneTimeLinkBox')?.classList.add('hidden');}
function liveUserRow(u){
  const isSelf=String(u.id)===String(identitySession?.user?.id),manage=canManageUsers();
  const roleOptions=Object.entries(TENANT_ROLE_LABELS).map(([value,label])=>`<option value="${value}" ${u.role===value?'selected':''}>${esc(label)}</option>`).join('');
  const locked=u.locked_until&&new Date(u.locked_until).getTime()>Date.now();
  const pw=u.password_reset_required?'<span class="status-pill warn">Reset erforderlich</span>':(locked?'<span class="status-pill lock">Gesperrt</span>':'<span class="status-pill good">Aktiv</span>');
  return `<tr data-user-id="${esc(u.id)}"><td><b>${esc(u.display_name||u.username)}</b><div class="muted">${esc(u.username)}${u.email?` · ${esc(u.email)}`:''}${isSelf?' · Du':''}</div></td><td>${manage&&!isSelf?`<select class="user-role-select">${roleOptions}</select>`:esc(roleLabel(u.role))}</td><td>${u.active?'<span class="status-pill good">Aktiv</span>':'<span class="status-pill lock">Inaktiv</span>'}</td><td>${pw}</td><td><div class="toolbar">${manage&&!isSelf?`<button class="ghost compact save-role" type="button">Rolle speichern</button><button class="ghost compact toggle-user" type="button" data-active="${u.active?'false':'true'}">${u.active?'Deaktivieren':'Aktivieren'}</button><button class="ghost compact reset-user" type="button">Reset-Link</button>`:'–'}</div></td></tr>`;
}
async function loadLiveUsers(){
  if(localMigrationLab||!identitySession){$('#liveUserAdmin')?.classList.add('hidden');return;}
  $('#liveUserAdmin')?.classList.remove('hidden');
  const manage=canManageUsers();$('#inviteUserForm')?.classList.toggle('hidden',!manage);
  $('#userAdminModePill').className='pill '+(manage?'good':'warn');$('#userAdminModePill').textContent=manage?'Firmen-Admin':'Nur Leserechte';
  try{
    const data=await apiJson('/api/professional-admin/users',{method:'GET',headers:{}});
    $('#liveUsersCount').textContent=`${fmt(data.users?.length)} Benutzer · ${fmt(data.invites?.length)} offene Einladungen`;
    $('#liveUsersRows').innerHTML=(data.users||[]).map(liveUserRow).join('')||'<tr><td colspan="5" class="muted">Keine Benutzer gefunden.</td></tr>';
    $('#pendingInvites').innerHTML=(data.invites||[]).map(i=>`<div class="identity-event"><b>${esc(i.display_name)}</b><span>${esc(i.login_name)} · ${esc(roleLabel(i.role))}</span><small>Gültig bis ${esc(new Date(i.expires_at).toLocaleString('de-DE'))}</small></div>`).join('')||'<div class="muted">Keine offenen Einladungen.</div>';
    wireLiveUserActions();
    try{const audit=await apiJson('/api/professional-admin/identity-audit?limit=100',{method:'GET',headers:{}});$('#identityAuditRows').innerHTML=(audit.events||[]).map(a=>`<div class="identity-event"><b>${esc(a.event_type)}</b><span>${esc(a.actor_name||a.actor_username||'System')} · ${esc(a.entity_type||'')}</span><small>${esc(new Date(a.occurred_at).toLocaleString('de-DE'))}</small></div>`).join('')||'<div class="muted">Noch keine Identity-Ereignisse.</div>';}catch{$('#identityAuditRows').innerHTML='<div class="muted">Identity-Audit ist für diese Rolle nicht verfügbar.</div>';}
  }catch(err){$('#liveUsersCount').textContent=err.message||'Benutzerverwaltung konnte nicht geladen werden.';$('#liveUsersRows').innerHTML='<tr><td colspan="5" class="muted">Keine Serverdaten verfügbar.</td></tr>';}
}
function wireLiveUserActions(){
  $$('.save-role').forEach(btn=>btn.addEventListener('click',async()=>{const tr=btn.closest('tr'),userId=tr?.dataset.userId,role=tr?.querySelector('.user-role-select')?.value;if(!userId||!role)return;btn.disabled=true;try{await apiJson('/api/professional-admin/users/role',{method:'POST',headers:csrfHeaders(),body:JSON.stringify({userId,role})});await loadLiveUsers();}catch(err){alert(err.message||'Rollenänderung fehlgeschlagen.');}finally{btn.disabled=false;}}));
  $$('.toggle-user').forEach(btn=>btn.addEventListener('click',async()=>{const tr=btn.closest('tr'),userId=tr?.dataset.userId,active=btn.dataset.active==='true';if(!userId||!confirm(active?'Benutzer wieder aktivieren?':'Benutzer deaktivieren und aktive Sitzungen beenden?'))return;btn.disabled=true;try{await apiJson('/api/professional-admin/users/status',{method:'POST',headers:csrfHeaders(),body:JSON.stringify({userId,active})});await loadLiveUsers();}catch(err){alert(err.message||'Statusänderung fehlgeschlagen.');}finally{btn.disabled=false;}}));
  $$('.reset-user').forEach(btn=>btn.addEventListener('click',async()=>{const tr=btn.closest('tr'),userId=tr?.dataset.userId;if(!userId||!confirm('Neuen einmaligen Passwort-Reset-Link erzeugen?'))return;btn.disabled=true;try{const r=await apiJson('/api/professional-admin/users/password-reset',{method:'POST',headers:csrfHeaders(),body:JSON.stringify({userId})});showOneTimeLink('Passwort-Reset-Link',oneTimeUrl('reset',r.resetToken));await loadLiveUsers();}catch(err){alert(err.message||'Reset-Link konnte nicht erzeugt werden.');}finally{btn.disabled=false;}}));
}
function parseCredentialAction(){
  const raw=location.hash.replace(/^#/,'');if(!raw)return null;const i=raw.indexOf('=');if(i<1)return null;const kind=raw.slice(0,i),token=decodeURIComponent(raw.slice(i+1)||'');return (kind==='invite'||kind==='reset')&&token?{kind,token}:null;
}
function showCredentialAction(action){
  credentialAction=action;$('#credentialActionPanel').classList.remove('hidden');$('#loginForm').classList.add('hidden');$('.auth-actions').classList.add('hidden');$('#onboardingForm').classList.add('hidden');
  $('#credentialActionTitle').textContent=action.kind==='invite'?'Einladung annehmen':'Passwort zurücksetzen';$('#credentialActionHint').textContent=action.kind==='invite'?'Einmalige Einladung für einen Professional-Benutzer.':'Einmaliger Passwort-Reset-Link.';$('#identityStatus').textContent='Sicherer Einmal-Link erkannt.';
}
function clearCredentialAction(){credentialAction=null;history.replaceState(null,'',location.pathname+location.search);$('#credentialActionPanel').classList.add('hidden');$('#loginForm').classList.remove('hidden');$('.auth-actions').classList.remove('hidden');$('#credentialPassword').value='';$('#credentialPassword2').value='';$('#credentialActionMessage').textContent='';}

function showApplication({local=false,session=null}={}){
  localMigrationLab=!!local;identitySession=session||null;liveCustomers=[];selectedCustomerId='';selectedCustomer=null;openLocationIds=new Set();closeMasterdataDrawer();
  $('#authGate').classList.add('hidden');$('#appShell').classList.remove('hidden');
  const badge=$('#identityBadge');badge.classList.remove('hidden');$('#logoutBtn').classList.remove('hidden');
  if(local){badge.innerHTML='<b>Lokales Migrationslabor</b><span>keine Serverdaten</span>';$('#logoutBtn').textContent='Zur Anmeldung';$('#liveUserAdmin')?.classList.add('hidden');setView('migration');}
  else {badge.innerHTML=`<b>${esc(session?.user?.displayName||session?.user?.username||'Benutzer')}</b><span>${esc(session?.tenant?.name||'Mandant')} · ${esc(roleLabel(session?.user?.role))}</span>`;$('#logoutBtn').textContent='Abmelden';setView('overview');}
}
function showAuthGate(message='',kind=''){
  identitySession=null;localMigrationLab=false;closeMasterdataDrawer();$('#appShell').classList.add('hidden');$('#authGate').classList.remove('hidden');
  const st=$('#identityStatus');if(message){st.textContent=message;st.className='auth-status '+kind;}
}
async function refreshOnboardingStatus(){
  try{
    const s=await apiJson('/api/professional-onboarding/status',{method:'GET',headers:{}});
    if(s.databaseConfigured&&s.controlWritesEnabled&&s.bootstrapConfigured&&Number(s.tenantCount)===0){$('#openOnboardingBtn').classList.remove('hidden');}
    else $('#openOnboardingBtn').classList.add('hidden');
    return s;
  }catch{$('#openOnboardingBtn').classList.add('hidden');return null;}
}
async function bootIdentity(){
  const action=parseCredentialAction();showAuthGate(action?'Sicherer Einmal-Link erkannt.':'Identity Service wird geprüft …');if(action){showCredentialAction(action);return;}
  try{const session=await apiJson('/api/professional-auth/session',{method:'GET',headers:{}});showApplication({session});return;}
  catch(err){
    if(err.status===401) showAuthGate('Bitte mit Firmen-Workspace und Benutzerkonto anmelden.','');
    else if(err.status===503) showAuthGate('Identity Service ist noch nicht mit der Professional-Datenbank aktiviert. Das lokale Migrationslabor bleibt verfügbar.','warn');
    else showAuthGate('Anmeldedienst derzeit nicht erreichbar. Das lokale Migrationslabor bleibt verfügbar.','warn');
  }
  await refreshOnboardingStatus();
}

function setView(name){
  $$('.view').forEach(v=>v.classList.toggle('active',v.dataset.view===name));
  $$('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.nav===name));
  $('#pageTitle').textContent=({overview:'Übersicht',migration:'Migration',tenants:'Mandanten',users:'Benutzer & Rollen',customers:'Kunden',locations:'Standorte',shipments:'Sendungen',documents:'Dokumente',audit:'Audit'}[name]||'ExportHUB Professional');
  if(name==='users'&&!localMigrationLab&&identitySession) loadLiveUsers();
  if(name==='customers'){
    const live=syncCustomerViewMode();
    if(live)loadCustomers();
  }
}
$$('.nav button').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.nav)));

function download(name,text){
  const blob=new Blob([text],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function fmt(n){return new Intl.NumberFormat('de-DE').format(Number(n||0))}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function hintOptions(){return {sourceVersionHint:($('#sourceVersionHint')?.value||'').trim(),tenantNameHint:($('#tenantNameHint')?.value||'').trim()}}
function statusPill(s){const k=String(s||'');let c='neutral';if(/POD vorhanden|Abgeschlossen|Archiviert/.test(k))c='good';else if(/Abgeholt|Bereit|Vorbereitet/.test(k))c='info';else if(/Wartet|Nachbearbeitung/.test(k))c='warn';return `<span class="status-pill ${c}">${esc(k||'Entwurf')}</span>`}

function documentStatusPill(s){
  const k=String(s||'');
  if(k==='VERIFIED_INLINE') return '<span class="status-pill good">Verifiziert</span>';
  if(k==='REMOTE_CAPTURE_REQUIRED') return '<span class="status-pill warn">Remote sichern</span>';
  if(k==='CONTENT_MISSING') return '<span class="status-pill lock">Dateiinhalt fehlt</span>';
  if(k==='HASH_ERROR') return '<span class="status-pill warn">Hashfehler</span>';
  return `<span class="status-pill">${esc(k||'Offen')}</span>`;
}
function recoveryLabel(v){
  return ({NONE:'Keine Aktion',CAPTURE_SHAREPOINT_AUTHORIZED:'SharePoint-Datei autorisiert sichern',CAPTURE_LEGACY_API:'ExportHUB-API-Datei sichern',CAPTURE_AUTHORIZED_REMOTE:'Remote-Datei autorisiert sichern',REGENERATE_FROM_LOCKED_SNAPSHOT:'Aus gesperrtem Sendungsstand regenerierbar',SOURCE_FILE_REQUIRED:'Originaldatei erforderlich'}[String(v||'')]||String(v||'Offen'));
}
function renderDocumentRows(){
  const qv=($('#documentSearch')?.value||'').trim().toLowerCase();
  const kind=$('#documentKindFilter')?.value||'', st=$('#documentStatusFilter')?.value||'';
  const rows=currentDocumentRows.filter(d=>(!kind||d.kind===kind)&&(!st||d.migrationStatus===st)&&(!qv||[d.reference,d.name,d.kind,d.remoteSourceClass].join(' ').toLowerCase().includes(qv)));
  $('#documentRows').innerHTML=rows.map(d=>`<tr><td><b>${esc(d.reference||'–')}</b></td><td>${esc(d.kind)}</td><td><b>${esc(d.name)}</b><div class="muted">${fmt(d.size)} B · ${fmt(d.sourceRecordCount||1)} Quelle(n)</div></td><td>${esc(d.storage==='inline-source'?'Im Backup':(d.remoteSourceClass||'Nur Metadaten'))}</td><td>${documentStatusPill(d.migrationStatus)}</td><td>${esc(recoveryLabel(d.recoveryAction))}</td><td><span class="status-pill ${d.migrationPriority==='P0'?'warn':(d.migrationPriority==='OK'?'good':'info')}">${esc(d.migrationPriority)}</span></td></tr>`).join('') || '<tr><td colspan="7" class="muted">Keine Dokumente für diesen Filter.</td></tr>';
}

function renderInventory(inv){
  currentInventory=inv;const c=inv.counts;
  $('#invCustomers').textContent=fmt(c.canonicalCustomers||c.customers);
  $('#invShipments').textContent=fmt(c.canonicalShipmentGroups);
  $('#invShipmentSources').textContent=fmt(c.shipmentSourceRecords)+' Quelldatensätze';
  $('#invPods').textContent=fmt(c.podFileEntries||c.pods);
  $('#invDocs').textContent=fmt(c.documents)+' eindeutige Dokumente';
  $('#invUsers').textContent=fmt(c.users);
  $('#sourceMeta').innerHTML=`<b>${esc(inv.source.version||'Version unbekannt')}</b> · ${esc(inv.source.format)} · ${inv.source.exportedAt?('Export '+esc(inv.source.exportedAt)):'Exportzeit im Legacy-Backup nicht enthalten'}`;
  const rows=[
    ['Kunden-Quelldatensätze',c.customers],['Eindeutige Kunden',c.canonicalCustomers],['Sendungs-Quelldatensätze',c.shipmentSourceRecords],['Eindeutige Sendungen',c.canonicalShipmentGroups],['Sendungen mit POD-Evidenz',c.podEvidenceShipments],['Sendungen mit POD-Datei',c.podFileShipments],['POD-Dateieinträge Hauptbestand',c.podFileEntries],['POD eingebettet',c.podFileInline],['POD extern verknüpft',c.podFileRemote],['POD nur Metadaten',c.podFileMetadataOnly],['POD-Artefakte inkl. Evidenz',c.pods],['Dokument-Quelldatensätze',c.documentSourceRecords],['Eindeutige Dokumente',c.documents],['Lieferscheine',c.deliveryNotes],['ABD-Dokumente',c.abdDocuments],['Aufgaben',c.tasks],['ABD-Anfragen',c.abdRequests],['Archiv-Einträge',c.archiveEntries],['Benutzer',c.users]
  ];
  $('#inventoryRows').innerHTML=rows.map(r=>`<tr><td>${esc(r[0])}</td><td>${fmt(r[1])}</td></tr>`).join('');
  $('#dupInfo').textContent=`${inv.duplicateShipmentGroups.length} Sendungsgruppen mit mehreren Quellen · ${inv.duplicateDocumentGroups.length} Dokumentgruppen mit mehreren Quellen · ${inv.duplicateCustomerGroups.length} Kunden-Dubletten-Gruppen`;
  $('#statusOverview').innerHTML=Object.entries(inv.statusCounts||{}).map(([k,v])=>`<div>${statusPill(k)}<b>${fmt(v)}</b></div>`).join('');
  $('#inventorySection').classList.remove('hidden');$('#buildPackageBtn').disabled=false;
}

function renderReadOnlyViews(pkg){
  const n=pkg.normalized||{},m=pkg.manifest||{},tenant=n.tenant||{};
  $('#tenantCard').innerHTML=`<div class="kicker">READ-ONLY TENANT</div><h2>${esc(tenant.name)}</h2><p class="muted">Technische ID: <span class="mono">${esc(tenant.id)}</span></p><div class="gate good">✓ Daten dieses Mandanten sind vollständig von anderen künftigen Mandanten zu trennen.</div><div class="gate warn" style="margin-top:8px">⚠ Noch kein produktiver Schreibzugriff und kein Cutover.</div>`;
  $('#usersRows').innerHTML=(n.users||[]).map(u=>`<tr><td><b>${esc(u.displayName)}</b><div class="muted">${esc(u.username)}</div></td><td>${esc(u.legacyRole)}</td><td>${esc(u.professionalRole)}</td><td>${u.active?'Aktiv':'Inaktiv'}</td><td><span class="status-pill warn">Passwort-Neuvergabe</span></td></tr>`).join('');
  $('#usersCount').textContent=fmt((n.users||[]).length)+' Benutzer aus dem Altbestand';
  $('#customerRows').innerHTML=(n.customers||[]).map(c=>`<tr><td><b>${esc(c.account)}</b></td><td>${esc(c.name)}</td><td>${esc(c.country)}</td><td>${esc(c.carrier)}</td></tr>`).join('');
  $('#customersCount').textContent=fmt((n.customers||[]).length)+' eindeutige Kunden';
  const customerById=new Map((n.customers||[]).map(c=>[c.id,c]));
  $('#locationRows').innerHTML=(n.locations||[]).map(l=>{const c=customerById.get(l.customerId)||{};return `<tr><td><b>${esc(c.name||c.account||l.customerId)}</b></td><td>${esc(l.name)}</td><td>${esc(l.address||'–')}</td><td>${esc(l.country||'–')}</td><td>${l.derivedMain?'Abgeleitete Hauptadresse':'Gespeicherter Standort'}</td></tr>`}).join('')||'<tr><td colspan="5" class="muted">Keine Standorte gefunden.</td></tr>';
  $('#locationsCount').textContent=fmt((n.locations||[]).length)+' eindeutige Standorte · '+fmt(m.locations?.shipmentsResolved)+' Sendungen direkt zugeordnet';
  $('#shipmentRows').innerHTML=(n.shipments||[]).map(sh=>`<tr><td><b>${esc(sh.reference)}</b><div class="muted">${esc(sh.legacyShipmentId)}</div></td><td>${esc(sh.customerName||sh.customerAccount)}</td><td>${statusPill(sh.canonicalStatus)}</td><td>${sh.podEvidence?'<span class="status-pill good">POD-Evidenz</span>':'–'}</td><td>${sh.locked?'<span class="status-pill lock">Gesperrt</span>':'Read only'}</td><td>${esc(sh.actualPickupDate||sh.pickupDate)}</td></tr>`).join('');
  $('#shipmentsCount').textContent=fmt((n.shipments||[]).length)+' eindeutige Sendungen · '+fmt(m.sourceCounts?.shipmentSourceRecords)+' Quellstände';
  currentDocumentRows=(n.documents||[]).slice();
  $('#documentsCount').textContent=fmt(currentDocumentRows.length)+' eindeutige Dokumente · '+fmt(m.documents?.inlineHashed)+' verifiziert · '+fmt(m.documents?.remoteCaptureRequired)+' remote · '+fmt(m.documents?.contentMissing)+' ohne Inhalt';
  const kinds=[...new Set(currentDocumentRows.map(d=>d.kind).filter(Boolean))].sort();
  $('#documentKindFilter').innerHTML='<option value="">Alle</option>'+kinds.map(k=>`<option value="${esc(k)}">${esc(k)}</option>`).join('');
  const byStatus=m.documents?.byStatus||{};
  $('#documentSummary').innerHTML=Object.entries(byStatus).map(([k,v])=>`<div>${documentStatusPill(k)}<b>${fmt(v)}</b></div>`).join('');
  const pg=m.documents?.podGate||{};
  $('#podGatePill').className='pill '+(pg.ready?'good':'warn');
  $('#podGatePill').textContent=pg.ready?'POD vollständig verifiziert':`${fmt(pg.blockers)} POD-Dateien offen`;
  renderDocumentRows();
  const audits=(n.auditEvents||[]).slice();
  $('#auditCount').textContent=fmt(audits.length)+' Audit-Ereignisse · Anzeige der letzten '+fmt(Math.min(200,audits.length));
  $('#auditPreview').innerHTML=`<div class="read-grid"><div class="read-kpi"><b>${fmt(m.mapping?.mapped)}</b><span>Quellobjekte zugeordnet</span></div><div class="read-kpi"><b>${fmt(m.audit?.total)}</b><span>Audit-Ereignisse strukturiert</span></div><div class="read-kpi"><b>${fmt(m.recovery?.captureRequired)}</b><span>Remote-Captures offen</span></div><div class="read-kpi"><b>${fmt(m.recovery?.sourceFileRequired)}</b><span>Originaldateien erforderlich</span></div></div><div class="notice" style="margin-top:14px">Professional 0.7 bewahrt Audittexte, redigiert aber bekannte Secret-Felder in strukturierten Details. Es werden keine fehlenden POD-/Quelldateien erfunden oder als erfolgreich migriert markiert.</div>`;
  $('#auditRows').innerHTML=audits.slice(-200).reverse().map(a=>`<tr><td>${esc(a.at||'–')}</td><td>${esc(a.actor||'System')}</td><td>${esc(a.category)}</td><td><b>${esc(a.action)}</b><div class="muted">${esc(a.detail||'')}</div></td><td>${esc(a.source)}</td></tr>`).join('')||'<tr><td colspan="5" class="muted">Keine Audit-Ereignisse gefunden.</td></tr>';
  $$('.needs-migration').forEach(x=>x.classList.add('hidden'));$$('.has-migration').forEach(x=>x.classList.remove('hidden'));
}

$('#backupFile').addEventListener('change',async e=>{
  const file=e.target.files&&e.target.files[0]; if(!file)return;
  $('#uploadStatus').textContent='Backup wird ausschließlich lokal im Browser gelesen …';
  $('#buildPackageBtn').disabled=true;migrationPackage=null;currentInventory=null;
  try{
    sourceText=await file.text();sourcePayload=JSON.parse(sourceText);
    let result=inventoryBackup(sourcePayload,hintOptions());
    if(result.validation.ok && result.validation.warnings.includes('SOURCE_VERSION_MISSING')){
      $('#sourceVersionHint').focus();
    }
    if(!result.validation.ok) throw new Error('Backup-Struktur nicht unterstützt: '+result.validation.errors.join(', '));
    renderInventory(result.inventory);
    $('#uploadStatus').textContent=result.validation.format==='legacy-state-users'?'Legacy-Export erkannt. Version ggf. oben bestätigen; noch keine Daten geschrieben oder hochgeladen.':'Backup erkannt. Es wurden noch keine Daten geschrieben oder hochgeladen.';
  }catch(err){sourceText='';sourcePayload=null;$('#inventorySection').classList.add('hidden');$('#uploadStatus').textContent='Abgelehnt: '+(err&&err.message||err)}
});

$('#sourceVersionHint').addEventListener('change',()=>{if(sourcePayload){const r=inventoryBackup(sourcePayload,hintOptions());if(r.validation.ok)renderInventory(r.inventory)}});
$('#tenantNameHint').addEventListener('change',()=>{if(migrationPackage)renderReadOnlyViews(migrationPackage)});

$('#buildPackageBtn').addEventListener('click',async()=>{
  if(!sourcePayload)return;
  const btn=$('#buildPackageBtn');btn.disabled=true;$('#packageStatus').textContent='Migrationspaket wird geprüft. Dokument-Prüfsummen können bei großen Backups etwas dauern …';$('#packageProgress').style.width='35%';
  await new Promise(r=>setTimeout(r,30));
  try{
    migrationPackage=await buildMigrationPackage(sourcePayload,sourceText,hintOptions());$('#packageProgress').style.width='100%';
    const s=summarizePackage(migrationPackage),g=migrationPackage.manifest.gates,d=migrationPackage.manifest.documents;
    $('#readOnlyGate').className='gate '+(g.readOnlyReady?'good':'bad');$('#readOnlyGate').textContent=g.readOnlyReady?'✓ READ_ONLY_READY – Bestand vollständig zugeordnet':'✕ READ_ONLY blockiert – '+g.readOnlyErrors.join(', ');
    $('#cutoverGate').className='gate '+(g.cutoverReady?'good':'warn');$('#cutoverGate').textContent=g.cutoverReady?'✓ CUTOVER_READY':'⚠ CUTOVER weiterhin blockiert – '+(g.cutoverBlockers.join(', ')||'weitere Prüfung erforderlich');
    $('#hashValue').textContent=migrationPackage.manifest.sourceSha256;
    $('#docVerify').textContent=`${fmt(d.inlineHashed)} eingebettete Dateien gehasht · ${fmt(d.remoteCaptureRequired)} Remote-Dateien separat zu sichern · ${fmt(d.contentMissing)} ohne Dateinhalt`;
    $('#packageStatus').textContent=`Migrationsprüfung abgeschlossen: ${fmt(s.customers)} Kunden · ${fmt(s.canonicalShipments)} Sendungen · ${fmt(s.documents)} Dokumente · ${fmt(s.users)} Benutzer · ${fmt(migrationPackage.normalized?.locations?.length)} Standorte · ${fmt(migrationPackage.normalized?.auditEvents?.length)} Audit-Ereignisse.`;
    $('#downloadPackageBtn').disabled=!g.readOnlyReady;$('#downloadDocumentRegistryBtn').disabled=!g.readOnlyReady;$('#packageResult').classList.remove('hidden');renderReadOnlyViews(migrationPackage);
  }catch(err){$('#packageStatus').textContent='Fehler: '+(err&&err.message||err);$('#packageProgress').style.width='0'}finally{btn.disabled=false}
});

$('#downloadPackageBtn').addEventListener('click',()=>{
  if(!migrationPackage)return;
  const ts=new Date().toISOString().replace(/[:.]/g,'-');download(`ExportHUB_Professional_Migration_${ts}.json`,JSON.stringify(migrationPackage,null,2));
});
$('#downloadDocumentRegistryBtn').addEventListener('click',()=>{
  if(!migrationPackage)return;
  const m=migrationPackage.manifest||{}, docs=(migrationPackage.normalized?.documents||[]).map(d=>({id:d.id,reference:d.reference,kind:d.kind,name:d.name,mimeType:d.mimeType,size:d.size,storage:d.storage,migrationStatus:d.migrationStatus,migrationPriority:d.migrationPriority,cutoverBlocking:d.cutoverBlocking,remoteSourceClass:d.remoteSourceClass,remoteLocatorPresent:!!d.remoteUrl,recoveryAction:d.recoveryAction,sha256:d.sha256||'',sourcePointers:d.sourcePointers}));
  const safe={type:'ExportHUB_Professional_Document_Registry',version:m.professionalVersion,generatedAt:m.generatedAt,sourceSha256:m.sourceSha256,sourceMetadata:m.sourceMetadata,summary:m.documents,documents:docs};
  const ts=new Date().toISOString().replace(/[:.]/g,'-');download(`ExportHUB_Professional_Dokumentregister_${ts}.json`,JSON.stringify(safe,null,2));
});
['documentSearch','documentKindFilter','documentStatusFilter'].forEach(id=>document.getElementById(id)?.addEventListener(id==='documentSearch'?'input':'change',renderDocumentRows));

$('#newCustomerBtn')?.addEventListener('click',()=>openCustomerDrawer('create'));
$('#customerSearch')?.addEventListener('input',()=>{clearTimeout(customerSearchTimer);customerSearchTimer=setTimeout(()=>loadCustomers({selectId:''}),180);});
$('#customerStatusFilter')?.addEventListener('change',()=>loadCustomers({selectId:''}));
$('#closeMasterdataDrawer')?.addEventListener('click',closeMasterdataDrawer);
$('#masterdataDrawerBackdrop')?.addEventListener('click',closeMasterdataDrawer);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#masterdataDrawer')?.classList.contains('hidden'))closeMasterdataDrawer();});

$('#inviteUserForm')?.addEventListener('submit',async e=>{
  e.preventDefault();clearOneTimeLink();const btn=e.currentTarget.querySelector('button[type=submit]');btn.disabled=true;$('#inviteMessage').textContent='Einladung wird sicher erzeugt …';
  try{const r=await apiJson('/api/professional-admin/users/invite',{method:'POST',headers:csrfHeaders(),body:JSON.stringify({displayName:$('#inviteDisplayName').value,email:$('#inviteEmail').value,login:$('#inviteLogin').value,role:$('#inviteRole').value})});showOneTimeLink('Einladungs-Link',oneTimeUrl('invite',r.inviteToken));$('#inviteMessage').textContent='Einladung erstellt. Den Einmal-Link sicher weitergeben.';e.currentTarget.reset();await loadLiveUsers();}catch(err){$('#inviteMessage').textContent=err.message||'Einladung konnte nicht erstellt werden.';}finally{btn.disabled=false;}
});
$('#copyOneTimeLink')?.addEventListener('click',async()=>{const v=$('#oneTimeLinkOutput').value;if(!v)return;try{await navigator.clipboard.writeText(v);$('#copyOneTimeLink').textContent='Kopiert';setTimeout(()=>$('#copyOneTimeLink').textContent='Link kopieren',1500);}catch{$('#oneTimeLinkOutput').select();}});
$('#credentialActionForm')?.addEventListener('submit',async e=>{
  e.preventDefault();if(!credentialAction)return;const p1=$('#credentialPassword').value,p2=$('#credentialPassword2').value;if(p1!==p2){$('#credentialActionMessage').textContent='Die Passwörter stimmen nicht überein.';return;}const btn=e.currentTarget.querySelector('button[type=submit]');btn.disabled=true;$('#credentialActionMessage').textContent='Passwort wird sicher gesetzt …';
  try{const url=credentialAction.kind==='invite'?'/api/professional-auth/invite/redeem':'/api/professional-auth/password-reset/redeem';const r=await apiJson(url,{method:'POST',body:JSON.stringify({token:credentialAction.token,password:p1})});const workspace=r.tenant?.slug||'',login=r.user?.username||r.login||'';clearCredentialAction();$('#loginWorkspace').value=workspace;$('#loginName').value=login;$('#identityStatus').textContent='Passwort gesetzt. Jetzt anmelden.';$('#identityStatus').className='auth-status good';}catch(err){$('#credentialActionMessage').textContent=err.message||'Einmal-Link konnte nicht eingelöst werden.';}finally{btn.disabled=false;}
});
$('#cancelCredentialAction')?.addEventListener('click',()=>{clearCredentialAction();showAuthGate('Bitte mit Firmen-Workspace und Benutzerkonto anmelden.');refreshOnboardingStatus();});

$('#loginForm')?.addEventListener('submit',async e=>{
  e.preventDefault();const btn=e.currentTarget.querySelector('button[type=submit]');btn.disabled=true;$('#loginMessage').textContent='Anmeldung wird geprüft …';
  try{
    const result=await apiJson('/api/professional-auth/login',{method:'POST',body:JSON.stringify({workspace:$('#loginWorkspace').value,login:$('#loginName').value,password:$('#loginPassword').value})});
    $('#loginPassword').value='';$('#loginMessage').textContent='';showApplication({session:result});
  }catch(err){$('#loginMessage').textContent=err.code==='AUTH_LOCKED'?'Konto vorübergehend gesperrt. Bitte später erneut versuchen.':err.code==='PASSWORD_RESET_REQUIRED'?'Für dieses Konto wurde ein Passwort-Reset angefordert. Bitte den aktuellen Reset-Link verwenden.':(err.message||'Anmeldung fehlgeschlagen.');}
  finally{btn.disabled=false;}
});
$('#openMigrationLabBtn')?.addEventListener('click',()=>showApplication({local:true}));
$('#openOnboardingBtn')?.addEventListener('click',()=>$('#onboardingForm').classList.toggle('hidden'));
$('#onboardingForm')?.addEventListener('submit',async e=>{
  e.preventDefault();const btn=e.currentTarget.querySelector('button[type=submit]');btn.disabled=true;$('#onboardingMessage').textContent='Firmenmandant wird angelegt …';
  try{
    const payload={companyName:$('#companyName').value,workspace:$('#workspaceName').value,adminName:$('#adminName').value,adminEmail:$('#adminEmail').value,adminLogin:$('#adminLogin').value,password:$('#adminPassword').value};
    await apiJson('/api/professional-onboarding/tenant',{method:'POST',headers:{'x-professional-bootstrap-token':$('#bootstrapToken').value},body:JSON.stringify(payload)});
    $('#onboardingMessage').textContent='Ersteinrichtung abgeschlossen. Jetzt mit Workspace und Administrator anmelden.';$('#loginWorkspace').value=$('#workspaceName').value;$('#loginName').value=$('#adminLogin').value;$('#adminPassword').value='';$('#bootstrapToken').value='';$('#openOnboardingBtn').classList.add('hidden');
  }catch(err){$('#onboardingMessage').textContent=err.message||'Ersteinrichtung fehlgeschlagen.';}
  finally{btn.disabled=false;}
});
$('#logoutBtn')?.addEventListener('click',async()=>{
  if(localMigrationLab){showAuthGate('Bitte mit Firmen-Workspace und Benutzerkonto anmelden.');await refreshOnboardingStatus();return;}
  try{await apiJson('/api/professional-auth/logout',{method:'POST',body:'{}'});}catch{}
  showAuthGate('Abgemeldet.');await refreshOnboardingStatus();
});

setView('overview');
bootIdentity();
