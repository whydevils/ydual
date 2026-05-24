// Smoke-test for injector.js
// Each interception path runs in its own page so the one-shot 'manifested'
// guard doesn't suppress the second test.
//
// Path A — JSON.parse: page calls JSON.parse(manifestString) directly
// Path B — fetch:      page calls fetch(url).then(r => r.json())  ← modern Netflix

import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const injectorSrc = readFileSync(`${__dir}/injector.js`, 'utf8');

const MOCK_VTT = `WEBVTT

00:00:01.000 --> 00:00:03.000
はい、そうです。

00:00:04.000 --> 00:00:06.500
行きましょう！ 行きましょう！
`;

// ── HTTP server ───────────────────────────────────────────────────────────────
const srv = await new Promise(r => {
  const s = createServer(); s.listen(0, '127.0.0.1', () => r(s));
});
const { port } = srv.address();
const VTT_URL = `http://127.0.0.1:${port}/subtitles.vtt`;

const manifestObj = {
  result: {
    movieId: 12345678,
    timedtextTracks: [{
      language: 'ja', bcp47: 'ja', rawTrackType: 'subtitles', isNoneTrack: false,
      ttDownloadables: {
        'webvtt-lssdh-ios8': { isNoneTrack: false, downloadUrls: { '0': VTT_URL } }
      }
    }]
  }
};
const manifestJson = JSON.stringify(manifestObj);

function pageHtml(bodyScript) {
  return `<!DOCTYPE html><html><body><script>
    window.__r = { manifest: null, subtitleFile: null };
    window.addEventListener('DUALY_MANIFEST',      e => { window.__r.manifest     = e.detail; });
    window.addEventListener('DUALY_SUBTITLE_FILE', e => {
      window.__r.subtitleFile = {
        lang: e.detail.language,
        bytes: e.detail.text?.length,
        isVTT: e.detail.text?.trimStart().startsWith('WEBVTT'),
        firstCue: e.detail.text?.split('\\n').find(l => l && !l.includes('-->') && !l.startsWith('WEBVTT') && l.trim()),
      };
    });
    ${bodyScript}
  </script></body></html>`;
}

srv.on('request', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/subtitles.vtt') {
    res.writeHead(200, { 'Content-Type': 'text/vtt' }); res.end(MOCK_VTT); return;
  }
  if (req.url.includes('/shakti/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(manifestJson); return;
  }
  if (req.url === '/test-a') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(pageHtml(`JSON.parse(${JSON.stringify(manifestJson)});`));
    return;
  }
  if (req.url === '/test-b') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(pageHtml(`
      fetch('/shakti/manifest')
        .then(r => r.json())
        .catch(e => console.error('fetch failed:', e));
    `));
    return;
  }
  res.writeHead(404); res.end();
});

// ── Run a test page ───────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

async function runPage(path) {
  const page = await browser.newPage();
  await page.addInitScript({ content: injectorSrc });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}${path}`);
  await page.waitForTimeout(3000);
  const result = await page.evaluate(() => window.__r);
  await page.close();
  return { result, errors };
}

const A = await runPage('/test-a');
const B = await runPage('/test-b');

await browser.close();
srv.close();

// ── Report ────────────────────────────────────────────────────────────────────
const ok   = s => `  ✓  ${s}`;
const fail = s => `  ✗  ${s}`;
console.log('\n══ Results ══════════════════════════════════════');

for (const [label, { result, errors }] of [['JSON.parse path', A], ['fetch path    ', B]]) {
  if (result.manifest) {
    console.log(ok(`${label}: DUALY_MANIFEST fired (lang=${result.manifest.tracks?.[0]?.language})`));
  } else {
    console.log(fail(`${label}: DUALY_MANIFEST did NOT fire`));
  }
  if (result.subtitleFile) {
    console.log(ok(`${label}: DUALY_SUBTITLE_FILE — ${result.subtitleFile.bytes}B, isVTT=${result.subtitleFile.isVTT}, first cue: "${result.subtitleFile.firstCue}"`));
  } else {
    console.log(fail(`${label}: DUALY_SUBTITLE_FILE did NOT fire`));
  }
  if (errors.length) errors.forEach(e => console.log(`  ! ${e}`));
}

console.log('═════════════════════════════════════════════════\n');
const passed = A.result.manifest && A.result.subtitleFile && B.result.manifest && B.result.subtitleFile;
process.exit(passed ? 0 : 1);
