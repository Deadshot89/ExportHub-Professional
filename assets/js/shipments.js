import {createAutosaveQueue} from './shipment-autosave.js';
import {renderShipmentEditor} from './shipment-editor.js';

const $=selector=>document.querySelector(selector);
const WRITE_ROLES=new Set(['TENANT_ADMIN','EXPORT_ADMIN','TEAM_LEAD','OPERATOR']);
let session=null;
let localMode=false;
let rows=[];
let selectedId='';
let current=null;
let lock=null;
let autosave=null;
let colliAutosave=null;
let packagingTypes=[];
let packagingLoaded=false;
let packagingPromise=null;
let carriers=[];
let carriersLoaded=false;
let carriersPromise=null;
let oneOffPreview=null;
let oneOffSelectedCustomerId='';
let colliDirty=false;
let colliEditVersion=0;
let mutationTail=Promise.resolve();
let loadSequence=0;
let searchTimer=null;
let saveState='idle';
let navigationBypass=false;

function esc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function canWrite(){return !localMode&&!!session&&WRITE_ROLES.has(String(session?.user?.role||''));}
function csrfHeaders(){return session?.csrfToken?{'x-professional-csrf':session.csrfToken}:{};}
async function apiJson(url,options={}){
  const {headers={},...rest}=options;
  const response=await fetch(url,{credentials:'same-origin',...rest,headers:{'content-type':'application/json',...headers}});
  let body={};try{body=await response.json();}catch{}
  if(!response.ok){const error=new Error(body.message||`HTTP ${response.status}`);error.code=body.code||`HTTP_${response.status}`;error.status=response.status;throw error;}
  return body;
}
function setMessage(message='',kind=''){
  const node=$('#shipmentWorkspaceMessage');if(!node)return;
  node.textContent=message;node.className=`shipment-workspace-message ${kind}`.trim();
}
function setSaveState(state,error){
  saveState=state;
  const node=$('#shipmentSaveState');
  if(node){
    const label={saving:'Speichert …',saved:'Gespeichert',error:'Speichern fehlgeschlagen',idle:'Bereit'}[state]||state;
    node.textContent=label;node.className=`shipment-save-state ${state}`;
  }
  if(state==='error')setMessage(error?.message||'Änderungen konnten nicht gespeichert werden. Erneuter Versuch läuft.','warn');
  else if(state==='saved'&&!colliDirty)setMessage('');
}
function syncMode(){
  const live=!localMode&&!!session;
  $('#liveShipmentWorkspace')?.classList.toggle('hidden',!live);
  $('#legacyShipmentMigrationPreview')?.classList.toggle('hidden',live);
  const create=$('#newShipmentBtn');if(create){create.classList.toggle('hidden',!live||!canWrite());create.disabled=!canWrite();}
  return live;
}
function statusClass(status){
  const value=String(status||'');
  if(/POD vorhanden|Abgeschlossen|Archiviert/.test(value))return 'good';
  if(/Abgeholt|Bereit zur Abholung/.test(value))return 'info';
  if(/Wartet|Nachbearbeitung/.test(value))return 'warn';
  if(/Storniert/.test(value))return 'bad';
  return 'neutral';
}
function runShipmentMutation(operation){
  const run=mutationTail.then(operation,operation);
  mutationTail=run.catch(()=>{});
  return run;
}
async function loadPackagingTypes(){
  if(localMode||!session)return [];
  if(packagingLoaded)return packagingTypes;
  if(packagingPromise)return packagingPromise;
  packagingPromise=(async()=>{
    const data=await apiJson('/api/professional-masterdata/packaging-types?status=active',{method:'GET',headers:{}});
    packagingTypes=Array.isArray(data.packagingTypes)?data.packagingTypes:[];
    packagingLoaded=true;
    return packagingTypes;
  })();
  try{return await packagingPromise;}finally{packagingPromise=null;}
}
async function loadCarriers(){
  if(localMode||!session)return [];
  if(carriersLoaded)return carriers;
  if(carriersPromise)return carriersPromise;
  carriersPromise=(async()=>{
    const data=await apiJson('/api/professional-masterdata/carriers?status=active',{method:'GET',headers:{}});
    carriers=Array.isArray(data.carriers)?data.carriers:[];
    carriersLoaded=true;
    return carriers;
  })();
  try{return await carriersPromise;}finally{carriersPromise=null;}
}
function renderList(){
  const list=$('#shipmentMasterList'),count=$('#shipmentMasterCount');if(!list)return;
  if(count)count.textContent=`${rows.length} Sendung${rows.length===1?'':'en'}`;
  list.innerHTML=rows.map(shipment=>`<button class="shipment-master-item ${String(shipment.id)===String(selectedId)?'active':''}" type="button" data-shipment-id="${esc(shipment.id)}"><span class="shipment-master-head"><strong>${esc(shipment.reference||'–')}</strong><span class="cc-status ${statusClass(shipment.status)}">${esc(shipment.status||'Entwurf')}</span></span><span class="shipment-master-customer">${esc(shipment.customerName||shipment.customerAccount||'Kunde noch offen')}</span><span class="shipment-master-meta">${esc(shipment.locationName||'Standort offen')}${shipment.plannedPickupDate?` · ${esc(shipment.plannedPickupDate)}`:''}${String(shipment.sourceKind).toUpperCase()==='MIGRATED'?' · Migriert':''}</span></button>`).join('')||'<div class="cc-empty">Keine Sendungen für diesen Filter.</div>';
  list.querySelectorAll('[data-shipment-id]').forEach(button=>button.addEventListener('click',()=>openShipment(button.dataset.shipmentId)));
}
function currentColliRows(){return Array.isArray(current?.colliRows)?current.colliRows:[];}
function packagingFor(id){return packagingTypes.find(item=>String(item?.id||'')===String(id||''))||null;}
function serializableColliRows(){
  return currentColliRows().map(row=>({
    packagingTypeId:String(row.packagingTypeId||''),
    quantity:Number(row.quantity),
    weightKg:Number(row.weightKg),
    lengthCm:row.lengthCm===null||row.lengthCm===undefined||row.lengthCm===''?null:Number(row.lengthCm),
    widthCm:row.widthCm===null||row.widthCm===undefined||row.widthCm===''?null:Number(row.widthCm),
    heightCm:row.heightCm===null||row.heightCm===undefined||row.heightCm===''?null:Number(row.heightCm)
  }));
}
function colliRowsComplete(){
  return currentColliRows().every(row=>{
    const quantity=Number(row.quantity),weight=Number(row.weightKg);
    if(!String(row.packagingTypeId||'').trim()||!Number.isInteger(quantity)||quantity<=0||row.weightKg===null||row.weightKg===undefined||row.weightKg===''||!Number.isFinite(weight)||weight<0)return false;
    return ['lengthCm','widthCm','heightCm'].every(field=>row[field]===null||row[field]===undefined||row[field]===''||(Number.isFinite(Number(row[field]))&&Number(row[field])>0));
  });
}
function queueColliSave(){
  colliDirty=true;
  if(current){current.colliTotals=null;}
  if(!colliRowsComplete()){
    colliAutosave?.dispose();colliAutosave=null;setupColliAutosave();
    setMessage('Colli-Zeile unvollständig. Verpackung, Anzahl und Gewicht müssen vollständig sein.','warn');
    setSaveState('idle');
    return;
  }
  colliAutosave?.queue({colliRows:serializableColliRows(),editVersion:colliEditVersion});
}
function updateColliField(index,field,value){
  if(!current||!Number.isInteger(index)||index<0||index>=currentColliRows().length)return;
  const next=currentColliRows().map(row=>({...row}));
  const row=next[index];
  if(field==='packagingTypeId'){
    row.packagingTypeId=String(value||'');
    const packaging=packagingFor(row.packagingTypeId);
    row.packagingName=packaging?.name||'';
    for(const dimension of ['lengthCm','widthCm','heightCm'])row[dimension]=packaging?.[dimension]??null;
  }else{
    row[field]=value===''?null:value;
  }
  row.ldm=null;
  current={...current,colliRows:next,colliTotals:null};
  colliEditVersion++;
  queueColliSave();
}
function addColliRow(){
  if(!current||!canWrite()||!lock?.lockToken||!packagingTypes.length)return;
  const packaging=packagingTypes[0];
  const next=[...currentColliRows(),{packagingTypeId:packaging.id,packagingName:packaging.name,quantity:1,weightKg:null,lengthCm:packaging.lengthCm??null,widthCm:packaging.widthCm??null,heightCm:packaging.heightCm??null,ldm:null,position:currentColliRows().length}];
  current={...current,colliRows:next,colliTotals:null};colliEditVersion++;colliDirty=true;renderCurrent();
  setMessage('Neue Colli-Zeile angelegt. Bitte Gewicht vervollständigen.','warn');
}
function removeColliRow(index){
  if(!current||!canWrite()||!lock?.lockToken)return;
  const next=currentColliRows().filter((_,position)=>position!==index).map((row,position)=>({...row,position,ldm:null}));
  current={...current,colliRows:next,colliTotals:null};colliEditVersion++;queueColliSave();renderCurrent();
}
function wireColliEditor(root){
  root.querySelectorAll('[data-colli-action="add"]').forEach(button=>button.addEventListener('click',()=>addColliRow()));
  root.querySelectorAll('[data-colli-action="remove"]').forEach(button=>button.addEventListener('click',()=>removeColliRow(Number(button.dataset.colliIndex))));
  root.querySelectorAll('[data-colli-field]').forEach(input=>input.addEventListener('change',event=>{
    const target=event.currentTarget,index=Number(target.dataset.colliIndex),field=target.dataset.colliField;
    updateColliField(index,field,target.value);
    if(field==='packagingTypeId')renderCurrent();
    else target.closest('[data-colli-row]')?.querySelector('[data-colli-ldm]')?.replaceChildren('–');
  }));
}
async function setCarrier(carrierId,carrierRequiresAbd){
  if(!current?.id||!lock?.lockToken||!canWrite()||!carrierId)return;
  setSaveState('saving');
  try{
    const shipment=await runShipmentMutation(async()=>{
      const body={operation:'set-carrier',lockToken:lock.lockToken,revision:current.revision,carrierId};
      if(typeof carrierRequiresAbd==='boolean')body.carrierRequiresAbd=carrierRequiresAbd;
      const data=await apiJson(`/api/professional-shipments/${encodeURIComponent(current.id)}`,{method:'POST',headers:csrfHeaders(),body:JSON.stringify(body)});
      current={...current,...(data.shipment||{})};
      return current;
    });
    setSaveState('saved');renderCurrent();return shipment;
  }catch(error){setSaveState('error',error);renderCurrent();return null;}
}
function resetOneOffModal(){
  oneOffPreview=null;oneOffSelectedCustomerId='';
  if($('#oneOffCustomerAccount'))$('#oneOffCustomerAccount').value='';
  if($('#oneOffCandidateResult'))$('#oneOffCandidateResult').innerHTML='<div class="muted">Kundennummer eingeben und zuerst prüfen.</div>';
  if($('#convertOneOffNewCustomerBtn'))$('#convertOneOffNewCustomerBtn').disabled=true;
  if($('#convertOneOffExistingCustomerBtn'))$('#convertOneOffExistingCustomerBtn').disabled=true;
}
function openOneOffModal(){
  if(!current?.id||!lock?.lockToken||!canWrite())return;
  resetOneOffModal();$('#oneOffRecipientModal')?.classList.remove('hidden');$('#oneOffCustomerAccount')?.focus();
}
function closeOneOffModal(){resetOneOffModal();$('#oneOffRecipientModal')?.classList.add('hidden');}
function renderOneOffPreview(preview,account){
  const result=$('#oneOffCandidateResult');if(!result)return;
  const exactAccount=preview?.exactAccount||null;
  const similar=Array.isArray(preview?.similar)?preview.similar:[];
  const exactHtml=exactAccount?`<div class="one-off-duplicate"><strong>Kundennummer ${esc(account)} existiert bereits.</strong><span>${esc(exactAccount.name||'Bestehender Kunde')} · ${esc(exactAccount.account||account)}</span><button type="button" class="ghost compact" data-one-off-customer-id="${esc(exactAccount.id)}">Diesen Kunden verwenden</button></div>`:'<div class="one-off-ok"><strong>Kundennummer ist verfügbar.</strong><span>Ein neuer Kunde kann angelegt werden.</span></div>';
  const similarHtml=similar.length?`<div class="one-off-similar"><strong>Ähnliche Kunden</strong>${similar.map(candidate=>`<button type="button" class="one-off-candidate" data-one-off-customer-id="${esc(candidate.id)}"><span>${esc(candidate.name||'Kunde')}</span><small>${esc(candidate.account||'–')}</small></button>`).join('')}</div>`:'<div class="muted">Keine weiteren ähnlich benannten Kunden gefunden.</div>';
  result.innerHTML=`${exactHtml}${similarHtml}`;
  if($('#convertOneOffNewCustomerBtn'))$('#convertOneOffNewCustomerBtn').disabled=!!exactAccount||!String(account||'').trim();
  oneOffSelectedCustomerId=exactAccount?.id||'';
  if($('#convertOneOffExistingCustomerBtn'))$('#convertOneOffExistingCustomerBtn').disabled=!oneOffSelectedCustomerId;
  result.querySelectorAll('[data-one-off-customer-id]').forEach(button=>button.addEventListener('click',()=>{
    oneOffSelectedCustomerId=String(button.dataset.oneOffCustomerId||'');
    result.querySelectorAll('[data-one-off-customer-id]').forEach(item=>item.classList.toggle('selected',item===button));
    if($('#convertOneOffExistingCustomerBtn'))$('#convertOneOffExistingCustomerBtn').disabled=!oneOffSelectedCustomerId;
  }));
}
async function previewOneOffRecipient(){
  if(!current?.id||!canWrite())return;
  const account=String($('#oneOffCustomerAccount')?.value||'').trim();
  if(!account){if($('#oneOffCandidateResult'))$('#oneOffCandidateResult').innerHTML='<div class="drawer-error">Kundennummer ist erforderlich.</div>';return;}
  const button=$('#previewOneOffRecipientBtn');if(button)button.disabled=true;
  try{
    const data=await apiJson(`/api/professional-shipments/${encodeURIComponent(current.id)}`,{method:'POST',headers:csrfHeaders(),body:JSON.stringify({operation:'preview-one-off-recipient',customerAccount:account})});
    oneOffPreview=data.preview||{};renderOneOffPreview(oneOffPreview,account);
  }catch(error){oneOffPreview=null;oneOffSelectedCustomerId='';if($('#oneOffCandidateResult'))$('#oneOffCandidateResult').innerHTML=`<div class="drawer-error">${esc(error.message||'Prüfung fehlgeschlagen.')}</div>`;}
  finally{if(button)button.disabled=false;}
}
async function flushCurrentEdits(){
  if(autosave&&!(await autosave.flush())){setMessage('Offene Änderungen konnten nicht gespeichert werden.','bad');return false;}
  if(colliAutosave&&!(await colliAutosave.flush())){setMessage('Colli konnten nicht gespeichert werden.','bad');return false;}
  if(colliDirty){setMessage('Colli sind noch unvollständig. Bitte zuerst vervollständigen.','bad');return false;}
  return true;
}
async function convertOneOffRecipient(mode){
  if(!current?.id||!lock?.lockToken||!canWrite()||!oneOffPreview)return;
  const customerAccount=String($('#oneOffCustomerAccount')?.value||'').trim();
  const customerId=mode==='existing-customer'?oneOffSelectedCustomerId:'';
  if(mode==='existing-customer'&&!customerId){if($('#oneOffCandidateResult'))$('#oneOffCandidateResult').insertAdjacentHTML('beforeend','<div class="drawer-error">Bitte zuerst einen bestehenden Kunden auswählen.</div>');return;}
  if(!(await flushCurrentEdits()))return;
  const newButton=$('#convertOneOffNewCustomerBtn'),existingButton=$('#convertOneOffExistingCustomerBtn');if(newButton)newButton.disabled=true;if(existingButton)existingButton.disabled=true;
  setSaveState('saving');
  try{
    await runShipmentMutation(async()=>{
      const body={operation:'convert-one-off-recipient',lockToken:lock.lockToken,revision:current.revision,customerAccount,mode};
      if(mode==='existing-customer')body.customerId=customerId;
      const data=await apiJson(`/api/professional-shipments/${encodeURIComponent(current.id)}`,{method:'POST',headers:csrfHeaders(),body:JSON.stringify(body)});
      current={...current,...(data.shipment||{})};
      const refreshed=await apiJson(`/api/professional-shipments/${encodeURIComponent(current.id)}`,{method:'GET',headers:{}});
      current=refreshed.shipment||current;
    });
    closeOneOffModal();setSaveState('saved');await loadShipments();renderCurrent();setMessage('Einmal-Empfänger wurde in die Stammdaten übernommen.');
  }catch(error){setSaveState('error',error);if($('#oneOffCandidateResult'))$('#oneOffCandidateResult').insertAdjacentHTML('beforeend',`<div class="drawer-error">${esc(error.message||'Übernahme fehlgeschlagen.')}</div>`);}
  finally{if(newButton)newButton.disabled=false;if(existingButton)existingButton.disabled=!oneOffSelectedCustomerId;}
}
function wireShipmentOperations(root){
  const carrierSelect=root.querySelector('#shipmentCarrierSelect');
  if(carrierSelect&&!carrierSelect.disabled)carrierSelect.addEventListener('change',event=>{
    const carrierId=String(event.currentTarget.value||'');if(!carrierId){renderCurrent();return;}
    void setCarrier(carrierId);
  });
  const carrierAbd=root.querySelector('#shipmentCarrierRequiresAbd');
  if(carrierAbd&&!carrierAbd.disabled)carrierAbd.addEventListener('change',event=>{
    const carrierId=String(current?.carrierSnapshot?.carrierId||'');if(carrierId)void setCarrier(carrierId,event.currentTarget.checked===true);
  });
  root.querySelector('[data-shipment-action="convert-one-off"]')?.addEventListener('click',openOneOffModal);
}
function renderCurrent(){
  const root=$('#shipmentEditorRoot');if(!root)return;
  renderShipmentEditor(root,{shipment:current,lock,saveState,packagingTypes,carriers},{canWrite:canWrite(),lock,saveState});
  root.querySelector('[data-shipment-action="close"]')?.addEventListener('click',()=>closeShipment());
  const pickup=root.querySelector('#shipmentPlannedPickupDate');
  if(pickup&&!pickup.disabled)pickup.addEventListener('change',event=>autosave?.queue({plannedPickupDate:event.currentTarget.value||null}));
  wireColliEditor(root);wireShipmentOperations(root);
}
function clearCurrent(){
  autosave?.dispose();colliAutosave?.dispose();autosave=null;colliAutosave=null;current=null;lock=null;selectedId='';saveState='idle';colliDirty=false;colliEditVersion=0;mutationTail=Promise.resolve();closeOneOffModal();renderList();renderCurrent();
}
async function releaseCurrentLock({silent=false}={}){
  if(!current?.id||!lock?.lockToken||!canWrite())return true;
  const shipmentId=current.id,token=lock.lockToken;
  try{
    await apiJson(`/api/professional-shipments/${encodeURIComponent(shipmentId)}/lock`,{method:'POST',headers:csrfHeaders(),body:JSON.stringify({action:'release',lockToken:token})});
    if(lock?.lockToken===token)lock=null;
    return true;
  }catch(error){
    if(!silent)setMessage(error.message||'Bearbeitungssperre konnte nicht freigegeben werden.','warn');
    return false;
  }
}
async function prepareToLeaveCurrent({silent=false}={}){
  if(!current)return true;
  if(autosave&&!(await autosave.flush())){if(!silent)setMessage('Offene Änderungen konnten nicht gespeichert werden. Die Sendung bleibt geöffnet.','bad');return false;}
  if(colliAutosave&&!(await colliAutosave.flush())){if(!silent)setMessage('Colli konnten nicht gespeichert werden. Die Sendung bleibt geöffnet.','bad');return false;}
  if(colliDirty){if(!silent)setMessage('Colli sind noch unvollständig und wurden nicht gespeichert. Bitte die Colli-Zeilen vervollständigen.','bad');return false;}
  const released=await releaseCurrentLock({silent});
  if(!released)return false;
  autosave?.dispose();colliAutosave?.dispose();autosave=null;colliAutosave=null;
  return true;
}
function setupColliAutosave(){
  if(colliAutosave||!current?.id||!lock?.lockToken||current.readOnly||!canWrite())return;
  colliAutosave=createAutosaveQueue({
    save:async payload=>runShipmentMutation(async()=>{
      const version=Number(payload.editVersion||0);
      const data=await apiJson(`/api/professional-shipments/${encodeURIComponent(current.id)}`,{method:'POST',headers:csrfHeaders(),body:JSON.stringify({lockToken:lock.lockToken,revision:current.revision,colliRows:payload.colliRows})});
      current={...current,...(data.shipment||{})};
      if(version===colliEditVersion){
        current={...current,colliRows:Array.isArray(data.colliRows)?data.colliRows:[],colliTotals:data.totals||{totalColli:0,totalWeightKg:0,totalLdm:0}};
        colliDirty=false;
        renderCurrent();
      }
    }),
    onState:(state,error)=>{if(state==='saved'&&colliDirty)setSaveState('idle');else setSaveState(state,error);}
  });
}
function setupAutosave(){
  autosave?.dispose();colliAutosave?.dispose();autosave=null;colliAutosave=null;
  if(!current?.id||!lock?.lockToken||current.readOnly||!canWrite())return;
  autosave=createAutosaveQueue({
    save:async patch=>runShipmentMutation(async()=>{
      const data=await apiJson(`/api/professional-shipments/${encodeURIComponent(current.id)}`,{method:'POST',headers:csrfHeaders(),body:JSON.stringify({lockToken:lock.lockToken,revision:current.revision,patch})});
      current={...current,...(data.shipment||{})};
      renderCurrent();
    }),
    onState:(state,error)=>setSaveState(state,error)
  });
  setupColliAutosave();
}

export async function loadShipments(filters={}){
  if(!syncMode())return [];
  const sequence=++loadSequence;
  const search=filters.q??$('#shipmentSearch')?.value??'';
  const status=filters.status??$('#shipmentStatusFilter')?.value??'all';
  const source=filters.source??$('#shipmentSourceFilter')?.value??'all';
  const list=$('#shipmentMasterList'),count=$('#shipmentMasterCount');
  if(list)list.innerHTML='<div class="cc-empty">Sendungen werden geladen …</div>';
  if(count)count.textContent='Sendungen werden geladen …';
  try{
    const data=await apiJson(`/api/professional-shipments?q=${encodeURIComponent(String(search).trim())}&status=${encodeURIComponent(status)}&source=${encodeURIComponent(source)}`,{method:'GET',headers:{}});
    if(sequence!==loadSequence)return rows;
    rows=Array.isArray(data.shipments)?data.shipments:[];
    if(selectedId&&!rows.some(row=>String(row.id)===String(selectedId))){
      if(await prepareToLeaveCurrent({silent:false}))clearCurrent();
    }
    renderList();
    return rows;
  }catch(error){
    if(sequence!==loadSequence)return rows;
    rows=[];renderList();if(count)count.textContent='Sendungen konnten nicht geladen werden.';setMessage(error.message||'Sendungen konnten nicht geladen werden.','bad');
    return [];
  }
}

export async function openShipment(id){
  const shipmentId=String(id||'').trim();if(!shipmentId||!syncMode())return null;
  if(current?.id&&String(current.id)===shipmentId)return current;
  if(current?.id&&String(current.id)!==shipmentId){if(!(await prepareToLeaveCurrent()))return current;}
  selectedId=shipmentId;renderList();saveState='idle';setMessage('');colliDirty=false;colliEditVersion=0;mutationTail=Promise.resolve();
  const root=$('#shipmentEditorRoot');if(root)root.innerHTML='<div class="shipment-editor-empty"><div class="kicker">SENDUNGSDETAIL</div><h3>Wird geladen …</h3></div>';
  try{
    const data=await apiJson(`/api/professional-shipments/${encodeURIComponent(shipmentId)}`,{method:'GET',headers:{}});
    current=data.shipment||null;lock=null;
    try{await loadPackagingTypes();}catch(error){setMessage(error.message||'Verpackungsarten konnten nicht geladen werden. Colli bleiben vorerst schreibgeschützt.','warn');}
    try{await loadCarriers();}catch(error){setMessage(error.message||'Speditionen konnten nicht geladen werden. Speditionsauswahl bleibt vorerst schreibgeschützt.','warn');}
    if(current&&!current.readOnly&&String(current.sourceKind||'').toUpperCase()==='LIVE'&&canWrite()){
      try{
        const lockData=await apiJson(`/api/professional-shipments/${encodeURIComponent(shipmentId)}/lock`,{method:'POST',headers:csrfHeaders(),body:JSON.stringify({action:'acquire'})});
        lock=lockData.lock||null;
      }catch(error){
        if(error.code!=='SHIPMENT_LOCKED')setMessage(error.message||'Bearbeitungssperre konnte nicht gesetzt werden.','warn');
        else setMessage('Diese Sendung wird bereits von einem anderen Benutzer bearbeitet. Sie bleibt hier schreibgeschützt.','warn');
      }
    }
    setupAutosave();renderCurrent();renderList();return current;
  }catch(error){current=null;lock=null;renderCurrent();setMessage(error.message||'Sendung konnte nicht geöffnet werden.','bad');return null;}
}

export async function createShipment(){
  if(!syncMode()||!canWrite())return null;
  const button=$('#newShipmentBtn');if(button)button.disabled=true;setMessage('Neue Sendung wird angelegt …');
  try{
    if(current&&!(await prepareToLeaveCurrent()))return null;
    try{await loadPackagingTypes();}catch(error){setMessage(error.message||'Verpackungsarten konnten nicht geladen werden.','warn');}
    try{await loadCarriers();}catch(error){setMessage(error.message||'Speditionen konnten nicht geladen werden.','warn');}
    const data=await apiJson('/api/professional-shipments',{method:'POST',headers:csrfHeaders(),body:'{}'});
    current={...(data.shipment||{}),colliRows:[],colliTotals:{totalColli:0,totalWeightKg:0,totalLdm:0}};lock=data.lock||null;selectedId=current?.id||'';saveState='saved';colliDirty=false;colliEditVersion=0;mutationTail=Promise.resolve();
    setupAutosave();await loadShipments();renderCurrent();setMessage('Neue LIVE-Sendung angelegt.');return current;
  }catch(error){setMessage(error.message||'Neue Sendung konnte nicht angelegt werden.','bad');return null;}
  finally{if(button)button.disabled=!canWrite();}
}

async function closeShipment(){
  if(!(await prepareToLeaveCurrent()))return;
  clearCurrent();setMessage('');
}

function wireFilters(){
  $('#shipmentSearch')?.addEventListener('input',()=>{if(searchTimer)clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadShipments(),250);});
  $('#shipmentStatusFilter')?.addEventListener('change',()=>loadShipments());
  $('#shipmentSourceFilter')?.addEventListener('change',()=>loadShipments());
  $('#newShipmentBtn')?.addEventListener('click',()=>createShipment());
  $('#previewOneOffRecipientBtn')?.addEventListener('click',()=>previewOneOffRecipient());
  $('#convertOneOffNewCustomerBtn')?.addEventListener('click',()=>convertOneOffRecipient('new-customer'));
  $('#convertOneOffExistingCustomerBtn')?.addEventListener('click',()=>convertOneOffRecipient('existing-customer'));
  $('#closeOneOffRecipientModal')?.addEventListener('click',closeOneOffModal);
  $('#oneOffRecipientModal')?.addEventListener('click',event=>{if(event.target===event.currentTarget)closeOneOffModal();});
  document.querySelector('[data-nav="shipments"]')?.addEventListener('click',()=>{if(syncMode())loadShipments();});
  document.querySelectorAll('.nav button[data-nav]').forEach(button=>button.addEventListener('click',event=>{
    if(navigationBypass||button.dataset.nav==='shipments'||!current)return;
    event.preventDefault();event.stopImmediatePropagation();
    void (async()=>{
      if(!(await prepareToLeaveCurrent()))return;
      clearCurrent();navigationBypass=true;
      try{button.click();}finally{navigationBypass=false;}
    })();
  },{capture:true}));
}

window.addEventListener('professional:session-ready',event=>{
  localMode=!!event.detail?.local;session=event.detail?.session||null;rows=[];packagingTypes=[];packagingLoaded=false;packagingPromise=null;carriers=[];carriersLoaded=false;carriersPromise=null;clearCurrent();syncMode();
});
window.addEventListener('professional:carriers-changed',()=>{
  carriers=[];carriersLoaded=false;carriersPromise=null;
  if(!localMode&&session)void loadCarriers().then(()=>renderCurrent()).catch(error=>setMessage(error.message||'Speditionen konnten nicht neu geladen werden.','warn'));
});
window.addEventListener('pagehide',()=>{
  if(!current?.id||!lock?.lockToken||!session?.csrfToken)return;
  const shipmentId=current.id,token=lock.lockToken;
  fetch(`/api/professional-shipments/${encodeURIComponent(shipmentId)}/lock`,{method:'POST',credentials:'same-origin',keepalive:true,headers:{'content-type':'application/json','x-professional-csrf':session.csrfToken},body:JSON.stringify({action:'release',lockToken:token})}).catch(()=>{});
});

wireFilters();