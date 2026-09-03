export const TOUR_STEPS = Object.freeze([
  Object.freeze({
    view: 'overview',
    title: '1 · Tagesüberblick statt Einzelrecherche',
    text: 'Der Einstieg zeigt offene Sendungen, heutige Abholungen, fehlende Dokumente und priorisierten Handlungsbedarf aus einem gemeinsamen fiktiven Arbeitsstand.'
  }),
  Object.freeze({
    view: 'shipments',
    shipmentId: 'sh-001',
    title: '2 · Blockierte Nicht-EU-Sendung erkennen',
    text: 'RWD301 ist bewusst mit fehlendem ABD vorbereitet. ExportHUB macht sichtbar, warum der Vorgang noch nicht zur Abholung freigegeben werden darf.'
  }),
  Object.freeze({
    view: 'documents',
    title: '3 · Pflichtdokumente automatisch einordnen',
    text: 'Die Dokumentenübersicht unterscheidet je Sendung zwischen vorhandenen und fehlenden Pflichtunterlagen wie Lieferschein, L1, L2, CMR, ABD und POD.'
  }),
  Object.freeze({
    view: 'tasks',
    title: '4 · Offene Schritte klar zuweisen',
    text: 'Aufgaben verbinden Priorität, Fälligkeit, verantwortliche Person und Sendungsreferenz. In der Demo lassen sie sich lokal als erledigt markieren.'
  }),
  Object.freeze({
    view: 'shipments',
    shipmentId: 'sh-002',
    title: '5 · Bereite Sendung an das Lager übergeben',
    text: 'RWD302 besitzt die notwendigen Ausfuhrunterlagen und steht bereit zur Abholung. Der nächste zulässige Status ist damit eindeutig.'
  }),
  Object.freeze({
    view: 'shipments',
    shipmentId: 'sh-005',
    title: '6 · Abholung und POD sauber trennen',
    text: 'Nach bestätigter Abholung sind operative Sendungsdaten gesperrt. Der fehlende POD bleibt als eigener Nachweisschritt sichtbar, bis er ergänzt wurde.'
  }),
  Object.freeze({
    view: 'avis',
    shipmentId: 'sh-002',
    title: '7 · Kunden-Avis ohne internen Zugriff',
    text: 'Die Präsentation zeigt eine getrennte Kundenansicht mit Referenz, Abholinformationen und freigegebenen Unterlagen. Der Demo-Verweis bleibt ausschließlich lokal.'
  }),
  Object.freeze({
    view: 'customers',
    title: '8 · Kunden zentral mit Vorgängen verbinden',
    text: 'Die Kundenansicht fasst fiktive Kundennummer, Land, Standorte und zugehörige Sendungen zusammen, ohne die operative Oberfläche mit Stammdatenformularen zu überladen.'
  }),
  Object.freeze({
    view: 'locations',
    title: '9 · Lieferstandorte getrennt pflegen und prüfen',
    text: 'Zwölf fiktive Lieferstandorte machen sichtbar, welchem Kunden und Land ein Ziel zugeordnet ist und wie häufig es im Demo-Sendungsbestand verwendet wird.'
  }),
  Object.freeze({
    view: 'team',
    role: 'Lager',
    employeeId: 'emp-06',
    title: '10 · Rollen zeigen nur den passenden Arbeitskontext',
    text: 'Zum Abschluss wechselt die Präsentation lokal in die Lagerrolle. Abholung und POD sind verfügbar, während Kundenverwaltung und andere nicht benötigte Aktionen ausgeblendet bleiben.'
  })
]);

export function initPresentationGuide({ openView, openShipment, setPresentationRole } = {}) {
  const dock = document.getElementById('tourDock');
  const count = document.getElementById('tourStepCount');
  const title = document.getElementById('tourStepTitle');
  const text = document.getElementById('tourStepText');
  const prev = document.getElementById('tourPrevBtn');
  const next = document.getElementById('tourNextBtn');
  const close = document.getElementById('tourCloseBtn');
  const startButtons = [document.getElementById('startTourBtn'), document.getElementById('restartTourBtn')].filter(Boolean);
  let index = 0;

  function applyStep() {
    const step = TOUR_STEPS[index];
    if (!step) return;
    openView?.(step.view);
    if (step.shipmentId && step.view === 'shipments') openShipment?.(step.shipmentId, { preserveScroll: true });
    if (step.role && step.employeeId) setPresentationRole?.(step.role, step.employeeId);
    if (count) count.textContent = `${index + 1} / ${TOUR_STEPS.length}`;
    if (title) title.textContent = step.title;
    if (text) text.textContent = step.text;
    if (prev) prev.disabled = index === 0;
    if (next) next.textContent = index === TOUR_STEPS.length - 1 ? 'Tour beenden' : 'Weiter';
    if (dock) dock.hidden = false;
  }

  function start() {
    index = 0;
    document.getElementById('demoApp')?.scrollIntoView({ block: 'start' });
    applyStep();
  }

  function finish() {
    if (dock) dock.hidden = true;
  }

  prev?.addEventListener('click', () => {
    if (index > 0) {
      index -= 1;
      applyStep();
    }
  });
  next?.addEventListener('click', () => {
    if (index >= TOUR_STEPS.length - 1) {
      finish();
      return;
    }
    index += 1;
    applyStep();
  });
  close?.addEventListener('click', finish);
  startButtons.forEach(button => button.addEventListener('click', start));

  return { start, close: finish, getStep: () => TOUR_STEPS[index] };
}
