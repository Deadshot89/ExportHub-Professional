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

  const customerBody=`<div class="shipment-field-grid"><div><span class="shipment-field-label">Kunde</span><strong>${esc(shipment.customerName||shipment.customerAccount||'Noch nicht gewählt')}</strong><small>${esc(shipment.customerAccount||'')}</small></div><div><span class="shipment-field-label">Standort</span><strong>${esc(shipment.locationName||'Noch nicht gewählt')}</strong><small>${esc([shipment.locationCity,shipment.locationCountry].filter(Boolean).join(' · '))}</small></div><div class="full"><span class="shipment-field-label">Empfänger-Snapshot</span><p>${esc(snapshotAddress(recipient))}</p></div></div>`;
  const shipmentBody=`<div class="shipment-field-grid"><label><span class="shipment-field-label">Geplantes Abholdatum</span><input id="shipmentPlannedPickupDate" type="date" value="${esc(shipment.plannedPickupDate||'')}" ${canEdit?'':'disabled'}></label><div><span class="shipment-field-label">Revision</span><strong>${esc(shipment.revision??0)}</strong><small>Optimistische Versionsprüfung</small></div><div class="full"><span class="shipment-field-label">Absender-Snapshot</span><p>${esc(snapshotAddress(shipment.senderSnapshot||{}))}</p></div></div>`;
  const colliBody='<div class="shipment-server-owned"><strong>Colli und Lademeter werden serverseitig geführt.</strong><span>Verpackungsregeln und berechnete LDM kommen im nächsten Ausbauschritt. Browserwerte sind nicht maßgeblich.</span></div>';
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
      ${section('Colli/LDM',colliBody)}
      ${section('Spedition',carrierBody)}
      ${section('Warenwert & Zoll',customsBody)}
      ${section('Dokumente',documentsBody,{open:true})}
      ${section('Abholung',pickupBody)}
    </div>
  </article>`;
}
