import { DEMO_TODAY, CUSTOMER_BY_ID, LOCATION_BY_ID } from './demo-data.js';
import { getState, updateShipment, transitionShipment, setDocumentState } from './demo-store.js';

const PICKUP_TIME = `${DEMO_TODAY}T14:20:00`;
const POD_TIME = `${DEMO_TODAY}T15:05:00`;
const podEvidenceByShipment = new Map();

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

function requireShipment(id) {
  const shipment = getState().shipments.find(item => item.id === id && item.demo === true);
  if (!shipment) throw new Error('DEMO_SENDUNG_NICHT_GEFUNDEN');
  return shipment;
}

function demoPin(reference) {
  const digits = String(reference || '').replace(/\D/g, '');
  return digits.slice(-4).padStart(4, '0');
}

function physicalColli(shipment) {
  if (Array.isArray(shipment.colli) && shipment.colli.length) {
    return shipment.colli.reduce((sum, row) => sum + Math.max(0, Number(row.quantity) || 0), 0);
  }
  const match = String(shipment.packages || '').match(/\d+/);
  return Math.max(0, Number(match?.[0] || 0));
}

function formatDateTime(value) {
  if (!value) return '–';
  const [date, time = ''] = String(value).split('T');
  const [year, month, day] = date.split('-');
  return `${day}.${month}.${year}${time ? ` · ${time.slice(0, 5)} Uhr` : ''}`;
}

function errorText(error) {
  const code = String(error?.message || error);
  const messages = {
    PIN_UNGUELTIG: 'Der eingegebene DEMO-Verlade-PIN ist nicht korrekt.',
    COLLI_ABWEICHUNG: 'Die bestätigte Colli-Anzahl stimmt nicht mit der Sendung überein.',
    ABHOLUNG_BEREITS_BESTAETIGT: 'Die Abholung wurde bereits bestätigt.',
    ABHOLUNG_NICHT_BEREIT: 'Diese Sendung ist noch nicht zur Abholung freigegeben.',
    POD_VOR_ABHOLUNG: 'Ein POD kann erst nach bestätigter Abholung ergänzt werden.',
    POD_BEREITS_VORHANDEN: 'Für diese Sendung ist der POD-Schritt bereits abgeschlossen.'
  };
  return messages[code] || code;
}

export function buildDemoPickupSession(shipmentId) {
  const shipment = requireShipment(shipmentId);
  const customer = CUSTOMER_BY_ID[shipment.customerId];
  const location = LOCATION_BY_ID[shipment.locationId];
  return {
    demo: true,
    shipmentId: shipment.id,
    shipmentReference: shipment.reference,
    reference: `DEMO-PICKUP-${shipment.reference}`,
    previewTarget: `#demo-pickup/${shipment.reference}`,
    pin: demoPin(shipment.reference),
    expectedColli: physicalColli(shipment),
    status: shipment.status,
    customer: customer?.name || 'Demo-Kunde',
    destination: shipment.destination,
    location: location?.label || 'Demo-Standort',
    plannedPickup: shipment.plannedPickup,
    actualPickup: shipment.actualPickup,
    packages: shipment.packages,
    weightKg: shipment.weightKg
  };
}

export function confirmDemoPickup(shipmentId, input = {}) {
  const shipment = requireShipment(shipmentId);
  if (['Abgeholt', 'POD vorhanden', 'Abgeschlossen', 'Archiviert'].includes(shipment.status)) {
    throw new Error('ABHOLUNG_BEREITS_BESTAETIGT');
  }
  if (shipment.status !== 'Bereit zur Abholung') throw new Error('ABHOLUNG_NICHT_BEREIT');

  const session = buildDemoPickupSession(shipmentId);
  if (String(input.pin || '').trim() !== session.pin) throw new Error('PIN_UNGUELTIG');
  if (Number(input.colli) !== session.expectedColli) throw new Error('COLLI_ABWEICHUNG');

  const driverName = String(input.driverName || '').trim() || 'Demo Fahrer';
  updateShipment(shipmentId, {
    pickup: {
      demo: true,
      reference: session.reference,
      previewTarget: session.previewTarget,
      driverName,
      colli: session.expectedColli,
      confirmedAt: PICKUP_TIME
    }
  });
  return transitionShipment(shipmentId, 'Abgeholt');
}

export function addDemoPod(shipmentId, input = {}) {
  const shipment = requireShipment(shipmentId);
  if (!['Abgeholt', 'POD vorhanden', 'Abgeschlossen', 'Archiviert'].includes(shipment.status)) {
    throw new Error('POD_VOR_ABHOLUNG');
  }
  if (shipment.status !== 'Abgeholt') throw new Error('POD_BEREITS_VORHANDEN');

  const pod = {
    demo: true,
    reference: `DEMO-POD-${shipment.reference}`,
    receivedBy: String(input.receivedBy || '').trim() || 'Demo Lager',
    receivedAt: POD_TIME
  };
  setDocumentState(shipmentId, 'pod', true);
  const result = transitionShipment(shipmentId, 'POD vorhanden');
  podEvidenceByShipment.set(shipmentId, pod);
  result.pickup = { ...(result.pickup || {}), pod };
  return result;
}

function renderReady(session) {
  return `<div class="demo-pickup-layout">
    <section class="demo-pickup-handoff">
      <span class="demo-pickup-kicker">INTERNE ÜBERGABE · DEMO / MUSTER</span>
      <h3>QR-Abholung vorbereiten</h3>
      <p>Die L1-Ausgabe führt in der echten Lösung zur geschützten Abholansicht. In dieser Firmen-Demo wird der Scan lokal nachgestellt.</p>
      <div class="demo-qr-card" aria-label="Nicht funktionsfähiger Demo QR-Code">
        <div class="demo-qr-pattern" aria-hidden="true"></div>
        <div><small>DEMO-QR · NICHT SCANNEN</small><strong>${escapeHtml(session.shipmentReference)}</strong><span>${escapeHtml(session.previewTarget)}</span></div>
      </div>
      <div class="demo-pickup-pin"><small>Präsentations-PIN</small><strong>${escapeHtml(session.pin)}</strong><span>Nur für diese lokale Demo-Sendung</span></div>
    </section>
    <section class="demo-pickup-external">
      <div class="demo-external-head"><span>EXTERNE ABHOLANSICHT</span><b>DEMO / MUSTER</b></div>
      <h3>Abholung ${escapeHtml(session.shipmentReference)}</h3>
      <p>${escapeHtml(session.customer)} → ${escapeHtml(session.destination)}</p>
      <div class="demo-pickup-facts">
        <div><small>Colli laut Versand</small><strong>${session.expectedColli}</strong></div>
        <div><small>Gewicht</small><strong>${escapeHtml(session.weightKg)} kg</strong></div>
        <div><small>Abholtag</small><strong>${escapeHtml(formatDateTime(session.plannedPickup))}</strong></div>
      </div>
      <form id="demoPickupConfirmForm" class="demo-pickup-form">
        <label><span>Fahrer / Abholer</span><input name="driverName" value="Demo Fahrer" autocomplete="off"></label>
        <label><span>4-stelliger Verlade-PIN</span><input name="pin" inputmode="numeric" maxlength="4" placeholder="••••" autocomplete="off"></label>
        <label><span>Physische Colli bestätigt</span><input name="colli" type="number" min="0" step="1" value="${session.expectedColli}"></label>
        <button type="submit">Abholung verbindlich bestätigen</button>
      </form>
      <div class="demo-pickup-safety"><strong>Präsentationsmodus</strong><span>Keine Kamera, kein öffentlicher Link und keine Verbindung zu Produktivdaten.</span></div>
    </section>
  </div>`;
}

function renderCollected(session, shipment) {
  const evidence = shipment.pickup || {};
  return `<div class="demo-pickup-layout">
    <section class="demo-pickup-handoff collected">
      <span class="demo-pickup-kicker">ABHOLUNG BESTÄTIGT · DEMO / MUSTER</span>
      <div class="demo-proof-icon">✓</div>
      <h3>Übergabe nachvollziehbar</h3>
      <div class="demo-evidence-list">
        <div><small>Referenz</small><strong>${escapeHtml(evidence.reference || session.reference)}</strong></div>
        <div><small>Fahrer / Abholer</small><strong>${escapeHtml(evidence.driverName || 'Demo Fahrer')}</strong></div>
        <div><small>Colli</small><strong>${escapeHtml(evidence.colli ?? session.expectedColli)}</strong></div>
        <div><small>Bestätigt</small><strong>${escapeHtml(formatDateTime(evidence.confirmedAt || `${session.actualPickup}T14:20:00`))}</strong></div>
      </div>
      <p>Normale Sendungsdaten sind ab diesem Schritt gesperrt. Offen bleibt nur noch der Nachweisprozess.</p>
    </section>
    <section class="demo-pickup-external">
      <div class="demo-external-head"><span>POD-NACHWEIS</span><b>DEMO / MUSTER</b></div>
      <h3>Proof of Delivery ergänzen</h3>
      <p>Der POD wird bewusst getrennt von der Abholung geführt und schließt die Nachweislücke.</p>
      <form id="demoPodForm" class="demo-pickup-form">
        <label><span>Bestätigt / empfangen durch</span><input name="receivedBy" value="Demo Lager" autocomplete="off"></label>
        <div class="demo-pod-placeholder"><span>POD</span><div><strong>Fiktiver Abliefernachweis</strong><small>In der Produktivlösung würde hier der freigegebene Nachweis hinterlegt.</small></div></div>
        <button type="submit">POD-Nachweis ergänzen</button>
      </form>
    </section>
  </div>`;
}

function renderComplete(session, shipment) {
  const pod = podEvidenceByShipment.get(shipment.id);
  return `<div class="demo-pickup-complete">
    <span class="demo-pickup-kicker">NACHWEISKETTE VOLLSTÄNDIG · DEMO / MUSTER</span>
    <div class="demo-proof-icon">✓</div>
    <h3>Abholung und POD abgeschlossen</h3>
    <p>${escapeHtml(session.shipmentReference)} ist im Demo-Prozess bis zum Nachweis dokumentiert.</p>
    <div class="demo-evidence-list compact">
      <div><small>Status</small><strong>${escapeHtml(shipment.status)}</strong></div>
      <div><small>Abholung</small><strong>${escapeHtml(formatDateTime(shipment.pickup?.confirmedAt || `${shipment.actualPickup || DEMO_TODAY}T14:20:00`))}</strong></div>
      <div><small>POD</small><strong>${pod ? escapeHtml(pod.reference) : 'DEMO-POD vorhanden'}</strong></div>
      <div><small>Produktivdaten</small><strong>Keine Verbindung</strong></div>
    </div>
  </div>`;
}

export function initDemoPickupFlow({ onChange } = {}) {
  const drawer = document.getElementById('demoPickupDrawer');
  const workspace = document.getElementById('demoPickupWorkspace');
  if (!drawer || !workspace) return { open(){}, close(){}, refresh(){} };
  let activeShipmentId = null;

  function close() {
    drawer.hidden = true;
    document.body.classList.remove('demo-pickup-open');
    activeShipmentId = null;
  }

  function render() {
    if (!activeShipmentId) return;
    const shipment = requireShipment(activeShipmentId);
    const session = buildDemoPickupSession(activeShipmentId);
    if (shipment.status === 'Bereit zur Abholung') workspace.innerHTML = renderReady(session);
    else if (shipment.status === 'Abgeholt') workspace.innerHTML = renderCollected(session, shipment);
    else workspace.innerHTML = renderComplete(session, shipment);

    workspace.querySelector('#demoPickupConfirmForm')?.addEventListener('submit', event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      try {
        confirmDemoPickup(activeShipmentId, {
          driverName: form.get('driverName'),
          pin: form.get('pin'),
          colli: form.get('colli')
        });
        onChange?.();
        render();
      } catch (error) {
        showMessage(errorText(error), true);
      }
    }, { once: true });

    workspace.querySelector('#demoPodForm')?.addEventListener('submit', event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      try {
        addDemoPod(activeShipmentId, { receivedBy: form.get('receivedBy') });
        onChange?.();
        render();
      } catch (error) {
        showMessage(errorText(error), true);
      }
    }, { once: true });
  }

  function showMessage(text, isError = false) {
    let target = workspace.querySelector('.demo-pickup-message');
    if (!target) {
      target = document.createElement('div');
      target.className = 'demo-pickup-message';
      workspace.prepend(target);
    }
    target.classList.toggle('error', isError);
    target.textContent = text;
  }

  function open(shipmentId) {
    activeShipmentId = shipmentId;
    render();
    drawer.hidden = false;
    document.body.classList.add('demo-pickup-open');
  }

  drawer.querySelector('[data-demo-pickup-close]')?.addEventListener('click', close);
  drawer.addEventListener('click', event => {
    if (event.target === drawer) close();
  });

  return { open, close, refresh: render };
}