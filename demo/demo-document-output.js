const MARKER = 'DEMO / MUSTER';
const STATUS_FLOW = ['Entwurf','Erstellt','Bereit zur Abholung','Abgeholt','POD vorhanden','Abgeschlossen','Archiviert'];

const TYPE_META = Object.freeze({
  loading: { label:'Ladeliste', file:'Ladeliste', generated:true },
  l1: { label:'L1 / QR', file:'L1-QR', generated:true },
  l2: { label:'L2', file:'L2', generated:true },
  cmr: { label:'CMR', file:'CMR', generated:false },
  abd: { label:'ABD', file:'ABD', generated:false },
  pod: { label:'POD', file:'POD', generated:false }
});

const escapeHtml = value => String(value ?? '')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');

const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const round2 = value => Math.round((number(value) + Number.EPSILON) * 100) / 100;

export function formatDemoDate(value) {
  if (!value) return '–';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  return match ? `${match[3]}.${match[2]}.${match[1]}` : String(value);
}

function safeSegment(value, fallback = 'Demo') {
  const clean = String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^A-Za-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .replace(/-+/g,'-');
  return clean || fallback;
}

export function buildDocumentFilename({ reference, customerName, documentType, copy } = {}) {
  const meta = TYPE_META[documentType];
  if (!meta) throw new Error('UNBEKANNTES_DOKUMENT');
  const typePart = documentType === 'cmr' && copy
    ? `${meta.file}-${Number(copy)}-von-3`
    : meta.file;
  return `${safeSegment(reference,'DEMO01')}_${safeSegment(customerName,'Demo-Kunde')}_${typePart}_DEMO-MUSTER.html`;
}

function requireContext(shipmentId, state) {
  if (!state || !Array.isArray(state.shipments)) throw new Error('DEMO_STATE_FEHLT');
  const shipment = state.shipments.find(item => item.id === shipmentId && item.demo === true);
  if (!shipment) throw new Error('DEMO_SENDUNG_NICHT_GEFUNDEN');
  const customer = state.customers?.find(item => item.id === shipment.customerId) || { name:'Demo-Kunde', number:'DEMO' };
  const location = state.locations?.find(item => item.id === shipment.locationId) || {
    label:'Demo-Standort', address:'Musteradresse', city:String(shipment.destination || 'Demo-Ziel'), country:shipment.nonEu ? 'Nicht-EU' : 'DE'
  };
  return { shipment, customer, location };
}

function atOrAfterCollection(shipment) {
  const index = STATUS_FLOW.indexOf(shipment.status);
  return Boolean(shipment.actualPickup) || index >= STATUS_FLOW.indexOf('Abgeholt');
}

function documentState(shipment, type) {
  if (type === 'loading') return 'Generierte Musterausgabe';
  if (type === 'l1' || type === 'l2') return shipment.documents?.[type] === true ? 'Vorhanden' : 'Generierte Musterausgabe';
  return shipment.documents?.[type] === true ? 'Vorhanden' : 'Fehlt';
}

export function buildDocumentPackage(shipmentId, state) {
  const { shipment, customer, location } = requireContext(shipmentId, state);
  const items = [
    { type:'loading', label:'Ladeliste', relevant:true, status:documentState(shipment,'loading'), generated:true, copies:1 },
    { type:'l1', label:'L1 / QR', relevant:true, status:documentState(shipment,'l1'), generated:true, copies:1 },
    { type:'l2', label:'L2', relevant:true, status:documentState(shipment,'l2'), generated:true, copies:1 }
  ];
  if (String(location.country || '').toUpperCase() !== 'DE') {
    items.push({ type:'cmr', label:'CMR', relevant:true, status:documentState(shipment,'cmr'), generated:true, copies:3, copyLabels:['1/3','2/3','3/3'] });
  }
  if (shipment.requiresAbd === true) {
    items.push({ type:'abd', label:'ABD', relevant:true, status:documentState(shipment,'abd'), generated:true, copies:1 });
  }
  if (atOrAfterCollection(shipment)) {
    items.push({ type:'pod', label:'POD', relevant:true, status:documentState(shipment,'pod'), generated:true, copies:1 });
  }
  return {
    demo:true,
    marker:MARKER,
    shipmentId,
    reference:shipment.reference,
    customer:{ id:customer.id, number:customer.number, name:customer.name },
    location:{ id:location.id, label:location.label, address:location.address, city:location.city, country:location.country },
    status:shipment.status,
    items
  };
}

function normalizeRows(shipment) {
  if (Array.isArray(shipment.colli) && shipment.colli.length) {
    return shipment.colli.map((row, index) => ({
      position:index + 1,
      packaging:String(row.packaging || 'Colli'),
      quantity:Math.max(0, Math.trunc(number(row.quantity))),
      weightKg:round2(row.weightKg),
      ldm:round2(row.ldm),
      lengthCm:number(row.lengthCm),
      widthCm:number(row.widthCm),
      heightCm:number(row.heightCm)
    }));
  }
  const match = /^(\d+)/.exec(String(shipment.packages || ''));
  return [{
    position:1,
    packaging:String(shipment.packages || 'Colli'),
    quantity:match ? Number(match[1]) : 1,
    weightKg:round2(shipment.weightKg),
    ldm:round2(shipment.ldm),
    lengthCm:0,
    widthCm:0,
    heightCm:0
  }];
}

function rowSummary(rows, shipment) {
  const hasDetailedLdm = rows.some(row => row.ldm > 0);
  return {
    totalQuantity:rows.reduce((sum,row) => sum + row.quantity,0),
    totalWeightKg:round2(rows.reduce((sum,row) => sum + row.weightKg,0) || shipment.weightKg),
    totalLdm:round2(hasDetailedLdm ? rows.reduce((sum,row) => sum + row.ldm,0) : shipment.ldm)
  };
}

export function buildDocumentSheet(shipmentId, documentType, { state, copy = 1 } = {}) {
  const meta = TYPE_META[documentType];
  if (!meta) throw new Error('UNBEKANNTES_DOKUMENT');
  const { shipment, customer, location } = requireContext(shipmentId, state);
  const pkg = buildDocumentPackage(shipmentId, state);
  const item = pkg.items.find(entry => entry.type === documentType);
  if (!item) throw new Error('DOKUMENT_NICHT_RELEVANT');
  const rows = normalizeRows(shipment);
  const summary = rowSummary(rows, shipment);
  const safeCopy = documentType === 'cmr' ? Math.min(3, Math.max(1, Math.trunc(number(copy) || 1))) : 1;

  const notes = [];
  if (documentType === 'abd') {
    notes.push(shipment.documents?.abd === true
      ? 'Ausfuhrbegleitdokument im Demo-Status vorhanden. Es wird keine echte Zollreferenz erzeugt.'
      : 'ABD fehlt. Die Sendung bleibt bis zum Nachweis für die Freigabe gesperrt.');
  }
  if (documentType === 'pod') {
    notes.push(shipment.documents?.pod === true
      ? 'POD im lokalen Demo-Status vorhanden.'
      : 'POD fehlt. Nachweis nach der bestätigten Abholung noch offen.');
  }

  return {
    demo:true,
    marker:MARKER,
    type:documentType,
    title:meta.label,
    status:item.status,
    reference:shipment.reference,
    pageCount:1,
    copy:safeCopy,
    copyLabel:documentType === 'cmr' ? `${safeCopy}/3` : null,
    customer:{ id:customer.id, number:customer.number, name:customer.name },
    location:{ id:location.id, label:location.label, address:location.address, city:location.city, country:location.country },
    shipment:{
      status:shipment.status,
      ownerId:shipment.ownerId,
      plannedPickup:formatDemoDate(shipment.plannedPickup),
      actualPickup:formatDemoDate(shipment.actualPickup),
      destination:shipment.destination,
      nonEu:Boolean(shipment.nonEu),
      requiresAbd:Boolean(shipment.requiresAbd),
      valueEur:round2(shipment.valueEur),
      packages:shipment.packages,
      weightKg:round2(shipment.weightKg),
      ldm:round2(shipment.ldm)
    },
    rows,
    summary,
    notes,
    documents:{ ...(shipment.documents || {}) }
  };
}

function metric(value, suffix = '') {
  return `${Number(value || 0).toLocaleString('de-DE',{maximumFractionDigits:2})}${suffix}`;
}

function qrCells(reference) {
  const seed = [...String(reference || 'DEMO01')].reduce((sum,char,index) => sum + char.charCodeAt(0) * (index + 3),0);
  const cells = [];
  for (let row = 0; row < 13; row += 1) {
    for (let col = 0; col < 13; col += 1) {
      const finder = (row < 4 && col < 4) || (row < 4 && col > 8) || (row > 8 && col < 4);
      const dark = finder || ((seed + row * 17 + col * 31 + row * col) % 5 < 2);
      cells.push(`<i class="${dark ? 'on' : ''}"></i>`);
    }
  }
  return cells.join('');
}

function rowsTable(sheet, { cmr = false } = {}) {
  return `<table class="doc-output-table"><thead><tr><th>Pos.</th><th>Verpackung / Ware</th><th>Anzahl</th><th>Gewicht</th>${cmr ? '' : '<th>LDM</th><th>Maße L×B×H</th>'}</tr></thead><tbody>${sheet.rows.map(row => `<tr><td>${row.position}</td><td>${escapeHtml(row.packaging)}</td><td>${row.quantity}</td><td>${metric(row.weightKg,' kg')}</td>${cmr ? '' : `<td>${metric(row.ldm)}</td><td>${row.lengthCm && row.widthCm ? `${row.lengthCm}×${row.widthCm}×${row.heightCm || '–'} cm` : '–'}</td>`}</tr>`).join('')}</tbody></table>`;
}

function commonParties(sheet) {
  return `<div class="doc-output-parties"><section><small>Absender</small><strong>Rheinwerk Industrial Solutions GmbH</strong><span>Demo-Zentrale · Nordrhein-Westfalen · Deutschland</span></section><section><small>Empfänger</small><strong>${escapeHtml(sheet.customer.name)}</strong><span>${escapeHtml(sheet.location.label || '')} · ${escapeHtml(sheet.location.address || '')}<br>${escapeHtml(sheet.location.city || '')} · ${escapeHtml(sheet.location.country || '')}</span></section></div>`;
}

function typeBody(sheet) {
  if (sheet.type === 'loading') {
    return `${commonParties(sheet)}<section class="doc-output-section"><h4>Colli & Verladung</h4>${rowsTable(sheet)}<div class="doc-output-totals"><span><small>Colli</small><strong>${sheet.summary.totalQuantity}</strong></span><span><small>Gewicht</small><strong>${metric(sheet.summary.totalWeightKg,' kg')}</strong></span><span><small>LDM</small><strong>${metric(sheet.summary.totalLdm)}</strong></span></div><p class="doc-output-note">Einseitige Musterausgabe · keine zweite Ladelisten-Seite.</p></section>`;
  }
  if (sheet.type === 'l1') {
    return `${commonParties(sheet)}<div class="doc-output-l1"><section><span class="doc-output-kicker">ABHOLUNG / VERLADUNG</span><h4>${escapeHtml(sheet.reference)}</h4><dl><div><dt>Geplante Abholung</dt><dd>${sheet.shipment.plannedPickup}</dd></div><div><dt>Colli</dt><dd>${sheet.summary.totalQuantity}</dd></div><div><dt>Gewicht</dt><dd>${metric(sheet.summary.totalWeightKg,' kg')}</dd></div><div><dt>Ziel</dt><dd>${escapeHtml(sheet.location.city)} · ${escapeHtml(sheet.location.country)}</dd></div></dl></section><section class="doc-output-qr-wrap"><div class="doc-output-qr" aria-label="Nicht scannbarer Demo-QR">${qrCells(sheet.reference)}</div><strong>DEMO QR</strong><small>Nicht scannen · nur Präsentationsmuster</small></section></div>`;
  }
  if (sheet.type === 'l2') {
    const entries = [
      ['Lieferschein', sheet.documents.delivery],['L1 / QR',sheet.documents.l1],['L2',sheet.documents.l2],['CMR',sheet.documents.cmr],['ABD',sheet.shipment.requiresAbd ? sheet.documents.abd : null],['POD',sheet.documents.pod]
    ].filter(([,value]) => value !== null);
    return `${commonParties(sheet)}<section class="doc-output-section"><h4>Versand-/Speditionsübersicht</h4><div class="doc-output-facts"><div><small>Abholung</small><strong>${sheet.shipment.plannedPickup}</strong></div><div><small>Colli</small><strong>${sheet.summary.totalQuantity}</strong></div><div><small>Gewicht</small><strong>${metric(sheet.summary.totalWeightKg,' kg')}</strong></div><div><small>LDM</small><strong>${metric(sheet.summary.totalLdm)}</strong></div></div><div class="doc-output-checks">${entries.map(([label,present]) => `<span class="${present ? 'ok' : 'missing'}"><b>${present ? '✓' : '!'}</b>${label}</span>`).join('')}</div></section>`;
  }
  if (sheet.type === 'cmr') {
    return `<div class="doc-output-cmr-title"><strong>INTERNATIONALER FRACHTBRIEF / CMR</strong><span>Ausfertigung ${sheet.copyLabel}</span></div>${commonParties(sheet)}<section class="doc-output-section"><div class="doc-output-facts"><div><small>Übernahmeort</small><strong>Demo-Zentrale · DE</strong></div><div><small>Ablieferort</small><strong>${escapeHtml(sheet.location.city)} · ${escapeHtml(sheet.location.country)}</strong></div><div><small>Frachtführer</small><strong>Demo Spedition GmbH</strong></div><div><small>Abholdatum</small><strong>${sheet.shipment.plannedPickup}</strong></div></div>${rowsTable(sheet,{cmr:true})}<div class="doc-output-signatures"><span>Absender / Muster</span><span>Frachtführer / Muster</span><span>Empfänger / Muster</span></div></section>`;
  }
  if (sheet.type === 'abd') {
    return `${commonParties(sheet)}<section class="doc-output-section"><div class="doc-output-customs"><span class="${sheet.status === 'Vorhanden' ? 'ok' : 'missing'}">${sheet.status}</span><h4>Ausfuhrbegleitdokument</h4><p>${escapeHtml(sheet.notes[0])}</p><div class="doc-output-facts"><div><small>Ausfuhrland</small><strong>Deutschland</strong></div><div><small>Bestimmungsland</small><strong>${escapeHtml(sheet.location.country)}</strong></div><div><small>Warenwert</small><strong>${metric(sheet.shipment.valueEur,' EUR')}</strong></div><div><small>Zollreferenz</small><strong>Nicht erzeugt · DEMO</strong></div></div></div></section>`;
  }
  if (sheet.type === 'pod') {
    return `${commonParties(sheet)}<section class="doc-output-section"><div class="doc-output-pod"><span class="${sheet.status === 'Vorhanden' ? 'ok' : 'missing'}">${sheet.status}</span><h4>Proof of Delivery</h4><p>${escapeHtml(sheet.notes[0])}</p><div class="doc-output-facts"><div><small>Referenz</small><strong>${escapeHtml(sheet.reference)}</strong></div><div><small>Tatsächliche Abholung</small><strong>${sheet.shipment.actualPickup}</strong></div><div><small>Empfangsort</small><strong>${escapeHtml(sheet.location.city)}</strong></div><div><small>Nachweis</small><strong>${sheet.status === 'Vorhanden' ? 'Demo-POD hinterlegt' : 'noch offen'}</strong></div></div><div class="doc-output-pod-sign"><span>Empfang / Unterschrift</span><strong>${sheet.status === 'Vorhanden' ? 'DEMO-POD VORHANDEN' : 'POD FEHLT'}</strong></div></div></section>`;
  }
  return '';
}

export function renderDocumentSheetHtml(sheet) {
  const copy = sheet.type === 'cmr' ? `<span class="doc-output-copy">${sheet.copyLabel}</span>` : '';
  return `<article class="doc-output-sheet" data-document-type="${sheet.type}"><div class="doc-output-watermark">${MARKER}</div><header class="doc-output-sheet-head"><div class="doc-output-brand"><span>EH</span><div><strong>ExportHUB Professional</strong><small>Rheinwerk Industrial Solutions GmbH</small></div></div><div class="doc-output-doc-title"><small>${MARKER}</small><h3>${escapeHtml(sheet.title)}</h3><span class="doc-output-state ${sheet.status === 'Fehlt' ? 'missing' : 'ok'}">${escapeHtml(sheet.status)}</span>${copy}</div></header><div class="doc-output-reference"><div><small>Referenz</small><strong>${escapeHtml(sheet.reference)}</strong></div><div><small>Kunde</small><strong>${escapeHtml(sheet.customer.number || 'DEMO')}</strong></div><div><small>Geplante Abholung</small><strong>${sheet.shipment.plannedPickup}</strong></div><div><small>Status</small><strong>${escapeHtml(sheet.shipment.status)}</strong></div></div>${typeBody(sheet)}<footer class="doc-output-sheet-foot"><span>ExportHUB Professional · Präsentationsmuster</span><strong>${MARKER}</strong><span>Seite 1 / 1</span></footer></article>`;
}

function downloadHtml(sheet) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(sheet.reference)} · ${escapeHtml(sheet.title)} · DEMO</title><style>body{margin:0;padding:24px;background:#eef2f4;font-family:Arial,sans-serif;color:#152d3e}.doc-output-sheet{max-width:900px;margin:auto;background:#fff;padding:34px;box-shadow:0 8px 30px #0002;position:relative}.doc-output-watermark{position:absolute;right:24px;top:24px;font-weight:800;color:#a16b08}.doc-output-sheet-head,.doc-output-reference,.doc-output-parties,.doc-output-facts,.doc-output-totals,.doc-output-signatures,.doc-output-sheet-foot{display:flex;gap:18px;justify-content:space-between}.doc-output-brand{display:flex;gap:10px;align-items:center}.doc-output-brand>span{background:#123b59;color:#fff;padding:12px;border-radius:8px;font-weight:800}.doc-output-doc-title{text-align:right}.doc-output-reference,.doc-output-parties,.doc-output-facts{margin-top:20px;padding:14px;border:1px solid #d9e1e6}.doc-output-reference>div,.doc-output-facts>div{flex:1}.doc-output-parties>section{flex:1}.doc-output-reference small,.doc-output-parties small,.doc-output-facts small{display:block;color:#6e7f8a}.doc-output-section{margin-top:22px}.doc-output-table{width:100%;border-collapse:collapse}.doc-output-table th,.doc-output-table td{border:1px solid #d7dfe4;padding:8px;text-align:left;font-size:12px}.doc-output-table th{background:#eef3f6}.doc-output-totals{margin-top:14px}.doc-output-qr{display:grid;grid-template-columns:repeat(13,8px);gap:1px}.doc-output-qr i{width:8px;height:8px;background:#fff}.doc-output-qr i.on{background:#111}.doc-output-l1{display:flex;justify-content:space-between;gap:30px;margin-top:24px}.doc-output-qr-wrap{border:1px solid #d7dfe4;padding:18px;text-align:center}.doc-output-sheet-foot{margin-top:30px;padding-top:12px;border-top:1px solid #d7dfe4;font-size:11px}.ok{color:#2f7658}.missing{color:#a45e26}@media print{body{padding:0;background:#fff}.doc-output-sheet{box-shadow:none}}</style></head><body>${renderDocumentSheetHtml(sheet)}</body></html>`;
}

function ensureStylesheet() {
  if (document.querySelector('[data-document-output-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './demo-document-output.css';
  link.dataset.documentOutputStyle = 'true';
  document.head.appendChild(link);
}

function ensureHost() {
  let drawer = document.getElementById('documentOutputDrawer');
  if (!drawer) {
    document.body.insertAdjacentHTML('beforeend', `<div class="document-output-drawer" id="documentOutputDrawer" hidden><aside class="document-output-panel" id="documentOutputPanel" role="dialog" aria-modal="true" aria-label="Demo-Dokumentpaket"><header class="document-output-head"><div id="documentOutputContext"></div><button type="button" id="documentOutputCloseBtn" aria-label="Dokumentpaket schließen">×</button></header><div class="document-output-tabs" id="documentOutputTabs"></div><div class="document-output-copy-tabs" id="documentOutputCopyTabs"></div><main class="document-output-stage"><div id="documentOutputPaper"></div></main><footer class="document-output-actions"><div><strong>Lokale Musterausgabe</strong><span>Keine Daten werden hochgeladen oder versendet.</span></div><button type="button" id="documentPrintBtn">Drucken</button><button type="button" class="primary" id="documentDownloadBtn">Muster herunterladen</button></footer></aside></div>`);
    drawer = document.getElementById('documentOutputDrawer');
  }
  return drawer;
}

export function initDocumentOutput({ getState } = {}) {
  if (typeof document === 'undefined' || typeof getState !== 'function') return { open(){}, close(){}, refresh(){} };
  ensureStylesheet();
  const drawer = ensureHost();
  const panel = document.getElementById('documentOutputPanel');
  const tabs = document.getElementById('documentOutputTabs');
  const copies = document.getElementById('documentOutputCopyTabs');
  const paper = document.getElementById('documentOutputPaper');
  const context = document.getElementById('documentOutputContext');
  const closeBtn = document.getElementById('documentOutputCloseBtn');
  const printBtn = document.getElementById('documentPrintBtn');
  const downloadBtn = document.getElementById('documentDownloadBtn');
  let current = { shipmentId:null, type:null, copy:1 };

  const close = () => {
    drawer.hidden = true;
    drawer.classList.remove('open');
    document.body.classList.remove('document-output-open');
  };

  const render = () => {
    if (!current.shipmentId) return;
    const state = getState();
    const pkg = buildDocumentPackage(current.shipmentId, state);
    if (!pkg.items.some(item => item.type === current.type)) current.type = pkg.items[0]?.type || null;
    const activeItem = pkg.items.find(item => item.type === current.type);
    if (!activeItem) return;
    if (current.type !== 'cmr') current.copy = 1;

    context.innerHTML = `<span class="eyebrow">DOKUMENTPAKET · ${MARKER}</span><strong>${escapeHtml(pkg.reference)} · ${escapeHtml(pkg.customer.name)}</strong><small>${escapeHtml(pkg.location.city)} · ${escapeHtml(pkg.location.country)} · ${escapeHtml(pkg.status)}</small>`;
    tabs.innerHTML = pkg.items.map(item => `<button type="button" class="${item.type === current.type ? 'active' : ''}" data-output-type="${item.type}"><span>${escapeHtml(item.label)}</span><small class="${item.status === 'Fehlt' ? 'missing' : 'ok'}">${escapeHtml(item.status)}</small></button>`).join('');
    copies.innerHTML = current.type === 'cmr' ? `<span>CMR-Ausfertigung</span>${[1,2,3].map(copy => `<button type="button" class="${copy === current.copy ? 'active' : ''}" data-output-copy="${copy}">${copy}/3</button>`).join('')}` : '';
    const sheet = buildDocumentSheet(current.shipmentId, current.type, { state, copy:current.copy });
    paper.innerHTML = renderDocumentSheetHtml(sheet);
    downloadBtn.dataset.filename = buildDocumentFilename({ reference:sheet.reference, customerName:sheet.customer.name, documentType:sheet.type, copy:sheet.type === 'cmr' ? sheet.copy : undefined });

    tabs.querySelectorAll('[data-output-type]').forEach(button => button.addEventListener('click', () => {
      current.type = button.dataset.outputType;
      current.copy = 1;
      render();
    }));
    copies.querySelectorAll('[data-output-copy]').forEach(button => button.addEventListener('click', () => {
      current.copy = Number(button.dataset.outputCopy) || 1;
      render();
    }));
  };

  const open = shipmentId => {
    const pkg = buildDocumentPackage(shipmentId, getState());
    current = { shipmentId, type:pkg.items[0]?.type || 'loading', copy:1 };
    drawer.hidden = false;
    drawer.classList.add('open');
    document.body.classList.add('document-output-open');
    render();
  };

  closeBtn?.addEventListener('click', close);
  drawer?.addEventListener('click', event => { if (event.target === drawer) close(); });
  panel?.addEventListener('click', event => event.stopPropagation());
  printBtn?.addEventListener('click', () => {
    document.body.classList.add('document-output-printing');
    window.print();
    setTimeout(() => document.body.classList.remove('document-output-printing'), 0);
  });
  downloadBtn?.addEventListener('click', () => {
    if (!current.shipmentId || !current.type) return;
    const state = getState();
    const sheet = buildDocumentSheet(current.shipmentId, current.type, { state, copy:current.copy });
    const blob = new Blob([downloadHtml(sheet)], { type:'text/html;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = downloadBtn.dataset.filename || buildDocumentFilename({ reference:sheet.reference, customerName:sheet.customer.name, documentType:sheet.type, copy:sheet.copy });
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(href), 0);
  });

  return { open, close, refresh:render };
}
