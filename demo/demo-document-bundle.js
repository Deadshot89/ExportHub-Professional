import { buildDocumentPackage, buildDocumentSheet, renderDocumentSheetHtml } from './demo-document-output.js';

const MARKER = 'DEMO / MUSTER';

const escapeHtml = value => String(value ?? '')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');

function safeSegment(value, fallback = 'Demo') {
  const clean = String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^A-Za-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .replace(/-+/g,'-');
  return clean || fallback;
}

export function buildShipmentBundleFilename({ reference, customerName } = {}) {
  return `${safeSegment(reference,'DEMO01')}_${safeSegment(customerName,'Demo-Kunde')}_Gesamtausgabe_DEMO-MUSTER.html`;
}

function expandPages(pkg) {
  const pages = [{ key:'cover', type:'cover', label:'Deckblatt', status:'Generiert' }];
  for (const type of ['l1','l2']) {
    const item = pkg.items.find(entry => entry.type === type);
    if (item) pages.push({ key:type, type, label:item.label, status:item.status });
  }
  const cmr = pkg.items.find(entry => entry.type === 'cmr');
  if (cmr) {
    for (let copy = 1; copy <= 3; copy += 1) {
      pages.push({ key:`cmr-${copy}`, type:'cmr', label:`CMR ${copy}/3`, status:cmr.status, copy, copyLabel:`${copy}/3` });
    }
  }
  for (const type of ['abd','pod']) {
    const item = pkg.items.find(entry => entry.type === type);
    if (item) pages.push({ key:type, type, label:item.label, status:item.status });
  }
  return pages;
}

export function buildShipmentBundleManifest(shipmentId, state) {
  const pkg = buildDocumentPackage(shipmentId, state);
  const pages = expandPages(pkg);
  const warnings = pkg.items
    .filter(item => item.status === 'Fehlt')
    .map(item => `${item.label} fehlt`);
  return {
    demo:true,
    marker:MARKER,
    shipmentId,
    reference:pkg.reference,
    customer:pkg.customer,
    location:pkg.location,
    status:pkg.status,
    totalPages:pages.length,
    releaseState:warnings.length ? 'Handlungsbedarf' : 'Freigabefähig',
    warnings,
    pages
  };
}

export function buildShipmentBundleCover(shipmentId, state) {
  const manifest = buildShipmentBundleManifest(shipmentId, state);
  const base = buildDocumentSheet(shipmentId, 'l2', { state });
  return {
    demo:true,
    marker:MARKER,
    type:'cover',
    title:'Deckblatt',
    reference:manifest.reference,
    customer:manifest.customer,
    location:manifest.location,
    status:manifest.status,
    shipment:base.shipment,
    summary:base.summary,
    totalPages:manifest.totalPages,
    releaseState:manifest.releaseState,
    warnings:[...manifest.warnings],
    contents:manifest.pages.slice(1).map(page => ({ key:page.key, label:page.label, status:page.status }))
  };
}

function renderCoverHtml(cover) {
  const warningHtml = cover.warnings.length
    ? `<div class="bundle-cover-warning"><strong>Handlungsbedarf</strong>${cover.warnings.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>`
    : '<div class="bundle-cover-ready"><strong>Dokumentenpaket vollständig</strong><span>Keine offenen Pflichtunterlagen in dieser Demo-Sendung.</span></div>';
  return `<article class="doc-output-sheet bundle-cover-sheet" data-document-type="cover">
    <div class="doc-output-watermark">${MARKER}</div>
    <header class="doc-output-sheet-head"><div class="doc-output-brand"><span>EH</span><div><strong>ExportHUB Professional</strong><small>Rheinwerk Industrial Solutions GmbH</small></div></div><div class="doc-output-doc-title"><small>${MARKER}</small><h3>Gesamtausgabe</h3><span class="doc-output-state ${cover.warnings.length ? 'missing' : 'ok'}">${escapeHtml(cover.releaseState)}</span></div></header>
    <section class="bundle-cover-hero"><span>Deckblatt</span><h2>${escapeHtml(cover.reference)}</h2><p>${escapeHtml(cover.customer.name)} · ${escapeHtml(cover.location.city)} · ${escapeHtml(cover.location.country)}</p></section>
    <div class="bundle-cover-facts"><div><small>Kundennummer</small><strong>${escapeHtml(cover.customer.number || 'DEMO')}</strong></div><div><small>Status</small><strong>${escapeHtml(cover.status)}</strong></div><div><small>Geplante Abholung</small><strong>${escapeHtml(cover.shipment.plannedPickup)}</strong></div><div><small>Seiten im Paket</small><strong>${cover.totalPages}</strong></div><div><small>Colli</small><strong>${cover.summary.totalQuantity}</strong></div><div><small>Gewicht</small><strong>${Number(cover.summary.totalWeightKg || 0).toLocaleString('de-DE')} kg</strong></div></div>
    ${warningHtml}
    <section class="bundle-cover-contents"><header><span>INHALT DER GESAMTAUSGABE</span><strong>${cover.totalPages - 1} Dokumentseiten</strong></header>${cover.contents.map((item,index) => `<div><i>${String(index + 2).padStart(2,'0')}</i><span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.status)}</small></span><b class="${item.status === 'Fehlt' ? 'missing' : 'ok'}">${item.status === 'Fehlt' ? '!' : '✓'}</b></div>`).join('')}</section>
    <footer class="doc-output-sheet-foot"><span>ExportHUB Professional · Präsentationsmuster</span><strong>${MARKER}</strong><span>Seite 1 / ${cover.totalPages}</span></footer>
  </article>`;
}

function withBundlePageNumber(html, page, total) {
  return html.replace(/Seite 1 \/ 1/g, `Seite ${page} / ${total}`);
}

export function renderShipmentBundleHtml(manifest, state) {
  if (!manifest || manifest.demo !== true || !Array.isArray(manifest.pages)) throw new Error('DEMO_GESAMTAUSGABE_UNGUELTIG');
  const cover = buildShipmentBundleCover(manifest.shipmentId, state);
  return `<div class="document-bundle-document" data-bundle-reference="${escapeHtml(manifest.reference)}"><div class="bundle-document-heading"><span>${MARKER}</span><strong>Gesamtausgabe · ${escapeHtml(manifest.reference)}</strong><small>${manifest.totalPages} Seiten</small></div>${manifest.pages.map((page,index) => {
    const pageNumber = index + 1;
    const content = page.type === 'cover'
      ? renderCoverHtml(cover)
      : renderDocumentSheetHtml(buildDocumentSheet(manifest.shipmentId, page.type, { state, copy:page.copy || 1 }));
    return `<section class="document-bundle-page" data-bundle-page="${pageNumber}" data-bundle-key="${escapeHtml(page.key)}">${withBundlePageNumber(content,pageNumber,manifest.totalPages)}</section>`;
  }).join('')}</div>`;
}

function ensureStylesheet() {
  if (document.getElementById('documentBundleStyles')) return;
  const link = document.createElement('link');
  link.id = 'documentBundleStyles';
  link.rel = 'stylesheet';
  link.href = './demo-document-bundle.css';
  document.head.append(link);
}

function ensureHost() {
  let drawer = document.getElementById('documentBundleDrawer');
  if (drawer) return drawer;
  document.body.insertAdjacentHTML('beforeend', `<div class="document-bundle-backdrop" id="documentBundleDrawer" hidden><aside class="document-bundle-panel" id="documentBundlePanel" role="dialog" aria-modal="true" aria-label="Gesamtausgabe"><header class="document-bundle-toolbar"><div><span>DEMO / MUSTER</span><h3 id="documentBundleTitle">Gesamtausgabe</h3><small id="documentBundleMeta"></small></div><div><button type="button" id="documentBundlePrintBtn">Gesamtausgabe drucken</button><button type="button" id="documentBundleDownloadBtn">Muster herunterladen</button><button type="button" class="document-bundle-close" id="documentBundleCloseBtn" aria-label="Gesamtausgabe schließen">×</button></div></header><main class="document-bundle-paper" id="documentBundlePaper"></main></aside></div>`);
  return document.getElementById('documentBundleDrawer');
}

function collectPrintableCss() {
  if (typeof document === 'undefined') return '';
  return [...document.styleSheets].map(sheet => {
    try { return [...sheet.cssRules].map(rule => rule.cssText).join('\n'); }
    catch { return ''; }
  }).join('\n');
}

function standaloneHtml(manifest, body, css) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(manifest.reference)} · Gesamtausgabe · DEMO</title><style>${css}</style></head><body class="bundle-standalone">${body}</body></html>`;
}

function downloadBundle(manifest, state) {
  const body = renderShipmentBundleHtml(manifest, state);
  const blob = new Blob([standaloneHtml(manifest, body, collectPrintableCss())], { type:'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = buildShipmentBundleFilename({ reference:manifest.reference, customerName:manifest.customer.name });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function initDocumentBundle({ getState } = {}) {
  if (typeof document === 'undefined' || typeof getState !== 'function') return { open(){}, close(){}, refresh(){} };
  ensureStylesheet();
  const drawer = ensureHost();
  const paper = document.getElementById('documentBundlePaper');
  const title = document.getElementById('documentBundleTitle');
  const meta = document.getElementById('documentBundleMeta');
  let activeShipmentId = null;
  let activeManifest = null;

  const close = () => {
    drawer.hidden = true;
    document.body.classList.remove('document-bundle-open','document-bundle-printing');
  };

  const render = () => {
    if (!activeShipmentId) return;
    const state = getState();
    activeManifest = buildShipmentBundleManifest(activeShipmentId, state);
    paper.innerHTML = renderShipmentBundleHtml(activeManifest, state);
    title.textContent = `Gesamtausgabe · ${activeManifest.reference}`;
    meta.textContent = `${activeManifest.customer.name} · ${activeManifest.totalPages} Seiten · ${activeManifest.releaseState}`;
  };

  const open = shipmentId => {
    activeShipmentId = shipmentId;
    render();
    drawer.hidden = false;
    document.body.classList.add('document-bundle-open');
  };

  document.getElementById('documentBundleCloseBtn')?.addEventListener('click', close);
  drawer.addEventListener('click', event => { if (event.target === drawer) close(); });
  document.getElementById('documentBundlePrintBtn')?.addEventListener('click', () => {
    if (!activeManifest) return;
    document.body.classList.add('document-bundle-printing');
    window.print();
    document.body.classList.remove('document-bundle-printing');
  });
  document.getElementById('documentBundleDownloadBtn')?.addEventListener('click', () => {
    if (!activeManifest) return;
    downloadBundle(activeManifest, getState());
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !drawer.hidden) close(); });

  return { open, close, refresh:render };
}
