const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const text=value=>String(value??'').trim();

function statusClass(status){
  if(['POD vorhanden','Abgeschlossen','Archiviert'].includes(status))return 'good';
  if(['Abgeholt','Bereit zur Abholung'].includes(status))return 'info';
  if(['Wartet auf ABD','Nachbearbeitung erforderlich'].includes(status))return 'warn';
  if(status==='Storniert')return 'bad';
  return 'neutral';
}

function checklistHtml(readiness={}){
  const checklist=Array.isArray(readiness?.checklist)?readiness.checklist:[];
  const blocks=Array.isArray(readiness?.blocks)?readiness.blocks:[];
  if(checklist.length){
    return checklist.map(item=>`<span class="shipment-check ${item?.ok===true?'good':'open'}">${item?.ok===true?'✓':'○'} ${esc(item?.label||item?.code||'Prüfung')}</span>`).join('');
  }
  if(blocks.length)return blocks.map(code=>`<span class="shipment-check open">○ ${esc(code)}</span>`).join('');
  return '<span class="shipment-check neutral">Prüfliste wird serverseitig geführt.</span>';
}

function snapshotAddress(snapshot={}){
  const line1=[snapshot.street,snapshot.houseNumber??snapshot.house_number].filter(Boolean).join(' ');
  const line2=[snapshot.postalCode??snapshot.postal_code,snapshot.city].filter(Boolean).join(' ');
  return [snapshot.companyName??snapshot.company_name,line1,line2,snapshot.country??snapshot.shippingCountry].filter(Boolean).join(' · ')||'Noch nicht vollständig hinterlegt';
}

function section(title,body,{open=false}={}){
  return `<details class="shipment-section" ${open?'open':''}><summary><span>${esc(title)}</span><span class="shipment-section-caret">▾</span></summary><div class="shipment-section-body">${body}</div></details>`;
}

function numberLabel(value,digits=2){
  if(value===null||value===undefined||value==='')return '–';
  const number=Number(value);
  return Number.isFinite(number)?number.toLocaleString('de-DE',{maximumFractionDigits:digits}):'–';
}

function packagingFor(packagingTypes,id){return packagingTypes.find(item=>text(item?.id)===text(id))||null;}

function packagingOptions(packagingTypes,row){
  const currentId=text(row?.packagingTypeId);
  const active=packagingTypes.map(item=>`<option value="${esc(item.id)}" ${text(item.id)===currentId?'selected':''}>${esc(item.name)}</option>`).join('');
  if(currentId&&!packagingTypes.some(item=>text(item.id)===currentId)){
    return `<option value="${esc(currentId)}" selected>${esc(row.packagingName||'Nicht aktive Verpackungsart')}</option>${active}`;
  }
  return `<option value="">Bitte wählen</option>${active}`;
}

function dimensionInput({label,field,row,packaging,canEdit,index,allowKey,presetKey}){
  const allowed=packaging?.[allowKey]===true;
  const preset=packaging?.[presetKey];
  const value=row?.[field]??preset??'';
  const disabled=!canEdit||!allowed;
  const note=allowed?'Eingabe erlaubt':(preset!==null&&preset!==undefined?'Fest aus Verpackungsart':'Nicht vorgesehen');
  return `<label><span class="shipment-field-label">${esc(label)}</span><input type="number" min="0.01" step="0.01" data-colli-field="${esc(field)}" data-colli-index="${index}" value="${esc(value)}" ${disabled?'disabled':''}><small>${esc(note)}</small></label>`;
}

function colliEditorHtml(shipment,packagingTypes,canEdit){
  const rows=Array.isArray(shipment.colliRows)?shipment.colliRows:[];
  const totals=shipment.colliTotals&&typeof shipment.colliTotals==='object'?shipment.colliTotals:null;
  const totalHtml=totals?`<div class="shipment-colli-totals"><strong>${numberLabel(totals.totalColli,0)} Colli</strong><span>${numberLabel(totals.totalWeightKg,3)} kg</span><span>${numberLabel(totals.totalLdm,4)} LDM</span></div>`:'<div class="shipment-colli-totals is-pending"><strong>Serverberechnung offen</strong><span>LDM und Summen werden nach gültigem Speichern aktualisiert.</span></div>';
  const rowsHtml=rows.map((row,index)=>{
    const packaging=packagingFor(packagingTypes,row.packagingTypeId);
    return `<div class="shipment-colli-row" data-colli-row data-colli-index="${index}">
      <div class="shipment-colli-row-head"><label><span class="shipment-field-label">Verpackung</span><select data-colli-field="packagingTypeId" data-colli-index="${index}" ${canEdit?'':'disabled'}>${packagingOptions(packagingTypes,row)}</select></label>${canEdit?`<button type="button" class="ghost compact" data-colli-action="remove" data-colli-index="${index}">Entfernen</button>`:''}</div>
      <div class="shipment-colli-grid">
        <label><span class="shipment-field-label">Anzahl</span><input type="number" min="1" step="1" data-colli-field="quantity" data-colli-index="${index}" value="${esc(row.quantity??'')}" ${canEdit?'':'disabled'}></label>
        <label><span class="shipment-field-label">Gewicht kg</span><input type="number" min="0" step="0.001" data-colli-field="weightKg" data-colli-index="${index}" value="${esc(row.weightKg??'')}" ${canEdit?'':'disabled'}></label>
        <div class="shipment-colli-output"><span class="shipment-field-label">LDM</span><output data-colli-ldm>${numberLabel(row.ldm,4)}</output><small>Serverseitig berechnet</small></div>
        ${dimensionInput({label:'Länge cm',field:'lengthCm',row,packaging,canEdit,index,allowKey:'allowLength',presetKey:'lengthCm'})}
        ${dimensionInput({label:'Breite cm',field:'widthCm',row,packaging,canEdit,index,allowKey:'allowWidth',presetKey:'widthCm'})}
        ${dimensionInput({label:'Höhe cm',field:'heightCm',row,packaging,canEdit,index,allowKey:'allowHeight',presetKey:'heightCm'})}
      </div>
    </div>`;
  }).join('');
  const empty=!rows.length?`<div class="shipment-server-owned"><strong>Noch keine Colli erfasst.</strong><span>${packagingTypes.length?'Mit „Colli hinzufügen“ eine Verpackungszeile anlegen.':'Keine aktive Verpackungsart verfügbar.'}</span></div>`:'';
  const action=canEdit?`<div class="shipment-colli-actions"><button type="button" class="btn compact" data-colli-action="add" ${packagingTypes.length?'':'disabled'}>+ Colli hinzufügen</button><span>Physische Anzahl und Gewicht erfassen. LDM kommt ausschließlich vom Server.</span></div>`:'';
  return `<div class="shipment-colli-editor">${totalHtml}<div class="shipment-colli-rows">${rowsHtml||empty}</div>${action}</div>`;
}

export function renderShipmentEditor(root,model={},permissions={}){
  if(!root)return;
  const shipment=model?.shipment||model||{};
  if(!text(shipment.id)){
    root.innerHTML='<div class="shipment-editor-empty"><div class="kicker">SENDUNGSDETAIL</div><h3>Sendung auswählen</h3><p class="muted">Links eine Sendung auswählen oder eine neue LIVE-Sendung anlegen.</p></div>';
    return;
  }
  const readOnly=shipment.readOnly===true||text(shipment.sourceKind).toUpperCase()==='MIGRATED'||permissions.canWrite===false;
  const lock=permissions.lock||model.lock||null;
  const canEdit=!readOnly&&!!lock?.lockToken;
  const saveState=text(permissions.saveState||model.saveState)||'saved';
  const saveLabel={saving:'Speichert …',saved:'Gespeichert',error:'Speichern fehlgeschlagen',idle:'Bereit'}[saveState]||saveState;
  const readiness=shipment.readiness&&typeof shipment.readiness==='object'?shipment.readiness:{};
  const recipient=shipment.recipientSnapshot&&typeof shipment.recipientSnapshot==='object'?shipment.recipientSnapshot:{};
  const carrier=shipment.carrierSnapshot&&typeof shipment.carrierSnapshot==='object'?shipment.carrierSnapshot:{};
  const fx=shipment.fxSnapshot&&typeof shipment.fxSnapshot==='object'?shipment.fxSnapshot:{};
  const packagingTypes=Array.isArray(model.packagingTypes)?model.packagingTypes:[];

  const customerBody=`<div class="shipment-field-grid"><div><span class="shipment-field-label">Kunde</span><strong>${esc(shipment.customerName||shipment.customerAccount||'Noch nicht gewählt')}</strong><small>${esc(shipment.customerAccount||'')}</small></div><div><span class="shipment-field-label">Standort</span><strong>${esc(shipment.locationName||'Noch nicht gewählt')}</strong><small>${esc([shipment.locationCity,shipment.locationCountry].filter(Boolean).join(' · '))}</small></div><div class="full"><span class="shipment-field-label">Empfänger-Snapshot</span><p>${esc(snapshotAddress(recipient))}</p></div></div>`;
  const shipmentBody=`<div class="shipment-field-grid"><label><span class="shipment-field-label">Geplantes Abholdatum</span><input id="shipmentPlannedPickupDate" type="date" value="${esc(shipment.plannedPickupDate||'')}" ${canEdit?'':'disabled'}></label><div><span class="shipment-field-label">Revision</span><strong>${esc(shipment.revision??0)}</strong><small>Optimistische Versionsprüfung</small></div><div class="full"><span class="shipment-field-label">Absender-Snapshot</span><p>${esc(snapshotAddress(shipment.senderSnapshot||{}))}</p></div></div>`;
  const colliBody=colliEditorHtml(shipment,packagingTypes,canEdit);
  const carrierBody=`<div class="shipment-field-grid"><div><span class="shipment-field-label">Spedition</span><strong>${esc(carrier.name||carrier.carrierName||'Noch nicht festgelegt')}</strong></div><div><span class="shipment-field-label">Status</span><strong>${esc(carrier.status||'Serverseitig')}</strong></div></div>`;
  const customsBody=`<div class="shipment-field-grid"><div><span class="shipment-field-label">Währungs-/FX-Stand</span><strong>${esc(fx.currency||'Serverseitig')}</strong></div><div><span class="shipment-field-label">Zollentscheidung</span><strong>Serverseitig</strong><small>Keine ABD-/CMR-Regel im Browser.</small></div></div>`;
  const documentsBody=`<div id="shipmentChecklist" class="shipment-checklist">${checklistHtml(readiness)}</div>`;
  const pickupBody=`<div class="shipment-field-grid"><div><span class="shipment-field-label">Tatsächliche Abholung</span><strong>${esc(shipment.actualPickupDate||'Noch nicht abgeholt')}</strong></div><div><span class="shipment-field-label">Abgeholt um</span><strong>${esc(shipment.pickedUpAt||'–')}</strong></div></div>`;

  root.innerHTML=`<article class="shipment-editor ${readOnly?'is-read-only':''}">
    <header class="shipment-editor-head">
      <div class="shipment-editor-identity"><div class="kicker">SENDUNG</div><div class="shipment-reference-row"><strong id="shipmentReference">${esc(shipment.reference||'–')}</strong><span id="shipmentStatus" class="cc-status ${statusClass(text(shipment.status))}">${esc(shipment.status||'Entwurf')}</span><span id="shipmentReadOnlyBadge" class="cc-status neutral ${readOnly?'':'hidden'}">${text(shipment.sourceKind).toUpperCase()==='MIGRATED'?'Migriert · Read only':'Read only'}</span></div><small>${esc(shipment.customerName||shipment.customerAccount||'Kunde noch nicht gewählt')}</small></div>
      <div class="shipment-editor-state"><span id="shipmentSaveState" class="shipment-save-state ${esc(saveState)}">${esc(saveLabel)}</span><button type="button" class="ghost compact" data-shipment-action="close">Zur Liste</button></div>
    </header>
    <div id="shipmentLockBanner" class="shipment-lock-banner ${readOnly?'read-only':(lock?.lockToken?'good':'warn')}">${readOnly?'Diese Sendung ist dauerhaft schreibgeschützt.':(lock?.lockToken?'Bearbeitungssperre aktiv · Änderungen werden automatisch gespeichert.':'Keine Bearbeitungssperre. Änderungen sind deaktiviert.')}</div>
    <div class="shipment-editor-sections">
      ${section('Kunde & Standort',customerBody,{open:true})}
      ${section('Sendungsdaten',shipmentBody,{open:true})}
      ${section('Colli/LDM',colliBody,{open:true})}
      ${section('Spedition',carrierBody)}
      ${section('Warenwert & Zoll',customsBody)}
      ${section('Dokumente',documentsBody,{open:true})}
      ${section('Abholung',pickupBody)}
    </div>
  </article>`;
}
