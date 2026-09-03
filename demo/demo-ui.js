import {
  DEMO_ACTIVITIES,
  DEMO_TODAY,
  CUSTOMER_BY_ID,
  EMPLOYEE_BY_ID,
  getMissingDocuments
} from './demo-data.js';
import { getState, reset as resetDemoStore } from './demo-store.js';
import { initShipmentWorkspace } from './demo-shipments.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const PRIORITIES = ['P0','P1','P2','P3','P4'];

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

let shipmentWorkspace = null;

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
    openView('shipments');
    shipmentWorkspace?.select(button.dataset.dashboardShipment);
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

function renderActivities() {
  const container = $('#activityList');
  if (!container) return;
  container.innerHTML = DEMO_ACTIVITIES.map(item => `<article class="activity-item">
    <time>${item.time}</time>
    <span class="activity-dot ${item.tone}" aria-hidden="true"></span>
    <div><strong>${item.label}</strong><span>${item.text}</span></div>
  </article>`).join('');
}

function refreshOperationalViews() {
  renderMetrics();
  renderPriorityShipments();
  renderActions();
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
}

function enterDemo(withTour) {
  document.getElementById('demoApp')?.scrollIntoView({ block: 'start' });
  if (withTour) {
    const toast = $('#tourToast');
    if (toast) toast.hidden = false;
  }
}

function showResetMessage() {
  const toast = $('#tourToast');
  if (!toast) return;
  toast.hidden = false;
  const text = toast.querySelector('span');
  if (text) text.textContent = 'Demo-Ausgangsansicht wiederhergestellt. Es wurden keine Produktivdaten verändert.';
}

function bindNavigation() {
  $$('.demo-nav button[data-view]').forEach(button => button.addEventListener('click', () => openView(button.dataset.view)));
  $$('[data-open-view]').forEach(button => button.addEventListener('click', () => openView(button.dataset.openView)));
  $('#exploreBtn')?.addEventListener('click', () => enterDemo(false));
  $('#startTourBtn')?.addEventListener('click', () => enterDemo(true));
  $('#restartTourBtn')?.addEventListener('click', () => {
    openView('overview');
    const toast = $('#tourToast');
    if (toast) toast.hidden = false;
  });
  $('#tourToastClose')?.addEventListener('click', () => {
    const toast = $('#tourToast');
    if (toast) toast.hidden = true;
  });
  $('#mobileMenuBtn')?.addEventListener('click', () => $('#demoSidebar')?.classList.toggle('open'));
  $('#demoResetBtn')?.addEventListener('click', () => {
    resetDemoStore();
    refreshOperationalViews();
    shipmentWorkspace?.refresh();
    openView('overview');
    showResetMessage();
  });
}

function init() {
  refreshOperationalViews();
  renderActivities();
  bindNavigation();
  shipmentWorkspace = initShipmentWorkspace({ onChange: refreshOperationalViews });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
