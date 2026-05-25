#!/usr/bin/env node
// Converts raw doc/ screenshots to Chrome Web Store dimensions and exports the
// app icon. Outputs everything to doc/images/.
//
// Requirements: ImageMagick (convert + identify must be on PATH)
// Usage: node prepare-assets.js
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const docDir = path.join(root, 'doc');
const outDir = path.join(docDir, 'images');

fs.mkdirSync(outDir, { recursive: true });

// ── Screenshots ───────────────────────────────────────────────────────────────
// Chrome Web Store accepts exactly 1280×800 (landscape) or 640×400 (portrait).
// We pick the target based on the source orientation, then letterbox with the
// extension's background colour so the aspect ratio is always preserved.

const BG = '#18181b';

const sources = fs.readdirSync(docDir)
  .filter(f => /\.(png|jpe?g)$/i.test(f))
  .sort()
  .map(f => path.join(docDir, f));

if (!sources.length) {
  console.warn('No screenshots found in doc/ — nothing to convert.');
} else {
  sources.forEach((src, i) => {
    const num = String(i + 1).padStart(2, '0');
    const out = path.join(outDir, `screenshot-${num}.png`);

    const info = execSync(`identify -format "%wx%h" "${src}"`).toString().trim();
    const [w, h] = info.split('x').map(Number);
    const [tw, th] = w >= h ? [1280, 800] : [640, 400];

    // -alpha remove: flatten transparency onto BG before resizing
    // -resize:       fit within target, preserve aspect ratio
    // -extent:       pad to exact target size, centred
    execSync(
      `convert "${src}" -background "${BG}" -alpha remove` +
      ` -resize ${tw}x${th} -gravity center -background "${BG}" -extent ${tw}x${th}` +
      ` "${out}"`,
      { stdio: 'inherit' },
    );

    console.log(`screenshot  ${path.basename(src).padEnd(40)} → ${path.relative(root, out)} (${tw}×${th})`);
  });
}

// ── App icon ──────────────────────────────────────────────────────────────────
// Chrome Web Store requires a 128×128 PNG icon.

const iconSrc = path.join(root, 'src', 'icons', 'icon128.png');
const iconOut = path.join(outDir, 'icon-128.png');

if (!fs.existsSync(iconSrc)) {
  console.error(`icon source not found: ${iconSrc}`);
  process.exit(1);
}

// Use '!' to force exact dimensions in case the source ever differs
execSync(`convert "${iconSrc}" -resize 128x128! "${iconOut}"`, { stdio: 'inherit' });
console.log(`icon        ${path.relative(root, iconSrc).padEnd(40)} → ${path.relative(root, iconOut)} (128×128)`);
