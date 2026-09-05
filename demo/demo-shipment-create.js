const PALLET_PATTERN = /palette/i;
const EU_COUNTRIES = new Set(['AT','BE','BG','HR','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK']);

const escapeHtml = value => String(value ?? '')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');

const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const round2 = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function isValidReference(reference) {
  return /^[A-Z0-9]{6}$/.test(String(reference || '').trim());
}

export function isNonEuCountry(country) {
  return Boolean(country) && !EU_COUNTRIES.has(String(country).toUpperCase());
}

export function calculateColliSummary(rows = []) {
  const normalized = rows.map((row, index) => {
    const quantity = Math.max(0, Math.trunc(number(row.quantity)));
    const weightKg = Math.max(0, number(row.weightKg));
    const packaging = String(row.packaging || 'Colli');
    const ldm = PALLET_PATTERN.test(packaging) ? round2(quantity * 0.20) : 0;
    return {
      index,
      packaging,
      quantity,
      weightKg: round2(weightKg),
      lengthCm: Math.max(0, number(row.lengthCm)),
      widthCm: Math.max(0, number(row.widthCm)),
      heightCm: Math.max(0, number(row.heightCm)),
      ldm
    };
  });
  return {
    rows: normalized,
    totalQuantity: normalized.reduce((sum, row) => sum + row.quantity, 0),
    totalWeightKg: round2(normalized.reduce((sum, row) => sum + row.weightKg, 0)),
    totalLdm: round2(normalized.reduce((sum, row) => sum + row.ldm, 0))
  };
}

export function requiresAbd({ nonEu, valueEur, forwarderRequiresAbd } = {}) {
  return Boolean(nonEu) && (number(valueEur) > 1000 || Boolean(forwarderRequiresAbd));
}

export function buildStowagePlan(rows = []) {
  const blocks = [];
  calculateColliSummary(rows).rows.forEach((row, rowIndex) => {
    if (!PALLET_PATTERN.test(row.packaging)) return;
    for (let unit = 0; unit < row.quantity; unit += 1) {
      blocks.push({
        id: `pallet-${rowIndex + 1}-${unit + 1}`,
        packaging: row.packaging,
        lengthCm: row.lengthCm || 120,
        widthCm: row.widthCm || 80,
        heightCm: row.heightCm || 100,
        sourceRow: rowIndex + 1
      });
    }
  });
  blocks.sort((a, b) => b.heightCm - a.heightCm || a.sourceRow - b.sourceRow);
  return blocks.map((block, index) => ({ ...block, frontOrder: index + 1 }));
}

function nextDemoReference(state) {
  const max = state.shipments.reduce((current, shipment) => {
    const match = /^RWD(\d{3})$/.exec(shipment.reference || '');
    return match ? Math.max(current, Number(match[1])) : current;
  }, 314);
  return `RWD${String(max + 1).padStart(3, '0').slice(-3)}`;
}

function formatDate(value) {
  if (!value) return '–';
  const [year, month, day] = String(value).split('-');
  return day && month && year ? `${day}.${month}.${year}` : value;
}

function defaultModel(state) {
  const customer = state.customers[4] || state.customers[0];
  const location = state.locations.find(item => item.customerId === customer?.id) || state.locations[0];
  return {
    reference: nextDemoReference(state),
    customerId: customer?.id || '',
    locationId: location?.id || '',
    ownerId: state.role.employeeId || 'emp-02',
    plannedPickup: '2026-09-07',
    valueEur: 2500,
    forwarderRequiresAbd: false,
    colli: [
      { packaging:'Europalette', quantity:2, weightKg:760, lengthCm:120, widthCm:80, heightCm:160 }
    ],
    documents: { delivery:true, l1:true, l2:true, cmr:true, abd:false, pod:false }
  };
}

function mailPreview(model, state) {
  const customer = state.customers.find(item => item.id === model.customerId);
  const location = state.locations.find(item => item.id === model.locationId);
  const nonEu = isNonEuCountry(location?.country);
  const abdRequired = requiresAbd({ nonEu, valueEur:model.valueEur, forwarderRequiresAbd:model.forwarderRequiresAbd });
  return `DEMO / MUSTER\nBetreff: Abholung ${model.reference} · ${customer?.name || 'Demo-Kunde'}\n\nGuten Tag,\n\nfür die Demo-Sendung ${model.reference} nach ${location?.city || 'Demo-Ziel'} (${location?.country || '–'}) ist die Abholung am ${formatDate(model.plannedPickup)} geplant.\n\nColli und Verladeinformationen sind im ExportHUB-Arbeitsbereich vorbereitet.\nABD-Status: ${abdRequired ? (model.documents.abd ? 'vorhanden' : 'erforderlich / offen') : 'nicht erforderlich'}.\n\nDiese Mail wird ausschließlich lokal als DEMO / MUSTER angezeigt und nicht versendet.`;
}

export function initShipmentCreator({ getState, createShipment, canCreate = () => true, onCreated, onClose } = {}) {
  const drawer = typeof document !== 'undefined' ? document.getElementById('shipmentCreateDrawer') : null;
  const trigger = typeof document !== 'undefined' ? document.getElementById('shipmentCreateBtn') : null;
  const host = typeof document !== 'undefined' ? document.getElementById('shipmentCreateForm') : null;
  if (!drawer || !trigger || !host || typeof getState !== 'function' || typeof createShipment !== 'function') {
    return { open(){}, close(){}, refreshRole(){} };
  }

  let model = defaultModel(getState());

  const close = () => {
    drawer.hidden = true;
    drawer.classList.remove('open');
    onClose?.();
  };

  const locationOptions = state => state.locations
    .filter(item => item.customerId === model.customerId)
    .map(item => `<option value="${escapeHtml(item.id)}"${item.id === model.locationId ? ' selected' : ''}>${escapeHtml(item.label)} · ${escapeHtml(item.city)} · ${escapeHtml(item.country)}</option>`)
    .join('');

  const ownerOptions = state => state.employees
    .filter(item => item.role !== 'Auditor')
    .map(item => `<option value="${escapeHtml(item.id)}"${item.id === model.ownerId ? ' selected' : ''}>${escapeHtml(item.name)} · ${escapeHtml(item.role)}</option>`)
    .join('');

  const customerOptions = state => state.customers
    .map(item => `<option value="${escapeHtml(item.id)}"${item.id === model.customerId ? ' selected' : ''}>${escapeHtml(item.number)} · ${escapeHtml(item.name)}</option>`)
    .join('');

  const colliRowsHtml = () => calculateColliSummary(model.colli).rows.map((row, index) => `<article class="colli-create-row" data-colli-row="${index}">
    <div class="colli-create-row-top">
      <label><span>Verpackung</span><select data-colli-field="packaging" data-colli-index="${index}"><option${row.packaging === 'Europalette' ? ' selected' : ''}>Europalette</option><option${row.packaging === 'Plastic Palette' ? ' selected' : ''}>Plastic Palette</option><option${row.packaging === 'Karton' ? ' selected' : ''}>Karton</option><option${row.packaging === 'Paket' ? ' selected' : ''}>Paket</option><option${row.packaging === 'Sonstiges' ? ' selected' : ''}>Sonstiges</option></select></label>
      <button type="button" class="colli-remove" data-remove-colli="${index}"${model.colli.length === 1 ? ' disabled' : ''}>Zeile löschen</button>
    </div>
    <div class="colli-create-row-mid">
      <label><span>Anzahl</span><input type="number" min="1" step="1" value="${row.quantity || 1}" data-colli-field="quantity" data-colli-index="${index}"></label>
      <label><span>Gewicht kg</span><input type="number" min="0" step="1" value="${row.weightKg}" data-colli-field="weightKg" data-colli-index="${index}"></label>
      <label><span>LDM</span><output data-colli-ldm="${index}">${row.ldm.toFixed(2)}</output></label>
    </div>
    <div class="colli-create-row-dims">
      <label><span>L cm</span><input type="number" min="0" step="1" value="${row.lengthCm}" data-colli-field="lengthCm" data-colli-index="${index}"></label>
      <label><span>B cm</span><input type="number" min="0" step="1" value="${row.widthCm}" data-colli-field="widthCm" data-colli-index="${index}"></label>
      <label><span>H cm</span><input type="number" min="0" step="1" value="${row.heightCm}" data-colli-field="heightCm" data-colli-index="${index}"></label>
    </div>
  </article>`).join('');

  const render = () => {
    const state = getState();
    const allowedLocations = state.locations.filter(item => item.customerId === model.customerId);
    if (!allowedLocations.some(item => item.id === model.locationId)) model.locationId = allowedLocations[0]?.id || '';
    host.innerHTML = `<form class="shipment-create-form" aria-label="Neue Demo-Sendung">
      <header class="shipment-create-head"><div><span class="eyebrow">NEUE DEMO-SENDUNG</span><h3>Sendung vollständig vorbereiten</h3><p>Alle Eingaben bleiben lokal in dieser Firmen-Demo.</p></div><div><span class="demo-watermark">DEMO / MUSTER</span><button type="button" class="shipment-create-close" aria-label="Erstellung schließen">×</button></div></header>

      <section class="shipment-create-section"><div class="shipment-create-section-title"><i>1</i><div><strong>Kunde & Standort</strong><span>Lieferziel eindeutig dem Kunden zuordnen.</span></div></div><div class="shipment-create-grid two"><label><span>Kunde</span><select name="customerId">${customerOptions(state)}</select></label><label><span>Lieferstandort</span><select name="locationId">${locationOptions(state)}</select></label></div><div class="shipment-create-context" id="shipmentCreateDestination"></div></section>

      <section class="shipment-create-section"><div class="shipment-create-section-title"><i>2</i><div><strong>Sendungsdaten</strong><span>Referenz, Abholdatum, Verantwortung und Warenwert.</span></div></div><div class="shipment-create-grid four"><label><span>Referenz</span><input name="reference" maxlength="6" value="${escapeHtml(model.reference)}"></label><label><span>Geplante Abholung</span><input type="date" name="plannedPickup" value="${escapeHtml(model.plannedPickup)}"></label><label><span>Verantwortlich</span><select name="ownerId">${ownerOptions(state)}</select></label><label><span>Warenwert EUR</span><input type="number" min="0" step="1" name="valueEur" value="${model.valueEur}"></label></div></section>

      <section class="shipment-create-section"><div class="shipment-create-section-title"><i>3</i><div><strong>Colli & LDM</strong><span>Verpackung, physische Anzahl, Gewicht und Maße bleiben sichtbar.</span></div><button type="button" class="colli-add" data-add-colli>+ Colli-Zeile</button></div><div class="colli-create-list">${colliRowsHtml()}</div><div class="colli-create-summary" id="shipmentCreateColliSummary"></div></section>

      <section class="shipment-create-section"><div class="shipment-create-section-title"><i>4</i><div><strong>Dokumente & ABD</strong><span>Pflichtunterlagen und Ausfuhrstatus vor der Freigabe erkennen.</span></div></div><div class="shipment-create-docs"><label><input type="checkbox" data-create-doc="delivery"${model.documents.delivery ? ' checked' : ''}><span>Lieferschein</span></label><label><input type="checkbox" data-create-doc="l1"${model.documents.l1 ? ' checked' : ''}><span>L1 / QR</span></label><label><input type="checkbox" data-create-doc="l2"${model.documents.l2 ? ' checked' : ''}><span>L2</span></label><label><input type="checkbox" data-create-doc="cmr"${model.documents.cmr ? ' checked' : ''}><span>CMR</span></label><label><input type="checkbox" data-create-doc="abd"${model.documents.abd ? ' checked' : ''}><span>ABD</span></label></div><label class="forwarder-abd"><input type="checkbox" name="forwarderRequiresAbd"${model.forwarderRequiresAbd ? ' checked' : ''}><span>Spedition verlangt ABD unabhängig vom Warenwert</span></label><div class="shipment-create-abd" id="shipmentCreateAbd"></div></section>

      <section class="shipment-create-section"><div class="shipment-create-section-title"><i>5</i><div><strong>Stauplan</strong><span>Illustrative Ladefolge aus denselben Colli-Daten; hohe Paletten zuerst Richtung Fahrerhaus.</span></div></div><div class="stowage-create" id="shipmentCreateStowage"></div></section>

      <section class="shipment-create-section"><div class="shipment-create-section-title"><i>6</i><div><strong>Mailvorschau</strong><span>Geschäftliche Übergabe sichtbar machen – ohne echten Versand.</span></div></div><pre class="shipment-create-mail" id="shipmentCreateMail"></pre></section>

      <footer class="shipment-create-footer"><div><strong>Nur lokale Demo-Speicherung</strong><span>Die neue Sendung erscheint als Entwurf in der bestehenden Arbeitsliste.</span></div><button type="submit">Demo-Sendung anlegen</button></footer>
    </form>`;
    bind();
    syncPreview();
  };

  const readModel = () => {
    const form = host.querySelector('form');
    if (!form) return;
    model.reference = String(form.elements.reference?.value || '').trim().toUpperCase();
    model.customerId = String(form.elements.customerId?.value || '');
    model.locationId = String(form.elements.locationId?.value || '');
    model.ownerId = String(form.elements.ownerId?.value || '');
    model.plannedPickup = String(form.elements.plannedPickup?.value || '');
    model.valueEur = number(form.elements.valueEur?.value);
    model.forwarderRequiresAbd = Boolean(form.elements.forwarderRequiresAbd?.checked);
    host.querySelectorAll('[data-create-doc]').forEach(input => { model.documents[input.dataset.createDoc] = input.checked; });
    host.querySelectorAll('[data-colli-field]').forEach(input => {
      const index = Number(input.dataset.colliIndex);
      const field = input.dataset.colliField;
      if (!model.colli[index]) return;
      model.colli[index][field] = field === 'packaging' ? input.value : number(input.value);
    });
  };

  const syncPreview = () => {
    readModel();
    const state = getState();
    const location = state.locations.find(item => item.id === model.locationId);
    const customer = state.customers.find(item => item.id === model.customerId);
    const nonEu = isNonEuCountry(location?.country);
    const abdRequired = requiresAbd({ nonEu, valueEur:model.valueEur, forwarderRequiresAbd:model.forwarderRequiresAbd });
    const summary = calculateColliSummary(model.colli);
    const blocks = buildStowagePlan(model.colli);

    summary.rows.forEach((row, index) => {
      const output = host.querySelector(`[data-colli-ldm="${index}"]`);
      if (output) output.textContent = row.ldm.toFixed(2);
    });
    const summaryTarget = host.querySelector('#shipmentCreateColliSummary');
    if (summaryTarget) summaryTarget.innerHTML = `<div><small>Physische Colli</small><strong>${summary.totalQuantity}</strong></div><div><small>Gesamtgewicht</small><strong>${summary.totalWeightKg.toLocaleString('de-DE')} kg</strong></div><div><small>Gesamt-LDM</small><strong>${summary.totalLdm.toFixed(2)}</strong></div>`;

    const destination = host.querySelector('#shipmentCreateDestination');
    if (destination) destination.innerHTML = `<span>${nonEu ? 'Nicht-EU · Exportrelevant' : 'EU-Ziel'}</span><strong>${escapeHtml(customer?.name || 'Demo-Kunde')} → ${escapeHtml(location?.city || 'Demo-Ziel')} · ${escapeHtml(location?.country || '–')}</strong>`;

    const abd = host.querySelector('#shipmentCreateAbd');
    if (abd) abd.innerHTML = abdRequired
      ? `<strong class="warn">ABD erforderlich</strong><span>${model.documents.abd ? 'Ausfuhrbegleitdokument ist als vorhanden markiert.' : 'Fehlt das ABD, bleibt die spätere Freigabe „Bereit zur Abholung“ gesperrt.'}</span>`
      : '<strong class="good">Kein ABD erforderlich</strong><span>Für diese Demo-Konstellation greift keine ABD-Pflicht.</span>';

    const stowage = host.querySelector('#shipmentCreateStowage');
    if (stowage) stowage.innerHTML = `<div class="stowage-cab"><span>Fahrerhaus</span></div><div class="stowage-bed">${blocks.length ? blocks.map((block, index) => `<i class="stowage-block height-${block.heightCm >= 160 ? 'high' : block.heightCm >= 120 ? 'medium' : 'low'}" title="${escapeHtml(block.packaging)} · ${block.heightCm} cm · Position ${index + 1}"></i>`).join('') : '<span class="stowage-empty">Keine Paletten in den Colli-Daten</span>'}</div><div class="stowage-legend"><span><i class="legend-high"></i>hoch · vorne</span><span><i class="legend-medium"></i>mittel</span><span><i class="legend-low"></i>niedrig</span><strong>${blocks.length} Palette${blocks.length === 1 ? '' : 'n'}</strong></div>`;

    const mail = host.querySelector('#shipmentCreateMail');
    if (mail) mail.textContent = mailPreview(model, state);
  };

  const bind = () => {
    const form = host.querySelector('form');
    host.querySelector('.shipment-create-close')?.addEventListener('click', close);
    form?.elements.customerId?.addEventListener('change', () => {
      readModel();
      const state = getState();
      model.locationId = state.locations.find(item => item.customerId === model.customerId)?.id || '';
      render();
    });
    form?.addEventListener('input', event => {
      if (event.target?.name === 'reference') event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      syncPreview();
    });
    form?.addEventListener('change', syncPreview);
    host.querySelector('[data-add-colli]')?.addEventListener('click', () => {
      readModel();
      model.colli.push({ packaging:'Europalette', quantity:1, weightKg:300, lengthCm:120, widthCm:80, heightCm:120 });
      render();
    });
    host.querySelectorAll('[data-remove-colli]').forEach(button => button.addEventListener('click', () => {
      if (model.colli.length === 1) return;
      readModel();
      model.colli.splice(Number(button.dataset.removeColli), 1);
      render();
    }));
    form?.addEventListener('submit', event => {
      event.preventDefault();
      readModel();
      try {
        const created = createShipment(model);
        close();
        model = defaultModel(getState());
        onCreated?.(created);
      } catch (error) {
        const target = document.getElementById('shipmentMessage');
        if (target) {
          target.hidden = false;
          const code = String(error?.message || error);
          const messages = {
            UNGUELTIGE_REFERENZ:'Referenz muss genau 6 Zeichen aus A–Z und 0–9 enthalten.',
            REFERENZ_VERGEBEN:'Diese Demo-Referenz ist bereits vergeben.',
            STANDORT_GEHOERT_NICHT_ZUM_KUNDEN:'Der gewählte Standort gehört nicht zum gewählten Kunden.',
            COLLI_FEHLEN:'Mindestens eine vollständige Colli-Zeile ist erforderlich.'
          };
          target.textContent = messages[code] || code;
        }
      }
    });
  };

  const open = () => {
    if (!canCreate()) return;
    model = defaultModel(getState());
    drawer.hidden = false;
    drawer.classList.add('open');
    render();
  };

  trigger.addEventListener('click', open);

  const refreshRole = () => {
    const allowed = Boolean(canCreate());
    trigger.hidden = !allowed;
    trigger.disabled = !allowed;
    if (!allowed && !drawer.hidden) close();
  };

  refreshRole();
  return { open, close, refreshRole };
}
