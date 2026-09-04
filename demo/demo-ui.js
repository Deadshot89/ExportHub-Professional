import {
  DEMO_ACTIVITIES,
  DEMO_TODAY,
  CUSTOMER_BY_ID,
  EMPLOYEE_BY_ID,
  getMissingDocuments
} from './demo-data.js';
import {
  getState,
  reset as resetDemoStore,
  completeTask,
  setRole,
  canRole,
  DEMO_ROLE_CAPABILITIES
} from './demo-store.js';
import { initShipmentWorkspace } from './demo-shipments.js';
import { initDocumentWorkspace } from './demo-documents.js';
import { initAvisWorkspace } from './demo-avis.js';
import { initPresentationGuide } from './presentation-guide.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const PRIORITIES = ['P0','P1','P2','P3','P4'];
const NON_EU_COUNTRIES = new Set(['CH','GB']);

const viewTitles = {
  overview: 'Übersicht',
  shipments: 'Sendungen',
  tasks: 'Aufgaben & Planung',
  documents: 'Dokumente',
  customers: 'Kunden',
  locations: 'Standorte',
  avis: 'Kunden-Avis',
  team: 'Team & Rollen'
};

const capabilityLabels = {
  viewShipments: 'Sendungen ansehen',
  editShipments: 'Sendungsdaten bearbeiten',
  completeTasks: 'Aufgaben erledigen',
  viewDocuments: 'Dokumente prüfen',
  manageCustomers: 'Kunden verwalten',
  confirmPickup: 'Abholung bestätigen',
  addPod: 'POD ergänzen',
  createAvis: 'Kunden-Avis erstellen',
  viewAudit: 'Nachvollziehbarkeit ansehen'
};

let shipmentWorkspace = null;
let documentWorkspace = null;
let avisWorkspace = null;
let presentationGuide = null;
let selectedCustomerId = 'cus-05';
let locationFilter = 'all';

const escapeHtml = value => String(value ?? '')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');

function customerName(shipment) {
  return CUSTOMER_BY_ID[shipment.customerId]?.name || 'Demo-Kunde';
}

function ownerName(shipment) {
  return EMPLOYEE_BY_ID[shipment.ownerId]?.name || 'Nicht zugewiesen';
}

function currentMetrics(state = getState()) {
  const openShipments = state.shipments.filter(item => !['Abgeschlossen', 'Archiviert'].includes(item.status)).length;
  const pickupsToday = state.shipments.filter(item => item.plannedPickup === DEMO_TODAY && !['Abgeschlossen', 'Archiviert'].includes(item.status)).length;
  const missingDocuments = state.shipments.reduce((sum, item) => sum + getMissingDocuments(item).length, 0);
  const actionRequired = state.shipments.filter(item => item.attention || getMissingDocuments(item).length > 0).length;
  return { openShipments, pickupsToday, missingDocuments, actionRequired };
}

function renderMetrics() {
  const metrics = currentMetrics();
  const values = {
    metricOpen: metrics.openShipments,
    metricPickups: metrics.pickupsToday,
    metricDocuments: metrics.missingDocuments,
    metricAction: metrics.actionRequired,
    introMetricOpen: metrics.openShipments,
    introMetricPickup: metrics.pickupsToday,
    introMetricAction: metrics.actionRequired
  };
  Object.entries(values).forEach(([id, value]) => {
    const target = document.getElementById(id);
    if (target) target.textContent = String(value);
  });
  const badge = $('#actionCountBadge');
  if (badge) badge.textContent = `${metrics.actionRequired} offen`;
}

function shipmentTone(shipment) {
  if (shipment.priority === 'P0') return 'p0';
  if (shipment.priority === 'P1') return 'p1';
  return 'p2';
}

function shipmentMessage(shipment) {
  if (shipment.attention) return { text: shipment.attention, ready: false };
  if (shipment.status === 'Bereit zur Abholung') return { text: 'Bereit', ready: true };
  const missing = getMissingDocuments(shipment);
  if (missing.length) return { text: `${missing.length} Dokumente`, ready: false };
  return { text: shipment.status, ready: true };
}

function renderPriorityShipments() {
  const container = $('#priorityShipmentList');
  if (!container) return;
  const state = getState();
  const prioritized = state.shipments
    .filter(item => !['Abgeschlossen', 'Archiviert'].includes(item.status))
    .sort((a, b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority))
    .slice(0, 6);

  container.innerHTML = prioritized.map(shipment => {
    const message = shipmentMessage(shipment);
    return `<button type="button" class="shipment-row ${shipmentTone(shipment)}" data-dashboard-shipment="${shipment.id}">
      <span class="priority-bar" aria-hidden="true"></span>
      <div class="shipment-ref"><strong>${shipment.reference}</strong><small>${shipment.priority} · ${shipment.status}</small></div>
      <div class="shipment-customer"><strong>${customerName(shipment)}</strong><small>${shipment.destination}</small></div>
      <div class="shipment-meta">${shipment.plannedPickup === DEMO_TODAY ? 'Heute' : shipment.plannedPickup}<br><small>${ownerName(shipment)}</small></div>
      <span class="shipment-attention${message.ready ? ' ready' : ''}">${message.text}</span>
    </button>`;
  }).join('');

  container.querySelectorAll('[data-dashboard-shipment]').forEach(button => button.addEventListener('click', () => {
    openShipment(button.dataset.dashboardShipment);
  }));
}

function renderActions() {
  const container = $('#actionList');
  if (!container) return;
  const state = getState();
  const tasks = state.tasks
    .filter(task => task.status === 'Offen')
    .sort((a, b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority))
    .slice(0, 5);

  container.innerHTML = tasks.map(task => {
    const shipment = state.shipments.find(item => item.id === task.shipmentId);
    const employee = EMPLOYEE_BY_ID[task.ownerId];
    const critical = task.priority === 'P0' || task.priority === 'P1';
    return `<article class="action-item${critical ? ' critical' : ''}">
      <span class="action-symbol">${critical ? '!' : '✓'}</span>
      <div><strong>${task.title}</strong><span>${shipment?.reference || 'Demo'} · ${shipment ? customerName(shipment) : 'ExportHUB Demo'}</span><small>${task.due} · ${employee?.name || 'Team'}</small></div>
    </article>`;
  }).join('');
}

function renderTaskWorkspace() {
  const workspace = $('#taskWorkspace');
  if (!workspace) return;
  const state = getState();
  const sorted = [...state.tasks].sort((a,b) => {
    if (a.status !== b.status) return a.status === 'Offen' ? -1 : 1;
    return PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority);
  });
  const openCount = sorted.filter(item => item.status === 'Offen').length;
  const doneCount = sorted.filter(item => item.status === 'Erledigt').length;
  const criticalCount = sorted.filter(item => item.status === 'Offen' && ['P0','P1'].includes(item.priority)).length;
  const canComplete = canRole(state.role.role, 'completeTasks');
  const summary = $('#taskSummary');
  if (summary) summary.innerHTML = `<strong>${openCount}</strong><span>offene Demo-Aufgaben</span>`;
  if (!sorted.length) {
    workspace.innerHTML = '<div class="task-empty">Keine Demo-Aufgaben vorhanden.</div>';
    return;
  }
  workspace.innerHTML = `<section class="task-control-strip" aria-label="Operative Aufgabenlage">
    <article class="critical"><span>!</span><div><small>Kritisch P0/P1</small><strong>${criticalCount}</strong><em>zuerst bearbeiten</em></div></article>
    <article><span>↗</span><div><small>Offen</small><strong>${openCount}</strong><em>nach Priorität & Zuständigkeit</em></div></article>
    <article class="done"><span>✓</span><div><small>Erledigt</small><strong>${doneCount}</strong><em>lokal in dieser Demo</em></div></article>
  </section>` + sorted.map(task => {
    const shipment = state.shipments.find(item => item.id === task.shipmentId);
    const employee = EMPLOYEE_BY_ID[task.ownerId];
    const done = task.status === 'Erledigt';
    let action = '<span>Erledigt</span>';
    if (!done && canComplete) action = `<button type="button" data-complete-task="${task.id}">Als erledigt markieren</button>`;
    if (!done && !canComplete) action = '<span>Nur Ansicht</span>';
    return `<article class="task-card ${task.priority.toLowerCase()}${done ? ' task-done' : ''}">
      <span class="task-priority">${done ? '✓' : task.priority}</span>
      <div class="task-copy"><strong>${task.title}</strong><span>${shipment?.reference || 'Demo'} · ${shipment ? customerName(shipment) : 'ExportHUB Demo'}</span><small>${task.due} · ${employee?.name || 'Team'}</small></div>
      <div class="task-actions">${action}</div>
    </article>`;
  }).join('');
  workspace.querySelectorAll('[data-complete-task]').forEach(button => button.addEventListener('click', () => {
    completeTask(button.dataset.completeTask);
    refreshOperationalViews();
  }));
}

function renderActivities() {
  const container = $('#activityList');
  if (!container) return;
  container.innerHTML = DEMO_ACTIVITIES.map(item => `<article class="activity-item">
    <time>${item.time}</time>
    <span class="activity-dot ${item.tone}" aria-hidden="true"></span>
    <div><strong>${item.label}</strong><span>${item.text}</span></div>
  </article>`).join('');
}

function renderCustomerWorkspace() {
  const state = getState();
  const list = $('#customerList');
  const detail = $('#customerDetail');
  if (!list || !detail) return;
  if (!state.customers.some(item => item.id === selectedCustomerId)) selectedCustomerId = state.customers[0]?.id || null;

  const customerShipments = customerId => state.shipments.filter(item => item.customerId === customerId);
  const isOpen = shipment => !['Abgeschlossen', 'Archiviert'].includes(shipment.status);
  const openCustomers = state.customers.filter(customer => customerShipments(customer.id).some(isOpen)).length;
  const attentionCustomers = state.customers.filter(customer => customerShipments(customer.id).some(shipment => isOpen(shipment) && (shipment.attention || getMissingDocuments(shipment).length))).length;
  const nonEuCustomers = state.customers.filter(customer => customerShipments(customer.id).some(shipment => shipment.nonEu)).length;

  list.innerHTML = `<section class="customer-signal-strip" aria-label="Operativer Kundenkontext">
      <article><small>Kunden mit offenen Sendungen</small><strong>${openCustomers}</strong><span>von ${state.customers.length} Demo-Kunden</span></article>
      <article class="warning"><small>Handlungsbedarf</small><strong>${attentionCustomers}</strong><span>Kunden mit offenem Punkt</span></article>
      <article><small>Nicht-EU-Bezug</small><strong>${nonEuCustomers}</strong><span>Kunden mit Exportvorgang</span></article>
    </section>` + state.customers.map(customer => {
    const locations = state.locations.filter(item => item.customerId === customer.id).length;
    const shipments = customerShipments(customer.id);
    const open = shipments.filter(isOpen).length;
    const attention = shipments.filter(item => isOpen(item) && (item.attention || getMissingDocuments(item).length)).length;
    return `<button type="button" class="customer-demo-row${customer.id === selectedCustomerId ? ' active' : ''}" data-customer-id="${customer.id}"><div><strong>${escapeHtml(customer.name)}</strong><small>${escapeHtml(customer.number)} · ${escapeHtml(customer.country)} · ${locations} Standort${locations === 1 ? '' : 'e'}</small></div><span><b>${open} offen</b><em>${attention ? `${attention} prüfen` : `${shipments.length} gesamt`}</em></span></button>`;
  }).join('');

  const customer = state.customers.find(item => item.id === selectedCustomerId);
  if (!customer) {
    detail.innerHTML = '<div class="shipment-detail-empty"><h3>Kein Demo-Kunde</h3></div>';
    return;
  }
  const locations = state.locations.filter(item => item.customerId === customer.id);
  const shipments = customerShipments(customer.id);
  const openShipments = shipments.filter(isOpen).sort((a,b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) || a.plannedPickup.localeCompare(b.plannedPickup));
  const attentionShipments = openShipments.filter(item => item.attention || getMissingDocuments(item).length);
  const nextShipment = attentionShipments[0] || openShipments[0] || null;
  const missingForNext = nextShipment ? getMissingDocuments(nextShipment) : [];
  const nextAction = !nextShipment ? 'Kein offener Schritt' : nextShipment.attention || (missingForNext.length ? `${missingForNext.length} Pflichtdokument${missingForNext.length === 1 ? '' : 'e'} prüfen` : nextShipment.status === 'Bereit zur Abholung' ? 'Abholung koordinieren' : 'Sendung weiterführen');
  detail.innerHTML = `<div class="customer-detail-head"><div><span class="eyebrow">DEMO-KUNDE</span><h3>${escapeHtml(customer.name)}</h3><p>${escapeHtml(customer.number)} · ${escapeHtml(customer.country)}</p></div><span class="status-chip good">${escapeHtml(customer.status)}</span></div>
    <div class="customer-detail-facts"><div><small>Kundennummer</small><strong>${escapeHtml(customer.number)}</strong></div><div><small>Lieferstandorte</small><strong>${locations.length}</strong></div><div><small>Offene Sendungen</small><strong>${openShipments.length}</strong></div></div>
    <section class="customer-next-action${nextShipment?.attention ? ' warning' : ''}"><div><small>Nächster operativer Schritt</small><strong>${escapeHtml(nextAction)}</strong><span>${nextShipment ? `${escapeHtml(nextShipment.reference)} · ${escapeHtml(nextShipment.destination)} · ${escapeHtml(nextShipment.priority)}` : 'Für diesen Demo-Kunden ist aktuell nichts offen.'}</span></div>${nextShipment ? `<button type="button" data-customer-next-shipment="${nextShipment.id}">Sendung öffnen →</button>` : ''}</section>
    <section class="customer-location-list"><h4>Zugeordnete Standorte</h4>${locations.map(location => `<div class="customer-location-entry"><div><strong>${escapeHtml(location.label)}</strong><small>${escapeHtml(location.address)} · ${escapeHtml(location.city)}</small></div><span>${escapeHtml(location.country)}</span></div>`).join('') || '<small>Keine Standorte</small>'}</section>
    <section class="customer-shipment-list"><h4>Sendungen in dieser Demo</h4>${shipments.map(shipment => `<div class="customer-shipment-mini"><div><strong>${escapeHtml(shipment.reference)} · ${escapeHtml(shipment.status)}</strong><small>${escapeHtml(shipment.destination)} · ${escapeHtml(shipment.packages)}</small></div><button type="button" data-customer-shipment="${shipment.id}">Öffnen →</button></div>`).join('') || '<small>Keine Sendungen</small>'}</section>`;

  list.querySelectorAll('[data-customer-id]').forEach(button => button.addEventListener('click', () => {
    selectedCustomerId = button.dataset.customerId;
    renderCustomerWorkspace();
  }));
  detail.querySelectorAll('[data-customer-shipment],[data-customer-next-shipment]').forEach(button => button.addEventListener('click', () => openShipment(button.dataset.customerShipment || button.dataset.customerNextShipment)));
}

function renderLocationWorkspace() {
  const state = getState();
  const summary = $('#locationQualitySummary');
  const workspace = $('#locationWorkspace');
  if (!summary || !workspace) return;
  const countries = new Set(state.locations.map(item => item.country)).size;
  const usedLocations = new Set(state.shipments.map(item => item.locationId));
  const nonEuLocations = state.locations.filter(item => NON_EU_COUNTRIES.has(item.country)).length;
  const filteredLocations = state.locations.filter(location => {
    if (locationFilter === 'used') return usedLocations.has(location.id);
    if (locationFilter === 'non-eu') return NON_EU_COUNTRIES.has(location.country);
    return true;
  });
  summary.innerHTML = `<div><small>Länder</small><strong>${countries}</strong><span>im fiktiven Standortbestand</span></div><div><small>In Sendungen genutzt</small><strong>${usedLocations.size} / ${state.locations.length}</strong><span>Standorte mit operativem Bezug</span></div><div><small>Nicht-EU-Ziele</small><strong>${nonEuLocations}</strong><span>mit Exportrelevanz in der Demo</span></div>`;
  workspace.innerHTML = `<div class="location-filter-strip" aria-label="Standortansicht filtern">
      <button type="button" data-location-filter="all" class="${locationFilter === 'all' ? 'active' : ''}"><strong>Alle Standorte</strong><span>${state.locations.length}</span></button>
      <button type="button" data-location-filter="used" class="${locationFilter === 'used' ? 'active' : ''}"><strong>Operativ genutzt</strong><span>${usedLocations.size}</span></button>
      <button type="button" data-location-filter="non-eu" class="${locationFilter === 'non-eu' ? 'active' : ''}"><strong>Exportrelevant · Nicht-EU</strong><span>${nonEuLocations}</span></button>
    </div>` + (filteredLocations.length ? filteredLocations.map(location => {
    const customer = state.customers.find(item => item.id === location.customerId);
    const usage = state.shipments.filter(item => item.locationId === location.id).length;
    const nonEu = NON_EU_COUNTRIES.has(location.country);
    return `<article class="location-demo-card${nonEu ? ' export-relevant' : ''}"><header><div><strong>${escapeHtml(location.label)}</strong><small>${escapeHtml(customer?.name || 'Demo-Kunde')}</small></div><div class="location-badges"><span class="location-country">${escapeHtml(location.country)}</span><span class="location-export-badge ${nonEu ? 'non-eu' : 'eu'}">${nonEu ? 'Exportrelevant · Nicht-EU' : 'EU-Ziel'}</span></div></header><div class="location-address">${escapeHtml(location.address)}<br>${escapeHtml(location.city)}</div><div class="location-usage"><span>${usage ? 'Operativ genutzt' : 'Noch ohne Sendungsbezug'}</span><strong>${usage}×</strong></div></article>`;
  }).join('') : '<div class="location-empty">Für diesen Filter sind keine Demo-Standorte vorhanden.</div>');
  workspace.querySelectorAll('[data-location-filter]').forEach(button => button.addEventListener('click', () => {
    locationFilter = button.dataset.locationFilter;
    renderLocationWorkspace();
  }));
}

function renderTeamWorkspace() {
  const state = getState();
  const role = state.role.role;
  const employee = state.employees.find(item => item.id === state.role.employeeId);
  const capabilities = DEMO_ROLE_CAPABILITIES[role] || {};
  const activeRole = $('#activeRoleName');
  const teamActiveRole = $('#teamActiveRole');
  const summary = $('#teamRoleSummary');
  const detail = $('#teamRoleDetail');
  if (activeRole) activeRole.textContent = role;
  if (teamActiveRole) teamActiveRole.textContent = role;
  if (summary) summary.innerHTML = `<strong>${escapeHtml(employee?.name || role)}</strong><span>aktive Präsentationsperson</span>`;
  $$('[data-demo-role]').forEach(button => {
    button.classList.toggle('active', button.dataset.demoRole === role);
    button.onclick = () => setPresentationRole(button.dataset.demoRole, button.dataset.demoEmployee);
  });
  if (!detail) return;
  const peers = state.employees.filter(item => item.role === role);
  const teamMembers = state.employees.filter(item => item.team === employee?.team);
  const permissionEntries = Object.keys(capabilityLabels);
  const allowedCount = permissionEntries.filter(key => capabilities[key]).length;
  const blockedCount = permissionEntries.length - allowedCount;
  detail.innerHTML = `<section class="role-impact-strip" aria-label="Auswirkung der aktiven Rolle">
      <article class="allowed"><small>Freigegebene Aktionen</small><strong>${allowedCount}</strong><span>im Demo-Arbeitsbereich</span></article>
      <article class="blocked"><small>Gesperrt</small><strong>${blockedCount}</strong><span>rollenbedingt nicht verfügbar</span></article>
      <article><small>Teamkontext</small><strong>${teamMembers.length}</strong><span>${escapeHtml(employee?.team || 'Demo-Team')}</span></article>
    </section><div class="role-context-profile"><strong>${escapeHtml(employee?.name || role)}</strong><span>${escapeHtml(role)} · ${escapeHtml(employee?.team || 'Demo-Team')}</span></div><div class="capability-list">${Object.entries(capabilityLabels).map(([key,label]) => `<div class="capability-item ${capabilities[key] ? 'allowed' : 'blocked'}"><i>${capabilities[key] ? '✓' : '–'}</i><span>${escapeHtml(label)}</span></div>`).join('')}</div><div class="role-context-note">Der Wechsel betrifft ausschließlich die Darstellung und lokale Demo-Aktionen. Alle Geschäftsdatensätze bleiben fiktiv.</div><section class="role-team-context"><div><h4>Teamkontext</h4><p>Die aktive Person wird zusammen mit ihrem fiktiven Team gezeigt. So lässt sich im Gespräch erklären, wie Arbeitsbereiche nach Rolle begrenzt werden.</p></div><div class="role-team-context-people">${teamMembers.map(item => `<span class="${item.id === employee?.id ? 'active' : ''}"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.role)}</small></span>`).join('')}</div></section><div class="role-team-list"><h4>Beispielpersonen mit dieser Rolle</h4><div class="role-team-people">${peers.map(item => `<span>${escapeHtml(item.name)}</span>`).join('')}</div></div>`;
}

function setPresentationRole(role, employeeId) {
  setRole(role, employeeId);
  refreshOperationalViews();
  shipmentWorkspace?.refresh();
  renderTeamWorkspace();
}

function refreshOperationalViews() {
  renderMetrics();
  renderPriorityShipments();
  renderActions();
  renderTaskWorkspace();
  renderCustomerWorkspace();
  renderLocationWorkspace();
  renderTeamWorkspace();
  documentWorkspace?.refresh();
  avisWorkspace?.refresh();
}

function openShipment(id) {
  openView('shipments');
  shipmentWorkspace?.select(id);
}

function openView(view) {
  if (!viewTitles[view]) return;
  $$('.view').forEach(section => section.classList.toggle('active', section.dataset.demoView === view));
  $$('.demo-nav button').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  const title = $('#viewTitle');
  if (title) title.textContent = viewTitles[view];
  $('#demoSidebar')?.classList.remove('open');
  document.getElementById('demoApp')?.scrollIntoView({ block: 'start' });
  if (view === 'shipments') shipmentWorkspace?.refresh();
  if (view === 'tasks') renderTaskWorkspace();
  if (view === 'documents') documentWorkspace?.refresh();
  if (view === 'customers') renderCustomerWorkspace();
  if (view === 'locations') renderLocationWorkspace();
  if (view === 'avis') avisWorkspace?.refresh();
  if (view === 'team') renderTeamWorkspace();
}

function showResetMessage() {
  const notice = $('#demoNotice');
  if (notice) notice.hidden = false;
}

function bindNavigation() {
  $$('.demo-nav button[data-view]').forEach(button => button.addEventListener('click', () => openView(button.dataset.view)));
  $$('[data-open-view]').forEach(button => button.addEventListener('click', () => openView(button.dataset.openView)));
  $('#exploreBtn')?.addEventListener('click', () => document.getElementById('demoApp')?.scrollIntoView({ block: 'start' }));
  $('#mobileMenuBtn')?.addEventListener('click', () => $('#demoSidebar')?.classList.toggle('open'));
  $('#demoNoticeClose')?.addEventListener('click', () => { const notice = $('#demoNotice'); if (notice) notice.hidden = true; });
  $('#demoResetBtn')?.addEventListener('click', () => {
    resetDemoStore();
    selectedCustomerId = 'cus-05';
    locationFilter = 'all';
    refreshOperationalViews();
    shipmentWorkspace?.refresh();
    openView('overview');
    presentationGuide?.close();
    showResetMessage();
  });
}

function init() {
  renderMetrics();
  renderPriorityShipments();
  renderActions();
  renderTaskWorkspace();
  renderActivities();
  renderCustomerWorkspace();
  renderLocationWorkspace();
  renderTeamWorkspace();
  bindNavigation();
  shipmentWorkspace = initShipmentWorkspace({ onChange: refreshOperationalViews });
  documentWorkspace = initDocumentWorkspace({ onOpenShipment: openShipment });
  avisWorkspace = initAvisWorkspace({ onChange: refreshOperationalViews });
  presentationGuide = initPresentationGuide({ openView, openShipment, setPresentationRole });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();