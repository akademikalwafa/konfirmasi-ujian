// ============================================================
// API — semua komunikasi ke GAS lewat fetch() (tanpa google.script.run)
// POST wajib Content-Type text/plain agar tidak memicu CORS preflight
// ============================================================
(function () {
  'use strict';
  var C = window.APP_CONFIG;
  var API = window.API = { onState: function () {} };

  function configured() { return /^https:\/\/script\.google\.com\//.test(C.GAS_URL || ''); }

  function withTimeout(ms) {
    var ctl = new AbortController();
    var t = setTimeout(function () { ctl.abort(); }, ms);
    return { signal: ctl.signal, done: function () { clearTimeout(t); } };
  }

  async function handle(res) {
    var json;
    try { json = await res.json(); } catch (e) { throw new Error('Respons server tidak valid.'); }
    return json;
  }

  API.publicConfig = async function () {
    if (!configured()) return { success: false, message: 'GAS_URL belum diisi di js/config.js' };
    var t = withTimeout(30000);
    try {
      API.onState('loading');
      var res = await fetch(C.GAS_URL + '?action=publicConfig', { signal: t.signal });
      var j = await handle(res);
      API.onState(j.success ? 'ok' : 'error');
      return j;
    } catch (e) {
      API.onState('offline');
      return { success: false, message: 'Tidak dapat terhubung ke server. Periksa koneksi internet.' };
    } finally { t.done(); }
  };

  API.post = async function (action, opts) {
    opts = opts || {};
    if (!configured()) return { success: false, message: 'GAS_URL belum diisi di js/config.js' };
    var t = withTimeout(opts.timeout || 45000);
    try {
      var res = await fetch(C.GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: action, token: opts.token || undefined, data: opts.data }),
        signal: t.signal
      });
      var j = await handle(res);
      API.onState(j.success || j.message ? 'ok' : 'error');
      return j;
    } catch (e) {
      API.onState('offline');
      return { success: false, message: e.name === 'AbortError' ? 'Server terlalu lama merespons. Coba lagi.' : 'Tidak dapat terhubung ke server. Periksa koneksi internet.' };
    } finally { t.done(); }
  };

  // Pemanasan: mulai ambil konfigurasi SEBELUM halaman selesai dirender
  window.__pc = API.publicConfig();
})();
