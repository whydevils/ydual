// Tests parseTTML + ttmlNodeText against the user's exact failing TTML snippet.

import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const contentSrc = readFileSync(`${__dir}/../src/content.js`, 'utf8');

// Pull parseTTML, ttmlNodeText, parseTimestamp out of content.js
const fnSrc = contentSrc.match(
  /(function parseTTML[\s\S]+?^})\s*(function ttmlNodeText[\s\S]+?^})\s*(function parseTimestamp[\s\S]+?^})/m
)?.[0] ?? '';

if (!fnSrc) { console.error('Could not extract functions'); process.exit(1); }

// Wrap in minimal valid TTML document
const ttml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xml:lang="es" xmlns="http://www.w3.org/ns/ttml"
    xmlns:tts="http://www.w3.org/ns/ttml#styling">
  <head>
    <styling>
      <style xml:id="style1" tts:fontFamily="Arial" tts:fontSize="100%"/>
    </styling>
    <layout><region xml:id="region0"/></layout>
  </head>
  <body><div>
    <p xml:id="subtitle663" begin="28365416667t" end="28394166667t" region="region0">
      <span style="style1">Realmente creo</span><br/><span style="style1">que usted es la media naranja perfecta</span>
    </p>
    <p xml:id="subtitle664" begin="28395000000t" end="28413750000t" region="region0">
      <span style="style1">para iniciar mi revolución</span>
    </p>
    <p xml:id="subtitle665" begin="28432916667t" end="28452916667t" region="region0">
      <span style="style1">y estrenarme como esposa infiel.</span>
    </p>
  </div></body>
</tt>`;

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('about:blank');

const result = await page.evaluate(({ fnSrc, ttml }) => {
  eval(fnSrc); // loads parseTTML, ttmlNodeText, parseTimestamp
  const cues = parseTTML(ttml);
  return cues.map(c => ({ begin: c.begin.toFixed(3), end: c.end.toFixed(3), text: c.text }));
}, { fnSrc, ttml });

await browser.close();

console.log('\n══ parseTTML results ══════════════════════════════════════');
for (const c of result) {
  console.log(`  [${c.begin} → ${c.end}]`);
  console.log(`  text: ${JSON.stringify(c.text)}`);
  console.log();
}
if (!result.length) console.log('  (no cues parsed — querySelectorAll returned nothing)');
console.log('══════════════════════════════════════════════════════════\n');
