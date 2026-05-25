# Chrome Web Store — Submission Texts

## Description

```
Watch Netflix in two languages at once — ideal for language learners.

Dualy adds a live translation beneath the original subtitles, so you can
immerse yourself in foreign-language content without losing the thread.
Follow dialogue in the original, glance down for the translation when you
need it, check the pronunciation, and pick up vocabulary naturally in context.

FEATURES

• No delay — upcoming lines are pre-translated before they appear
• Context-aware translation — lines are translated in scene-sized groups, so pronouns, names and tone stay consistent across sentences rather than each line being treated in isolation
• Google Translate built in, no setup required
• DeepL support for higher-quality translations (API key required)
• Pinyin for Chinese · Romanisation for Korean
• Adjustable font size, position, background colour and opacity
```

---

## Single purpose

Displays a real-time translation alongside the original subtitles on Netflix, so users can watch content in two languages simultaneously.

---

## Permission justifications

### storage

`chrome.storage.sync` stores user preferences: target language, translation provider, font sizes, vertical position, and background theme and opacity. `chrome.storage.local` stores a translation cache (capped at 500 entries) to avoid redundant API calls, and the user-supplied DeepL API key if DeepL is selected as provider. No data is transmitted to any developer-controlled server.

### tabs

Used only in the extension popup to read the URL of the active tab. This determines whether the user is on a Netflix watch page and updates the status indicator accordingly. No tab content, browsing history or other data is accessed.

### Host permissions

`https://www.netflix.com/watch/*` — content script match pattern; injects the subtitle overlay into Netflix watch pages only.

`https://translate.googleapis.com/*` — the background service worker calls Google Translate to translate subtitle text when Google is selected as the translation provider.

`https://api.deepl.com/*` and `https://api-free.deepl.com/*` — called by the background service worker when the user selects DeepL as translation provider.

---

## Remote code

**No.** All JavaScript is bundled in the extension package. The extension makes no use of `eval()`, `new Function()`, or externally hosted scripts.

---

## Data usage

**No user data is collected by the developer.**

Subtitle text is sent directly from the extension to Google Translate or DeepL (whichever the user selects) as the core function of the extension. This data is not routed through or stored on any developer-controlled server. User preferences and the optional DeepL API key are stored only on the user's own device via `chrome.storage`.

Check **none** of the data collection categories. Certify all three disclosures.
