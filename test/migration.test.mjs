import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBackupPayload,inventoryBackup,buildMigrationPackage,sha256Hex,canonicalStatusOf} from '../shared/migration-core.js';

function typedSample(remotePod=false){
  return {
    type:'ExportHUB_BACKUP',version:'RC880',exportedAt:'2026-08-30T08:00:00.000Z',exportedBy:'Test',
    users:[{name:'Admin',username:'Admin',password:'secret',role:'Globaler Administrator',permissions:['*'],active:true}],
    state:{
      customers:[{id:'C1',account:'100',name:'Kunde A'}],
      shipments:[{id:'S1',ref:'ABC123',customerId:'C1',status:'POD vorhanden',processStatus:'POD vorhanden',podConfirmed:true,deliveryFiles:[{id:'D1',name:'LS_123.pdf',type:'application/pdf',data:'data:application/pdf;base64,JVBERi0xLjQK'}],podFiles:[remotePod?{id:'P1',name:'POD_ABC123.pdf',podCloudBackupWebUrl:'https://example.invalid/pod.pdf',podCloudBackupHash:'abc'}:{id:'P1',name:'POD_ABC123.pdf',type:'application/pdf',data:'data:application/pdf;base64,JVBERi0xLjQK'}]}],
      savedShipments:[{id:'S1',ref:'ABC123',customerId:'C1',status:'POD vorhanden',podFiles:[remotePod?{id:'P1',name:'POD_ABC123.pdf',podCloudBackupWebUrl:'https://example.invalid/pod.pdf',podCloudBackupHash:'abc'}:{id:'P1',name:'POD_ABC123.pdf',type:'application/pdf',data:'data:application/pdf;base64,JVBERi0xLjQK'}]}],
      tasks:[{id:'T1',title:'Test',status:'offen'}],abdRequests:[],archive:[],palletBookings:[]
    }
  };
}
function legacyRc826(){
  const x=typedSample(true); delete x.type; delete x.version; delete x.exportedAt; delete x.exportedBy;
  x.state.shipments[0].status='Erstellt';x.state.shipments[0].processStatus='Abgeholt';x.state.shipments[0].pickedUpAt='2026-08-21T08:00:00Z';x.state.shipments[0].podStatus='POD vorhanden';
  return x;
}

test('rejects unrelated partial payload',()=>{
  const r=validateBackupPayload({state:{}});assert.equal(r.ok,false);assert.ok(r.errors.includes('BACKUP_FORMAT_UNSUPPORTED'));
});

test('accepts legacy RC826 state+users backup with explicit source hint',()=>{
  const r=validateBackupPayload(legacyRc826(),{sourceVersionHint:'RC826'});assert.equal(r.ok,true);assert.equal(r.format,'legacy-state-users');assert.ok(r.warnings.includes('LEGACY_BACKUP_WITHOUT_METADATA'));
});

test('deduplicates shipment copies and document copies',()=>{
  const r=inventoryBackup(typedSample());assert.equal(r.validation.ok,true);assert.equal(r.inventory.counts.shipmentSourceRecords,2);assert.equal(r.inventory.counts.canonicalShipmentGroups,1);assert.equal(r.inventory.counts.documentSourceRecords,3);assert.equal(r.inventory.counts.documents,2);assert.equal(r.inventory.counts.pods,1);
});

test('podCloudBackupWebUrl is treated as remote POD and blocks cutover',async()=>{
  const payload=legacyRc826(),pkg=await buildMigrationPackage(payload,JSON.stringify(payload),{sourceVersionHint:'RC826'});assert.equal(pkg.manifest.gates.readOnlyReady,true);assert.equal(pkg.manifest.documents.remoteCaptureRequired,1);assert.equal(pkg.manifest.gates.cutoverReady,false);assert.ok(pkg.manifest.gates.cutoverBlockers.includes('REMOTE_DOCUMENTS_REQUIRE_CAPTURE'));
});

test('status preservation uses pickup/POD evidence and locks migrated shipment',async()=>{
  const payload=legacyRc826(),pkg=await buildMigrationPackage(payload,JSON.stringify(payload),{sourceVersionHint:'RC826'});const sh=pkg.normalized.shipments[0];assert.equal(canonicalStatusOf(payload.state.shipments[0]),'Abgeholt');assert.equal(sh.canonicalStatus,'Abgeholt');assert.equal(sh.locked,true);assert.equal(sh.podEvidence,true);
});

test('legacy cleartext password is never copied to normalized user',async()=>{
  const payload=typedSample(),pkg=await buildMigrationPackage(payload,JSON.stringify(payload));const u=pkg.normalized.users[0];assert.equal('password' in u,false);assert.equal(u.passwordMigration,'RESET_REQUIRED');assert.equal(pkg.manifest.security.legacyPasswordsMigrated,false);
});

test('inline documents receive hashes',async()=>{
  const payload=typedSample(false),pkg=await buildMigrationPackage(payload,JSON.stringify(payload));assert.equal(pkg.manifest.documents.inlineHashed,2);assert.equal(pkg.manifest.documents.hashErrors,0);assert.match(pkg.manifest.documents.verification[0].sha256,/^[a-f0-9]{64}$/);
});

test('source hash is deterministic',async()=>{
  const text='{"a":1}';assert.equal(await sha256Hex(text),await sha256Hex(text));
});

test('document registry exposes migration status and remote source class',async()=>{
  const payload=typedSample(true),pkg=await buildMigrationPackage(payload,JSON.stringify(payload));
  const pod=pkg.normalized.documents.find(d=>d.kind==='POD');
  assert.equal(pod.migrationStatus,'REMOTE_CAPTURE_REQUIRED');
  assert.equal(pod.remoteSourceClass,'EXTERNAL_HTTP');
  assert.equal(pod.cutoverBlocking,true);
  assert.equal(pkg.manifest.documents.podGate.ready,false);
});

test('ABD request document is linked to shipment by reference',async()=>{
  const payload=typedSample(false);
  payload.state.abdRequests=[{id:'A1',ref:'ABC123',abdFiles:[{id:'A-DOC',name:'ABD_26DE_TEST.pdf',type:'application/pdf',data:'data:application/pdf;base64,JVBERi0xLjQK'}]}];
  const pkg=await buildMigrationPackage(payload,JSON.stringify(payload));
  const abd=pkg.normalized.documents.find(d=>d.kind==='ABD');
  assert.ok(abd);
  assert.equal(abd.reference,'ABC123');
  assert.equal(abd.shipmentId,pkg.normalized.shipments[0].id);
});

test('Professional 0.5 normalizes customer locations and resolves shipment location',async()=>{
  const payload=typedSample(false);
  payload.state.customers[0].address='Hauptstraße 1, 12345 Test';
  payload.state.customers[0].country='Deutschland';
  payload.state.customers[0].locations=[{id:'LOC-2',name:'Werk 2',address:'Werkstraße 2, 12345 Test',country:'Deutschland'}];
  payload.state.shipments[0].locationId='LOC-2'; payload.state.shipments[0].locationName='Werk 2';
  const pkg=await buildMigrationPackage(payload,JSON.stringify(payload));
  assert.equal(pkg.normalized.schemaVersion,'professional-0.5');
  assert.equal(pkg.normalized.locations.length,2);
  assert.ok(pkg.normalized.shipments[0].locationId);
  assert.equal(pkg.manifest.locations.shipmentsResolved,1);
});

test('Professional 0.5 structures audit and redacts secret keys',async()=>{
  const payload=typedSample(false);
  payload.state.audit=[{time:'30.8.2026, 12:00:00',user:'Admin',action:'Lieferschein angehängt',detail:'LS_123.pdf'}];
  payload.state.auditLog=[{id:'AUD-1',type:'LOGIN_SUCCESS',actor:'Admin',at:'2026-08-30T10:00:00Z',details:{sessionToken:'SECRET',ip:'127.0.0.1'}}];
  const pkg=await buildMigrationPackage(payload,JSON.stringify(payload));
  assert.equal(pkg.normalized.auditEvents.length,2);
  const sec=pkg.normalized.auditEvents.find(x=>x.source==='SECURITY_AUDIT');
  assert.equal(sec.details.sessionToken,'[REDACTED_FOR_MIGRATION]');
  assert.equal(sec.details.ip,'127.0.0.1');
  assert.equal(pkg.manifest.audit.total,2);
});

test('Professional 0.5 assigns recovery actions without pretending missing source files exist',async()=>{
  const payload=typedSample(true);
  payload.state.shipments[0].documents=[{id:'CMR1',name:'CMR_ABC123.pdf',type:'application/pdf'}];
  const pkg=await buildMigrationPackage(payload,JSON.stringify(payload));
  const pod=pkg.normalized.documents.find(d=>d.kind==='POD');
  const cmr=pkg.normalized.documents.find(d=>d.kind==='CMR');
  assert.equal(pod.recoveryAction,'CAPTURE_AUTHORIZED_REMOTE');
  assert.equal(cmr.recoveryAction,'REGENERATE_FROM_LOCKED_SNAPSHOT');
  assert.equal(pkg.manifest.gates.cutoverReady,false);
});

test('Professional 0.5 preserves generated document metadata separately from migrated files',async()=>{
  const payload=typedSample(false);
  payload.state.shipments[0].generatedDocuments=[{id:'GEN-1-CMR',type:'CMR',version:3,status:'active',signature:'abc',generatedAt:'2026-08-10T09:42:59.043Z'}];
  const pkg=await buildMigrationPackage(payload,JSON.stringify(payload));
  assert.equal(pkg.normalized.generatedArtifacts.length,1);
  assert.equal(pkg.normalized.generatedArtifacts[0].type,'CMR');
  assert.equal(pkg.manifest.recovery.generatedArtifacts,1);
});
