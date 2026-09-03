const $=selector=>document.querySelector(selector);
let sessionState={local:true,session:null};
let loadSequence=0;

async function apiJson(url,options={}){
  const {headers={},...rest}=options;
  const response=await fetch(url,{credentials:'same-origin',...rest,headers:{'content-type':'application/json',...headers}});
  let body={};try{body=await response.json();}catch{}
  if(!response.ok){const error=new Error(body.message||`HTTP ${response.status}`);error.code=body.code||`HTTP_${response.status}`;error.status=response.status;throw error;}
  return body;
}
function value(id){return String($(id)?.value||'').trim();}
function canWrite(){return !sessionState.local&&String(sessionState.session?.user?.role||'')==='TENANT_ADMIN';}
function setField(id,next){const node=$(id);if(node)node.value=String(next??'');}
function setFormWritable(write){
  $('#workspaceShippingForm')?.querySelectorAll('input').forEach(input=>{input.readOnly=!write;});
  const save=$('#saveWorkspaceShipping');if(save)save.classList.toggle('hidden',!write);
  const mode=$('#workspaceShippingMode');if(mode){mode.className=`cc-status ${write?'good':'neutral'}`;mode.textContent=write?'Firmen-Admin · bearbeitbar':'Nur Firmen-Admin darf ändern';}
}
function renderCompleteness(shipping={}){
  const host=$('#workspaceShippingCompleteness');if(!host)return;
  if(shipping.complete===true){
    host.className='notice good';
    host.textContent='Absender- und Versandeinstellungen vollständig. LIVE-Sendungen können später einen vollständigen Absender-Snapshot übernehmen.';
  }else{
    host.className='notice warn';
    host.textContent='Unvollständig – LIVE-Sendungen dürfen erst angelegt werden, wenn Firma, Adresse, Versandland, Länder-ISO und Zeitzone vollständig hinterlegt sind.';
  }
}
function renderShipping(shipping={}){
  setField('#workspaceCompanyName',shipping.companyName);
  setField('#workspaceStreet',shipping.street);
  setField('#workspaceHouseNumber',shipping.houseNumber);
  setField('#workspacePostalCode',shipping.postalCode);
  setField('#workspaceCity',shipping.city);
  setField('#workspaceShippingCountry',shipping.shippingCountry);
  setField('#workspaceShippingCountryIso',shipping.shippingCountryIso);
  setField('#workspaceTimezone',shipping.timezone||'Europe/Berlin');
  renderCompleteness(shipping);
  setFormWritable(canWrite());
}
function payloadFromForm(){
  return {
    companyName:value('#workspaceCompanyName'),
    street:value('#workspaceStreet'),
    houseNumber:value('#workspaceHouseNumber'),
    postalCode:value('#workspacePostalCode'),
    city:value('#workspaceCity'),
    shippingCountry:value('#workspaceShippingCountry'),
    shippingCountryIso:value('#workspaceShippingCountryIso'),
    timezone:value('#workspaceTimezone')
  };
}
async function resolveSession(){
  if(sessionState.local&&$('#identityBadge')?.textContent?.includes('Lokales Migrationslabor'))return null;
  if(sessionState.session)return sessionState.session;
  try{
    const session=await apiJson('/api/professional-auth/session');
    sessionState={local:false,session};return session;
  }catch{return null;}
}
async function loadShippingSettings(){
  const session=await resolveSession();
  if(!session){
    renderCompleteness({complete:false});setFormWritable(false);
    const message=$('#workspaceShippingMessage');if(message)message.textContent=sessionState.local?'Im lokalen Migrationslabor sind keine Server-Einstellungen verfügbar.':'Versand-Einstellungen konnten nicht geladen werden.';
    return;
  }
  const seq=++loadSequence,message=$('#workspaceShippingMessage');
  if(message)message.textContent='Versand-Einstellungen werden geladen …';
  try{
    const result=await apiJson('/api/professional-workspace/shipping-settings');
    if(seq!==loadSequence)return;
    renderShipping(result.shipping||{});
    if(message)message.textContent=canWrite()?'Änderungen können hier gespeichert werden.':'Lesemodus.';
  }catch(error){
    if(seq!==loadSequence)return;
    if(message)message.textContent=error.message||'Versand-Einstellungen konnten nicht geladen werden.';
    renderCompleteness({complete:false});setFormWritable(false);
  }
}

$('#workspaceShippingForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!canWrite())return;
  const save=$('#saveWorkspaceShipping'),message=$('#workspaceShippingMessage');
  if(save)save.disabled=true;if(message)message.textContent='Wird gespeichert …';
  try{
    const result=await apiJson('/api/professional-workspace/shipping-settings',{
      method:'POST',
      headers:{'x-professional-csrf':sessionState.session?.csrfToken||''},
      body:JSON.stringify(payloadFromForm())
    });
    renderShipping(result.shipping||{});
    if(message)message.textContent='Versand-Einstellungen gespeichert.';
  }catch(error){if(message)message.textContent=error.message||'Speichern fehlgeschlagen.';}
  finally{if(save)save.disabled=false;}
});

window.addEventListener('professional:session-ready',event=>{
  sessionState={local:!!event.detail?.local,session:event.detail?.session||null};
  if(document.querySelector('[data-view="workspace-settings"]')?.classList.contains('active'))loadShippingSettings();
});
document.querySelector('[data-nav="workspace-settings"]')?.addEventListener('click',()=>{
  const title=$('#pageTitle');if(title)title.textContent='Versand-Einstellungen';
  setTimeout(loadShippingSettings,0);
});

export {loadShippingSettings,renderShipping};
