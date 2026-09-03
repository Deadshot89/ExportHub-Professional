import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

const readModel=require('../api/shared/shipment-read-model.js');

const today='2026-09-03';
const fixture=[
  {id:'1',reference:'AAA001',source_kind:'MIGRATED',status:'Erstellt',planned_pickup_date:today,customer_name:'Alpha GmbH'},
  {id:'2',reference:'AAA002',source_kind:'MIGRATED',status:'Bereit zur Abholung',planned_pickup_date:today,customer_name:'Beta GmbH'},
  {id:'3',reference:'AAA003',source_kind:'MIGRATED',status:'Abgeholt',planned_pickup_date:today,picked_up_at:'2026-09-03T08:00:00Z',customer_name:'Gamma GmbH'},
  {id:'4',reference:'AAA004',source_kind:'MIGRATED',status:'Abgeschlossen',planned_pickup_date:today,customer_name:'Delta GmbH'},
  {id:'5',reference:'AAA005',source_kind:'MIGRATED',status:'Archiviert',planned_pickup_date:'2026-09-01',customer_name:'Epsilon GmbH'},
  {id:'6',reference:'AAA006',source_kind:'MIGRATED',status:'Storniert',planned_pickup_date:'2026-09-02',customer_name:'Zeta GmbH'}
];

test('migrated shipment rows are normalized as permanently read-only',()=>{
  const rows=fixture.map(readModel.normalizeShipmentRow);
  assert.equal(rows.length,6);
  for(const row of rows){
    assert.equal(row.sourceKind,'MIGRATED');
    assert.equal(row.readOnly,true);
    assert.equal(row.reference.length,6);
  }
  assert.equal(rows[0].customerName,'Alpha GmbH');
});

test('dashboard excludes completed archived and cancelled shipments from open work',()=>{
  const dashboard=readModel.buildShipmentDashboard(fixture,{localDate:today,timeZone:'Europe/Berlin'});
  assert.equal(dashboard.openShipments,3);
  assert.equal(dashboard.pickupsToday,4);
  assert.equal(dashboard.pickupsTodayOpen,2);
  assert.equal(dashboard.pickupsTodayPicked,2);
  assert.deepEqual(dashboard.todayRows.map(row=>row.reference),['AAA001','AAA002','AAA003','AAA004']);
});

test('historical missing-document total remains unavailable when legacy rows have no readiness facts',()=>{
  const dashboard=readModel.buildShipmentDashboard(fixture,{localDate:today,timeZone:'Europe/Berlin'});
  assert.equal(dashboard.missingDocuments,null);
  assert.equal(dashboard.missingDocumentsAvailable,false);
});

test('overdue and rework facts become shipment action items without fake rows',()=>{
  const rows=[
    {id:'7',reference:'AAA007',source_kind:'MIGRATED',status:'Bereit zur Abholung',planned_pickup_date:'2026-09-02',customer_name:'Overdue GmbH'},
    {id:'8',reference:'AAA008',source_kind:'MIGRATED',status:'Erstellt',planned_pickup_date:'2026-09-04',rework:{active:true,reason:'DATA_ERROR'},customer_name:'Rework GmbH'}
  ];
  const dashboard=readModel.buildShipmentDashboard(rows,{localDate:today,timeZone:'Europe/Berlin'});
  assert.equal(dashboard.actionItems.length,2);
  assert.ok(dashboard.actionItems.some(item=>item.code==='PICKUP_OVERDUE'&&item.shipmentId==='7'));
  assert.ok(dashboard.actionItems.some(item=>item.code==='REWORK_ACTIVE'&&item.shipmentId==='8'));
});

test('legacy normalized rework and waiting-for-ABD statuses remain visible as action items',()=>{
  const rows=[
    {id:'9',reference:'AAA009',source_kind:'MIGRATED',status:'Nachbearbeitung erforderlich',customer_name:'Legacy Rework GmbH'},
    {id:'10',reference:'AAA010',source_kind:'MIGRATED',status:'Wartet auf ABD',customer_name:'Legacy ABD GmbH'}
  ];
  const dashboard=readModel.buildShipmentDashboard(rows,{localDate:today,timeZone:'Europe/Berlin'});
  assert.ok(dashboard.actionItems.some(item=>item.code==='REWORK_ACTIVE'&&item.shipmentId==='9'));
  assert.ok(dashboard.actionItems.some(item=>item.code==='ABD_PENDING'&&item.shipmentId==='10'));
});
