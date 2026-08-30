import {inventoryBackup,buildMigrationPackage,summarizePackage} from '../../shared/migration-core.js';

const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
let sourceText='', sourcePayload=null, migrationPackage=null, currentInventory=null, currentDocumentRows=[];

function setView(name){
  $$('.view').forEach(v=>v.classList.toggle('active',v.dataset.view===name));
  $$('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.nav===name));
  $('#pageTitle').textContent=({overview:'Übersicht',migration:'Migration',tenants:'Mandanten',users:'Benutzer & Rollen',customers:'Kunden',locations:'Standorte',shipments:'Sendungen',documents:'Dokumente',audit:'Audit'}[name]||'ExportHUB Professional');
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
  $('#auditPreview').innerHTML=`<div class="read-grid"><div class="read-kpi"><b>${fmt(m.mapping?.mapped)}</b><span>Quellobjekte zugeordnet</span></div><div class="read-kpi"><b>${fmt(m.audit?.total)}</b><span>Audit-Ereignisse strukturiert</span></div><div class="read-kpi"><b>${fmt(m.recovery?.captureRequired)}</b><span>Remote-Captures offen</span></div><div class="read-kpi"><b>${fmt(m.recovery?.sourceFileRequired)}</b><span>Originaldateien erforderlich</span></div></div><div class="notice" style="margin-top:14px">Professional 0.5 bewahrt Audittexte, redigiert aber bekannte Secret-Felder in strukturierten Details. Es werden keine fehlenden POD-/Quelldateien erfunden oder als erfolgreich migriert markiert.</div>`;
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

setView('overview');
