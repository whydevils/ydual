#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');
const keyFile = path.join(root, 'privatekey.pem');

const manifest = JSON.parse(fs.readFileSync(path.join(src, 'manifest.json'), 'utf8'));
const version = manifest.version;
const base = 'dualy';

fs.mkdirSync(dist, { recursive: true });

// ── Zip ───────────────────────────────────────────────────────────────────────

const zipPath = path.join(dist, `${base}-${version}.zip`);
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
execSync(`cd "${src}" && zip -r "${zipPath}" .`, { stdio: 'inherit' });
console.log(`zip  → ${path.relative(root, zipPath)}`);

// ── CRX ───────────────────────────────────────────────────────────────────────

if (!fs.existsSync(keyFile)) {
  console.warn('skipping crx — privatekey.pem not found');
  process.exit(0);
}

const chrome = findChrome();
if (!chrome) {
  console.warn('skipping crx — Chrome/Chromium binary not found');
  process.exit(0);
}

// Chrome writes src.crx next to the src directory
const tempCrx = path.join(root, 'src.crx');
if (fs.existsSync(tempCrx)) fs.unlinkSync(tempCrx);

execSync(
  `"${chrome}" --pack-extension="${src}" --pack-extension-key="${keyFile}"`,
  { stdio: 'inherit' },
);

if (!fs.existsSync(tempCrx)) {
  console.error('Chrome did not produce a crx — check that the key is valid');
  process.exit(1);
}

const crxPath = path.join(dist, `${base}-${version}.crx`);
fs.renameSync(tempCrx, crxPath);
console.log(`crx  → ${path.relative(root, crxPath)}`);

// ── Helpers ───────────────────────────────────────────────────────────────────

function findChrome() {
  const candidates = [
    'google-chrome',
    'google-chrome-stable',
    'chromium-browser',
    'chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  for (const bin of candidates) {
    try {
      execSync(`which "${bin}" 2>/dev/null || test -x "${bin}"`, { stdio: 'pipe' });
      return bin;
    } catch (_) {}
  }
  return null;
}
