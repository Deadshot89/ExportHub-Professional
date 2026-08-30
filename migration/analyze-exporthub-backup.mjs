#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {buildMigrationPackage,summarizePackage} from '../shared/migration-core.js';

const args=process.argv.slice(2);
const input=args[0];
if(!input){
  console.error('Verwendung: npm run analyze -- <backup.json> [ausgabe.json] [--source-version RC826] [--tenant "Firma"]');
  process.exit(2);
}
let output=args[1] && !args[1].startsWith('--') ? args[1] : path.join(path.dirname(input),'ExportHUB_Professional_Migration_Package.json');
function opt(name){ const i=args.indexOf(name); return i>=0?q(args[i+1]):''; }
function q(v){return v==null?'':String(v).trim()}
const sourceVersionHint=opt('--source-version');
const tenantNameHint=opt('--tenant');
const text=await fs.readFile(input,'utf8');
let payload;
try{payload=JSON.parse(text)}catch(e){console.error('Backup ist kein gültiges JSON.');process.exit(3)}
const pkg=await buildMigrationPackage(payload,text,{sourceVersionHint,tenantNameHint});
await fs.writeFile(output,JSON.stringify(pkg,null,2),'utf8');
const s=summarizePackage(pkg);
console.log(JSON.stringify({output,...s,statusCounts:pkg.manifest.statusCounts,documents:pkg.manifest.documents,gates:pkg.manifest.gates,security:pkg.manifest.security},null,2));
if(!pkg.manifest.gates.readOnlyReady) process.exitCode=4;
