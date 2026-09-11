import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const url = path => new URL(`../${path}`, import.meta.url);
const read = path => fs.readFileSync(url(path), 'utf8');

test('showcase intro exposes a customer-meeting presentation launcher', () => {
  const shell = read('demo/index.html') + '\n' + read('demo/presentation-guide.js');
  assert.match(shell, /presentationLaunchPanel/);
  assert.match(shell, /presentationModeBtn/);
  assert.match(shell, /12\s+Schritte/i);
  assert.match(shell, /Präsentationsmodus/i);
});

test('tour dock exposes progress, focus-mode and fullscreen controls', () => {
  const shell = read('demo/index.html') + '\n' + read('demo/presentation-guide.js');
  for (const marker of ['tourProgressTrack', 'tourProgressBar', 'tourFocusLabel', 'tourFullscreenBtn']) {
    assert.match(shell, new RegExp(marker), `missing presentation control: ${marker}`);
  }
});

test('every guided step declares a spotlight target for the current presentation context', async () => {
  const guide = await import('../demo/presentation-guide.js');
  assert.equal(guide.TOUR_STEPS.length, 12);
  for (const step of guide.TOUR_STEPS) {
    assert.equal(typeof step.spotlight, 'string', `missing spotlight for ${step.title}`);
    assert.ok(step.spotlight.length > 2, `empty spotlight for ${step.title}`);
  }
});

test('presentation guide manages focus mode, spotlight and transition state locally', () => {
  const source = read('demo/presentation-guide.js');
  assert.match(source, /presentation-mode/);
  assert.match(source, /tour-spotlight/);
  assert.match(source, /tour-transitioning/);
  assert.match(source, /tourProgressBar/);
  assert.match(source, /tourFocusLabel/);
});

test('presentation guide supports keyboard navigation and browser fullscreen without network dependencies', () => {
  const source = read('demo/presentation-guide.js');
  assert.match(source, /ArrowRight/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /Escape/);
  assert.match(source, /requestFullscreen/);
  assert.match(source, /exitFullscreen/);
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|mailto:/i);
});

test('presentation styling provides a strong focus layer and respects reduced motion', () => {
  const css = read('demo/demo-presentation.css') + '\n' + read('demo/demo-presentation-mode.css');
  assert.match(css, /\.presentation-mode/);
  assert.match(css, /\.tour-spotlight/);
  assert.match(css, /\.tour-progress-track/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /tour-key-hints/);
});
