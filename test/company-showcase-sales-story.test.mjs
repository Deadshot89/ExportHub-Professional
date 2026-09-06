import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('customer-meeting landing injects a clear before ExportHUB outcome story',()=>{
  const source=read('demo/presentation-guide.js');
  assert.match(source,/function ensureCommercialStory/);
  assert.match(source,/id="commercialStoryPanel"/);
  assert.match(source,/Vorher/);
  assert.match(source,/Mit ExportHUB/);
  assert.match(source,/Ergebnis im Prozess/);
  assert.match(source,/id="commercialModuleMap"/);
});

test('commercial story names the core modules companies can discuss in the demo',()=>{
  const source=read('demo/presentation-guide.js');
  for(const label of ['Sendungssteuerung','Aufgaben & Planung','Dokumentenkontrolle','QR-Abholung & POD','Kunden-Avis','Rollen & Mandanten']){
    assert.match(source,new RegExp(label.replace('&','&(?:amp;)?')));
  }
});

test('commercial framing avoids invented business results and can start the existing guided tour',()=>{
  const source=read('demo/presentation-guide.js');
  assert.match(source,/id="commercialStartTourBtn"/);
  assert.match(source,/commercialStartTourBtn/);
  assert.doesNotMatch(source,/\bROI\b|\d+\s*%\s*(?:weniger|mehr|schneller)|Zeitersparnis|Kosteneinsparung/i);
  assert.doesNotMatch(source,/fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|mailto:/i);
});

test('commercial story styling supports process, modules and mobile customer meetings',()=>{
  const css=read('demo/demo-commercial-polish.css');
  for(const cls of ['commercial-story-panel','commercial-process-grid','commercial-module-map','commercial-decision-panel']){
    assert.match(css,new RegExp(`\\.${cls}\\b`));
  }
  assert.match(css,/@media\(max-width:700px\)[\s\S]*?\.commercial-process-grid/);
});