import { getMissingDocuments, requiredDocumentTypes } from './demo-data.js';
import { getState as getDemoState } from './demo-store.js';

const CLOSED_STATUSES = new Set(['Abgeschlossen', 'Archiviert']);
const PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'];
const PRESENTATION_TITLES = Object.freeze({
  management: 'Management',
  conclusion: 'Präsentationsabschluss'
});

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

export function getManagementSnapshot({ shipments = [], tasks = [] } = {}) {
  const open = shipments.filter(item => !CLOSED_STATUSES.has(item.status));
  const openShipments = open.length;
  const readyForPickup = open.filter(item => item.status === 'Bereit zur Abholung').length;
  const openCriticalTasks = tasks.filter(item => item.status === 'Offen' && ['P0', 'P1'].includes(item.priority)).length;
  const nonEuOpen = open.filter(item => item.nonEu === true).length;
  const podGap = open.filter(item => item.status === 'Abgeholt' && item.documents?.pod !== true).length;
  const actionRequiredShipments = open.filter(item => item.attention || getMissingDocuments(item).length > 0);

  let requiredDocuments = 0;
  let presentDocuments = 0;
  shipments.forEach(shipment => {
    const required = requiredDocumentTypes(shipment);
    requiredDocuments += required.length;
    presentDocuments += required.filter(type => shipment.documents?.[type] === true).length;
  });
  const documentCompleteness = requiredDocuments
    ? Math.round((presentDocuments / requiredDocuments) * 100)
    : 100;

  const priorityShipments = [...actionRequiredShipments]
    .sort((a, b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) || String(a.plannedPickup).localeCompare(String(b.plannedPickup)))
    .slice(0, 5);

  return {
    openShipments,
    readyForPickup,
    openCriticalTasks,
    nonEuOpen,
    podGap,
    actionRequired: actionRequiredShipments.length,
    documentCompleteness,
    requiredDocuments,
    presentDocuments,
    priorityShipments
  };
}

function ensureManagementStyles() {
  if (document.querySelector('link[data-demo-management-styles]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './demo-management.css';
  link.dataset.demoManagementStyles = 'true';
  document.head.append(link);
}

function ensureManagementShell() {
  const nav = document.querySelector('.demo-nav');
  const workspace = document.querySelector('.workspace');
  if (!nav || !workspace) return;

  if (!nav.querySelector('[data-view="management"]')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.view = 'management';
    button.innerHTML = '<span>◈</span>Management';
    nav.prepend(button);
  }

  if (!nav.querySelector('[data-view="conclusion"]')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.view = 'conclusion';
    button.innerHTML = '<span>◆</span>Präsentationsabschluss';
    nav.append(button);
  }

  if (!workspace.querySelector('[data-demo-view="management"]')) {
    const section = document.createElement('section');
    section.className = 'view';
    section.dataset.demoView = 'management';
    section.innerHTML = '<div class="ops-page-head"><div><span class="eyebrow">MANAGEMENT & STEUERUNG</span><h3>Exportprozesse als Lagebild führen</h3><p>Alle Werte werden aus den fiktiven Demo-Sendungen, Aufgaben und Pflichtdokumenten berechnet.</p></div><span class="status-chip neutral">DEMO / MUSTER</span></div><div id="managementWorkspace"></div>';
    workspace.prepend(section);
  }

  if (!workspace.querySelector('[data-demo-view="conclusion"]')) {
    const section = document.createElement('section');
    section.className = 'view';
    section.dataset.demoView = 'conclusion';
    section.innerHTML = '<div id="conclusionWorkspace"></div>';
    workspace.append(section);
  }
}

function activateStandaloneView(view) {
  if (!PRESENTATION_TITLES[view]) return;
  document.querySelectorAll('.view').forEach(section => section.classList.toggle('active', section.dataset.demoView === view));
  document.querySelectorAll('.demo-nav button[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  const title = document.getElementById('viewTitle');
  if (title) title.textContent = PRESENTATION_TITLES[view];
  document.getElementById('demoSidebar')?.classList.remove('open');
  document.getElementById('demoApp')?.scrollIntoView({ block: 'start' });
}

function openViaNavigation(view) {
  if (PRESENTATION_TITLES[view]) {
    activateStandaloneView(view);
    return;
  }
  document.querySelector(`.demo-nav button[data-view="${view}"]`)?.click();
}

function renderManagement(state, openView, openShipment) {
  const workspace = document.getElementById('managementWorkspace');
  if (!workspace) return;
  const snapshot = getManagementSnapshot(state);

  const priorityHtml = snapshot.priorityShipments.length
    ? snapshot.priorityShipments.map(shipment => {
        const missing = getMissingDocuments(shipment);
        const reason = shipment.attention || (missing.length ? `${missing.length} Pflichtdokument${missing.length === 1 ? '' : 'e'} offen` : 'Operativen Schritt prüfen');
        return `<button type="button" class="management-priority-row" data-management-shipment="${escapeHtml(shipment.id)}">
          <span class="management-priority-code">${escapeHtml(shipment.priority)}</span>
          <div><strong>${escapeHtml(shipment.reference)} · ${escapeHtml(reason)}</strong><small>${escapeHtml(shipment.destination)} · ${escapeHtml(shipment.status)}</small></div>
          <span>Öffnen →</span>
        </button>`;
      }).join('')
    : '<div class="management-empty">Im aktuellen Demo-Bestand gibt es keinen offenen Handlungsbedarf.</div>';

  workspace.innerHTML = `<section class="management-hero panel">
      <div><span class="eyebrow">MANAGEMENT-LAGEBILD · DEMO / MUSTER</span><h3>Management-Lagebild für Export & Logistik</h3><p>Die Kennzahlen werden direkt aus dem lokalen Demo-Bestand berechnet. Sie zeigen Arbeitsvorrat, Dokumentenqualität, kritische Aufgaben und Prozesslücken – ohne erfundene Nutzen- oder Wirtschaftlichkeitswerte.</p></div>
      <div class="management-hero-status"><small>Beispieldaten</small><strong>${snapshot.openShipments}</strong><span>offene Sendungen im Demo-Bestand</span></div>
    </section>

    <section class="management-kpi-grid" aria-label="Management-Kennzahlen">
      <article><span>▣</span><div><small>Offene Sendungen</small><strong>${snapshot.openShipments}</strong><em>aktiver Arbeitsvorrat</em></div></article>
      <article class="positive"><span>⇄</span><div><small>Bereit zur Abholung</small><strong>${snapshot.readyForPickup}</strong><em>können operativ weiterlaufen</em></div></article>
      <article class="warning"><span>▤</span><div><small>Dokumentenquote</small><strong>${snapshot.documentCompleteness}%</strong><em>${snapshot.presentDocuments} von ${snapshot.requiredDocuments} Pflichtnachweisen vorhanden</em></div></article>
      <article class="critical"><span>!</span><div><small>Kritische Aufgaben P0/P1</small><strong>${snapshot.openCriticalTasks}</strong><em>offen im Demo-Bestand</em></div></article>
    </section>

    <section class="management-signal-grid">
      <article class="panel management-signal decision"><header><span>01</span><div><small>HEUTE ENTSCHEIDEN</small><strong>${snapshot.actionRequired} Vorgänge mit Handlungsbedarf</strong></div></header><p>Blockaden und fehlende Nachweise werden nicht in Listen versteckt, sondern als konkrete Vorgänge priorisiert.</p><button type="button" data-management-open-view="shipments">Handlungsbedarf öffnen →</button></article>
      <article class="panel management-signal stability"><header><span>02</span><div><small>PROZESSSTABILITÄT</small><strong>${snapshot.documentCompleteness}% Dokumentenquote</strong></div></header><p>Die Quote bezieht sich ausschließlich auf die aktuell erforderlichen Pflichtdokumente der fiktiven Sendungen.</p><button type="button" data-management-open-view="documents">Dokumentenlage öffnen →</button></article>
      <article class="panel management-signal export"><header><span>03</span><div><small>EXPORTRELEVANZ</small><strong>${snapshot.nonEuOpen} offene Nicht-EU-Sendungen</strong></div></header><p>Ausfuhrpflicht, ABD-Status und nächste Schritte bleiben für die Exportkoordination im selben Arbeitsfluss sichtbar.</p><button type="button" data-management-open-view="shipments">Nicht-EU-Vorgänge öffnen →</button></article>
      <article class="panel management-signal proof"><header><span>04</span><div><small>NACHWEISKETTE</small><strong>${snapshot.podGap} Abholungen ohne POD</strong></div></header><p>Abholung und POD sind getrennte Kontrollpunkte. So bleibt sichtbar, welche Vorgänge operativ abgeholt, aber noch nicht nachweislich abgeschlossen sind.</p><button type="button" data-management-open-view="tasks">POD-Aufgaben öffnen →</button></article>
    </section>

    <section class="panel management-priority-list">
      <header class="panel-head"><div><span class="eyebrow">PRIORISIERTE ENTSCHEIDUNGSLISTE</span><h3>Welche Vorgänge brauchen zuerst Aufmerksamkeit?</h3></div><span class="count-badge">${snapshot.actionRequired} prüfen</span></header>
      <div>${priorityHtml}</div>
    </section>`;

  workspace.querySelectorAll('[data-management-open-view]').forEach(button => button.addEventListener('click', () => openView?.(button.dataset.managementOpenView)));
  workspace.querySelectorAll('[data-management-shipment]').forEach(button => button.addEventListener('click', () => openShipment?.(button.dataset.managementShipment)));
}

function renderConclusion(state, openView) {
  const workspace = document.getElementById('conclusionWorkspace');
  if (!workspace) return;
  const snapshot = getManagementSnapshot(state);

  workspace.innerHTML = `<section class="conclusion-hero">
      <span class="eyebrow">PRÄSENTATIONSABSCHLUSS · DEMO / MUSTER</span>
      <h3>Was ExportHUB im gezeigten Ablauf verbindet</h3>
      <p>Der gezeigte Demo-Prozess verbindet operative Arbeit, Dokumentenkontrolle, externe Übergaben und Rollen in einem durchgängigen Arbeitskontext. Die Kennzahlen unten stammen ausschließlich aus den fiktiven Beispieldaten.</p>
      <div class="conclusion-snapshot"><span><strong>${snapshot.openShipments}</strong> offene Sendungen</span><span><strong>${snapshot.actionRequired}</strong> mit Handlungsbedarf</span><span><strong>${snapshot.documentCompleteness}%</strong> Dokumentenquote</span></div>
    </section>

    <section class="conclusion-value-grid">
      <article><i>01</i><strong>Sendungssteuerung</strong><p>Status, Priorität, Kunde, Verantwortlichkeit und nächster Schritt bleiben am selben Vorgang sichtbar.</p></article>
      <article><i>02</i><strong>Dokumenten- und ABD-Kontrolle</strong><p>Pflichtunterlagen und ausfuhrrelevante Sperren werden vor der operativen Freigabe sichtbar gemacht.</p></article>
      <article><i>03</i><strong>Abholung und POD</strong><p>QR-/PIN-Übergabe, Abholnachweis und POD werden als getrennte, nachvollziehbare Prozessschritte gezeigt.</p></article>
      <article><i>04</i><strong>Rollen und Verantwortlichkeiten</strong><p>Arbeitsbereiche lassen sich nach Aufgabe und Rolle begrenzen, ohne den gemeinsamen Prozesszusammenhang zu verlieren.</p></article>
    </section>

    <section class="panel conclusion-next-step">
      <div><span class="eyebrow">NÄCHSTER SINNVOLLER SCHRITT</span><h3>Nächster sinnvoller Schritt: den eigenen Exportprozess gegen diese Demo spiegeln.</h3><p>Für ein Folgegespräch können reale Prozessschritte, Rollen, Pflichtdokumente und Systemübergaben des Unternehmens aufgenommen und mit dem gezeigten Ablauf verglichen werden. Erst daraus lassen sich belastbare Anforderungen oder Nutzenpotenziale ableiten.</p></div>
      <div class="conclusion-actions"><button type="button" data-management-open-view="management">Management-Lagebild erneut öffnen</button><button type="button" data-management-open-view="overview">Operative Demo erneut öffnen</button></div>
    </section>`;

  workspace.querySelectorAll('[data-management-open-view]').forEach(button => button.addEventListener('click', () => openView?.(button.dataset.managementOpenView)));
}

export function initManagementWorkspace({ getState, openView, openShipment } = {}) {
  const stateReader = getState || getDemoState;
  const refresh = () => {
    const state = stateReader?.();
    if (!state) return;
    renderManagement(state, openView, openShipment);
    renderConclusion(state, openView);
  };
  refresh();
  return { refresh };
}

function initStandaloneManagement() {
  ensureManagementStyles();
  ensureManagementShell();
  const workspace = initManagementWorkspace({
    getState: getDemoState,
    openView: openViaNavigation,
    openShipment: () => openViaNavigation('shipments')
  });

  document.querySelectorAll('.demo-nav button[data-view="management"], .demo-nav button[data-view="conclusion"]').forEach(button => {
    button.addEventListener('click', () => {
      workspace.refresh();
      activateStandaloneView(button.dataset.view);
    });
  });

  document.getElementById('demoResetBtn')?.addEventListener('click', () => queueMicrotask(() => workspace.refresh()));
  window.addEventListener('storage', () => workspace.refresh());
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initStandaloneManagement, { once: true });
  else initStandaloneManagement();
}
