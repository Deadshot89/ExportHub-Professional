export const DEMO_TODAY = '2026-09-03';

export const DEMO_COMPANY = Object.freeze({
  id: 'demo-company-rheinwerk',
  name: 'Rheinwerk Industrial Solutions GmbH',
  workspace: 'rheinwerk-demo',
  industry: 'Industriekomponenten & Logistik',
  region: 'Nordrhein-Westfalen',
  demo: true
});

export const DEMO_EMPLOYEES = Object.freeze([
  { id:'emp-01', name:'Leonie Berger', role:'Firmenadmin', team:'Administration', email:'leonie.berger@example.com', demo:true },
  { id:'emp-02', name:'Jonas Feld', role:'Exportkoordination', team:'Export', email:'jonas.feld@example.com', demo:true },
  { id:'emp-03', name:'Mara Winter', role:'Teamleitung', team:'Export', email:'mara.winter@example.com', demo:true },
  { id:'emp-04', name:'Noah Stein', role:'Sachbearbeitung', team:'Export', email:'noah.stein@example.com', demo:true },
  { id:'emp-05', name:'Lina Köster', role:'Sachbearbeitung', team:'Export', email:'lina.koester@example.com', demo:true },
  { id:'emp-06', name:'Elias Brandt', role:'Lager', team:'Lager', email:'elias.brandt@example.com', demo:true },
  { id:'emp-07', name:'Sophie Kern', role:'Lager', team:'Lager', email:'sophie.kern@example.com', demo:true },
  { id:'emp-08', name:'David Reuter', role:'Teamleitung', team:'Lager', email:'david.reuter@example.com', demo:true },
  { id:'emp-09', name:'Amelie Roth', role:'Sachbearbeitung', team:'Export', email:'amelie.roth@example.com', demo:true },
  { id:'emp-10', name:'Finn Lorenz', role:'Auditor', team:'Qualität', email:'finn.lorenz@example.com', demo:true },
  { id:'emp-11', name:'Nina Vogt', role:'Exportkoordination', team:'Export', email:'nina.vogt@example.com', demo:true },
  { id:'emp-12', name:'Paul Henning', role:'Lager', team:'Lager', email:'paul.henning@example.com', demo:true }
]);

export const DEMO_CUSTOMERS = Object.freeze([
  { id:'cus-01', number:'D10001', name:'Auronex Maschinenbau GmbH', country:'DE', status:'Aktiv', demo:true },
  { id:'cus-02', number:'D10002', name:'Belvaris Components B.V.', country:'NL', status:'Aktiv', demo:true },
  { id:'cus-03', number:'D10003', name:'Caldora Systems S.A.S.', country:'FR', status:'Aktiv', demo:true },
  { id:'cus-04', number:'D10004', name:'Deltaris Motion Sp. z o.o.', country:'PL', status:'Aktiv', demo:true },
  { id:'cus-05', number:'D10005', name:'Elystra Automation AG', country:'CH', status:'Aktiv', demo:true },
  { id:'cus-06', number:'D10006', name:'Ferroviax Industries Ltd.', country:'GB', status:'Aktiv', demo:true },
  { id:'cus-07', number:'D10007', name:'Galdor Teknik AB', country:'SE', status:'Aktiv', demo:true },
  { id:'cus-08', number:'D10008', name:'Helionis Parts S.L.', country:'ES', status:'Aktiv', demo:true }
]);

export const DEMO_LOCATIONS = Object.freeze([
  { id:'loc-01', customerId:'cus-01', label:'Werk Nord', city:'Dortmund', country:'DE', address:'Musterallee 12', demo:true },
  { id:'loc-02', customerId:'cus-01', label:'Montagezentrum', city:'Kassel', country:'DE', address:'Beispielring 8', demo:true },
  { id:'loc-03', customerId:'cus-02', label:'Distribution Center', city:'Eindhoven', country:'NL', address:'Demo Park 21', demo:true },
  { id:'loc-04', customerId:'cus-03', label:'Site Est', city:'Metz', country:'FR', address:'Rue Exemple 14', demo:true },
  { id:'loc-05', customerId:'cus-03', label:'Site Sud', city:'Lyon', country:'FR', address:'Avenue Démo 6', demo:true },
  { id:'loc-06', customerId:'cus-04', label:'Plant A', city:'Poznań', country:'PL', address:'Ulica Demo 17', demo:true },
  { id:'loc-07', customerId:'cus-05', label:'Zentrallager', city:'Basel', country:'CH', address:'Musterweg 4', demo:true },
  { id:'loc-08', customerId:'cus-05', label:'Montage', city:'Winterthur', country:'CH', address:'Beispielplatz 9', demo:true },
  { id:'loc-09', customerId:'cus-06', label:'UK Hub', city:'Birmingham', country:'GB', address:'Example Way 31', demo:true },
  { id:'loc-10', customerId:'cus-07', label:'Nordic Hub', city:'Malmö', country:'SE', address:'Demogatan 11', demo:true },
  { id:'loc-11', customerId:'cus-08', label:'Centro', city:'Valencia', country:'ES', address:'Calle Ejemplo 18', demo:true },
  { id:'loc-12', customerId:'cus-08', label:'Norte', city:'Bilbao', country:'ES', address:'Avenida Demo 5', demo:true }
]);

const docs = ({ delivery=true, l1=true, l2=true, cmr=false, abd=false, pod=false }={}) => ({
  delivery, l1, l2, cmr, abd, pod
});

export const DEMO_SHIPMENTS = Object.freeze([
  { id:'sh-001', reference:'RWD301', customerId:'cus-05', locationId:'loc-07', status:'Erstellt', ownerId:'emp-02', plannedPickup:'2026-09-03', actualPickup:null, destination:'Basel · CH', nonEu:true, requiresAbd:true, valueEur:18400, packages:'3 Europaletten', weightKg:1280, documents:docs({cmr:true,abd:false}), avis:'Vorbereiten', attention:'ABD fehlt', priority:'P0', demo:true },
  { id:'sh-002', reference:'RWD302', customerId:'cus-06', locationId:'loc-09', status:'Bereit zur Abholung', ownerId:'emp-11', plannedPickup:'2026-09-03', actualPickup:null, destination:'Birmingham · GB', nonEu:true, requiresAbd:true, valueEur:9600, packages:'2 Europaletten', weightKg:840, documents:docs({cmr:true,abd:true}), avis:'Gesendet (Demo)', attention:null, priority:'P1', demo:true },
  { id:'sh-003', reference:'RWD303', customerId:'cus-02', locationId:'loc-03', status:'Erstellt', ownerId:'emp-04', plannedPickup:'2026-09-03', actualPickup:null, destination:'Eindhoven · NL', nonEu:false, requiresAbd:false, valueEur:4800, packages:'4 Kartons', weightKg:96, documents:docs({delivery:false}), avis:'Offen', attention:'Lieferschein fehlt', priority:'P1', demo:true },
  { id:'sh-004', reference:'RWD304', customerId:'cus-03', locationId:'loc-04', status:'Bereit zur Abholung', ownerId:'emp-05', plannedPickup:'2026-09-03', actualPickup:null, destination:'Metz · FR', nonEu:false, requiresAbd:false, valueEur:7200, packages:'1 Europalette', weightKg:410, documents:docs({cmr:true}), avis:'Gesendet (Demo)', attention:null, priority:'P2', demo:true },
  { id:'sh-005', reference:'RWD305', customerId:'cus-04', locationId:'loc-06', status:'Abgeholt', ownerId:'emp-09', plannedPickup:'2026-09-02', actualPickup:'2026-09-02', destination:'Poznań · PL', nonEu:false, requiresAbd:false, valueEur:11300, packages:'5 Europaletten', weightKg:2140, documents:docs({cmr:true,pod:false}), avis:'Abgeschlossen', attention:'POD fehlt', priority:'P1', demo:true },
  { id:'sh-006', reference:'RWD306', customerId:'cus-01', locationId:'loc-01', status:'POD vorhanden', ownerId:'emp-04', plannedPickup:'2026-09-01', actualPickup:'2026-09-01', destination:'Dortmund · DE', nonEu:false, requiresAbd:false, valueEur:3600, packages:'2 Pakete', weightKg:44, documents:docs({pod:true}), avis:'Abgeschlossen', attention:null, priority:'P3', demo:true },
  { id:'sh-007', reference:'RWD307', customerId:'cus-07', locationId:'loc-10', status:'Entwurf', ownerId:'emp-02', plannedPickup:'2026-09-04', actualPickup:null, destination:'Malmö · SE', nonEu:false, requiresAbd:false, valueEur:15800, packages:'6 Europaletten', weightKg:2520, documents:docs({delivery:false,l1:false,l2:false}), avis:'Offen', attention:'Sendung vervollständigen', priority:'P2', demo:true },
  { id:'sh-008', reference:'RWD308', customerId:'cus-08', locationId:'loc-11', status:'Erstellt', ownerId:'emp-11', plannedPickup:'2026-09-04', actualPickup:null, destination:'Valencia · ES', nonEu:false, requiresAbd:false, valueEur:6200, packages:'3 Europaletten', weightKg:980, documents:docs({cmr:false}), avis:'Vorbereiten', attention:'CMR fehlt', priority:'P2', demo:true },
  { id:'sh-009', reference:'RWD309', customerId:'cus-05', locationId:'loc-08', status:'Erstellt', ownerId:'emp-05', plannedPickup:'2026-09-05', actualPickup:null, destination:'Winterthur · CH', nonEu:true, requiresAbd:true, valueEur:24500, packages:'8 Europaletten', weightKg:3380, documents:docs({cmr:true,abd:true}), avis:'Vorbereiten', attention:null, priority:'P3', demo:true },
  { id:'sh-010', reference:'RWD310', customerId:'cus-03', locationId:'loc-05', status:'Abgeschlossen', ownerId:'emp-09', plannedPickup:'2026-08-31', actualPickup:'2026-08-31', destination:'Lyon · FR', nonEu:false, requiresAbd:false, valueEur:8900, packages:'2 Europaletten', weightKg:760, documents:docs({cmr:true,pod:true}), avis:'Abgeschlossen', attention:null, priority:'P4', demo:true },
  { id:'sh-011', reference:'RWD311', customerId:'cus-01', locationId:'loc-02', status:'Archiviert', ownerId:'emp-04', plannedPickup:'2026-08-29', actualPickup:'2026-08-29', destination:'Kassel · DE', nonEu:false, requiresAbd:false, valueEur:2100, packages:'6 Kartons', weightKg:122, documents:docs({pod:true}), avis:'Abgeschlossen', attention:null, priority:'P4', demo:true },
  { id:'sh-012', reference:'RWD312', customerId:'cus-02', locationId:'loc-03', status:'Bereit zur Abholung', ownerId:'emp-05', plannedPickup:'2026-09-03', actualPickup:null, destination:'Eindhoven · NL', nonEu:false, requiresAbd:false, valueEur:5100, packages:'1 Europalette', weightKg:350, documents:docs({cmr:true}), avis:'Gesendet (Demo)', attention:null, priority:'P2', demo:true },
  { id:'sh-013', reference:'RWD313', customerId:'cus-08', locationId:'loc-12', status:'Erstellt', ownerId:'emp-11', plannedPickup:'2026-09-06', actualPickup:null, destination:'Bilbao · ES', nonEu:false, requiresAbd:false, valueEur:13300, packages:'4 Europaletten', weightKg:1560, documents:docs({cmr:true}), avis:'Offen', attention:null, priority:'P3', demo:true },
  { id:'sh-014', reference:'RWD314', customerId:'cus-06', locationId:'loc-09', status:'Abgeholt', ownerId:'emp-02', plannedPickup:'2026-09-02', actualPickup:'2026-09-02', destination:'Birmingham · GB', nonEu:true, requiresAbd:true, valueEur:19200, packages:'3 Europaletten', weightKg:1410, documents:docs({cmr:true,abd:true,pod:false}), avis:'Abgeschlossen', attention:'POD fehlt', priority:'P0', demo:true }
]);

export const DEMO_TASKS = Object.freeze([
  { id:'task-01', shipmentId:'sh-001', title:'ABD anfordern', ownerId:'emp-02', due:'Heute · 10:30', priority:'P0', status:'Offen', demo:true },
  { id:'task-02', shipmentId:'sh-003', title:'Lieferschein ergänzen', ownerId:'emp-04', due:'Heute · 11:00', priority:'P1', status:'Offen', demo:true },
  { id:'task-03', shipmentId:'sh-004', title:'Abholung vorbereiten', ownerId:'emp-06', due:'Heute · 12:30', priority:'P2', status:'Offen', demo:true },
  { id:'task-04', shipmentId:'sh-005', title:'POD nachfordern', ownerId:'emp-09', due:'Heute · 13:00', priority:'P1', status:'Offen', demo:true },
  { id:'task-05', shipmentId:'sh-002', title:'Verladeunterlagen bereitstellen', ownerId:'emp-07', due:'Heute · 13:30', priority:'P1', status:'Offen', demo:true },
  { id:'task-06', shipmentId:'sh-012', title:'Abholung bestätigen', ownerId:'emp-06', due:'Heute · 14:00', priority:'P2', status:'Offen', demo:true },
  { id:'task-07', shipmentId:'sh-008', title:'CMR erstellen', ownerId:'emp-11', due:'Morgen · 09:00', priority:'P2', status:'Offen', demo:true },
  { id:'task-08', shipmentId:'sh-009', title:'Kunden-Avis vorbereiten', ownerId:'emp-05', due:'Morgen · 10:00', priority:'P3', status:'Offen', demo:true },
  { id:'task-09', shipmentId:'sh-007', title:'Colli-Daten vervollständigen', ownerId:'emp-02', due:'Morgen · 11:00', priority:'P2', status:'Offen', demo:true },
  { id:'task-10', shipmentId:'sh-014', title:'POD nachfordern', ownerId:'emp-02', due:'Heute · 15:00', priority:'P0', status:'Offen', demo:true }
]);

export const DEMO_ACTIVITIES = Object.freeze([
  { time:'09:42', label:'RWD302', text:'ABD vollständig · bereit zur Abholung', tone:'good' },
  { time:'09:18', label:'RWD303', text:'Dokumentenprüfung meldet fehlenden Lieferschein', tone:'warn' },
  { time:'08:56', label:'RWD305', text:'Abholung bestätigt · POD noch offen', tone:'warn' },
  { time:'08:31', label:'RWD304', text:'Kunden-Avis in der Demo vorbereitet', tone:'info' }
]);

export function requiredDocumentTypes(shipment) {
  const required = ['delivery', 'l1', 'l2'];
  if (shipment.destination && !shipment.destination.endsWith('· DE')) required.push('cmr');
  if (shipment.requiresAbd) required.push('abd');
  if (['Abgeholt', 'POD vorhanden', 'Abgeschlossen', 'Archiviert'].includes(shipment.status)) required.push('pod');
  return required;
}

export function getMissingDocuments(shipment) {
  return requiredDocumentTypes(shipment).filter(type => shipment.documents?.[type] !== true);
}

export function getDemoMetrics() {
  const openShipments = DEMO_SHIPMENTS.filter(item => !['Abgeschlossen', 'Archiviert'].includes(item.status)).length;
  const pickupsToday = DEMO_SHIPMENTS.filter(item => item.plannedPickup === DEMO_TODAY && !['Abgeschlossen', 'Archiviert'].includes(item.status)).length;
  const missingDocuments = DEMO_SHIPMENTS.reduce((sum, item) => sum + getMissingDocuments(item).length, 0);
  const actionRequired = DEMO_SHIPMENTS.filter(item => item.attention || getMissingDocuments(item).length > 0).length;
  return { openShipments, pickupsToday, missingDocuments, actionRequired };
}

export const CUSTOMER_BY_ID = Object.freeze(Object.fromEntries(DEMO_CUSTOMERS.map(item => [item.id, item])));
export const LOCATION_BY_ID = Object.freeze(Object.fromEntries(DEMO_LOCATIONS.map(item => [item.id, item])));
export const EMPLOYEE_BY_ID = Object.freeze(Object.fromEntries(DEMO_EMPLOYEES.map(item => [item.id, item])));
