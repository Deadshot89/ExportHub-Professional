import {
  DEMO_COMPANY,
  DEMO_EMPLOYEES,
  DEMO_CUSTOMERS,
  DEMO_LOCATIONS,
  DEMO_SHIPMENTS,
  DEMO_TASKS,
  DEMO_TODAY
} from './demo-data.js';

const STORAGE_KEY = 'exporthub-professional-company-showcase-v1';
const STATUS_FLOW = Object.freeze([
  'Entwurf',
  'Erstellt',
  'Bereit zur Abholung',
  'Abgeholt',
  'POD vorhanden',
  'Abgeschlossen',
  'Archiviert'
]);
const LOCKED_STATUSES = new Set(['Abgeholt', 'POD vorhanden', 'Abgeschlossen', 'Archiviert']);
const DOCUMENT_TYPES = new Set(['delivery', 'l1', 'l2', 'cmr', 'abd', 'pod']);

let memoryState = null;

function clone(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function baselineState() {
  return {
    demo: true,
    companyId: DEMO_COMPANY.id,
    version: 1,
    role: { role: 'Exportkoordination', employeeId: 'emp-02' },
    company: clone(DEMO_COMPANY),
    employees: clone(DEMO_EMPLOYEES),
    customers: clone(DEMO_CUSTOMERS),
    locations: clone(DEMO_LOCATIONS),
    shipments: clone(DEMO_SHIPMENTS),
    tasks: clone(DEMO_TASKS),
    avis: []
  };
}

function storage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function validState(candidate) {
  return Boolean(candidate && candidate.demo === true && candidate.companyId === DEMO_COMPANY.id && Array.isArray(candidate.shipments));
}

function loadState() {
  if (memoryState) return memoryState;
  const target = storage();
  if (target) {
    try {
      const parsed = JSON.parse(target.getItem(STORAGE_KEY) || 'null');
      if (validState(parsed)) {
        memoryState = parsed;
        return memoryState;
      }
    } catch {
      // A corrupted local demo snapshot is discarded and replaced with the fixed baseline.
    }
  }
  memoryState = baselineState();
  return memoryState;
}

function persist() {
  const target = storage();
  if (target) target.setItem(STORAGE_KEY, JSON.stringify(memoryState));
}

function requireShipment(id) {
  const shipment = loadState().shipments.find(item => item.id === id);
  if (!shipment || shipment.demo !== true) throw new Error('DEMO_SENDUNG_NICHT_GEFUNDEN');
  return shipment;
}

function assertUnlocked(shipment) {
  if (LOCKED_STATUSES.has(shipment.status)) throw new Error('SENDUNG_GESPERRT');
}

export function getState() {
  return clone(loadState());
}

export function reset() {
  memoryState = baselineState();
  persist();
  return getState();
}

export function updateShipment(id, patch) {
  const shipment = requireShipment(id);
  assertUnlocked(shipment);
  const safePatch = clone(patch || {});
  delete safePatch.id;
  delete safePatch.demo;
  Object.assign(shipment, safePatch, { demo: true });
  persist();
  return clone(shipment);
}

export function setDocumentState(id, documentType, present) {
  if (!DOCUMENT_TYPES.has(documentType)) throw new Error('UNBEKANNTES_DOKUMENT');
  const shipment = requireShipment(id);
  if (documentType === 'pod' && present === true && !LOCKED_STATUSES.has(shipment.status)) {
    throw new Error('POD_VOR_ABHOLUNG');
  }
  if (LOCKED_STATUSES.has(shipment.status) && documentType !== 'pod') throw new Error('SENDUNG_GESPERRT');
  shipment.documents = { ...(shipment.documents || {}), [documentType]: Boolean(present) };
  if (documentType === 'abd' && present) shipment.attention = shipment.attention === 'ABD fehlt' ? null : shipment.attention;
  if (documentType === 'pod' && present) shipment.attention = shipment.attention === 'POD fehlt' ? null : shipment.attention;
  persist();
  return clone(shipment);
}

export function transitionShipment(id, targetStatus) {
  const shipment = requireShipment(id);
  const currentIndex = STATUS_FLOW.indexOf(shipment.status);
  const targetIndex = STATUS_FLOW.indexOf(targetStatus);
  if (currentIndex < 0 || targetIndex !== currentIndex + 1) throw new Error('UNGUELTIGER_STATUSWECHSEL');

  if (targetStatus === 'Bereit zur Abholung' && shipment.requiresAbd && shipment.documents?.abd !== true) {
    throw new Error('ABD_FEHLT');
  }
  if (targetStatus === 'POD vorhanden' && shipment.documents?.pod !== true) throw new Error('POD_FEHLT');

  shipment.status = targetStatus;
  if (targetStatus === 'Abgeholt') {
    shipment.actualPickup = shipment.actualPickup || DEMO_TODAY;
    shipment.attention = shipment.documents?.pod === true ? shipment.attention : 'POD fehlt';
  }
  if (targetStatus === 'POD vorhanden') shipment.attention = null;
  persist();
  return clone(shipment);
}

export function completeTask(id) {
  const task = loadState().tasks.find(item => item.id === id);
  if (!task || task.demo !== true) throw new Error('DEMO_AUFGABE_NICHT_GEFUNDEN');
  task.status = 'Erledigt';
  persist();
  return clone(task);
}

export function setRole(role, employeeId) {
  const employee = loadState().employees.find(item => item.id === employeeId && item.demo === true);
  if (!employee) throw new Error('DEMO_MITARBEITER_NICHT_GEFUNDEN');
  loadState().role = { role, employeeId };
  persist();
  return clone(loadState().role);
}

export { STATUS_FLOW };
