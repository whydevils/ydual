// Dualy background service worker — translation + cache

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'TRANSLATE') {
    handleTranslate(msg.text, msg.sl, msg.tl, msg.provider).then(sendResponse);
    return true;
  }
});

async function handleTranslate(text, sl, tl, provider) {
  if (!text || !tl) return null;

  const cacheKey = `${provider || 'google'}|${sl}|${tl}|${text}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return { text: cached, fromCache: true };

  let result;
  if (provider === 'deepl') {
    const { deeplApiKey } = await new Promise(r => chrome.storage.local.get('deeplApiKey', r));
    if (!deeplApiKey) return null;
    result = await fetchDeepL(text, sl, tl, deeplApiKey);
  } else {
    result = await fetchGoogle(text, sl, tl);
  }

  if (result) await cacheSet(cacheKey, result);
  return result ? { text: result, fromCache: false } : null;
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

async function fetchDeepL(text, sl, tl, apiKey) {
  try {
    const base = apiKey.endsWith(':fx')
      ? 'https://api-free.deepl.com/v2/translate'
      : 'https://api.deepl.com/v2/translate';
    const targetLang = toDeepLLang(tl);
    if (!targetLang) return null;
    const body = new URLSearchParams({ text, target_lang: targetLang });
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
    return data.translations?.[0]?.text?.trim() ?? null;
  } catch (e) {
    console.warn('[Dualy] DeepL:', e.message);
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
  const keys = Object.keys(all).filter(k => k.includes('|'));
  if (keys.length > 500) chrome.storage.local.remove(keys.slice(0, keys.length - 400));
}
