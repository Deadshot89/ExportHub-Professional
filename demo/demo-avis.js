import { CUSTOMER_BY_ID, LOCATION_BY_ID } from './demo-data.js';
import { getState, saveAvis } from './demo-store.js';

function requireShipment(id) {
  const shipment = getState().shipments.find(item => item.id === id);
  if (!shipment || shipment.demo !== true) throw new Error('DEMO_SENDUNG_NICHT_GEFUNDEN');
  return shipment;
}

export function createDemoAvis(shipmentId) {
  const shipment = requireShipment(shipmentId);
  const reference = `DEMO-AVIS-${shipment.reference}`;
  return saveAvis({
    id: `avis-${shipment.id}`,
    reference,
    shipmentId: shipment.id,
    previewTarget: `#demo-avis/${shipment.reference}`,
    createdAt: '2026-09-03T10:00:00',
    status: 'Demo-Vorschau erstellt',
    demo: true
  });
}

function renderAvisPreview(shipment, avis) {
  const customer = CUSTOMER_BY_ID[shipment.customerId];
  const location = LOCATION_BY_ID[shipment.locationId];
  const allowedDocuments = ['Lieferschein', 'L1 / QR', 'L2', ...(shipment.nonEu ? ['CMR'] : [])];
  return `<div class="avis-preview-card">
    <div class="avis-preview-banner">DEMO / MUSTER · EXTERNE KUNDENANSICHT</div>
    <header><div><small>Abholavis</small><h4>${shipment.reference}</h4></div><span>${avis?.status || 'Noch nicht erzeugt'}</span></header>
    <div class="avis-preview-customer"><strong>${customer?.name || 'Demo-Kunde'}</strong><span>${location?.label || 'Demo-Standort'} · ${location?.city || ''} · ${location?.country || ''}</span></div>
    <div class="avis-preview-grid"><div><small>Geplante Abholung</small><strong>${shipment.plannedPickup}</strong></div><div><small>Colli</small><strong>${shipment.packages}</strong></div><div><small>Gewicht</small><strong>${shipment.weightKg} kg</strong></div></div>
    <div class="avis-documents"><small>Für die Demo freigegebene Unterlagen</small>${allowedDocuments.map(label => `<span>✓ ${label}</span>`).join('')}</div>
    <div class="avis-preview-foot"><span>Persönlicher Demo-Verweis</span><code>${avis?.previewTarget || '#demo-avis/vorschau'}</code><small>Nur lokale Vorschau. Kein öffentlicher Token, kein Mailversand.</small></div>
  </div>`;
}

export function initAvisWorkspace({ onChange } = {}) {
  const workspace = document.getElementById('avisWorkspace');
  if (!workspace) return { refresh(){} };
  let selectedId = 'sh-002';

  const refresh = () => {
    const state = getState();
    const eligible = state.shipments.filter(item => !['Entwurf','Archiviert'].includes(item.status));
    if (!eligible.some(item => item.id === selectedId)) selectedId = eligible[0]?.id || null;
    const shipment = eligible.find(item => item.id === selectedId);
    const avis = state.avis.find(item => item.shipmentId === selectedId);

    workspace.innerHTML = `<div class="avis-picker panel"><header class="ops-panel-head"><div><span class="eyebrow">SENDUNG AUSWÄHLEN</span><h3>Kunden-Avis vorbereiten</h3></div><span class="status-chip neutral">lokale Simulation</span></header><div class="avis-shipment-list">${eligible.map(item => `<button type="button" class="avis-shipment-option ${item.id === selectedId ? 'active' : ''}" data-avis-select="${item.id}"><div><strong>${item.reference}</strong><small>${CUSTOMER_BY_ID[item.customerId]?.name || 'Demo-Kunde'}</small></div><span>${item.avis}</span></button>`).join('')}</div></div><div class="avis-preview panel">${shipment ? renderAvisPreview(shipment, avis) : '<div class="shipment-empty">Keine passende Demo-Sendung.</div>'}${shipment ? `<div class="avis-actions"><div><small>Sicherheitsmodus</small><strong>Kein echter Link · keine E-Mail · keine Produktivdaten</strong></div><button type="button" class="shipment-primary-action" data-create-avis="${shipment.id}">${avis ? 'Demo-Avis aktualisieren' : 'Demo-Avis erzeugen'}</button></div>` : ''}</div>`;

    workspace.querySelectorAll('[data-avis-select]').forEach(button => button.addEventListener('click', () => { selectedId = button.dataset.avisSelect; refresh(); }));
    workspace.querySelector('[data-create-avis]')?.addEventListener('click', () => {
      createDemoAvis(shipment.id);
      onChange?.();
      refresh();
    });
  };

  refresh();
  return { refresh };
}
