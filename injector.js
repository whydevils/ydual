// Runs in MAIN world at document_start.
// Hooks XHR to intercept Netflix subtitle file downloads (OCA CDN — URL path '/').
(function () {
  'use strict';

  const _xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    this._dualyUrl = typeof url === 'string' ? url : String(url);
    return _xhrOpen.apply(this, arguments);
  };

  const _xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body) {
    const url = this._dualyUrl || '';
    if (looksLikeSubtitleDownload(url)) {
      this.addEventListener('load', () => {
        try {
          const text = this.responseText;
          if (!text) return;
          const trimmed = text.trimStart();
          if (!trimmed.startsWith('<?xml') && !trimmed.startsWith('<tt') && !trimmed.startsWith('WEBVTT')) return;
          const lang = extractSubtitleLang(text);
          window.dispatchEvent(new CustomEvent('DUALY_SUBTITLE_FILE', {
            detail: { text, language: lang || '', type: 'subtitles' },
          }));
        } catch (_) {}
      });
    }
    return _xhrSend.apply(this, arguments);
  };

  // Subtitle files from the OCA CDN have URL path '/' with only query params.
  function looksLikeSubtitleDownload(url) {
    try { return new URL(url).pathname === '/'; } catch (_) { return false; }
  }

  // Extract BCP-47 language code from TTML xml:lang or WebVTT Language header.
  function extractSubtitleLang(text) {
    const m = text.match(/xml:lang="([^"]+)"/);
    if (m) return m[1];
    const v = text.match(/^Language:\s*(.+)$/m);
    return v ? v[1].trim() : null;
  }
})();
