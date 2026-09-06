import './demo-management.js';

export const TOUR_STEPS = Object.freeze([
  Object.freeze({
    view: 'management',
    spotlight: '[data-demo-view="management"]',
    focusLabel: 'Management-Lagebild',
    title: '1 · Management-Lagebild zuerst',
    text: 'Zum Einstieg zeigt ExportHUB den fiktiven Arbeitsvorrat aus Management-Sicht: offene Sendungen, abholbereite Vorgänge, Dokumentenquote, kritische Aufgaben, Nicht-EU-Bezug und offene POD-Nachweise.'
  }),
  Object.freeze({
    view: 'overview',
    spotlight: '#overviewKpis',
    focusLabel: 'Operativer Tagesüberblick',
    title: '2 · Tagesüberblick statt Einzelrecherche',
    text: 'Die operative Übersicht zeigt offene Sendungen, heutige Abholungen, fehlende Dokumente und priorisierten Handlungsbedarf aus einem gemeinsamen fiktiven Arbeitsstand.'
  }),
  Object.freeze({
    view: 'shipments',
    shipmentId: 'sh-001',
    spotlight: '#shipmentDetail',
    focusLabel: 'Nicht-EU-Sendung RWD301',
    title: '3 · Blockierte Nicht-EU-Sendung erkennen',
    text: 'RWD301 ist bewusst mit fehlendem ABD vorbereitet. ExportHUB macht sichtbar, warum der Vorgang noch nicht zur Abholung freigegeben werden darf.'
  }),
  Object.freeze({
    view: 'documents',
    spotlight: '#documentWorkspace',
    focusLabel: 'Dokumentenkontrolle',
    title: '4 · Pflichtdokumente automatisch einordnen',
    text: 'Die Dokumentenübersicht unterscheidet je Sendung zwischen vorhandenen und fehlenden Pflichtunterlagen wie Lieferschein, L1, L2, CMR, ABD und POD.'
  }),
  Object.freeze({
    view: 'tasks',
    spotlight: '#taskWorkspace',
    focusLabel: 'Aufgaben & Verantwortlichkeit',
    title: '5 · Offene Schritte klar zuweisen',
    text: 'Aufgaben verbinden Priorität, Fälligkeit, verantwortliche Person und Sendungsreferenz. In der Demo lassen sie sich lokal als erledigt markieren.'
  }),
  Object.freeze({
    view: 'shipments',
    shipmentId: 'sh-002',
    spotlight: '#shipmentDetail',
    focusLabel: 'QR-Abholung RWD302',
    title: '6 · QR-Abholung mit PIN und Colli prüfen',
    text: 'RWD302 steht bereit zur Abholung. Über „QR-Abholung öffnen“ lässt sich die externe DEMO-Abholansicht zeigen: Verlade-PIN und physische Colli müssen stimmen, bevor der Status auf Abgeholt wechselt.'
  }),
  Object.freeze({
    view: 'shipments',
    shipmentId: 'sh-005',
    spotlight: '#shipmentDetail',
    focusLabel: 'POD-Nachweis RWD305',
    title: '7 · Abholung und POD sauber trennen',
    text: 'RWD305 ist bereits abgeholt und operative Daten sind gesperrt. Über „POD-Nachweis öffnen“ wird der fehlende Nachweis als eigener Schritt ergänzt und die Nachweiskette abgeschlossen.'
  }),
  Object.freeze({
    view: 'avis',
    shipmentId: 'sh-002',
    spotlight: '#avisWorkspace',
    focusLabel: 'Kunden-Avis',
    title: '8 · Kunden-Avis ohne internen Zugriff',
    text: 'Die Präsentation zeigt eine getrennte Kundenansicht mit Referenz, Abholinformationen und freigegebenen Unterlagen. Der Demo-Verweis bleibt ausschließlich lokal.'
  }),
  Object.freeze({
    view: 'customers',
    spotlight: '#customerWorkspace',
    focusLabel: 'Kundenkontext',
    title: '9 · Kunden zentral mit Vorgängen verbinden',
    text: 'Die Kundenansicht fasst fiktive Kundennummer, Land, Standorte und zugehörige Sendungen zusammen, ohne die operative Oberfläche mit Stammdatenformularen zu überladen.'
  }),
  Object.freeze({
    view: 'locations',
    spotlight: '#locationWorkspace',
    focusLabel: 'Lieferstandorte',
    title: '10 · Lieferstandorte getrennt pflegen und prüfen',
    text: 'Zwölf fiktive Lieferstandorte machen sichtbar, welchem Kunden und Land ein Ziel zugeordnet ist und wie häufig es im Demo-Sendungsbestand verwendet wird.'
  }),
  Object.freeze({
    view: 'team',
    role: 'Lager',
    employeeId: 'emp-06',
    spotlight: '#teamWorkspace',
    focusLabel: 'Rolle Lager',
    title: '11 · Rollen zeigen nur den passenden Arbeitskontext',
    text: 'Zum Ende des Prozessdurchlaufs wechselt die Präsentation lokal in die Lagerrolle. Abholung und POD sind verfügbar, während Kundenverwaltung und andere nicht benötigte Aktionen ausgeblendet bleiben.'
  }),
  Object.freeze({
    view: 'conclusion',
    spotlight: '[data-demo-view="conclusion"]',
    focusLabel: 'Präsentationsabschluss',
    title: '12 · Abschluss mit klarer Entscheidungsgrundlage',
    text: 'Die Abschlussansicht fasst die gezeigten Prozessbausteine zusammen und leitet zu einem sinnvollen Folgegespräch über: den realen Exportprozess des Unternehmens gegen den Demo-Ablauf spiegeln.'
  })
]);

function ensurePresentationModeStyles() {
  if (document.querySelector('link[data-presentation-mode-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './demo-presentation-mode.css';
  link.dataset.presentationModeStyle = 'true';
  document.head.append(link);
}

function ensurePresentationLauncher() {
  const existing = document.getElementById('presentationLaunchPanel');
  if (existing) return existing;
  const introActions = document.querySelector('.showcase-copy .intro-actions');
  if (!introActions) return null;
  const panel = document.createElement('div');
  panel.id = 'presentationLaunchPanel';
  panel.className = 'presentation-launch-panel';
  panel.innerHTML = `<div class="presentation-launch-copy"><span>KUNDENTERMIN</span><strong>Präsentationsmodus · 12 Schritte</strong><small>Geführter Fokusmodus mit Tastatursteuerung, klarer Bereichsmarkierung und optionalem Browser-Vollbild.</small></div><button type="button" class="presentation-launch-action" id="presentationModeBtn">Präsentationsmodus starten</button>`;
  introActions.insertAdjacentElement('afterend', panel);
  return panel;
}

function enhanceTourDock(dock) {
  if (!dock) return;
  dock.classList.add('presentation-dock');
  const progress = dock.querySelector('.tour-progress');
  const count = document.getElementById('tourStepCount');
  if (count) count.textContent = `1 / ${TOUR_STEPS.length}`;

  if (!document.getElementById('tourFocusLabel')) {
    const meta = document.createElement('div');
    meta.className = 'tour-presentation-meta';
    meta.innerHTML = `<span class="tour-focus-label" id="tourFocusLabel">Management-Lagebild</span><button type="button" class="tour-fullscreen-btn" id="tourFullscreenBtn">Vollbild</button>`;
    progress?.insertAdjacentElement('afterend', meta);
  }

  if (!document.getElementById('tourProgressTrack')) {
    const track = document.createElement('div');
    track.id = 'tourProgressTrack';
    track.className = 'tour-progress-track';
    track.setAttribute('aria-hidden', 'true');
    track.innerHTML = '<span id="tourProgressBar"></span>';
    document.getElementById('tourFocusLabel')?.parentElement?.insertAdjacentElement('afterend', track);
  }

  if (!dock.querySelector('.tour-key-hints')) {
    const hints = document.createElement('div');
    hints.className = 'tour-key-hints';
    hints.innerHTML = '<span>← → Schritte</span><span>F Vollbild</span><span>Esc beenden</span>';
    dock.querySelector('.tour-controls')?.insertAdjacentElement('beforebegin', hints);
  }
}

function activatePresentationView(view) {
  const titles = {
    management: 'Management',
    conclusion: 'Präsentationsabschluss'
  };
  document.querySelectorAll('.view').forEach(section => section.classList.toggle('active', section.dataset.demoView === view));
  document.querySelectorAll('.demo-nav button[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  const viewTitle = document.getElementById('viewTitle');
  if (viewTitle && titles[view]) viewTitle.textContent = titles[view];
  document.getElementById('demoSidebar')?.classList.remove('open');
  document.getElementById('demoApp')?.scrollIntoView({ block: 'start' });
}

function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  return target.matches('input, textarea, select, [contenteditable="true"]');
}

export function initPresentationGuide({ openView, openShipment, setPresentationRole } = {}) {
  ensurePresentationModeStyles();
  ensurePresentationLauncher();

  const dock = document.getElementById('tourDock');
  enhanceTourDock(dock);
  const count = document.getElementById('tourStepCount');
  const title = document.getElementById('tourStepTitle');
  const text = document.getElementById('tourStepText');
  const prev = document.getElementById('tourPrevBtn');
  const next = document.getElementById('tourNextBtn');
  const close = document.getElementById('tourCloseBtn');
  const progressBar = document.getElementById('tourProgressBar');
  const focusLabel = document.getElementById('tourFocusLabel');
  const fullscreenButton = document.getElementById('tourFullscreenBtn');
  const presentationModeButton = document.getElementById('presentationModeBtn');
  const startButtons = [document.getElementById('startTourBtn'), document.getElementById('restartTourBtn')].filter(Boolean);
  let index = 0;
  let transitionTimer = null;

  function clearSpotlight() {
    document.querySelectorAll('.tour-spotlight').forEach(element => element.classList.remove('tour-spotlight'));
  }

  function applySpotlight(step) {
    clearSpotlight();
    const fallback = document.querySelector(`[data-demo-view="${step.view}"].active`);
    const target = document.querySelector(step.spotlight) || fallback;
    if (!target) return;
    target.classList.add('tour-spotlight');
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    target.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
  }

  function setTransitioning() {
    document.body.classList.add('tour-transitioning');
    if (transitionTimer) window.clearTimeout(transitionTimer);
    transitionTimer = window.setTimeout(() => document.body.classList.remove('tour-transitioning'), 190);
  }

  function updatePresenterChrome(step) {
    if (count) count.textContent = `${index + 1} / ${TOUR_STEPS.length}`;
    if (title) title.textContent = step.title;
    if (text) text.textContent = step.text;
    if (focusLabel) focusLabel.textContent = step.focusLabel || step.title;
    if (progressBar) progressBar.style.width = `${((index + 1) / TOUR_STEPS.length) * 100}%`;
    if (prev) prev.disabled = index === 0;
    if (next) next.textContent = index === TOUR_STEPS.length - 1 ? 'Präsentation schließen' : 'Weiter';
    if (dock) dock.hidden = false;
  }

  function applyStep() {
    const step = TOUR_STEPS[index];
    if (!step) return;
    setTransitioning();
    if (step.view === 'management' || step.view === 'conclusion') activatePresentationView(step.view);
    else openView?.(step.view);
    if (step.shipmentId && step.view === 'shipments') openShipment?.(step.shipmentId, { preserveScroll: true });
    if (step.role && step.employeeId) setPresentationRole?.(step.role, step.employeeId);
    updatePresenterChrome(step);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => applySpotlight(step)));
  }

  async function enterFullscreen() {
    if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Browser or presentation environment denied fullscreen; guided mode remains usable.
    }
  }

  async function exitFullscreen() {
    if (!document.fullscreenElement || !document.exitFullscreen) return;
    try {
      await document.exitFullscreen();
    } catch {
      // The browser may already be leaving fullscreen because of Escape.
    }
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) await exitFullscreen();
    else await enterFullscreen();
  }

  function start() {
    index = 0;
    document.body.classList.add('presentation-mode');
    document.getElementById('demoApp')?.scrollIntoView({ block: 'start' });
    applyStep();
  }

  function finish() {
    if (transitionTimer) window.clearTimeout(transitionTimer);
    if (dock) dock.hidden = true;
    clearSpotlight();
    document.body.classList.remove('presentation-mode', 'tour-transitioning');
    void exitFullscreen();
  }

  function goPrevious() {
    if (index <= 0) return;
    index -= 1;
    applyStep();
  }

  function goNext() {
    if (index >= TOUR_STEPS.length - 1) {
      finish();
      return;
    }
    index += 1;
    applyStep();
  }

  prev?.addEventListener('click', goPrevious);
  next?.addEventListener('click', goNext);
  close?.addEventListener('click', finish);
  startButtons.forEach(button => button.addEventListener('click', start));
  presentationModeButton?.addEventListener('click', () => {
    start();
    void enterFullscreen();
  });
  fullscreenButton?.addEventListener('click', () => void toggleFullscreen());

  document.addEventListener('fullscreenchange', () => {
    if (fullscreenButton) fullscreenButton.textContent = document.fullscreenElement ? 'Vollbild verlassen' : 'Vollbild';
  });

  document.addEventListener('keydown', event => {
    if (!document.body.classList.contains('presentation-mode') || isEditableTarget(event.target)) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      goNext();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goPrevious();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      finish();
    } else if (event.key === 'f' || event.key === 'F') {
      event.preventDefault();
      void toggleFullscreen();
    }
  });

  return { start, close: finish, getStep: () => TOUR_STEPS[index], toggleFullscreen };
}
