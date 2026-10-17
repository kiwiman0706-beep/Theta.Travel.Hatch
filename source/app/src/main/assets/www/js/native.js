/* Promise wrapper around window.TabiNative (Android). In a plain browser it falls back to
   localStorage / fetch / file inputs so the same UI can be tested and demoed on the web. */
(function () {
  'use strict';
  const N = window.TabiNative;
  const pending = new Map();
  let seq = 0;

  window.TabiNativeCallback = (id, ok, value) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    ok ? p.resolve(value) : p.reject(new Error(value || 'error'));
  };

  const call = (fn) => new Promise((resolve, reject) => {
    const id = 'c' + (++seq);
    pending.set(id, { resolve, reject });
    try { fn(id); } catch (e) { pending.delete(id); reject(e); }
  });

  const KEY = 'tabi-data';

  const Native = {
    isAndroid: !!N,

    loadData() {
      const raw = N ? N.loadData() : localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    },

    saveData(state) {
      const json = JSON.stringify(state);
      if (N) return N.saveData(json);
      try { localStorage.setItem(KEY, json); return true; } catch (e) { return false; }
    },

    appInfo() {
      if (N) { try { return JSON.parse(N.appInfo()); } catch (e) { /* fall through */ } }
      return { versionName: 'web', versionCode: 0, package: 'web' };
    },

    consumeSharedText() {
      return N ? N.consumeSharedText() : null;
    },

    /** Resolves {status, body}. */
    http(method, url, headers, body) {
      if (N) return call((id) => N.http(id, method, url, JSON.stringify(headers || {}), body || ''));
      return fetch(url, { method, headers, body: method === 'POST' ? body : undefined })
        .then(async (r) => ({ status: r.status, body: await r.text() }));
    },

    async getJson(url, headers) {
      const r = await Native.http('GET', url, headers);
      if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
      return JSON.parse(r.body);
    },

    voiceAvailable: !!N,
    startVoice() {
      if (N) return call((id) => N.startVoice(id));
      return Promise.reject(new Error('音声入力はAndroidアプリで使えます'));
    },

    photosAvailable: !!N,
    pickPhotos() {
      if (N) return call((id) => N.pickPhotos(id));
      return Promise.resolve([]);
    },
    photoUrl(name) {
      return N ? `/photos/${encodeURIComponent(name)}` : '';
    },
    deletePhoto(name) {
      return N ? N.deletePhoto(name) : false;
    },

    exportFile(fileName, mime, content) {
      if (N) return call((id) => N.exportFile(id, fileName, mime, content));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([content], { type: mime }));
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      return Promise.resolve(fileName);
    },

    importFile() {
      if (N) return call((id) => N.importFile(id));
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = () => {
          const f = input.files && input.files[0];
          if (!f) return resolve(null);
          f.text().then(resolve);
        };
        input.click();
      });
    },

    shareText(text) {
      if (N) return N.shareText(text);
      if (navigator.share) navigator.share({ text }).catch(() => {});
    },

    openUrl(url) {
      if (N) return N.openUrl(url);
      window.open(url, '_blank', 'noopener');
    },
  };

  window.TabiNativeApi = Native;
})();
