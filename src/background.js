// Dualy background service worker — translation + cache

const BATCH_SEP = '⬛'; // preserved by translation APIs, unlikely in subtitle text

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'TRANSLATE') {
    handleTranslate(msg.text, msg.sl, msg.tl, msg.provider, msg.context, msg.preload).then(sendResponse);
    return true;
  }
  if (msg.type === 'TRANSLATE_BATCH') {
    handleTranslateBatch(msg.texts, msg.sl, msg.tl, msg.provider, msg.contextTexts).then(sendResponse);
    return true;
  }
});

async function handleTranslate(text, sl, tl, provider, context, preload) {
  if (!text || !tl) return null;

  const cacheKey = `${provider || 'google'}|${sl}|${tl}|${text}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return { text: cached, fromCache: true };

  let result;
  const t0 = Date.now();
  if (provider === 'deepl') {
    const { deeplApiKey } = await new Promise(r => chrome.storage.local.get('deeplApiKey', r));
    if (!deeplApiKey) return null;
    result = await fetchDeepL(text, sl, tl, deeplApiKey, context);
  } else {
    result = await fetchGoogle(text, sl, tl);
  }
  const ms = Date.now() - t0;

  if (result) await cacheSet(cacheKey, result);
  return result ? { text: result, fromCache: false, ms } : { fromCache: false, ms };
}

async function handleTranslateBatch(texts, sl, tl, provider, contextTexts) {
  if (!texts?.length || !tl) return;

  const providerKey = provider || 'google';
  const cacheKeys = texts.map(t => `${providerKey}|${sl}|${tl}|${t}`);
  const cached = await Promise.all(cacheKeys.map(cacheGet));

  const pending = texts.reduce((acc, text, i) => {
    if (!cached[i]) acc.push({ text, i });
    return acc;
  }, []);
  if (!pending.length) return { results: cached, ms: 0, allCached: true };

  const pendingTexts = pending.map(p => p.text);
  let results;
  const t0 = Date.now();
  if (provider === 'deepl') {
    const { deeplApiKey } = await new Promise(r => chrome.storage.local.get('deeplApiKey', r));
    if (!deeplApiKey) return;
    results = await fetchDeepLBatch(pendingTexts, sl, tl, deeplApiKey, contextTexts);
  } else {
    results = await fetchGoogleBatch(pendingTexts, sl, tl, contextTexts);
  }
  const ms = Date.now() - t0;

  if (!results) return { results: null, ms };
  await Promise.all(pending.map((p, ri) => results[ri] ? cacheSet(cacheKeys[p.i], results[ri]) : null));

  // Return full results array aligned to original texts[] order (cached slots filled in)
  const full = texts.map((_, i) => cached[i] ?? results[pending.findIndex(p => p.i === i)] ?? null);
  return { results: full, ms };
}

async function fetchGoogle(text, sl, tl) {
  try {
    const url =
      'https://translate.googleapis.com/translate_a/single' +
      `?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t` +
      `&q=${encodeURIComponent(text)}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return data[0].map(p => p[0]).join('').trim();
  } catch (e) {
    console.warn('[Dualy] Google:', e.message);
    return null;
  }
}

async function fetchGoogleBatch(texts, sl, tl, contextTexts) {
  const allTexts = contextTexts?.length ? [...contextTexts, ...texts] : texts;
  const raw = await fetchGoogle(allTexts.join(`\n${BATCH_SEP}\n`), sl, tl);
  if (!raw) return null;
  const parts = raw.split(BATCH_SEP).map(s => s.trim());
  if (parts.length !== allTexts.length) return null;
  return parts.slice(contextTexts?.length ?? 0);
}

async function fetchDeepL(text, sl, tl, apiKey, context) {
  try {
    const base = apiKey.endsWith(':fx')
      ? 'https://api-free.deepl.com/v2/translate'
      : 'https://api.deepl.com/v2/translate';
    const targetLang = toDeepLLang(tl);
    if (!targetLang) return null;
    const body = new URLSearchParams({ text, target_lang: targetLang });
    if (sl !== 'auto') body.set('source_lang', sl.toUpperCase().split('-')[0]);
    if (context) body.set('context', context);
    const resp = await fetch(base, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return data.translations?.[0]?.text?.trim() ?? null;
  } catch (e) {
    console.warn('[Dualy] DeepL:', e.message);
    return null;
  }
}

async function fetchDeepLBatch(texts, sl, tl, apiKey, contextTexts) {
  try {
    const base = apiKey.endsWith(':fx')
      ? 'https://api-free.deepl.com/v2/translate'
      : 'https://api.deepl.com/v2/translate';
    const targetLang = toDeepLLang(tl);
    if (!targetLang) return null;
    const allTexts = contextTexts?.length ? [...contextTexts, ...texts] : texts;
    const body = new URLSearchParams({ text: allTexts.join(`\n${BATCH_SEP}\n`), target_lang: targetLang });
    if (sl !== 'auto') body.set('source_lang', sl.toUpperCase().split('-')[0]);
    const resp = await fetch(base, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const raw = data.translations?.[0]?.text?.trim() ?? null;
    if (!raw) return null;
    const parts = raw.split(BATCH_SEP).map(s => s.trim());
    if (parts.length !== allTexts.length) return null;
    return parts.slice(contextTexts?.length ?? 0);
  } catch (e) {
    console.warn('[Dualy] DeepL batch:', e.message);
    return null;
  }
}

// DeepL uses uppercase codes with some differences from standard BCP-47
const DEEPL_LANG_MAP = {
  en: 'EN-US', es: 'ES', fr: 'FR', de: 'DE', pt: 'PT-BR', it: 'IT',
  nl: 'NL', pl: 'PL', ru: 'RU', ja: 'JA', ko: 'KO', zh: 'ZH',
  'zh-tw': 'ZH-HANT', ar: 'AR', tr: 'TR', sv: 'SV', da: 'DA',
  fi: 'FI', cs: 'CS', ro: 'RO', uk: 'UK',
};

function toDeepLLang(code) {
  return DEEPL_LANG_MAP[code.toLowerCase()] ?? null;
}

// ── Storage helpers ───────────────────────────────────────────────────────────

function cacheGet(key) {
  return new Promise(r => chrome.storage.local.get(key, res => r(res[key] ?? null)));
}

function cacheSet(key, value) {
  return chrome.storage.local.set({ [key]: value });
}

// ── Cache pruning ─────────────────────────────────────────────────────────────

chrome.runtime.onStartup.addListener(pruneCache);
chrome.runtime.onInstalled.addListener(pruneCache);

async function pruneCache() {
  const all = await new Promise(r => chrome.storage.local.get(null, r));
  // Cache keys have the form provider|sl|tl|text; settings keys (e.g. deeplApiKey) never contain '|'
  const keys = Object.keys(all).filter(k => k.includes('|'));
  if (keys.length > 500) chrome.storage.local.remove(keys.slice(0, keys.length - 400));
}
