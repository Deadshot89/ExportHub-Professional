import { CUSTOMER_BY_ID, requiredDocumentTypes } from './demo-data.js';
import { getState } from './demo-store.js';
import { initDocumentOutput } from './demo-document-output.js';
import { initDocumentBundle } from './demo-document-bundle.js';

export const DOCUMENT_LABELS = Object.freeze({
  delivery: 'Lieferschein',
  l1: 'L1 / QR',
  l2: 'L2',
  cmr: 'CMR',
  abd: 'ABD',
  pod: 'POD'
});

export const DOCUMENT_DESCRIPTIONS = Object.freeze({
  delivery: 'Waren- und Liefernachweis zur Sendung.',
  l1: 'Interne L1-Ausgabe mit QR-Code für Abholung und Verladung.',
  l2: 'Interne L2-Ausgabe als Versand-/Speditionsunterlage.',
  cmr: 'CMR-Frachtbrief für grenzüberschreitende Straßentransporte.',
  abd: 'Ausfuhrbegleitdokument für ausfuhrpflichtige Nicht-EU-Sendungen.',
  pod: 'Proof of Delivery als Zustell- bzw. Abliefernachweis nach der Abholung.'
});

function requireShipment(id) {
  const shipment = getState().shipments.find(item => item.id === id);
  if (!shipment || shipment.demo !== true) throw new Error('DEMO_SENDUNG_NICHT_GEFUNDEN');
  return shipment;
}

export function getDocumentChecklist(shipmentId) {
  const shipment = requireShipment(shipmentId);
  const required = new Set(requiredDocumentTypes(shipment));
  return Object.entries(DOCUMENT_LABELS).map(([type, label]) => ({
    type,
    label,
    description: DOCUMENT_DESCRIPTIONS[type],
    required: required.has(type),
    present: shipment.documents?.[type] === true,
    demo: true
  })).filter(item => item.required || item.present);
}

export function buildDemoDocumentPreview(shipmentId, documentType) {
  const shipment = requireShipment(shipmentId);
  const label = DOCUMENT_LABELS[documentType];
  if (!label) throw new Error('UNBEKANNTES_DOKUMENT');
  const customer = CUSTOMER_BY_ID[shipment.customerId];
  return [
    'DEMO / MUSTER',
    `ExportHUB Professional · ${label}`,
    `Referenz: ${shipment.reference}`,
    `Kunde: ${customer?.name || 'Demo-Kunde'}`,
    `Ziel: ${shipment.destination}`,
    DOCUMENT_DESCRIPTIONS[documentType],
    'Diese Musterausgabe enthält ausschließlich fiktive Präsentationsdaten.'
  ].join('\n');
}

export function initDocumentWorkspace({ onOpenShipment } = {}) {
  const workspace = document.getElementById('documentWorkspace');
  if (!workspace) return { refresh(){} };
  const documentOutput = initDocumentOutput({ getState });
  const documentBundle = initDocumentBundle({ getState });

  const refresh = () => {
    const state = getState();
    const rows = state.shipments.map(shipment => {
      const checklist = getDocumentChecklist(shipment.id);
      const missing = checklist.filter(item => item.required && !item.present);
      const customer = CUSTOMER_BY_ID[shipment.customerId];
      return { shipment, checklist, missing, customer };
    }).sort((a,b) => b.missing.length - a.missing.length || a.shipment.reference.localeCompare(b.shipment.reference));

    const summary = document.getElementById('documentSummary');
    if (summary) {
      const totalMissing = rows.reduce((sum,row) => sum + row.missing.length,0);
      summary.innerHTML = `<strong>${totalMissing}</strong><span>fehlende Pflichtdokumente in der Demo</span>`;
    }

    workspace.innerHTML = rows.map(({ shipment, checklist, missing, customer }) => `<article class="ops-card document-card ${missing.length ? 'needs-action' : 'complete'}">
      <header><div><span class="ops-ref">${shipment.reference}</span><strong>${customer?.name || 'Demo-Kunde'}</strong><small>${shipment.destination}</small></div><span class="ops-state ${missing.length ? 'warn' : 'good'}">${missing.length ? `${missing.length} offen` : 'Vollständig'}</span></header>
      <div class="document-strip">${checklist.map(item => `<span class="doc-pill ${item.present ? 'present' : 'missing'}" title="${item.required ? 'Pflichtdokument' : 'Optional'}"><b>${item.present ? '✓' : '!'}</b><span class="doc-pill-copy"><strong>${item.label}</strong><small>${item.description}</small></span></span>`).join('')}</div>
      <footer><span>${missing.length ? `Fehlt: ${missing.map(item => item.label).join(', ')}` : 'Alle erforderlichen Unterlagen sind vorhanden.'}</span><div class="document-card-actions"><button type="button" class="document-bundle-btn" data-doc-bundle="${shipment.id}">Gesamtausgabe öffnen</button><button type="button" class="document-package-btn" data-doc-package="${shipment.id}">Dokumentpaket öffnen</button><button type="button" data-doc-open="${shipment.id}">Sendung öffnen →</button></div></footer>
    </article>`).join('');

    workspace.querySelectorAll('[data-doc-bundle]').forEach(button => button.addEventListener('click', () => documentBundle.open(button.dataset.docBundle)));
    workspace.querySelectorAll('[data-doc-package]').forEach(button => button.addEventListener('click', () => documentOutput.open(button.dataset.docPackage)));
    workspace.querySelectorAll('[data-doc-open]').forEach(button => button.addEventListener('click', () => onOpenShipment?.(button.dataset.docOpen)));
  };

  refresh();
  return { refresh };
}
