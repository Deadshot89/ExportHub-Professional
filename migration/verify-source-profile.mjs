#!/usr/bin/env node
import fs from 'node:fs/promises';
import {buildMigrationPackage} from '../shared/migration-core.js';

const input=process.argv[2];
if(!input){ console.error('Verwendung: npm run baseline -- /pfad/backup.json'); process.exit(2); }
const [text,profileText]=await Promise.all([
  fs.readFile(input,'utf8'),
  fs.readFile(new URL('./source-profile-rc826.json',import.meta.url),'utf8')
]);
const payload=JSON.parse(text), profile=JSON.parse(profileText);
const pkg=await buildMigrationPackage(payload,text,{sourceVersionHint:profile.sourceVersionHint});
const c=pkg.manifest.sourceCounts,d=pkg.manifest.documents,s=pkg.manifest.statusCounts;
const actual={customers:c.canonicalCustomers,shipments:c.canonicalShipmentGroups,shipmentSourceRecords:c.shipmentSourceRecords,users:c.users,podFileEntriesDirect:c.podFileEntries,podFileShipments:c.podFileShipments,podEvidenceShipments:c.podEvidenceShipments,canonicalDocuments:c.documents,documentSourceRecords:c.documentSourceRecords,canonicalPodDocuments:d.podGate.total};
const diffs=[];
for(const [k,v] of Object.entries(profile.expectedCoreCounts)){ if(actual[k]!==v) diffs.push(`${k}: erwartet ${v}, erhalten ${actual[k]}`); }
for(const [k,v] of Object.entries(profile.expectedProcessStatusCounts)){ if((s[k]||0)!==v) diffs.push(`Status ${k}: erwartet ${v}, erhalten ${s[k]||0}`); }
const p04=profile.expectedProfessional04||{}, actual04={locations:pkg.manifest.locations.total,customersWithLocations:pkg.manifest.locations.customersWithLocations,shipmentsWithResolvedLocation:pkg.manifest.locations.shipmentsResolved,shipmentsWithUnresolvedNamedLocation:pkg.manifest.locations.shipmentsUnresolved,auditEvents:pkg.manifest.audit.total,legacyAuditEvents:pkg.manifest.audit.legacyAudit,securityAuditEvents:pkg.manifest.audit.securityAudit,remoteCaptureActions:pkg.manifest.recovery.captureRequired,sourceFileRequired:pkg.manifest.recovery.sourceFileRequired,regenerableDocuments:pkg.manifest.recovery.regenerableDocuments,generatedArtifactMetadata:pkg.manifest.recovery.generatedArtifacts,mappingExpected:pkg.manifest.mapping.expected,mappingMapped:pkg.manifest.mapping.mapped};
for(const [k,v] of Object.entries(p04)){ if(actual04[k]!==v) diffs.push(`Professional 0.4 ${k}: erwartet ${v}, erhalten ${actual04[k]}`); }
console.log(JSON.stringify({ok:diffs.length===0,sourceSha256:pkg.manifest.sourceSha256,actual,actual04,diffs},null,2));
if(diffs.length) process.exitCode=4;
