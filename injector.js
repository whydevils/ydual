// Runs in MAIN world at document_start to intercept the Netflix manifest.
// No chrome.* API access here — communicates via CustomEvent on window.
//
// Netflix delivers the manifest via fetch().then(r => r.json()), which bypasses
// a JSON.parse hook. We therefore hook both fetch (primary) and JSON.parse
// (fallback for older Netflix builds or other code paths).
(function () {
  'use strict';

  // ── fetch hook (primary) ────────────────────────────────────────────────────
  const _fetch = window.fetch.bind(window);
  window.fetch = async function (...args) {
    const response = await _fetch(...args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url ?? '';
      if (looksLikeManifest(url)) {
        response.clone().json().then(data => {
          const tracks = data?.result?.timedtextTracks ?? data?.timedtextTracks;
          if (tracks) onManifest(tracks);
        }).catch(() => {});
      }
    } catch (_) {}
    return response;
  };

  // ── JSON.parse hook (fallback) ──────────────────────────────────────────────
  const _parse = JSON.parse.bind(JSON);
  JSON.parse = function (...args) {
    const result = _parse(...args);
    try {
      const tracks = result?.result?.timedtextTracks ?? result?.timedtextTracks;
      if (tracks && result?.result?.movieId) onManifest(tracks);
    } catch (_) {}
    return result;
  };

  // Manifest responses come from Netflix's Shakti / cadmium API paths.
  // No domain check needed — this script only runs on netflix.com pages.
  function looksLikeManifest(url) {
    return url.includes('/manifest') ||
      url.includes('manifest?') ||
      url.includes('/cadmium/') ||
      url.includes('/shakti/') ||
      url.includes('/api/shakti');
  }

  // ── Shared manifest handler ─────────────────────────────────────────────────
  let manifested = false; // dispatch once per page load
  function onManifest(tracks) {
    if (manifested) return;
    const parsed = tracks
      .filter(t => !t.isNoneTrack)
      .map(t => ({
        language: t.language || t.bcp47 || '',
        type: t.rawTrackType || 'subtitles',
        downloadables: t.ttDownloadables || {},
      }));
    if (!parsed.length) return;
    manifested = true;

    window.dispatchEvent(new CustomEvent('DUALY_MANIFEST', { detail: { tracks: parsed } }));

    // Fetch subtitle files from page context (netflix.com origin — CDN allows it)
    for (const track of parsed) {
      if (track.type === 'closedcaptions') continue;
      const url = pickSubtitleUrl(track.downloadables);
      if (!url) continue;
      fetch(url)
        .then(r => (r.ok ? r.text() : null))
        .then(text => {
          if (!text) return;
          window.dispatchEvent(new CustomEvent('DUALY_SUBTITLE_FILE', {
            detail: { text, language: track.language, type: track.type },
          }));
        })
        .catch(() => {});
    }
  }

  function pickSubtitleUrl(downloadables) {
    const sorted = Object.entries(downloadables).sort(([a], [b]) => {
      const rank = k => (k.includes('webvtt') ? 0 : k.includes('dfxp') || k.includes('ttml') ? 1 : 2);
      return rank(a) - rank(b);
    });
    for (const [, dl] of sorted) {
      if (!dl || dl.isNoneTrack) continue;
      const urls = dl.downloadUrls || dl.urls || [];
      const entries = Array.isArray(urls) ? urls : Object.values(urls);
      for (const e of entries) {
        const u = typeof e === 'string' ? e : e?.url;
        if (u) return u;
      }
    }
    return null;
  }
})();
