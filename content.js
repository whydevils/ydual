// Dualy content script — dual subtitle overlay for Netflix

const ACCENT = '#D946EF';
const CHINESE_CODES = ['zh', 'zh-cn', 'zh-tw', 'zh-hans', 'zh-hant'];

const DEFAULT_SETTINGS = {
  enabled: true,
  targetLang: 'en',
  translationProvider: 'google',
  showPinyin: true,
  useAccentColor: true,
  bgTheme: 'dark',
  bgAlpha: 40,
  sourceFontSize: 18,
  targetFontSize: 22,
  verticalPos: 85,
};

let settings = { ...DEFAULT_SETTINGS };
let overlay, sourceEl, pinyinSrcEl, targetEl, pinyinTgtEl;
let subtitleObserver = null;
let containerObserver = null;
let lastSourceText = '';
let subtitleDebounceTimer = null;

// Manifest / TTML pre-fetch state
let manifestTracks = [];
let activeLang = 'auto';   // BCP-47 source language, or 'auto'
let ttmlCues = null;       // [{begin, end, text}] from pre-fetched subtitle file
let rafId = null;
let lastRafTs = 0;
let preloadTimer = null;
let videoEl = null;

// ── Init ──────────────────────────────────────────────────────────────────────

(async function init() {
  settings = await loadSettings();
  buildOverlay();
  injectStyles();
  if (settings.enabled) showNative(false);
  watchForSubtitleContainer();
})();

function loadSettings() {
  return new Promise(r => chrome.storage.sync.get(DEFAULT_SETTINGS, r));
}

// ── Settings updates from popup ───────────────────────────────────────────────

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  const prevTarget = settings.targetLang;
  const prevProvider = settings.translationProvider;
  for (const [key, { newValue }] of Object.entries(changes)) {
    settings[key] = newValue;
  }
  applySettingsToOverlay();
  if (!settings.enabled) {
    clearOverlay();
    showNative(true);
  } else {
    showNative(false);
    if (settings.targetLang !== prevTarget || settings.translationProvider !== prevProvider) {
      if (lastSourceText) translateAndShow(lastSourceText);
      if (ttmlCues) schedulePreload(); // re-warm cache for new target
    }
  }
});

// ── Overlay DOM ───────────────────────────────────────────────────────────────

function buildOverlay() {
  if (document.getElementById('dualy-overlay')) return;

  overlay = document.createElement('div');
  overlay.id = 'dualy-overlay';

  // Source block: source text + pinyin (optional, below)
  const srcBlock = document.createElement('div');
  srcBlock.id = 'dualy-source-block';
  pinyinSrcEl = document.createElement('div');
  pinyinSrcEl.id = 'dualy-pinyin-src';
  pinyinSrcEl.style.display = 'none';
  sourceEl = document.createElement('div');
  sourceEl.id = 'dualy-source';
  srcBlock.appendChild(sourceEl);
  srcBlock.appendChild(pinyinSrcEl);

  // Target block: target text + pinyin (optional, below)
  const tgtBlock = document.createElement('div');
  tgtBlock.id = 'dualy-target-block';
  targetEl = document.createElement('div');
  targetEl.id = 'dualy-target';
  pinyinTgtEl = document.createElement('div');
  pinyinTgtEl.id = 'dualy-pinyin-tgt';
  pinyinTgtEl.style.display = 'none';
  tgtBlock.appendChild(targetEl);
  tgtBlock.appendChild(pinyinTgtEl);

  overlay.appendChild(srcBlock);
  overlay.appendChild(tgtBlock);

  document.documentElement.appendChild(overlay);
  applySettingsToOverlay();
}

function injectStyles() {
  if (document.getElementById('dualy-style')) return;
  const style = document.createElement('style');
  style.id = 'dualy-style';
  style.textContent = `
    /* Hide Netflix native subtitles when Dualy is active */
    .dualy-active .player-timedtext,
    .dualy-active [data-uia="player-timed-text-container"],
    .dualy-active [class*="player-timedtext"] {
      visibility: hidden !important;
    }

    #dualy-overlay {
      position: fixed;
      left: 50%;
      transform: translateX(-50%);
      top: var(--dualy-vpos, 85%);
      z-index: 2147483647;
      text-align: center;
      pointer-events: none;
      max-width: 90vw;
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 3px;
    }
    #dualy-source-block {
      display: flex;
      flex-direction: column;
      align-items: center;
      background: rgba(var(--dualy-bg-rgb), var(--dualy-bg-alpha, 0.4));
      border-radius: 4px;
    }
    #dualy-source {
      font-family: 'Netflix Sans', Arial, sans-serif;
      font-size: var(--dualy-src-size, 18px);
      color: var(--dualy-text-color, rgba(255,255,255,0.85));
      text-shadow: var(--dualy-text-shadow, 0 1px 4px #000, 0 0 6px #000);
      padding: 2px 12px;
      line-height: 1.4;
      white-space: pre-line;
    }
    #dualy-pinyin-src {
      font-size: calc(var(--dualy-src-size, 18px) * 0.65);
      color: var(--dualy-pinyin-color, ${ACCENT});
      letter-spacing: 0.06em;
      text-shadow: var(--dualy-text-shadow, 0 1px 3px #000);
      line-height: 1.4;
      padding: 0 12px 2px;
    }
    #dualy-target-block {
      display: flex;
      flex-direction: column;
      align-items: center;
      background: rgba(var(--dualy-bg-rgb), var(--dualy-bg-alpha, 0.4));
      border-radius: 4px;
      border-bottom: var(--dualy-accent-line, 2px solid ${ACCENT});
    }
    #dualy-target {
      font-family: 'Netflix Sans', Arial, sans-serif;
      font-size: var(--dualy-tgt-size, 22px);
      color: var(--dualy-text-color, #fff);
      text-shadow: var(--dualy-text-shadow, 0 1px 5px #000, 0 0 8px #000);
      padding: 3px 14px;
      line-height: 1.4;
      white-space: pre-line;
    }
    #dualy-pinyin-tgt {
      font-size: calc(var(--dualy-tgt-size, 22px) * 0.6);
      color: var(--dualy-pinyin-color, ${ACCENT});
      letter-spacing: 0.06em;
      text-shadow: var(--dualy-text-shadow, 0 1px 3px #000);
      line-height: 1.4;
      padding: 0 14px 3px;
    }
  `;
  document.documentElement.appendChild(style);
}

function applySettingsToOverlay() {
  if (!overlay) return;
  overlay.style.setProperty('--dualy-vpos', `${settings.verticalPos}%`);
  overlay.style.setProperty('--dualy-src-size', `${settings.sourceFontSize}px`);
  overlay.style.setProperty('--dualy-tgt-size', `${settings.targetFontSize}px`);
  overlay.style.setProperty('--dualy-bg-alpha', (settings.bgAlpha / 100).toFixed(2));
  const dark = settings.bgTheme !== 'light';
  overlay.style.setProperty('--dualy-bg-rgb', dark ? '0,0,0' : '255,255,255');
  overlay.style.setProperty('--dualy-text-color', dark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)');
  overlay.style.setProperty('--dualy-text-shadow', dark ? '0 1px 4px #000, 0 0 6px #000' : 'none');
  overlay.style.setProperty('--dualy-pinyin-color', settings.useAccentColor ? ACCENT : 'var(--dualy-text-color)');
  overlay.style.setProperty('--dualy-accent-line', settings.useAccentColor ? `2px solid ${ACCENT}` : 'none');
}

function clearOverlay() {
  if (overlay) overlay.style.display = 'none';
  if (pinyinSrcEl) pinyinSrcEl.style.display = 'none';
  if (pinyinTgtEl) pinyinTgtEl.style.display = 'none';
  lastSourceText = '';
}

// ── Subtitle container watcher ────────────────────────────────────────────────
// Netflix renders subtitles to .player-timedtext via its own pipeline —
// video.textTracks is always empty, so we watch the DOM directly.

function watchForSubtitleContainer() {
  containerObserver = new MutationObserver(() => {
    const container = getSubtitleContainer();
    if (container) attachSubtitleObserver(container);
  });
  containerObserver.observe(document.documentElement, { childList: true, subtree: true });

  const container = getSubtitleContainer();
  if (container) attachSubtitleObserver(container);
}

function getSubtitleContainer() {
  return (
    document.querySelector('.player-timedtext') ||
    document.querySelector('[data-uia="player-timed-text-container"]') ||
    document.querySelector('[class*="player-timedtext"]')
  );
}

function attachSubtitleObserver(container) {
  if (subtitleObserver) return;
  if (settings.enabled) showNative(false);

  subtitleObserver = new MutationObserver(() => onSubtitleChange(container));
  subtitleObserver.observe(container, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ['style'],
  });

  // Handle SPA navigation: clean up when this container leaves the DOM
  const removeWatcher = new MutationObserver(() => {
    if (!document.contains(container)) {
      subtitleObserver.disconnect();
      subtitleObserver = null;
      stopRafLoop();
      ttmlCues = null;
      activeLang = 'auto';
      clearOverlay();
      document.documentElement.classList.remove('dualy-active');
      removeWatcher.disconnect();
    }
  });
  removeWatcher.observe(document.documentElement, { childList: true, subtree: true });
}

// ── Subtitle change handler ───────────────────────────────────────────────────

function onSubtitleChange(container) {
  clearTimeout(subtitleDebounceTimer);
  subtitleDebounceTimer = setTimeout(() => onSubtitleChangeDebounced(container), 50);
}

function onSubtitleChangeDebounced(container) {
  if (!settings.enabled) return;
  if (ttmlCues) return; // rAF loop handles display when TTML is loaded

  const text = extractText(container);
  if (!text) { clearOverlay(); return; }
  if (text === lastSourceText) return;
  onSubtitleText(text);
}

// Shared display path — called from both the DOM observer and the rAF loop.
function onSubtitleText(text) {
  lastSourceText = text;

  sourceEl.textContent = text;
  targetEl.textContent = '';
  pinyinTgtEl.style.display = 'none';
  overlay.style.display = 'flex';

  if (settings.showPinyin && isChinese(text) && typeof pinyinPro !== 'undefined') {
    pinyinSrcEl.textContent = pinyinPro.pinyin(text, { toneType: 'symbol', type: 'string', nonZh: 'consecutive' });
    pinyinSrcEl.style.display = 'block';
  } else {
    pinyinSrcEl.style.display = 'none';
  }

  translateAndShow(text);
}

function extractText(container) {
  // Primary: Netflix renders each subtitle line in its own container element.
  // The wildcard catches obfuscated class names like "ltr-xxxx-timedtext-text-container".
  const lineContainers = container.querySelectorAll(
    '.player-timedtext-text-container, [class*="timedtext-text-container"]'
  );
  if (lineContainers.length) {
    const lines = Array.from(lineContainers).map(lc => {
      // Each container has a visible child and an aria-hidden shadow child.
      for (const child of lc.children) {
        if (child.getAttribute('aria-hidden') !== 'true') {
          return cleanNodeText(child);
        }
      }
      return cleanNodeText(lc.firstElementChild || lc);
    }).filter(Boolean);
    if (lines.length) return lines.join('\n');
  }

  // Fallback A: aria-hidden filtering on leaf spans.
  // Group by topmost-ancestor-under-container so word-level spans on the same
  // line are joined with their original spacing, not split onto separate lines.
  const allLeaves = Array.from(container.querySelectorAll('span'))
    .filter(s => s.childElementCount === 0 && s.textContent.trim());
  if (!allLeaves.length) return cleanNodeText(container);

  const visibleLeaves = allLeaves.filter(s => !hasAriaHiddenAncestor(s, container));
  if (visibleLeaves.length > 0 && visibleLeaves.length < allLeaves.length) {
    return groupLeavesByLine(visibleLeaves, container);
  }

  // Fallback B: no aria-hidden markers — deduplicate by text, join with space.
  const seen = new Set();
  return allLeaves
    .map(s => s.textContent.trim())
    .filter(t => t && !seen.has(t) && seen.add(t))
    .join(' ');
}

// Recursive text extractor: maps <br> → '\n', preserves spaces in text nodes.
// Caller is responsible for trimming/collapsing the result.
function nodeText(node) {
  let out = '';
  for (const child of node.childNodes) {
    if (child.nodeType === 3) out += child.textContent;
    else if (child.nodeName === 'BR') out += '\n';
    else if (child.nodeType === 1) out += nodeText(child);
  }
  return out;
}

function cleanNodeText(node) {
  return nodeText(node).replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').trim();
}

// Group leaf spans by their topmost ancestor that is a direct child of container,
// join within a group (preserving spaces), join groups with '\n'.
function groupLeavesByLine(leaves, container) {
  const lineMap = new Map();
  for (const leaf of leaves) {
    let node = leaf;
    while (node.parentElement && node.parentElement !== container) node = node.parentElement;
    if (!lineMap.has(node)) lineMap.set(node, []);
    lineMap.get(node).push(leaf.textContent);
  }
  return [...lineMap.values()]
    .map(parts => parts.join('').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function hasAriaHiddenAncestor(el, boundary) {
  let node = el.parentElement;
  while (node && node !== boundary) {
    if (node.getAttribute('aria-hidden') === 'true') return true;
    node = node.parentElement;
  }
  return false;
}

// ── Translation ───────────────────────────────────────────────────────────────

async function translateAndShow(text) {
  const tl = settings.targetLang;

  const resp = await chrome.runtime.sendMessage({
    type: 'TRANSLATE',
    text,
    sl: activeLang,
    tl,
    provider: settings.translationProvider,
  });

  if (text !== lastSourceText) return;

  if (!resp?.fromCache) schedulePreload();

  const translated = resp?.text ?? resp;
  if (translated) {
    targetEl.textContent = translated;

    if (settings.showPinyin && isChineseLang(tl) && typeof pinyinPro !== 'undefined') {
      pinyinTgtEl.textContent = pinyinPro.pinyin(translated, { toneType: 'symbol', type: 'string', nonZh: 'consecutive' });
      pinyinTgtEl.style.display = 'block';
    } else {
      pinyinTgtEl.style.display = 'none';
    }
  }
}

// ── Native subtitle hiding ────────────────────────────────────────────────────

function showNative(visible) {
  document.documentElement.classList.toggle('dualy-active', !visible);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isChinese(text) {
  return /\p{Script=Han}/u.test(text);
}

function isChineseLang(lang) {
  return CHINESE_CODES.some(c => (lang || '').toLowerCase().startsWith(c));
}

// ── Manifest / TTML pre-fetch ─────────────────────────────────────────────────

window.addEventListener('DUALY_MANIFEST', e => {
  manifestTracks = e.detail.tracks || [];
  ttmlCues = null;
  activeLang = 'auto';
  stopRafLoop();

  // If there is exactly one subtitle (non-CC) track we know the source language.
  const subTracks = manifestTracks.filter(t => t.type !== 'closedcaptions');
  if (subTracks.length === 1) activeLang = subTracks[0].language || 'auto';
});

window.addEventListener('DUALY_SUBTITLE_FILE', e => {
  const { text, language, type } = e.detail;
  if (type === 'closedcaptions') return;
  // Skip if we already know the active language and this file is a different one
  if (activeLang !== 'auto' && language && activeLang !== language) return;

  const cues = text.trimStart().startsWith('WEBVTT') ? parseVTT(text) : parseTTML(text);
  if (!cues.length) return;

  activeLang = language || activeLang;
  ttmlCues = cues;
  schedulePreload();
  startRafLoop();
});

// ── rAF display loop ──────────────────────────────────────────────────────────

function startRafLoop() {
  if (rafId) return;
  const video = document.querySelector('video');
  if (!video) { setTimeout(startRafLoop, 500); return; }
  videoEl = video;
  video.addEventListener('seeked', onSeeked);

  function tick(ts) {
    if (ts - lastRafTs >= 200) {
      lastRafTs = ts;
      if (settings.enabled && ttmlCues) {
        const t = video.currentTime;
        const active = ttmlCues.find(c => t >= c.begin && t < c.end);
        const text = active ? active.text : '';
        if (text !== lastSourceText) {
          if (text) onSubtitleText(text);
          else clearOverlay();
        }
      }
    }
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);
}

function stopRafLoop() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  if (videoEl) { videoEl.removeEventListener('seeked', onSeeked); videoEl = null; }
}

function onSeeked() {
  if (!ttmlCues) return;
  ttmlCues.forEach(c => { c._preloaded = false; });
  schedulePreload();
}

// ── Pre-translation lookahead ─────────────────────────────────────────────────

function schedulePreload() {
  clearTimeout(preloadTimer);
  preloadTimer = setTimeout(doPreload, 600);
}

function doPreload() {
  if (!ttmlCues || !settings.enabled) return;
  const video = document.querySelector('video');
  const t = video ? video.currentTime : 0;
  const upcoming = ttmlCues.filter(c => c.begin >= t && c.begin <= t + 90 && !c._preloaded);
  for (const cue of upcoming) {
    cue._preloaded = true;
    // Fire-and-forget — result lands in background.js cache for instant retrieval
    chrome.runtime.sendMessage({
      type: 'TRANSLATE',
      text: cue.text,
      sl: activeLang,
      tl: settings.targetLang,
      provider: settings.translationProvider,
    });
  }
  // Slide the window forward every 30 s
  if (upcoming.length) preloadTimer = setTimeout(doPreload, 30_000);
}

// ── Subtitle file parsers ─────────────────────────────────────────────────────

function parseVTT(raw) {
  const cues = [];
  for (const block of raw.replace(/\r/g, '').split(/\n\n+/)) {
    const lines = block.trim().split('\n');
    const tl = lines.find(l => l.includes('-->'));
    if (!tl) continue;
    const [s, e] = tl.split('-->').map(x => parseTimestamp(x.trim().split(/\s/)[0]));
    const text = lines.slice(lines.indexOf(tl) + 1)
      .map(l => l.replace(/<[^>]+>/g, '').trim())
      .filter(Boolean)
      .join('\n');
    if (text) cues.push({ begin: s, end: e, text });
  }
  return cues;
}

function parseTTML(raw) {
  try {
    const doc = new DOMParser().parseFromString(raw, 'text/xml');
    const paras = doc.querySelectorAll('body > div > p, tt > body > div > p');
    return Array.from(paras).map(p => {
      const begin = parseTimestamp(p.getAttribute('begin') || '');
      const endAttr = p.getAttribute('end');
      const durAttr = p.getAttribute('dur');
      const end = endAttr ? parseTimestamp(endAttr) : begin + parseTimestamp(durAttr || '0');
      const text = ttmlNodeText(p).replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').trim();
      return { begin, end, text };
    }).filter(c => c.text && c.end > c.begin);
  } catch (_) { return []; }
}

function ttmlNodeText(node) {
  let out = '';
  for (const child of node.childNodes) {
    if (child.nodeType === 3 /* TEXT */) out += child.textContent;
    else if (child.nodeName.toLowerCase() === 'br') out += '\n';
    else if (child.nodeType === 1 /* ELEMENT */) out += ttmlNodeText(child);
  }
  return out;
}

function parseTimestamp(s) {
  if (!s) return 0;
  s = s.trim();
  if (/^\d+t$/.test(s)) return parseInt(s) / 10_000_000; // TTML ticks
  const parts = s.split(':');
  if (parts.length < 2) return parseFloat(s) || 0;
  const frames = parts[3] ? parseInt(parts[3]) / 30 : 0; // HH:MM:SS:FF
  return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2] || 0) + frames;
}
