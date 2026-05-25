/**
 * Dualy debug — launches Chrome with extension + your real Netflix login.
 * Navigate to a Netflix title and enable subtitles.
 * This script prints every subtitle-related network request and DOM state.
 */
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EXT = path.resolve(__dirname);
// Copy user profile to a temp dir (avoids conflicts if Chrome is running)
const PROFILE = path.join(os.tmpdir(), 'dualy-debug-profile');

if (!fs.existsSync(PROFILE)) {
  fs.mkdirSync(PROFILE, { recursive: true });
}

const SUB_HINTS = ['timedtext','timed_text','subtitle','caption','.ttml','.dfxp','.xml','.vtt','nflximg','nflxvideo','nflxext'];

function looksLikeSub(url) {
  const l = url.toLowerCase();
  return SUB_HINTS.some(h => l.includes(h));
}

(async () => {
  console.log('\n=== Dualy Debug ===');
  console.log('Extension:', EXT);
  console.log('Opening Netflix — log in and play a title with subtitles enabled.\n');

  const ctx = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome',
    headless: false,
    args: [
      `--load-extension=${EXT}`,
      `--disable-extensions-except=${EXT}`,
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const page = await ctx.newPage();

  // ── Log all requests ──────────────────────────────────────────────────────
  const seen = new Set();
  ctx.on('request', req => {
    const url = req.url();
    if (looksLikeSub(url) && !seen.has(url)) {
      seen.add(url);
      console.log('\n[SUBTITLE REQUEST]', url);
    }
  });

  ctx.on('response', async resp => {
    const url = resp.url();
    if (seen.has(url)) return;
    try {
      const ct = resp.headers()['content-type'] || '';
      if (/xml|ttml|vtt/.test(ct)) {
        seen.add(url);
        console.log('\n[SUBTITLE RESPONSE by content-type]', url, '|', ct);
      }
    } catch {}
  });

  // ── Page console (content script logs) ───────────────────────────────────
  page.on('console', msg => {
    const t = msg.text();
    if (t.includes('[Dualy') || t.includes('__dualy')) {
      console.log(`  [PAGE ${msg.type()}]`, t);
    }
  });

  page.on('pageerror', e => console.log('  [PAGE ERROR]', e.message));

  // ── DOM poller: checks overlay + native subs every 4s ────────────────────
  await page.goto('https://www.netflix.com');

  const poll = setInterval(async () => {
    try {
      if (!page.url().includes('/watch/')) return;
      const s = await page.evaluate(() => {
        const ov = document.getElementById('dualy-overlay');
        const native = [...document.querySelectorAll('[class*="timedtext"],[class*="TimedText"],[class*="timed-text"]')];
        const vid = document.querySelector('video');
        return {
          overlayExists: !!ov,
          overlayDisplay: ov?.style.display,
          overlayText: ov?.innerText.trim().slice(0, 60),
          nativeClasses: native.map(el => el.className).filter(Boolean).slice(0, 3),
          nativeVisible: native.map(el => el.style.visibility),
          videoTime: vid ? Math.round(vid.currentTime) : null,
        };
      });
      console.log('\n[DOM]', JSON.stringify(s));
    } catch {}
  }, 4000);

  await new Promise(r => ctx.on('close', r));
  clearInterval(poll);
})();
