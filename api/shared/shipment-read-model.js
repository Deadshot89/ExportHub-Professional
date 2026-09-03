'use strict';

const CLOSED_STATUSES=new Set(['Abgeschlossen','Archiviert','Storniert']);
const PICKED_STATUSES=new Set(['Abgeholt','POD vorhanden','Abgeschlossen','Archiviert']);
const DOCUMENT_BLOCKS=new Set(['LIEFERSCHEIN_REQUIRED','LADELISTE_REQUIRED','CMR_REQUIRED','ABD_REQUIRED','DOCUMENT_REQUIRED']);

function text(value){return value==null?'':String(value).trim();}
function objectValue(value){
  if(value&&typeof value==='object'&&!Array.isArray(value))return value;
  if(typeof value==='string'&&value.trim())try{const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};}catch{}
  return {};
}
function dateOnly(value){
  if(!value)return '';
  if(value instanceof Date&&!Number.isNaN(value.getTime()))return value.toISOString().slice(0,10);
  const raw=text(value);
  const match=raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?match[1]:'';
}
function sourceKind(row){return text(row?.source_kind??row?.sourceKind).toUpperCase()||'MIGRATED';}
function isPicked(row){return PICKED_STATUSES.has(text(row?.status))||!!(row?.picked_up_at??row?.pickedUpAt??row?.actual_pickup_date??row?.actualPickupDate);}
function isOpen(row){return !CLOSED_STATUSES.has(text(row?.status))&&!row?.discarded_at&&!row?.discardedAt;}
function documentMissingCount(row){
  const readiness=objectValue(row?.readiness);
  if(Number.isInteger(readiness.missingDocuments)&&readiness.missingDocuments>=0)return readiness.missingDocuments;
  if(Array.isArray(readiness.blocks))return readiness.blocks.filter(code=>DOCUMENT_BLOCKS.has(text(code).toUpperCase())).length;
  return null;
}

function normalizeShipmentRow(row={}){
  const kind=sourceKind(row);
  const rework=objectValue(row.rework);
  const readiness=objectValue(row.readiness);
  return {
    id:text(row.id),
    reference:text(row.reference),
    sourceKind:kind,
    readOnly:kind==='MIGRATED'||PICKED_STATUSES.has(text(row.status))||text(row.status)==='Storniert',
    status:text(row.status)||'Entwurf',
    sourceStatus:text(row.source_status??row.sourceStatus),
    processStatus:text(row.process_status??row.processStatus),
    customerId:text(row.customer_id??row.customerId),
    customerAccount:text(row.customer_account??row.customerAccount),
    customerName:text(row.customer_name??row.customerName),
    locationId:text(row.location_id??row.locationId),
    locationName:text(row.location_name??row.locationName),
    locationCity:text(row.location_city??row.locationCity),
    locationCountry:text(row.location_country??row.locationCountry),
    plannedPickupDate:dateOnly(row.planned_pickup_date??row.plannedPickupDate),
    pickedUpAt:row.picked_up_at??row.pickedUpAt??null,
    actualPickupDate:dateOnly(row.actual_pickup_date??row.actualPickupDate),
    createdAt:row.created_at??row.createdAt??null,
    updatedAt:row.updated_at??row.updatedAt??null,
    discardedAt:row.discarded_at??row.discardedAt??null,
    rework,
    readiness
  };
}

function shipmentActionItems(rows,{localDate}={}){
  const day=text(localDate);
  const actions=[];
  for(const source of rows){
    const row=source?.sourceKind?source:normalizeShipmentRow(source);
    if(!isOpen(row))continue;
    const status=text(row.status);
    if(row.plannedPickupDate&&day&&row.plannedPickupDate<day&&!isPicked(row)){
      actions.push({code:'PICKUP_OVERDUE',kind:'bad',shipmentId:row.id,reference:row.reference,label:`${row.reference||'Sendung'} · ${row.customerName||'Empfänger'}`,reason:`Abholung seit ${row.plannedPickupDate} überfällig`});
    }
    if(row.rework?.active===true||status==='Nachbearbeitung erforderlich'){
      actions.push({code:'REWORK_ACTIVE',kind:'warn',shipmentId:row.id,reference:row.reference,label:`${row.reference||'Sendung'} · ${row.customerName||'Empfänger'}`,reason:'Nachbearbeitung erforderlich'});
    }
    if(status==='Wartet auf ABD'){
      actions.push({code:'ABD_PENDING',kind:'warn',shipmentId:row.id,reference:row.reference,label:`${row.reference||'Sendung'} · ${row.customerName||'Empfänger'}`,reason:'Wartet auf ABD'});
    }
  }
  return actions;
}

function buildShipmentDashboard(rows=[],options={}){
  const normalized=(Array.isArray(rows)?rows:[]).map(row=>row?.sourceKind?row:normalizeShipmentRow(row));
  const localDate=text(options.localDate);
  const openRows=normalized.filter(isOpen);
  const todayRows=normalized.filter(row=>row.plannedPickupDate&&row.plannedPickupDate===localDate);
  const pickupsTodayPicked=todayRows.filter(isPicked).length;
  const missingValues=openRows.map(documentMissingCount);
  const missingDocumentsAvailable=openRows.length===0||missingValues.every(value=>value!==null);
  const missingDocuments=missingDocumentsAvailable?missingValues.reduce((sum,value)=>sum+(value||0),0):null;
  const actionItems=shipmentActionItems(normalized,{localDate});
  return {
    localDate,
    timeZone:text(options.timeZone)||'UTC',
    openShipments:openRows.length,
    pickupsToday:todayRows.length,
    pickupsTodayOpen:todayRows.length-pickupsTodayPicked,
    pickupsTodayPicked,
    missingDocuments,
    missingDocumentsAvailable,
    actionRequired:actionItems.length,
    actionItems,
    todayRows
  };
}

module.exports={normalizeShipmentRow,buildShipmentDashboard,shipmentActionItems,isOpen,isPicked};
