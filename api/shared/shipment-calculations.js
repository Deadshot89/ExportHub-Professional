'use strict';

function inputError(message){return Object.assign(new Error(message),{code:'INPUT_INVALID'});}
function finiteNumber(value){
  if(value===null||value===undefined||String(value).trim()==='')return null;
  const n=Number(value);return Number.isFinite(n)?n:null;
}
function round(value,digits){
  const factor=10**digits;
  return Math.round((Number(value)+Number.EPSILON)*factor)/factor;
}
function packagingFor(packagingById,id){
  if(packagingById instanceof Map)return packagingById.get(id);
  return packagingById&&typeof packagingById==='object'?packagingById[id]:undefined;
}

function calculateRowLdm(row={},packaging={}){
  const quantity=finiteNumber(row.quantity);
  if(!Number.isInteger(quantity)||quantity<=0)throw inputError('Physische Colli-Anzahl muss eine positive ganze Zahl sein.');
  const mode=String(packaging.ldm_mode||packaging.ldmMode||'').trim().toUpperCase();
  if(mode==='FIXED_PER_UNIT'){
    const fixed=finiteNumber(packaging.fixed_ldm_per_unit??packaging.fixedLdmPerUnit);
    if(fixed===null||fixed<0)throw inputError('Feste LDM-Regel ist ungültig.');
    return round(fixed*quantity,4);
  }
  if(mode==='FOOTPRINT'){
    const length=finiteNumber(row.length_cm??row.lengthCm??packaging.length_cm??packaging.lengthCm);
    const width=finiteNumber(row.width_cm??row.widthCm??packaging.width_cm??packaging.widthCm);
    if(length===null||length<=0||width===null||width<=0)throw inputError('Länge und Breite werden für die LDM-Berechnung benötigt.');
    return round(((length/100)*(width/100)/2.4)*quantity,4);
  }
  throw inputError('Unbekannte LDM-Berechnungsregel.');
}

function calculateTotals(rows=[],packagingById={}){
  if(!Array.isArray(rows))throw inputError('Colli-Zeilen müssen als Liste übergeben werden.');
  let totalColli=0,totalWeightKg=0,totalLdm=0;
  const calculatedRows=rows.map(row=>{
    const quantity=finiteNumber(row?.quantity);
    const weight=finiteNumber(row?.weight_kg??row?.weightKg);
    if(!Number.isInteger(quantity)||quantity<=0)throw inputError('Physische Colli-Anzahl muss eine positive ganze Zahl sein.');
    if(weight===null||weight<0)throw inputError('Gewicht muss eine gültige nicht-negative Zahl sein.');
    const packagingId=row.packaging_type_id??row.packagingTypeId;
    const packaging=packagingFor(packagingById,packagingId);
    if(!packaging)throw inputError('Verpackungsart für Colli-Zeile fehlt.');
    const ldm=calculateRowLdm(row,packaging);
    totalColli+=quantity;
    totalWeightKg+=weight;
    totalLdm+=ldm;
    return {...row,ldm};
  });
  return {totalColli,totalWeightKg:round(totalWeightKg,3),totalLdm:round(totalLdm,4),rows:calculatedRows};
}

function cmrRequired({destinationCountryIso,shippingCountryIso}={}){
  const dst=String(destinationCountryIso||'').trim().toUpperCase();
  const src=String(shippingCountryIso||'').trim().toUpperCase();
  if(!dst||!src)return {required:false,resolved:false,reason:'COUNTRY_MISSING'};
  return {required:dst!==src,resolved:true,reason:dst!==src?'CROSS_BORDER':'DOMESTIC'};
}

function abdDecision({isEuDestination,goodsValueEur,carrierRequiresAbd}={}){
  const value=finiteNumber(goodsValueEur);
  if(typeof isEuDestination!=='boolean'||value===null||value<0)return {required:false,resolved:false,reason:'CUSTOMS_FACTS_MISSING'};
  const required=!isEuDestination&&(value>1000||carrierRequiresAbd===true);
  return {required,resolved:true,reason:required?(carrierRequiresAbd===true?'NON_EU_CARRIER':'NON_EU_VALUE'):(isEuDestination?'EU_DESTINATION':'NON_EU_BELOW_THRESHOLD')};
}

module.exports={calculateRowLdm,calculateTotals,cmrRequired,abdDecision};
