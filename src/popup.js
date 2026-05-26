// Dualy popup script

const LANGUAGES = [
  { code: 'auto', label: 'Auto-detect' },
  { code: 'en',   label: 'English' },
  { code: 'es',   label: 'Spanish' },
  { code: 'fr',   label: 'French' },
  { code: 'de',   label: 'German' },
  { code: 'pt',   label: 'Portuguese' },
  { code: 'it',   label: 'Italian' },
  { code: 'nl',   label: 'Dutch' },
  { code: 'pl',   label: 'Polish' },
  { code: 'ru',   label: 'Russian' },
  { code: 'ja',   label: 'Japanese' },
  { code: 'ko',   label: 'Korean' },
  { code: 'zh',   label: 'Chinese (Simplified)' },
  { code: 'zh-TW', label: 'Chinese (Traditional)' },
  { code: 'ar',   label: 'Arabic' },
  { code: 'hi',   label: 'Hindi' },
  { code: 'tr',   label: 'Turkish' },
  { code: 'sv',   label: 'Swedish' },
  { code: 'da',   label: 'Danish' },
  { code: 'fi',   label: 'Finnish' },
  { code: 'no',   label: 'Norwegian' },
  { code: 'cs',   label: 'Czech' },
  { code: 'ro',   label: 'Romanian' },
  { code: 'uk',   label: 'Ukrainian' },
  { code: 'vi',   label: 'Vietnamese' },
];

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

// Elements
const $ = id => document.getElementById(id);
const enabledEl          = $('enabled');
const targetLangEl       = $('targetLang');
const providerEl         = $('translationProvider');
const deeplKeyRow        = $('deeplKeyRow');
const deeplKeyEl         = $('deeplApiKey');
const bgThemeEl    = $('bgTheme');
const showPinyinEl           = $('showPinyin');
const useAccentColorEl    = $('useAccentColor');
const useAccentColorRow   = $('useAccentColorRow');
const srcSizeEl    = $('sourceFontSize');
const tgtSizeEl    = $('targetFontSize');
const bgAlphaEl    = $('bgAlpha');
const vertPosEl    = $('verticalPos');
const srcSizeVal   = $('srcSizeVal');
const tgtSizeVal   = $('tgtSizeVal');
const bgAlphaVal   = $('bgAlphaVal');
const posVal       = $('posVal');
const statusDot        = $('statusDot');
const statusText       = $('statusText');
const resetDisplayBtn  = $('resetDisplay');

// Populate language dropdown
function populateSelects() {
  LANGUAGES.filter(l => l.code !== 'auto').forEach(lang => {
    const opt = document.createElement('option');
    opt.value = lang.code;
    opt.textContent = lang.label;
    targetLangEl.appendChild(opt);
  });
}

// Reflect settings to UI
function applyToUI(s) {
  enabledEl.checked        = s.enabled;
  targetLangEl.value       = s.targetLang;
  providerEl.value         = s.translationProvider;
  bgThemeEl.value          = s.bgTheme;
  showPinyinEl.checked          = s.showPinyin;
  useAccentColorEl.checked   = s.useAccentColor;
  srcSizeEl.value          = s.sourceFontSize;
  tgtSizeEl.value          = s.targetFontSize;
  bgAlphaEl.value          = s.bgAlpha;
  vertPosEl.value          = s.verticalPos;
  srcSizeVal.textContent   = `${s.sourceFontSize}px`;
  tgtSizeVal.textContent   = `${s.targetFontSize}px`;
  bgAlphaVal.textContent   = `${s.bgAlpha}%`;
  posVal.textContent       = `${s.verticalPos}%`;
  updateDeepLKeyVisibility(s.translationProvider);
  updatePinyinAccentVisibility(s.showPinyin);
}

// Read current UI values into a settings object (sync storage only — not API key)
function readFromUI() {
  return {
    enabled:             enabledEl.checked,
    targetLang:          targetLangEl.value,
    translationProvider: providerEl.value,
    bgTheme:             bgThemeEl.value,
    showPinyin:          showPinyinEl.checked,
    useAccentColor:   useAccentColorEl.checked,
    sourceFontSize:      parseInt(srcSizeEl.value),
    targetFontSize:      parseInt(tgtSizeEl.value),
    bgAlpha:             parseInt(bgAlphaEl.value),
    verticalPos:         parseInt(vertPosEl.value),
  };
}

function updateDeepLKeyVisibility(provider) {
  deeplKeyRow.style.display = provider === 'deepl' ? 'flex' : 'none';
}

function updatePinyinAccentVisibility(showPinyin) {
  useAccentColorRow.style.display = showPinyin ? 'flex' : 'none';
}

srcSizeEl.addEventListener('input', () => { srcSizeVal.textContent = `${srcSizeEl.value}px`; });
tgtSizeEl.addEventListener('input', () => { tgtSizeVal.textContent = `${tgtSizeEl.value}px`; });
bgAlphaEl.addEventListener('input', () => { bgAlphaVal.textContent = `${bgAlphaEl.value}%`; });
vertPosEl.addEventListener('input', () => { posVal.textContent = `${vertPosEl.value}%`; });

// Save on any change — debounced to avoid sync storage quota errors on slider drag
let saveTimer = null;
function onSettingChange() {
  const s = readFromUI();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => chrome.storage.sync.set(s), 300);
}

['enabled', 'targetLang', 'bgTheme', 'showPinyin', 'useAccentColor', 'sourceFontSize', 'targetFontSize', 'bgAlpha', 'verticalPos', 'translationProvider']
  .forEach(id => $(id).addEventListener('change', onSettingChange));

['sourceFontSize', 'targetFontSize', 'bgAlpha', 'verticalPos']
  .forEach(id => $(id).addEventListener('input', onSettingChange));

providerEl.addEventListener('change', () => updateDeepLKeyVisibility(providerEl.value));
showPinyinEl.addEventListener('change', () => updatePinyinAccentVisibility(showPinyinEl.checked));

const DISPLAY_DEFAULTS = {
  sourceFontSize: DEFAULT_SETTINGS.sourceFontSize,
  targetFontSize: DEFAULT_SETTINGS.targetFontSize,
  verticalPos:    DEFAULT_SETTINGS.verticalPos,
  bgTheme:        DEFAULT_SETTINGS.bgTheme,
  bgAlpha:        DEFAULT_SETTINGS.bgAlpha,
  useAccentColor: DEFAULT_SETTINGS.useAccentColor,
};

resetDisplayBtn.addEventListener('click', () => {
  const s = { ...readFromUI(), ...DISPLAY_DEFAULTS };
  applyToUI(s);
  clearTimeout(saveTimer);
  chrome.storage.sync.set(s);
});

// API key — stored in local storage (not synced across devices)
let keyTimer = null;
deeplKeyEl.addEventListener('input', () => {
  clearTimeout(keyTimer);
  keyTimer = setTimeout(() => {
    const key = deeplKeyEl.value.trim();
    if (key) {
      chrome.storage.local.set({ deeplApiKey: key });
    } else {
      chrome.storage.local.remove('deeplApiKey');
    }
  }, 500);
});

// Update status badge
async function updateStatus(tab) {
  const url = tab?.url || '';
  const onWatch = url.includes('netflix.com/watch');
  statusDot.classList.toggle('active', onWatch);
  statusText.textContent = onWatch
    ? 'Netflix detected'
    : url.includes('netflix.com')
      ? 'Open a Netflix title to start'
      : 'Navigate to Netflix';
}

// Init
(async function init() {
  populateSelects();
  const [s, local] = await Promise.all([
    new Promise(resolve => chrome.storage.sync.get(DEFAULT_SETTINGS, resolve)),
    new Promise(resolve => chrome.storage.local.get('deeplApiKey', resolve)),
  ]);
  applyToUI(s);
  if (local.deeplApiKey) deeplKeyEl.value = local.deeplApiKey;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    updateStatus(tab);
  } catch {
    statusDot.classList.remove('active');
    statusText.textContent = 'Ready';
  }
})();
