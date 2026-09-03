import { CUSTOMER_BY_ID, EMPLOYEE_BY_ID, LOCATION_BY_ID, getMissingDocuments } from './demo-data.js';
import { getState, setDocumentState, transitionShipment } from './demo-store.js';

const STATUS_ORDER = ['Entwurf','Erstellt','Bereit zur Abholung','Abgeholt','POD vorhanden','Abgeschlossen','Archiviert'];
const DOC_LABELS = { delivery:'Lieferschein', l1:'L1 / QR', l2:'L2', cmr:'CMR', abd:'ABD', pod:'POD' };

const escapeHtml = value => String(value ?? '')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');

function statusClass(status) {
  if (status === 'Bereit zur Abholung') return 'ready';
  if (status === 'Abgeholt' || status === 'POD vorhanden') return 'picked';
  if (status === 'Abgeschlossen' || status === 'Archiviert') return 'done';
  if (status === 'Entwurf') return 'draft';
  return 'active';
}

function formatDate(value) {
  if (!value) return '–';
  const [year,month,day] = value.split('-');
  return `${day}.${month}.${year}`;
}

function currentFilters() {
  return {
    search: document.getElementById('shipmentSearch')?.value.trim().toLowerCase() || '',
    status: document.getElementById('shipmentStatusFilter')?.value || 'all',
    owner: document.getElementById('shipmentOwnerFilter')?.value || 'all',
    region: document.getElementById('shipmentRegionFilter')?.value || 'all',
    attention: Boolean(document.getElementById('shipmentAttentionFilter')?.checked)
  };
}

function filterShipments(shipments, filters) {
  return shipments.filter(shipment => {
    const customer = CUSTOMER_BY_ID[shipment.customerId];
    const owner = EMPLOYEE_BY_ID[shipment.ownerId];
    const haystack = [shipment.reference, customer?.name, shipment.destination, owner?.name, shipment.status].join(' ').toLowerCase();
    if (filters.search && !haystack.includes(filters.search)) return false;
    if (filters.status !== 'all' && shipment.status !== filters.status) return false;
    if (filters.owner !== 'all' && shipment.ownerId !== filters.owner) return false;
    if (filters.region === 'eu' && shipment.nonEu) return false;
    if (filters.region === 'non-eu' && !shipment.nonEu) return false;
    if (filters.attention && !(shipment.attention || getMissingDocuments(shipment).length)) return false;
    return true;
  });
}

function nextAction(shipment) {
  if (shipment.status === 'Entwurf') return { label:'Sendung erstellen', action:'advance' };
  if (shipment.status === 'Erstellt') {
    if (shipment.requiresAbd && shipment.documents?.abd !== true) return { label:'DEMO-ABD hinzufügen', action:'add-abd', warn:true };
    return { label:'Bereit zur Abholung', action:'advance' };
  }
  if (shipment.status === 'Bereit zur Abholung') return { label:'Abholung bestätigen', action:'advance' };
  if (shipment.status === 'Abgeholt') return { label:'DEMO-POD hinzufügen', action:'add-pod' };
  if (shipment.status === 'POD vorhanden') return { label:'Sendung abschließen', action:'advance' };
  if (shipment.status === 'Abgeschlossen') return { label:'Archivieren', action:'advance' };
  return null;
}

function renderList(shipments, selectedId) {
  const list = document.getElementById('shipmentList');
  const meta = document.getElementById('shipmentResultMeta');
  if (!list) return;
  if (meta) meta.textContent = `${shipments.length} Sendungen`;
  if (!shipments.length) {
    list.innerHTML = '<div class="shipment-empty">Keine Demo-Sendung passt zu den gewählten Filtern.</div>';
    return;
  }
  list.innerHTML = shipments.map(shipment => {
    const customer = CUSTOMER_BY_ID[shipment.customerId];
    const missing = getMissingDocuments(shipment);
    const selected = shipment.id === selectedId ? ' selected' : '';
    return `<button type="button" class="shipment-list-card${selected}" data-select-shipment="${escapeHtml(shipment.id)}">
      <div class="shipment-list-main">
        <span class="shipment-priority ${escapeHtml(shipment.priority.toLowerCase())}">${escapeHtml(shipment.priority)}</span>
        <div><strong>${escapeHtml(shipment.reference)}</strong><small>${escapeHtml(customer?.name || 'Demo-Kunde')}</small></div>
      </div>
      <div class="shipment-list-route"><span>${escapeHtml(shipment.destination)}</span><small>Abholung ${formatDate(shipment.plannedPickup)}</small></div>
      <div class="shipment-list-state"><span class="shipment-status ${statusClass(shipment.status)}">${escapeHtml(shipment.status)}</span>${missing.length ? `<small class="missing-note">${missing.length} Dokument${missing.length === 1 ? '' : 'e'} offen</small>` : '<small class="complete-note">Dokumente vollständig</small>'}</div>
    </button>`;
  }).join('');
}

function renderDetail(shipment) {
  const detail = document.getElementById('shipmentDetail');
  if (!detail) return;
  if (!shipment) {
    detail.innerHTML = '<div class="shipment-detail-empty"><span>▣</span><h3>Sendung auswählen</h3><p>Links eine Demo-Sendung öffnen, um Status, Dokumente und nächsten Arbeitsschritt zu sehen.</p></div>';
    return;
  }

  const customer = CUSTOMER_BY_ID[shipment.customerId];
  const location = LOCATION_BY_ID[shipment.locationId];
  const owner = EMPLOYEE_BY_ID[shipment.ownerId];
  const missing = getMissingDocuments(shipment);
  const action = nextAction(shipment);
  const docs = Object.entries(DOC_LABELS).filter(([type]) => type !== 'abd' || shipment.requiresAbd || shipment.documents?.abd).filter(([type]) => type !== 'pod' || ['Abgeholt','POD vorhanden','Abgeschlossen','Archiviert'].includes(shipment.status) || shipment.documents?.pod);

  detail.innerHTML = `<div class="shipment-detail-head">
    <div><span class="eyebrow">SENDUNG</span><div class="shipment-detail-title"><h3>${escapeHtml(shipment.reference)}</h3><span class="shipment-status ${statusClass(shipment.status)}">${escapeHtml(shipment.status)}</span></div><p>${escapeHtml(customer?.name || 'Demo-Kunde')} · ${escapeHtml(shipment.destination)}</p></div>
    <span class="demo-watermark">DEMO / MUSTER</span>
  </div>

  ${shipment.attention ? `<div class="shipment-alert"><strong>Handlungsbedarf</strong><span>${escapeHtml(shipment.attention)}</span></div>` : '<div class="shipment-ok"><strong>Aktuell kein blockierender Hinweis</strong><span>Der nächste Arbeitsschritt kann durchgeführt werden.</span></div>'}

  <div class="shipment-facts">
    <div><small>Kunde</small><strong>${escapeHtml(customer?.name || '–')}</strong></div>
    <div><small>Standort</small><strong>${escapeHtml(location?.label || '–')}</strong><span>${escapeHtml(location?.city || '')} · ${escapeHtml(location?.country || '')}</span></div>
    <div><small>Verantwortlich</small><strong>${escapeHtml(owner?.name || '–')}</strong><span>${escapeHtml(owner?.role || '')}</span></div>
    <div><small>Geplante Abholung</small><strong>${formatDate(shipment.plannedPickup)}</strong><span>${shipment.actualPickup ? `Tatsächlich ${formatDate(shipment.actualPickup)}` : 'Noch nicht abgeholt'}</span></div>
    <div><small>Colli</small><strong>${escapeHtml(shipment.packages)}</strong><span>${escapeHtml(shipment.weightKg)} kg</span></div>
    <div><small>Warenwert</small><strong>${Number(shipment.valueEur).toLocaleString('de-DE')} €</strong><span>${shipment.nonEu ? 'Nicht-EU' : 'EU'}</span></div>
  </div>

  <section class="shipment-detail-section">
    <div class="shipment-section-head"><div><span class="eyebrow">DOKUMENTE</span><h4>Pflichtunterlagen</h4></div><span class="document-progress ${missing.length ? 'warning' : 'complete'}">${missing.length ? `${missing.length} offen` : 'Vollständig'}</span></div>
    <div class="mini-doc-grid">${docs.map(([type,label]) => `<div class="mini-doc ${shipment.documents?.[type] ? 'present' : 'missing'}"><span>${shipment.documents?.[type] ? '✓' : '!'}</span><div><strong>${label}</strong><small>${shipment.documents?.[type] ? 'vorhanden' : 'fehlt'}</small></div></div>`).join('')}</div>
  </section>

  <section class="shipment-detail-section">
    <div class="shipment-section-head"><div><span class="eyebrow">STATUSKETTE</span><h4>Fortschritt</h4></div></div>
    <div class="status-flow">${STATUS_ORDER.map(status => {
      const current = STATUS_ORDER.indexOf(shipment.status);
      const index = STATUS_ORDER.indexOf(status);
      return `<span class="${index < current ? 'passed' : index === current ? 'current' : ''}">${escapeHtml(status)}</span>`;
    }).join('')}</div>
  </section>

  <div class="shipment-detail-actions">
    <div><small>Bearbeitung</small><strong>${['Abgeholt','POD vorhanden','Abgeschlossen','Archiviert'].includes(shipment.status) ? 'Operative Daten gesperrt' : 'Demo-Bearbeitung möglich'}</strong></div>
    ${action ? `<button type="button" class="shipment-primary-action${action.warn ? ' warn' : ''}" data-shipment-action="${action.action}" data-shipment-id="${escapeHtml(shipment.id)}">${escapeHtml(action.label)}</button>` : '<span class="shipment-finished">Vorgang archiviert</span>'}
  </div>`;
}

function populateOwnerFilter() {
  const select = document.getElementById('shipmentOwnerFilter');
  if (!select || select.dataset.ready === 'true') return;
  const state = getState();
  const ownerIds = [...new Set(state.shipments.map(item => item.ownerId))];
  select.innerHTML = '<option value="all">Alle Verantwortlichen</option>' + ownerIds.map(id => `<option value="${escapeHtml(id)}">${escapeHtml(EMPLOYEE_BY_ID[id]?.name || id)}</option>`).join('');
  select.dataset.ready = 'true';
}

export function initShipmentWorkspace({ onChange } = {}) {
  const workspace = document.getElementById('shipmentWorkspace');
  if (!workspace) return { refresh(){} };

  let selectedId = 'sh-001';

  const refresh = () => {
    populateOwnerFilter();
    const state = getState();
    const filtered = filterShipments(state.shipments, currentFilters());
    if (!state.shipments.some(item => item.id === selectedId)) selectedId = filtered[0]?.id || null;
    renderList(filtered, selectedId);
    renderDetail(state.shipments.find(item => item.id === selectedId));
    bindDynamic();
  };

  const mutate = operation => {
    try {
      operation();
      onChange?.();
      refresh();
    } catch (error) {
      const message = String(error?.message || error);
      const target = document.getElementById('shipmentMessage');
      if (target) {
        target.hidden = false;
        target.textContent = message === 'ABD_FEHLT' ? 'ABD fehlt: Die Sendung bleibt gesperrt, bis das Ausfuhrdokument vorhanden ist.' : message;
      }
    }
  };

  const bindDynamic = () => {
    workspace.querySelectorAll('[data-select-shipment]').forEach(button => button.addEventListener('click', () => {
      selectedId = button.dataset.selectShipment;
      refresh();
    }, { once:true }));
    workspace.querySelectorAll('[data-shipment-action]').forEach(button => button.addEventListener('click', () => {
      const id = button.dataset.shipmentId;
      const action = button.dataset.shipmentAction;
      mutate(() => {
        const shipment = getState().shipments.find(item => item.id === id);
        if (!shipment) return;
        if (action === 'add-abd') setDocumentState(id, 'abd', true);
        else if (action === 'add-pod') {
          setDocumentState(id, 'pod', true);
          transitionShipment(id, 'POD vorhanden');
        } else if (action === 'advance') {
          const next = STATUS_ORDER[STATUS_ORDER.indexOf(shipment.status) + 1];
          if (next) transitionShipment(id, next);
        }
      });
    }, { once:true }));
  };

  for (const id of ['shipmentSearch','shipmentStatusFilter','shipmentOwnerFilter','shipmentRegionFilter','shipmentAttentionFilter']) {
    const control = document.getElementById(id);
    const event = control?.tagName === 'INPUT' && control.type === 'text' ? 'input' : 'change';
    control?.addEventListener(event, refresh);
  }

  refresh();
  return { refresh, select(id){ selectedId = id; refresh(); } };
}
