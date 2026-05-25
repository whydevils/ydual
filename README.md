# Dualy — Dual Subtitles

Watch streaming video with two subtitle tracks at once: the original language on top and a translation of your choice below. No server required — everything runs in your browser.

**Currently supported platforms:** Netflix

## Features

- **Dual subtitles** — original audio language + translation displayed simultaneously
- **Translation providers** — Google Translate (free, no setup) or DeepL (higher quality, requires an API key)
- **Phonetics** — optional pinyin for Chinese subtitles and romanization for Korean subtitles, shown beneath each line
- **24 target languages** — English, Spanish, French, German, Japanese, Korean, Chinese (Simplified & Traditional), Arabic, and more
- **Fully customizable display** — adjust font sizes, vertical position, background color and opacity, and accent color
- **Zero-delay translations** — upcoming subtitle lines are pre-translated in a lookahead window so the translation appears the instant the subtitle does

## Installation

The extension is not on the Chrome Web Store yet. Load it manually:

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Click **Load unpacked** and select the `src/` folder inside the repository.
4. Open a supported streaming platform and the extension activates automatically.

## Usage

Click the extension icon while watching a supported title to open the settings popup.

| Setting | Description |
|---|---|
| Active toggle | Enable or disable dual subtitles |
| Translate to | Target language for the translation line |
| Provider | Google (no key needed) or DeepL (paste your API key) |
| Show phonetics | Pinyin / romanization beneath Chinese or Korean lines |
| Source / Target size | Font size for each subtitle line |
| Vertical position | Where the overlay sits on the screen (0 % = top, 100 % = bottom) |
| Background | Dark or light pill behind the text, with adjustable opacity |
| Use accent color | Purple-pink highlight on the translation separator and phonetics |
| Reset display | Restore layout defaults without touching language or provider settings |

The status dot in the popup turns purple when a supported platform is detected.

## Technical overview

> For developers who want to understand, modify, or extend the extension.

### Architecture

The extension is designed around a platform content script (`src/content.js`) that is paired with a platform-specific injector (`src/injector.js`). Adding a new platform means writing a new injector and registering a new `content_scripts` entry in `src/manifest.json`; the translation pipeline, overlay, and settings are shared and platform-agnostic.

Currently one platform is implemented: **Netflix**. The following describes that implementation.

The extension consists of three JavaScript contexts and two vendor libraries:

```
src/
  injector.js          — MAIN world, runs at document_start
  content.js           — isolated world, runs at document_idle
  background.js        — MV3 service worker
  vendor/
    pinyin-pro.min.js
    hangul-romanization.js
build.js               — packages src/ into dist/dualy-{version}.zip and .crx
```

### Subtitle interception (`injector.js`)

Netflix delivers subtitles as TTML or WebVTT files fetched by its player via XHR from an OCA (Open Connect Appliance) CDN. The CDN URLs use the path `/` with all parameters in the query string.

`injector.js` runs in the `MAIN` world (same JavaScript environment as the page) and monkey-patches `XMLHttpRequest.prototype.open` and `.send` to intercept responses whose URL matches that pattern. When the response body begins with `<?xml`, `<tt`, or `WEBVTT`, the raw text and the BCP-47 language code (extracted from `xml:lang` or the WebVTT `Language:` header) are forwarded to the isolated world via a `CustomEvent` named `DUALY_SUBTITLE_FILE`.

### Content script (`content.js`)

**Two display modes** operate depending on whether a TTML intercept succeeded:

1. **rAF mode** (preferred) — after receiving a `DUALY_SUBTITLE_FILE` event, the script parses the full cue list (TTML or WebVTT) and runs a `requestAnimationFrame` loop that samples `video.currentTime` every 200 ms to find and display the active cue. This eliminates subtitle flicker and enables pre-translation.

2. **DOM observer mode** (fallback) — when no TTML is available (e.g. on a language switch back to a cached track), a `MutationObserver` watches Netflix's `.player-timedtext` container and extracts text on every change. The extractor handles obfuscated class names, `aria-hidden` shadow children, and word-level `<span>` elements that Netflix sometimes uses.

**Stale-cue detection** — if the rAF cue text and the Netflix DOM text are both non-empty but differ for five consecutive ticks, the extension tries to recover from its per-language cue cache (`cuesByLang`). If no cached language matches the DOM text, it falls back to DOM observer mode.

**Pre-translation lookahead** — after each subtitle update, `doPreload` fires background translate requests for all cues in the next 90 seconds. The background script caches the results immediately, so when the rAF loop reaches those cues the translation is already available.

**Phonetics** — Chinese text (detected via the Unicode `Han` script property) is run through `pinyin-pro`; Korean text (via the `Hangul` script property) is run through `hangul-romanization`. Both are applied to the source and, when applicable, the target line.

**Native subtitle hiding** — when Dualy is active it adds the class `dualy-active` to `<html>`. A CSS rule in the injected stylesheet sets `visibility: hidden` on Netflix's subtitle container, leaving the DOM intact (so the observer still fires) while hiding the rendered text.

### Background service worker (`background.js`)

Handles all outbound network requests (required by MV3 since content scripts cannot use `fetch` for cross-origin URLs without a host permission bottleneck).

- **Google Translate** — calls the public `translate.googleapis.com` single-endpoint API (no key required).
- **DeepL** — calls `api.deepl.com` or `api-free.deepl.com` depending on whether the key ends with `:fx`. The API key is stored in `chrome.storage.local` (not synced) and never leaves the device in plaintext.
- **Cache** — translations are stored in `chrome.storage.local` with a compound key `provider|sl|tl|text`. On startup or install, entries beyond 500 are pruned to keep storage usage bounded.

### Permissions

| Permission | Reason |
|---|---|
| `storage` | Persist settings (`sync`) and translation cache + DeepL key (`local`) |
| `tabs` | Read the active tab URL to update the popup status badge |
| `https://www.netflix.com/*` | Inject scripts and observe the Netflix player DOM |
| `https://translate.googleapis.com/*` | Google Translate API calls |
| `https://api.deepl.com/*`, `https://api-free.deepl.com/*` | DeepL API calls |

### Vendor libraries

| Library | Purpose |
|---|---|
| `pinyin-pro` | Convert Chinese characters to pinyin with tone marks |
| `hangul-romanization` | Convert Korean hangul to Latin romanization |

Both are loaded as content scripts before `content.js` and are available as globals (`pinyinPro`, `hangulRomanization`).

### Settings storage

All display and behaviour settings are stored in `chrome.storage.sync` so they roam across the user's Chrome profile. The DeepL API key is stored separately in `chrome.storage.local` to avoid syncing a secret.

Default values are defined identically in `content.js` and `popup.js` to ensure consistent fallback behaviour when settings have not yet been written.
