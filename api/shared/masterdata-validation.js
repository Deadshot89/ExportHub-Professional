const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function inputError(label){return Object.assign(new Error(`${label} ist erforderlich oder ungültig.`),{code:'INPUT_INVALID'});}
function requiredText(value,label,max=160){
  const v=String(value??'').normalize('NFKC').trim();
  if(!v||v.length>max) throw inputError(label);
  return v;
}
function optionalText(value,max=500){
  const v=String(value??'').normalize('NFKC').trim();
  if(!v) return null;
  if(v.length>max) throw inputError('Eingabe');
  return v;
}
function optionalUuid(value,label='ID'){
  const v=optionalText(value,64);
  if(!v)return null;
  if(!UUID_RE.test(v))throw inputError(label);
  return v.toLowerCase();
}
function cleanEmail(value,{required=false}={}){
  const v=String(value??'').normalize('NFKC').trim().toLowerCase();
  if(!v){
    if(required) throw Object.assign(new Error('Mindestens eine Anmelde-E-Mail-Adresse ist erforderlich.'),{code:'REGISTRATION_EMAIL_REQUIRED'});
    return null;
  }
  if(v.length>254||!EMAIL_RE.test(v)) throw Object.assign(new Error('E-Mail-Adresse ist ungültig.'),{code:'EMAIL_INVALID'});
  return v;
}
function normalizeRegistrationEmails(value){
  const values=Array.isArray(value)?value:(value==null?[]:[value]);
  const out=[];
  const seen=new Set();
  for(const raw of values){
    const trimmed=String(raw??'').trim();
    if(!trimmed) continue;
    const email=cleanEmail(trimmed,{required:true});
    if(seen.has(email)) continue;
    seen.add(email);out.push(email);
  }
  return out;
}
function cleanRegistrationEmails(value){
  const out=normalizeRegistrationEmails(value);
  if(!out.length) throw Object.assign(new Error('Mindestens eine Anmelde-E-Mail-Adresse ist erforderlich.'),{code:'REGISTRATION_EMAIL_REQUIRED'});
  return out;
}
function cleanCountryIso(value){
  const v=optionalText(value,3);
  if(!v) return null;
  const iso=v.toUpperCase();
  if(!/^[A-Z]{2}$/.test(iso)) throw inputError('Länder-ISO');
  return iso;
}
function cleanCustomer(input={}){
  return {
    account:requiredText(input.account,'Kundennummer',80),
    name:requiredText(input.name,'Firmenname',160)
  };
}
function cleanLocationBase(input={},{registrationEmailRequired=true}={}){
  const location={
    name:requiredText(input.name,'Standortname',160),
    street:requiredText(input.street,'Straße',160),
    houseNumber:requiredText(input.houseNumber,'Hausnummer',40),
    postalCode:requiredText(input.postalCode,'PLZ',32),
    city:requiredText(input.city,'Ort',120),
    country:requiredText(input.country,'Land',120),
    countryIso:cleanCountryIso(input.countryIso),
    contactName:optionalText(input.contactName,160),
    contactEmail:cleanEmail(input.contactEmail),
    phone:optionalText(input.phone,80),
    carrierName:optionalText(input.carrierName,160),
    shippingInstructions:optionalText(input.shippingInstructions,4000),
    registrationEmails:registrationEmailRequired?cleanRegistrationEmails(input.registrationEmails):normalizeRegistrationEmails(input.registrationEmails)
  };
  const carrierId=optionalUuid(input.carrierId??input.carrier_id,'Spedition');
  if(carrierId)location.carrierId=carrierId;
  return location;
}
function cleanLocation(input={}){return cleanLocationBase(input,{registrationEmailRequired:true});}
function cleanOneOffLocation(input={}){return cleanLocationBase(input,{registrationEmailRequired:false});}

module.exports={cleanCustomer,cleanLocation,cleanOneOffLocation,cleanEmail,cleanRegistrationEmails,cleanCountryIso,optionalUuid};
