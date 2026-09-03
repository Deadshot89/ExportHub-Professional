'use strict';

const db=require('./database');

function inputError(message){return Object.assign(new Error(message),{code:'INPUT_INVALID'});}
function clean(value){return String(value??'').trim();}
function validTimeZone(value){
  const timeZone=clean(value);
  if(!timeZone)return false;
  try{
    new Intl.DateTimeFormat('de-DE',{timeZone}).format(new Date());
    return true;
  }catch{return false;}
}

function normalizeShippingSettings(input={}){
  const shipping={
    companyName:clean(input.companyName??input.company_name),
    street:clean(input.street),
    houseNumber:clean(input.houseNumber??input.house_number),
    postalCode:clean(input.postalCode??input.postal_code),
    city:clean(input.city),
    shippingCountry:clean(input.shippingCountry??input.shipping_country),
    shippingCountryIso:clean(input.shippingCountryIso??input.shipping_country_iso).toUpperCase(),
    timezone:clean(input.timezone)
  };
  shipping.complete=!!(
    shipping.companyName&&shipping.street&&shipping.houseNumber&&shipping.postalCode&&shipping.city&&shipping.shippingCountry&&
    /^[A-Z]{2}$/.test(shipping.shippingCountryIso)&&validTimeZone(shipping.timezone)
  );
  return shipping;
}

function validateShippingSettings(input={}){
  const shipping=normalizeShippingSettings(input);
  if(shipping.shippingCountryIso&&!/^[A-Z]{2}$/.test(shipping.shippingCountryIso))throw inputError('Länder-ISO muss aus zwei Buchstaben bestehen.');
  if(shipping.timezone&&!validTimeZone(shipping.timezone))throw inputError('Zeitzone ist ungültig.');
  return shipping;
}

async function getShippingSettings(tenantId){
  return db.withTenantControlClient(tenantId,async client=>{
    const result=await client.query("select settings->'shipping' as shipping from tenant_settings where tenant_id=$1 limit 1",[tenantId]);
    return normalizeShippingSettings(result.rows[0]?.shipping||{});
  });
}

async function updateShippingSettings(tenantId,userId,input){
  const shipping=validateShippingSettings(input);
  const stored={...shipping};
  delete stored.complete;
  return db.withTenantControlClient(tenantId,async client=>{
    await client.query(`
      insert into tenant_settings(tenant_id,settings,updated_at)
      values($1,jsonb_build_object('shipping',$2::jsonb),now())
      on conflict (tenant_id) do update
         set settings=jsonb_set(coalesce(tenant_settings.settings,'{}'::jsonb),'{shipping}',$2::jsonb,true),
             updated_at=now()
    `,[tenantId,JSON.stringify(stored)]);
    await client.query(`
      insert into audit_events(tenant_id,user_id,event_type,metadata)
      values($1,$2,'WORKSPACE_SHIPPING_SETTINGS_UPDATED',$3::jsonb)
    `,[tenantId,userId,JSON.stringify({complete:shipping.complete,shippingCountryIso:shipping.shippingCountryIso,timezone:shipping.timezone})]);
    return shipping;
  },{write:true});
}

module.exports={normalizeShippingSettings,validateShippingSettings,getShippingSettings,updateShippingSettings};
