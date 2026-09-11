import {
  DEMO_COMPANY,
  DEMO_EMPLOYEES,
  DEMO_CUSTOMERS,
  DEMO_LOCATIONS,
  DEMO_SHIPMENTS,
  DEMO_TASKS,
  DEMO_TODAY
} from './demo-data.js';
import { calculateColliSummary, isNonEuCountry, isValidReference, requiresAbd } from './demo-shipment-create.js';

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

export const DEMO_ROLE_CAPABILITIES = Object.freeze({
  Firmenadmin: Object.freeze({
    viewShipments: true,
    editShipments: true,
    completeTasks: true,
    viewDocuments: true,
    manageCustomers: true,
    confirmPickup: true,
    addPod: true,
    createAvis: true,
    viewAudit: true
  }),
  Exportkoordination: Object.freeze({
    viewShipments: true,
    editShipments: true,
    completeTasks: true,
    viewDocuments: true,
    manageCustomers: false,
    confirmPickup: true,
    addPod: true,
    createAvis: true,
    viewAudit: true
  }),
  Teamleitung: Object.freeze({
    viewShipments: true,
    editShipments: true,
    completeTasks: true,
    viewDocuments: true,
    manageCustomers: false,
    confirmPickup: true,
    addPod: false,
    createAvis: true,
    viewAudit: true
  }),
  Lager: Object.freeze({
    viewShipments: true,
    editShipments: false,
    completeTasks: true,
    viewDocuments: true,
    manageCustomers: false,
    confirmPickup: true,
    addPod: true,
    createAvis: false,
    viewAudit: false
  }),
  Sachbearbeitung: Object.freeze({
    viewShipments: true,
    editShipments: true,
    completeTasks: true,
    viewDocuments: true,
    manageCustomers: false,
    confirmPickup: false,
    addPod: false,
    createAvis: true,
    viewAudit: false
  }),
  Auditor: Object.freeze({
    viewShipments: true,
    editShipments: false,
    completeTasks: false,
    viewDocuments: true,
    manageCustomers: false,
    confirmPickup: false,
    addPod: false,
    createAvis: false,
    viewAudit: true
  })
});

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

function nextCreatedShipmentId(state) {
  let number = state.shipments.length + 1;
  let id = `sh-demo-${String(number).padStart(3, '0')}`;
  while (state.shipments.some(item => item.id === id)) {
    number += 1;
    id = `sh-demo-${String(number).padStart(3, '0')}`;
  }
  return id;
}

function safeDocuments(input = {}) {
  return {
    delivery: Boolean(input.delivery),
    l1: Boolean(input.l1),
    l2: Boolean(input.l2),
    cmr: Boolean(input.cmr),
    abd: Boolean(input.abd),
    pod: false
  };
}

export function canRole(role, capability) {
  return DEMO_ROLE_CAPABILITIES[role]?.[capability] === true;
}

export function getState() {
  return clone(loadState());
}

export function reset() {
  memoryState = baselineState();
  persist();
  return getState();
}

export function createShipment(input = {}) {
  const state = loadState();
  const reference = String(input.reference || '').trim().toUpperCase();
  if (!isValidReference(reference)) throw new Error('UNGUELTIGE_REFERENZ');
  if (state.shipments.some(item => item.reference === reference)) throw new Error('REFERENZ_VERGEBEN');

  const customer = state.customers.find(item => item.id === input.customerId && item.demo === true);
  if (!customer) throw new Error('DEMO_KUNDE_NICHT_GEFUNDEN');
  const location = state.locations.find(item => item.id === input.locationId && item.demo === true);
  if (!location) throw new Error('DEMO_STANDORT_NICHT_GEFUNDEN');
  if (location.customerId !== customer.id) throw new Error('STANDORT_GEHOERT_NICHT_ZUM_KUNDEN');
  const owner = state.employees.find(item => item.id === input.ownerId && item.demo === true);
  if (!owner) throw new Error('DEMO_MITARBEITER_NICHT_GEFUNDEN');

  const colliSummary = calculateColliSummary(Array.isArray(input.colli) ? input.colli : []);
  if (!colliSummary.rows.length || colliSummary.totalQuantity < 1) throw new Error('COLLI_FEHLEN');

  const nonEu = isNonEuCountry(location.country);
  const valueEur = Math.max(0, Number(input.valueEur) || 0);
  const forwarderRequiresAbd = Boolean(input.forwarderRequiresAbd);
  const abdRequired = requiresAbd({ nonEu, valueEur, forwarderRequiresAbd });
  const documents = safeDocuments(input.documents);
  const missingBase = ['delivery','l1','l2'].filter(type => documents[type] !== true);
  const attention = abdRequired && documents.abd !== true
    ? 'ABD fehlt'
    : missingBase.length
      ? 'Sendung vervollständigen'
      : null;

  const created = {
    id: nextCreatedShipmentId(state),
    reference,
    customerId: customer.id,
    locationId: location.id,
    status: 'Entwurf',
    ownerId: owner.id,
    plannedPickup: String(input.plannedPickup || DEMO_TODAY),
    actualPickup: null,
    destination: `${location.city} · ${location.country}`,
    nonEu,
    requiresAbd: abdRequired,
    forwarderRequiresAbd,
    valueEur,
    packages: `${colliSummary.totalQuantity} Colli`,
    weightKg: colliSummary.totalWeightKg,
    ldm: colliSummary.totalLdm,
    colli: colliSummary.rows,
    documents,
    avis: 'Offen',
    attention,
    priority: String(input.priority || 'P2'),
    demo: true
  };

  state.shipments.unshift(created);
  persist();
  return clone(created);
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

export function saveAvis(record) {
  const shipment = requireShipment(record?.shipmentId);
  const safeRecord = {
    id: String(record.id || `avis-${shipment.id}`),
    reference: String(record.reference || `DEMO-AVIS-${shipment.reference}`),
    shipmentId: shipment.id,
    previewTarget: String(record.previewTarget || `#demo-avis/${shipment.reference}`),
    createdAt: String(record.createdAt || `${DEMO_TODAY}T10:00:00`),
    status: String(record.status || 'Demo-Vorschau erstellt'),
    demo: true
  };
  if (!safeRecord.previewTarget.startsWith('#demo-avis/')) throw new Error('AVIS_NUR_LOKAL');
  const state = loadState();
  const existingIndex = state.avis.findIndex(item => item.shipmentId === shipment.id);
  if (existingIndex >= 0) state.avis[existingIndex] = safeRecord;
  else state.avis.push(safeRecord);
  shipment.avis = 'Vorschau erstellt (Demo)';
  persist();
  return clone(safeRecord);
}

export function setRole(role, employeeId) {
  if (!DEMO_ROLE_CAPABILITIES[role]) throw new Error('UNBEKANNTE_DEMO_ROLLE');
  const employee = loadState().employees.find(item => item.id === employeeId && item.demo === true);
  if (!employee) throw new Error('DEMO_MITARBEITER_NICHT_GEFUNDEN');
  loadState().role = { role, employeeId };
  persist();
  return clone(loadState().role);
}

export { STATUS_FLOW };