// Smoke-tests for injector.js — verifies XHR interception fires DUALY_SUBTITLE_FILE.
//
// Cases:
//   A — XHR to pathname '/' returns TTML  → event fires with correct language
//   B — XHR to pathname '/' returns WebVTT → event fires with correct language
//   C — XHR to a normal path              → event does NOT fire

import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const injectorSrc = readFileSync(`${__dir}/../src/injector.js`, 'utf8');

const MOCK_TTML = `<?xml version="1.0" encoding="UTF-8"?>
<tt xml:lang="es" xmlns="http://www.w3.org/ns/ttml">
  <body><div>
    <p begin="00:00:01.000" end="00:00:03.000">Hola mundo</p>
  </div></body>
</tt>`;

const MOCK_VTT = `WEBVTT
Language: ja

00:00:01.000 --> 00:00:03.000
はい、そうです。`;

const srv = await new Promise(r => {
  const s = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { pathname, searchParams } = new URL(req.url, 'http://x');
    if (pathname === '/') {
      if (searchParams.get('fmt') === 'vtt') {
        res.writeHead(200, { 'Content-Type': 'text/vtt' });
        res.end(MOCK_VTT);
      } else {
        res.writeHead(200, { 'Content-Type': 'application/ttml+xml' });
        res.end(MOCK_TTML);
      }
    } else {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('not a subtitle');
    }
  });
  s.listen(0, '127.0.0.1', () => r(s));
});
const { port } = srv.address();

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

async function runXHR(url) {
  const page = await browser.newPage();
  await page.addInitScript({ content: injectorSrc });
  await page.goto('about:blank');
  const events = await page.evaluate(async url => {
    const fired = [];
    window.addEventListener('DUALY_SUBTITLE_FILE', e => fired.push({ ...e.detail, text: e.detail.text?.slice(0, 40) }));
    await new Promise(resolve => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.addEventListener('load', resolve);
      xhr.send();
    });
    return fired;
  }, url);
  await page.close();
  return events;
}

const ttmlEvents = await runXHR(`http://127.0.0.1:${port}/`);
const vttEvents  = await runXHR(`http://127.0.0.1:${port}/?fmt=vtt`);
const otherEvents = await runXHR(`http://127.0.0.1:${port}/api/data`);

await browser.close();
srv.close();

// ── Report ────────────────────────────────────────────────────────────────────

const ok   = s => `  ✓  ${s}`;
const fail = s => `  ✗  ${s}`;
let allPass = true;

function check(label, pass, detail = '') {
  if (pass) { console.log(ok(label)); }
  else      { allPass = false; console.log(fail(label) + (detail ? ` — ${detail}` : '')); }
}

console.log('\n══ injector.js smoke tests ══════════════════════════════');

check('TTML: DUALY_SUBTITLE_FILE fires',           ttmlEvents.length === 1, `got ${ttmlEvents.length} events`);
check('TTML: language extracted from xml:lang',    ttmlEvents[0]?.language === 'es', `got "${ttmlEvents[0]?.language}"`);

check('WebVTT: DUALY_SUBTITLE_FILE fires',         vttEvents.length === 1, `got ${vttEvents.length} events`);
check('WebVTT: language extracted from Language:', vttEvents[0]?.language === 'ja', `got "${vttEvents[0]?.language}"`);

check('Non-subtitle URL: no event fires',          otherEvents.length === 0, `got ${otherEvents.length} events`);

console.log('═════════════════════════════════════════════════════════\n');
process.exit(allPass ? 0 : 1);
