#!/usr/bin/env node
import fs from 'node:fs/promises';
import {sha256Hex,inventoryBackup} from '../shared/migration-core.js';
const args=process.argv.slice(2), source=args[0], pack=args[1];
if(!source||!pack){console.error('Verwendung: npm run verify -- <Original-Backup.json> <Migration-Package.json> [--source-version RC826]');process.exit(2)}
function opt(name){const i=args.indexOf(name);return i>=0?String(args[i+1]||'').trim():''}
const sourceVersionHint=opt('--source-version');
const sourceText=await fs.readFile(source,'utf8');
const payload=JSON.parse(sourceText), pkg=JSON.parse(await fs.readFile(pack,'utf8'));
const errors=[];
if(pkg.type!=='ExportHUB_Professional_Migration_Package')errors.push('Falscher Pakettyp');
const hash=await sha256Hex(sourceText);
if(hash!==pkg?.manifest?.sourceSha256)errors.push('SHA-256 des Original-Backups stimmt nicht');
const inv=inventoryBackup(payload,{sourceVersionHint});
if(!inv.validation.ok)errors.push('Original-Backup ist strukturell ungültig');
else{
  const a=inv.inventory.counts,b=pkg.manifest.sourceCounts||{};
  for(const key of ['customers','canonicalCustomers','shipmentSourceRecords','canonicalShipmentGroups','users','documentSourceRecords','documents','pods','podEvidenceShipments','deliveryNotes','abdDocuments','tasks','abdRequests','archiveEntries']){
    if(Number(a[key]||0)!==Number(b[key]||0))errors.push('Anzahl stimmt nicht: '+key);
  }
  const expected=inv.inventory.customers.length+inv.inventory.shipments.length+inv.inventory.users.length+inv.inventory.documentSources.length;
  if(Number(pkg?.manifest?.mapping?.mapped)!==expected)errors.push('Migrationsmapping ist unvollständig');
  if(pkg?.manifest?.security?.legacyPasswordsMigrated!==false)errors.push('Legacy-Passwörter dürfen nicht migriert werden');
}
if(errors.length){console.error(JSON.stringify({ok:false,errors},null,2));process.exit(5)}
console.log(JSON.stringify({ok:true,sourceSha256:hash,readOnlyReady:!!pkg.manifest.gates.readOnlyReady,cutoverReady:!!pkg.manifest.gates.cutoverReady},null,2));
