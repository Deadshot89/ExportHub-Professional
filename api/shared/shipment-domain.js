'use strict';

const crypto=require('crypto');
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const IMMUTABLE_STATUSES=new Set(['Abgeholt','POD vorhanden','Abgeschlossen','Archiviert','Storniert']);

function domainError(code,message){return Object.assign(new Error(message),{code});}
function sourceKindOf(shipment){return String(shipment?.source_kind??shipment?.sourceKind??'').trim().toUpperCase();}
function statusOf(shipment){return String(shipment?.status||'').trim();}
function cloneShipment(shipment){return {...shipment,rework:{...(shipment?.rework||{})}};}

function generateReference(randomBytes=crypto.randomBytes){
  if(typeof randomBytes!=='function')throw new TypeError('randomBytes function required.');
  const rejectionLimit=Math.floor(256/ALPHABET.length)*ALPHABET.length;
  let result='',attempts=0;
  while(result.length<6){
    if(++attempts>100)throw domainError('INTERNAL_ERROR','Referenz konnte nicht erzeugt werden.');
    const raw=randomBytes(Math.max(12,(6-result.length)*2));
    const bytes=Buffer.isBuffer(raw)?raw:Buffer.from(raw||[]);
    if(!bytes.length)continue;
    for(const byte of bytes){
      if(byte>=rejectionLimit)continue;
      result+=ALPHABET[byte%ALPHABET.length];
      if(result.length===6)break;
    }
  }
  return result;
}

function assertMutable(shipment){
  if(sourceKindOf(shipment)!=='LIVE')throw domainError('SHIPMENT_READ_ONLY','Migrierte oder unbekannte Sendungen sind schreibgeschützt.');
  const status=statusOf(shipment);
  if(IMMUTABLE_STATUSES.has(status)||shipment?.discarded_at||shipment?.discardedAt)throw domainError('SHIPMENT_READ_ONLY','Diese Sendung ist für normale Änderungen gesperrt.');
  return true;
}

function recipientSnapshotComplete(snapshot={}){
  const company=String(snapshot.companyName??snapshot.company_name??snapshot.name??snapshot.customerName??'').trim();
  const street=String(snapshot.street||'').trim();
  const house=String(snapshot.houseNumber??snapshot.house_number??'').trim();
  const postal=String(snapshot.postalCode??snapshot.postal_code??'').trim();
  const city=String(snapshot.city||'').trim();
  const country=String(snapshot.countryIso??snapshot.country_iso??snapshot.country??'').trim();
  return !!(company&&street&&house&&postal&&city&&country);
}

function evaluateCreation(shipment={},context={}){
  const missing=[];
  const recipientValid=typeof context.recipientValid==='boolean'?context.recipientValid:recipientSnapshotComplete(shipment.recipient_snapshot??shipment.recipientSnapshot);
  if(!recipientValid)missing.push('RECIPIENT_REQUIRED');
  const pickup=String(shipment.planned_pickup_date??shipment.plannedPickupDate??'').trim();
  if(!pickup)missing.push('PLANNED_PICKUP_DATE_REQUIRED');
  if(context.registrationEmailRequired===true){
    const snapshotEmails=shipment?.recipient_snapshot?.registrationEmails??shipment?.recipient_snapshot?.registration_emails??[];
    const count=Number.isFinite(Number(context.registrationEmailCount))?Number(context.registrationEmailCount):(Array.isArray(snapshotEmails)?snapshotEmails.length:0);
    if(count<1)missing.push('REGISTRATION_EMAIL_REQUIRED');
  }
  return {complete:missing.length===0,missing};
}

function evaluateReadiness(shipment={},context={}){
  const creation=context.creation||evaluateCreation(shipment,context);
  const blocks=[];
  if(!creation.complete)blocks.push(...(Array.isArray(creation.missing)?creation.missing:['CREATION_INCOMPLETE']));

  const colliOk=context.colliValid===true;
  if(!colliOk)blocks.push('COLLI_REQUIRED');
  const carrierOk=context.carrierValid===true;
  if(!carrierOk)blocks.push('CARRIER_REQUIRED');

  const cmr=context.cmr||{required:false,resolved:false};
  const abd=context.abd||{required:false,resolved:false};
  const customsResolved=context.customsResolved===true&&cmr.resolved===true&&abd.resolved===true;
  if(!customsResolved)blocks.push('CUSTOMS_UNRESOLVED');

  const docs=context.documents||{};
  const documentBlocks=[];
  if(docs.lieferschein!==true)documentBlocks.push('LIEFERSCHEIN_REQUIRED');
  if(docs.ladelisteCurrent!==true)documentBlocks.push('LADELISTE_REQUIRED');
  if(cmr.required===true&&docs.cmrCurrent!==true)documentBlocks.push('CMR_REQUIRED');
  if(abd.required===true&&docs.abdValid!==true)documentBlocks.push('ABD_REQUIRED');
  blocks.push(...documentBlocks);

  if(shipment?.rework?.active===true)blocks.push('REWORK_ACTIVE');

  const missing=Array.isArray(creation.missing)?creation.missing:[];
  const recipientError=missing.some(x=>x==='RECIPIENT_REQUIRED'||x==='REGISTRATION_EMAIL_REQUIRED');
  const shipmentDataError=missing.includes('PLANNED_PICKUP_DATE_REQUIRED');
  const checklist={
    'Kunde & Standort':recipientError?'error':'complete',
    'Sendungsdaten':shipmentDataError?'error':'complete',
    'Colli/LDM':colliOk?'complete':'error',
    'Spedition':carrierOk?'complete':'error',
    'Warenwert & Zoll':customsResolved?'complete':'error',
    'Dokumente':documentBlocks.length?'error':'complete',
    'Abholung':'open'
  };
  return {ready:blocks.length===0,blocks:[...new Set(blocks)],checklist};
}

function requireStatus(shipment,expected){
  if(statusOf(shipment)!==expected)throw domainError('SHIPMENT_TRANSITION_INVALID',`Statuswechsel ist aus ${statusOf(shipment)||'unbekannt'} nicht zulässig.`);
}
function requireReason(value){
  const reason=String(value||'').trim();
  if(!reason)throw domainError('INPUT_INVALID','Begründung ist erforderlich.');
  return reason;
}
function roleIs(role,...allowed){return allowed.includes(String(role||'').trim().toUpperCase());}

function applyLifecycleAction(shipment,action,context={}){
  const next=cloneShipment(shipment);
  const name=String(action||'').trim().toLowerCase();

  if(name==='mark-created'){
    assertMutable(next);requireStatus(next,'Entwurf');
    const creation=context.creation||evaluateCreation(next,context);
    if(!creation.complete)throw domainError('SHIPMENT_TRANSITION_INVALID','Pflichtangaben für Erstellt fehlen.');
    next.status='Erstellt';return next;
  }
  if(name==='confirm-ready'){
    assertMutable(next);requireStatus(next,'Erstellt');
    if(next.rework?.active===true)throw domainError('SHIPMENT_NOT_READY','Nachbearbeitung ist noch offen.');
    const readiness=context.readiness||evaluateReadiness(next,context);
    if(!readiness.ready)throw domainError('SHIPMENT_NOT_READY','Sendung ist noch nicht versandbereit.');
    next.status='Bereit zur Abholung';return next;
  }
  if(name==='set-rework'){
    assertMutable(next);
    const reason=requireReason(context.reason);
    next.rework={active:true,reason,manual:context.manual===true};
    return next;
  }
  if(name==='clear-rework'){
    assertMutable(next);
    if(next.rework?.active!==true)return next;
    if(next.rework.manual===true)requireReason(context.reason);
    if(next.rework.manual!==true&&context.validationPassed!==true)throw domainError('SHIPMENT_TRANSITION_INVALID','System-Nachbearbeitung kann erst nach erfolgreicher Prüfung geschlossen werden.');
    next.rework={active:false};return next;
  }
  if(name==='confirm-pickup'){
    assertMutable(next);requireStatus(next,'Bereit zur Abholung');
    if(next.rework?.active===true)throw domainError('SHIPMENT_TRANSITION_INVALID','Nachbearbeitung blockiert die Abholung.');
    if(context.pickupValidated!==true)throw domainError('SHIPMENT_TRANSITION_INVALID','Abholprüfung ist nicht bestätigt.');
    next.status='Abgeholt';return next;
  }
  if(name==='pod-valid'){
    requireStatus(next,'Abgeholt');next.status='POD vorhanden';return next;
  }
  if(name==='auto-complete'){
    requireStatus(next,'POD vorhanden');
    if(context.noBlockers!==true)throw domainError('SHIPMENT_TRANSITION_INVALID','Pflichtpunkte sind noch offen.');
    next.status='Abgeschlossen';return next;
  }
  if(name==='cancel'){
    assertMutable(next);
    if(!['Entwurf','Erstellt','Bereit zur Abholung'].includes(statusOf(next)))throw domainError('SHIPMENT_TRANSITION_INVALID','Storno ist in diesem Status nicht zulässig.');
    if(!roleIs(context.role,'TENANT_ADMIN','EXPORT_ADMIN'))throw domainError('FORBIDDEN','Keine Berechtigung zum Stornieren.');
    next.cancellation_reason=requireReason(context.reason);
    next.status='Storniert';return next;
  }
  if(name==='archive'){
    requireStatus(next,'Abgeschlossen');
    if(context.manual===true&&!roleIs(context.role,'TENANT_ADMIN','EXPORT_ADMIN'))throw domainError('FORBIDDEN','Keine Berechtigung zum Archivieren.');
    next.status='Archiviert';return next;
  }
  if(name==='restore'){
    requireStatus(next,'Archiviert');
    if(!roleIs(context.role,'TENANT_ADMIN'))throw domainError('FORBIDDEN','Nur Firmen-Admins dürfen archivierte Sendungen wiederherstellen.');
    next.restore_reason=requireReason(context.reason);
    next.status='Abgeschlossen';return next;
  }
  throw domainError('SHIPMENT_TRANSITION_INVALID','Unbekannte Sendungsaktion.');
}

module.exports={generateReference,assertMutable,evaluateCreation,evaluateReadiness,applyLifecycleAction};
