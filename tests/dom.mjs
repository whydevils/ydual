// DOM extraction test — loads content.js functions in a real browser and runs
// them against several Netflix subtitle DOM structures we need to handle.
//
// Structures tested:
//   S1  single line, one span per line (standard)
//   S2  two-line subtitle (two player-timedtext-text-container divs)
//   S3  word-level spans inside each line ("Yes" "," " " "no" rendered as 4 spans)
//   S4  two lines where both say the same thing (old dedup would silently drop one)
//   S5  no .player-timedtext-text-container (unknown future structure — fallback path)
//   S6  Netflix's newer obfuscated class names (ltr-xxxx instead of player-timedtext*)

import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const contentSrc = readFileSync(`${__dir}/../src/content.js`, 'utf8');

// Pull the two functions we want to test out of content.js so we can eval them
const fnSrc = contentSrc
  .replace(/^[\s\S]*?(function extractText)/, '$1')        // keep from extractText onward
  .replace(/(function parseTimestamp[\s\S]*?\n\})[\s\S]*$/, '$1'); // keep through last helper

const cases = [
  {
    name: 'S1 – single line, single span',
    html: `<div class="player-timedtext">
      <div class="player-timedtext-text-container">
        <span class="player-timedtext-text"><span>Hello world</span></span>
        <span class="player-timedtext-text" aria-hidden="true"><span>Hello world</span></span>
      </div>
    </div>`,
    expected: 'Hello world',
  },
  {
    name: 'S2 – two-line subtitle',
    html: `<div class="player-timedtext">
      <div class="player-timedtext-text-container">
        <span class="player-timedtext-text"><span>Line one here</span></span>
        <span class="player-timedtext-text" aria-hidden="true"><span>Line one here</span></span>
      </div>
      <div class="player-timedtext-text-container">
        <span class="player-timedtext-text"><span>Line two here</span></span>
        <span class="player-timedtext-text" aria-hidden="true"><span>Line two here</span></span>
      </div>
    </div>`,
    expected: 'Line one here\nLine two here',
  },
  {
    name: 'S3 – word-level spans within one line',
    html: `<div class="player-timedtext">
      <div class="player-timedtext-text-container">
        <span class="player-timedtext-text">
          <span>Yes,</span><span> </span><span>of</span><span> </span><span>course.</span>
        </span>
        <span class="player-timedtext-text" aria-hidden="true">
          <span>Yes,</span><span> </span><span>of</span><span> </span><span>course.</span>
        </span>
      </div>
    </div>`,
    expected: 'Yes, of course.',
  },
  {
    name: 'S4 – two lines with identical text (dialogue)',
    html: `<div class="player-timedtext">
      <div class="player-timedtext-text-container">
        <span class="player-timedtext-text"><span>- Yes!</span></span>
        <span class="player-timedtext-text" aria-hidden="true"><span>- Yes!</span></span>
      </div>
      <div class="player-timedtext-text-container">
        <span class="player-timedtext-text"><span>- Yes!</span></span>
        <span class="player-timedtext-text" aria-hidden="true"><span>- Yes!</span></span>
      </div>
    </div>`,
    expected: '- Yes!\n- Yes!',
  },
  {
    name: 'S5 – no text-container class (fallback path)',
    html: `<div class="player-timedtext">
      <span><span>Fallback text</span></span>
      <span aria-hidden="true"><span>Fallback text</span></span>
    </div>`,
    expected: 'Fallback text',
  },
  {
    name: 'S6 – obfuscated class names (ltr-xxxx)',
    html: `<div class="ltr-abc123-playerTiText">
      <div class="ltr-def456-timedtext-text-container">
        <span class="ltr-ghi789"><span>Obfuscated</span></span>
        <span class="ltr-ghi789" aria-hidden="true"><span>Obfuscated</span></span>
      </div>
    </div>`,
    // container found via [class*="player-timedtext"] won't match ltr-* names,
    // so this also tests what happens with the raw fallback
    expected: 'Obfuscated',
    containerSelector: '.ltr-abc123-playerTiText',
  },
  {
    name: 'S8 – one container, <br> between two spans (the reported bug)',
    html: `<div class="player-timedtext">
      <div class="player-timedtext-text-container">
        <span class="player-timedtext-text">
          <span>Realmente creo</span><br><span>que usted es la media naranja perfecta</span>
        </span>
        <span class="player-timedtext-text" aria-hidden="true">
          <span>Realmente creo</span><br><span>que usted es la media naranja perfecta</span>
        </span>
      </div>
    </div>`,
    expected: 'Realmente creo\nque usted es la media naranja perfecta',
  },
  {
    name: 'S7 – two-line, word-level spans, shadow layer',
    html: `<div class="player-timedtext">
      <div class="player-timedtext-text-container">
        <span class="player-timedtext-text">
          <span>Run!</span><span> </span><span>Run!</span>
        </span>
        <span class="player-timedtext-text" aria-hidden="true">
          <span>Run!</span><span> </span><span>Run!</span>
        </span>
      </div>
      <div class="player-timedtext-text-container">
        <span class="player-timedtext-text"><span>Now!</span></span>
        <span class="player-timedtext-text" aria-hidden="true"><span>Now!</span></span>
      </div>
    </div>`,
    expected: 'Run! Run!\nNow!',
  },
];

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('about:blank');

const results = await page.evaluate(({ fnSrc, cases }) => {
  // Eval the helper functions into this context
  eval(fnSrc); // eslint-disable-line no-eval

  return cases.map(c => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = c.html;
    document.body.appendChild(wrapper);

    const container = c.containerSelector
      ? wrapper.querySelector(c.containerSelector)
      : wrapper.querySelector('.player-timedtext') ||
        wrapper.querySelector('[data-uia="player-timed-text-container"]') ||
        wrapper.querySelector('[class*="player-timedtext"]');

    const got = container ? extractText(container) : '(container not found)';
    document.body.removeChild(wrapper);
    return { name: c.name, expected: c.expected, got, pass: got === c.expected };
  });
}, { fnSrc, cases });

await browser.close();

// ── Report ────────────────────────────────────────────────────────────────────
let allPass = true;
console.log('\n══ extractText DOM tests ═══════════════════════════════════');
for (const r of results) {
  if (r.pass) {
    console.log(`  ✓  ${r.name}`);
  } else {
    allPass = false;
    console.log(`  ✗  ${r.name}`);
    console.log(`       expected: ${JSON.stringify(r.expected)}`);
    console.log(`       got:      ${JSON.stringify(r.got)}`);
  }
}
console.log('═══════════════════════════════════════════════════════════\n');
process.exit(allPass ? 0 : 1);
