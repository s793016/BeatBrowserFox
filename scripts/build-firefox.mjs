#!/usr/bin/env node
// [INPUT] Shared extension sources plus the Firefox-only files in firefox/.
// [OUTPUT] dist/firefox/: an unpacked MV2 extension for about:debugging or web-ext.
// [POS] Firefox packaging. [PROTOCOL] Chrome sources stay untouched; no signing or upload.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'extension');
const FF = path.join(ROOT, 'firefox');
const OUT = path.join(ROOT, 'dist', 'firefox');

const chromeManifest = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(FF, 'manifest.json'), 'utf8'));
// AMO signs each version once, so Firefox may add a fourth segment (1.4.1.N) to the shared release.
if (manifest.version !== chromeManifest.version && !manifest.version.startsWith(chromeManifest.version + '.')) {
  throw new Error('Firefox manifest version must equal the Chrome version or extend it as <version>.N');
}

// The offscreen document only exists to keep Chrome's service worker socket alive.
const SKIP = new Set(['manifest.json', 'offscreen.html', 'offscreen.js']);
// Isolated-world scripts run in a content sandbox that needs its own chrome shim.
const ISOLATED = ['content.js', 'mark.js', 'ui-language.js'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, { recursive: true, filter: p => !SKIP.has(path.basename(p)) && !/\.DS_Store$/.test(p) });
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
for (const name of ['compat.js', 'background.html']) fs.copyFileSync(path.join(FF, name), path.join(OUT, name));
for (const name of ['LICENSE', 'PRIVACY.md']) fs.copyFileSync(path.join(ROOT, name), path.join(OUT, name));

const compat = fs.readFileSync(path.join(FF, 'compat.js'), 'utf8');
for (const name of ISOLATED) {
  const file = path.join(OUT, name);
  fs.writeFileSync(file, compat + '\n' + fs.readFileSync(file, 'utf8'));
}
for (const name of ['popup.html', 'panel.html']) {
  const file = path.join(OUT, name);
  const html = fs.readFileSync(file, 'utf8');
  const tag = '<script type="module" src="popup.js"></script>';
  if (!html.includes(tag)) throw new Error(`${name}: popup.js script tag not found`);
  fs.writeFileSync(file, html.replace(tag, '<script src="compat.js"></script>\n' + tag));
}
console.log(`Firefox extension ${manifest.version} → ${path.relative(ROOT, OUT)}`);
console.log('Load it from about:debugging#/runtime/this-firefox > "Load Temporary Add-on…" > dist/firefox/manifest.json');
