// ============================================================
// app.js — Inti SPA + Portal Mahasiswa
// Prinsip gas-instant-ux:
//  1) SPA: pindah halaman = tampil/sembunyi <section> (0 ms, tanpa jaringan)
//  2) Cache-first: konfigurasi dirender dari localStorage, lalu disegarkan di latar belakang
//  3) Optimistic UI: pengajuan langsung pindah ke layar hasil; rollback bila server menolak
//  4) Autosave draf formulir ke localStorage
// ============================================================
(function () {
  'use strict';
  var C = window.APP_CONFIG;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function store(area) {
    return {
      get: function (k, d) { try { var v = area.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
      set: function (k, v) { try { area.setItem(k, JSON.stringify(v)); } catch (e) {} },
      del: function (k) { try { area.removeItem(k); } catch (e) {} }
    };
  }
  var LS = store(window.localStorage), SS = store(window.sessionStorage);

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };

  // ---------- ikon inline (tanpa library) ----------
  var ICONS = {
    check: '<path d="M20 6 9 17l-5-5"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    arrowL: '<path d="M19 12H5M12 19l-7-7 7-7"/>', arrowR: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>'
  };
  function icon(n) { return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[n] || '') + '</svg>'; }
  function hydrateIcons(root) { $$('[data-i]', root).forEach(function (el) { if (!el.firstChild) el.innerHTML = icon(el.getAttribute('data-i')); }); }

  // ---------- util UI ----------
  function toast(msg, type) {
    var el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(function () { el.remove(); }, type === 'error' ? 6000 : 3200);
  }

  function modal(o) {
    var back = document.createElement('div');
    back.className = 'backdrop';
    back.innerHTML = '<div class="modal ' + (o.big ? 'big' : '') + '" role="dialog" aria-modal="true"><h2>' + esc(o.title || '') + '</h2><div class="mbody"></div><div class="acts"></div></div>';
    var body = $('.mbody', back), acts = $('.acts', back);
    if (typeof o.body === 'string') body.innerHTML = o.body; else if (o.body) body.appendChild(o.body);
    function close() { back.remove(); document.removeEventListener('keydown', onKey); if (o.onClose) o.onClose(); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    (o.actions || [{ label: 'Tutup', cls: 'btn-soft' }]).forEach(function (a) {
      var b = document.createElement('button');
      b.className = 'btn ' + (a.cls || 'btn-soft'); b.textContent = a.label; b.type = 'button';
      b.onclick = function () { if (a.onClick && a.onClick(close, back) === false) return; if (!a.keep) close(); };
      acts.appendChild(b);
    });
    back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(back);
    return { close: close, el: back };
  }

  function busy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.html = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span> ' + (label || 'Memproses…'); }
    else { btn.disabled = false; if (btn.dataset.html != null) btn.innerHTML = btn.dataset.html; }
  }

  function fmtDate(iso, short) {
    if (!iso) return '–';
    var d = new Date(iso); if (isNaN(d)) return '–';
    var o = short ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' };
    o.timeZone = 'Asia/Jakarta';
    return d.toLocaleString('id-ID', o).replace(/\./g, ':') + (short ? '' : ' WIB');
  }
  function pillStatus(st, pending) {
    var m = { Menunggu: ['pill-yellow', 'Menunggu'], Disetujui: ['pill-green', 'Disetujui'], Ditolak: ['pill-red', 'Ditolak'] }[st] || ['pill-gray', st || '–'];
    return '<span class="pill ' + m[0] + '">' + (pending ? '<span class="spin"></span> ' : '') + m[1] + '</span>';
  }
  function fillSelect(sel, items, current, allLabel) {
    var h = allLabel != null ? '<option value="">' + esc(allLabel) + '</option>' : '';
    sel.innerHTML = h + items.map(function (x) {
      var v = typeof x === 'string' ? x : x.v, l = typeof x === 'string' ? x : x.l;
      return '<option value="' + esc(v) + '">' + esc(l) + '</option>';
    }).join('');
    if (current != null) sel.value = current;
    if (sel.value !== current && allLabel != null) sel.value = '';
  }

  var App = window.App = {
    cfg: null, staff: SS.get('staff', null), file: null, sending: false, lastSubmit: null,
    onShow: {}, onConfig: [], $: $, $$: $$, LS: LS, SS: SS, esc: esc, icon: icon, toast: toast, modal: modal,
    busy: busy, fmtDate: fmtDate, pillStatus: pillStatus, fillSelect: fillSelect, hydrateIcons: hydrateIcons
  };

  // ---------- akses (dihitung ulang di klien dari jadwal agar tak basi) ----------
  function akses(cfg) {
    if (!cfg) return { open: false, reason: 'load' };
    var a = cfg.akses, now = Date.now();
    if (a.manual !== 'DIBUKA') return { open: false, reason: 'manual', pesan: 'Pengajuan sedang ditutup oleh akademik.' };
    if (a.mulai && now < Date.parse(a.mulai)) return { open: false, reason: 'belum', pesan: 'Pengajuan akan dibuka pada ' + fmtDate(a.mulai) + '.' };
    if (a.selesai && now > Date.parse(a.selesai)) return { open: false, reason: 'lewat', pesan: 'Periode pengajuan telah berakhir.' };
    return { open: true, sisa: a.selesai ? Date.parse(a.selesai) - now : null };
  }
  App.akses = akses;

  // ============================================================
  // ROUTER (hash) — pindah halaman instan
  // ============================================================
  var GROUP = { ketentuan: 'mhs', form: 'mhs', sukses: 'mhs', status: 'mhs', ditutup: 'mhs', dosen: 'dosen', admin: 'admin' };
  function route() { var h = (location.hash || '#ketentuan').slice(1); return h || 'ketentuan'; }
  function go(r) { if (route() === r) show(r); else location.hash = '#' + r; }
  App.go = go;

  function show(r) {
    if (!GROUP[r]) r = 'ketentuan';
    var ak = akses(App.cfg);
    if ((r === 'ketentuan' || r === 'form') && App.cfg && !ak.open) { r = 'ditutup'; }
    if (r === 'form' && !SS.get('agree', false)) r = 'ketentuan';
    if (r === 'sukses' && !App.lastSubmit) r = 'ketentuan';
    var view = r;
    if (r === 'dosen') view = App.staff && (App.staff.role === 'dosen' || App.staff.role === 'admin') ? 'dosen' : 'dosen-login';
    if (r === 'admin') view = App.staff && App.staff.role === 'admin' ? 'admin' : 'admin-login';
    $$('.view').forEach(function (v) { v.classList.toggle('active', v.id === 'v-' + view); });
    $$('.nav a').forEach(function (a) { a.classList.toggle('active', a.dataset.g === GROUP[r]); });
    window.scrollTo(0, 0);
    if (view === 'ditutup') $('#ditutup-pesan').textContent = ak.pesan || 'Pengajuan dibuka kembali sesuai jadwal dari akademik.';
    if (App.onShow[view]) App.onShow[view]();
  }
  App.show = function () { show(route()); };
  window.addEventListener('hashchange', function () { show(route()); });

  // ============================================================
  // KONFIGURASI PUBLIK (cache-first)
  // ============================================================
  function applyConfig(cfg) {
    App.cfg = cfg;
    $('#brand-name').textContent = cfg.namaKampus;
    document.title = 'Konfirmasi Ujian Online — ' + cfg.namaKampus;
    var lb = $('#logo-box');
    if (cfg.logoUrl) { lb.innerHTML = '<img alt="Logo" src="' + esc(cfg.logoUrl) + '">'; lb.firstChild.onerror = function () { lb.textContent = 'LOGO'; }; } else lb.textContent = 'LOGO';
    $('#nav-help').innerHTML = cfg.emailBantuan ? 'Bantuan Layanan<br><b>' + esc(cfg.emailBantuan) + '</b>' : '';
    $('#nav-help').style.display = cfg.emailBantuan ? '' : 'none';

    $('#terms-list').innerHTML = cfg.ketentuan.map(function (k) { return '<li><div><b>' + esc(k.judul) + '</b><span>' + esc(k.isi) + '</span></div></li>'; }).join('');
    $('#form-jenis').textContent = 'Jenis Ujian: ' + cfg.periode;
    $$('.maxmb').forEach(function (e) { e.textContent = cfg.maxMB; });

    // dropdown: pertahankan pilihan yang sedang diisi
    var fp = $('#f-prodi'), fs = $('#f-semester'), pv = fp.value, sv = fs.value;
    fillSelect(fp, cfg.prodi, pv, 'Pilih program studi');
    fillSelect(fs, cfg.semester, sv, 'Pilih semester');
    restoreDraftSelects();

    renderAkses();
    App.onConfig.forEach(function (fn) { fn(cfg); });
    show(route());
  }

  function renderAkses() {
    var cfg = App.cfg; if (!cfg) return;
    var ak = akses(cfg);
    var pill = $('#pill-periode');
    pill.innerHTML = '<i class="dot ' + (ak.open ? 'green' : 'red') + '"></i><span>' + esc(cfg.periode) + ' · ' + (ak.open ? 'DIBUKA' : 'DITUTUP') + '</span>';
    var a = cfg.akses, rentang = (a.mulai ? fmtDate(a.mulai) : 'sekarang') + ' – ' + (a.selesai ? fmtDate(a.selesai) : 'tanpa batas');
    var sisa = '';
    if (ak.open && ak.sisa != null) {
      var h = Math.floor(ak.sisa / 3600000), d = Math.floor(h / 24);
      sisa = '<span class="pill pill-amber">' + (d >= 1 ? 'Sisa ' + d + ' hari' : 'Sisa ' + Math.max(h, 0) + ' jam') + '</span>';
    }
    $('#reg-bar').innerHTML = '<div class="ico">' + icon('calendar') + '</div><div class="grow"><small>Status Registrasi</small> <span class="pill ' + (ak.open ? 'pill-green' : 'pill-red') + '">' + (ak.open ? 'DIBUKA' : 'DITUTUP') + '</span><div><b>' + esc(rentang) + '</b></div></div>' + sisa;
  }
  setInterval(renderAkses, 30000);

  API.onState = function (s) {
    var m = { ok: ['Aktif', 'green'], loading: ['Memuat', 'amber'], offline: ['Offline', 'red'], error: ['Gangguan', 'red'] }[s] || ['–', ''];
    $('#pill-server').innerHTML = 'Server: <b>' + m[0] + '</b>';
  };

  // ============================================================
  // W-01 KETENTUAN
  // ============================================================
  $('#agree-chk').addEventListener('change', function (e) { $('#btn-lanjut').disabled = !e.target.checked; });
  $('#btn-lanjut').addEventListener('click', function () { SS.set('agree', true); go('form'); });
  App.onShow.ketentuan = function () { $('#agree-chk').checked = !!SS.get('agree', false); $('#btn-lanjut').disabled = !$('#agree-chk').checked; };

  // ============================================================
  // W-02 FORM + autosave draf
  // ============================================================
  var F = { email: '#f-email', nama: '#f-nama', nim: '#f-nim', prodi: '#f-prodi', semester: '#f-semester', alasan: '#f-alasan' };
  var RULES = {
    email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) || 'Format email tidak valid'; },
    nama: function (v) { return v.trim().length >= 3 || 'Nama minimal 3 karakter'; },
    nim: function (v) { return /^[0-9A-Za-z.\-]{5,20}$/.test(v.trim()) || 'NIM tidak valid (5–20 karakter)'; },
    prodi: function (v) { return !!v || 'Pilih program studi'; },
    semester: function (v) { return !!v || 'Pilih semester'; },
    alasan: function (v) { var n = v.trim().length; return (n >= 10 && n <= 500) || 'Alasan 10–500 karakter'; }
  };
  function setErr(name, msg) {
    var e = $('.err[data-for="' + name + '"]'); if (e) e.textContent = msg || '';
    var f = $(F[name] || '#f-' + name); if (f && f.closest('.field')) f.closest('.field').classList.toggle('bad', !!msg);
  }
  var draftTimer;
  function saveDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(function () {
      var d = {}; Object.keys(F).forEach(function (k) { d[k] = $(F[k]).value; });
      LS.set('draft', d);
    }, 350);
  }
  function restoreDraft() {
    var d = LS.get('draft', null); if (!d) return;
    ['email', 'nama', 'nim', 'alasan'].forEach(function (k) { if (d[k] != null) $(F[k]).value = d[k]; });
    $('#alasan-count').textContent = $('#f-alasan').value.length + '/500';
  }
  function restoreDraftSelects() {
    var d = LS.get('draft', null); if (!d) return;
    ['prodi', 'semester'].forEach(function (k) { var s = $(F[k]); if (d[k] && !s.value && $$('option', s).some(function (o) { return o.value === d[k]; })) s.value = d[k]; });
  }
  restoreDraft();
  Object.keys(F).forEach(function (k) {
    $(F[k]).addEventListener('input', function () { saveDraft(); if (k === 'alasan') $('#alasan-count').textContent = this.value.length + '/500'; setErr(k, ''); });
    $(F[k]).addEventListener('change', saveDraft);
  });
  $('#f-nim').addEventListener('input', function () { this.value = this.value.replace(/\s+/g, ''); });

  // --- unggah PDF (dibaca ke base64 saat dipilih supaya tombol Kirim langsung jalan) ---
  var dz = $('#dropzone'), fileInput = $('#f-file');
  dz.addEventListener('click', function () { fileInput.click(); });
  dz.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('over'); }); });
  dz.addEventListener('drop', function (e) { if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); });
  fileInput.addEventListener('change', function () { if (fileInput.files[0]) setFile(fileInput.files[0]); });

  function fmtSize(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function setFile(f) {
    setErr('file', '');
    var max = (App.cfg ? App.cfg.maxMB : C.MAX_PDF_MB) * 1048576;
    if (!/\.pdf$/i.test(f.name) || (f.type && f.type !== 'application/pdf')) return setErr('file', 'File harus berformat PDF (.pdf).');
    if (f.size > max) return setErr('file', 'Ukuran file ' + fmtSize(f.size) + ' melebihi batas ' + (max / 1048576) + ' MB.');
    if (f.size < 1024) return setErr('file', 'File terlalu kecil / kosong.');
    var chip = $('#filechip');
    chip.hidden = false; chip.innerHTML = '<span class="dz-icon" style="width:36px;height:36px">' + icon('file') + '</span><div class="ft"><b>' + esc(f.name) + '</b><small class="muted"><span class="spin"></span> Menyiapkan…</small></div>';
    var r = new FileReader();
    r.onload = function () {
      App.file = { name: f.name, size: f.size, b64: String(r.result).split(',')[1] };
      chip.innerHTML = '<span class="dz-icon" style="width:36px;height:36px">' + icon('file') + '</span><div class="ft"><b>' + esc(f.name) + '</b><small class="muted">' + fmtSize(f.size) + ' · siap diunggah</small></div><button type="button" aria-label="Hapus berkas" id="file-del">' + icon('x') + '</button>';
      $('#file-del').onclick = clearFile;
    };
    r.onerror = function () { clearFile(); setErr('file', 'Gagal membaca file.'); };
    r.readAsDataURL(f);
  }
  function clearFile() { App.file = null; fileInput.value = ''; $('#filechip').hidden = true; $('#filechip').innerHTML = ''; }

  function validate() {
    var ok = true, first = null;
    Object.keys(RULES).forEach(function (k) { var r = RULES[k]($(F[k]).value); if (r !== true) { setErr(k, r); ok = false; first = first || $(F[k]); } else setErr(k, ''); });
    if (!App.file) { setErr('file', 'Surat izin (PDF) wajib diunggah.'); ok = false; first = first || dz; } else setErr('file', '');
    if (!$('#f-deklarasi').checked) { setErr('deklarasi', 'Centang pernyataan keaslian dokumen.'); ok = false; } else setErr('deklarasi', '');
    if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return ok;
  }

  $('#btn-batal').addEventListener('click', function () { go('ketentuan'); });
  App.onShow.form = function () { $('#form-alert').hidden = true; };

  // ---------- OPTIMISTIC SUBMIT ----------
  $('#form-ajuan').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (App.sending || !validate()) return;
    var data = {
      email: $('#f-email').value.trim(), nama: $('#f-nama').value.trim(), nim: $('#f-nim').value.trim(),
      prodi: $('#f-prodi').value, semester: $('#f-semester').value, alasan: $('#f-alasan').value.trim(),
      fileName: App.file.name, fileBase64: App.file.b64
    };
    App.sending = true;
    var ringkas = { nama: data.nama, nim: data.nim, prodi: data.prodi, semester: data.semester, periode: App.cfg ? App.cfg.periode : '' };
    renderSukses(ringkas, 'sending');          // 1) UI langsung pindah (0 ms)
    go('sukses');
    var res = await API.post('submitPengajuan', { data: data, timeout: 90000 });   // 2) sinkron di latar belakang
    App.sending = false;
    if (res.success) {
      renderSukses(Object.assign({}, ringkas, { id: res.data.id, waktu: res.data.timestamp }), 'ok');
      LS.del('draft'); LS.set('nim', data.nim);
      $('#form-ajuan').reset(); clearFile(); $('#alasan-count').textContent = '0/500';
      toast('Pengajuan berhasil dikirim', 'success');
    } else {                                    // 3) rollback ke formulir, data tetap utuh
      App.lastSubmit = null;
      go('form');
      var al = $('#form-alert'); al.hidden = false; al.textContent = res.message || 'Gagal mengirim pengajuan.';
      toast(res.message || 'Gagal mengirim pengajuan', 'error');
      if (/sudah DISETUJUI|masih MENUNGGU/.test(res.message || '')) { $('#cek-nim').value = data.nim; }
    }
  });

  // ============================================================
  // W-03 SUKSES
  // ============================================================
  function renderSukses(s, state) {
    App.lastSubmit = s;
    var sending = state === 'sending';
    $('#sukses-body').innerHTML =
      '<div class="bigicon ' + (sending ? 'navy' : 'green') + '">' + (sending ? '<span class="spin" style="width:28px;height:28px;border-width:3px"></span>' : icon('check')) + '</div>' +
      '<h1>' + (sending ? 'Mengirim pengajuan…' : 'Pengajuan Berhasil Dikirim') + '</h1>' +
      (sending ? '<p class="muted">Surat sedang diunggah. <b>Jangan tutup halaman ini</b> sampai konfirmasi muncul.</p>' : '<p class="muted">Hasil keputusan akan dikirim ke email Anda. Anda juga bisa cek status memakai NIM.</p>') +
      '<dl class="kv"><dt>Nama</dt><dd>' + esc(s.nama) + '</dd><dt>NIM</dt><dd>' + esc(s.nim) + '</dd><dt>Program Studi</dt><dd>' + esc(s.prodi) + '</dd><dt>Semester</dt><dd>' + esc(s.semester) + '</dd><dt>Periode</dt><dd>' + esc(s.periode) + '</dd>' +
      (s.id ? '<dt>ID Pengajuan</dt><dd>' + esc(s.id) + '</dd><dt>Waktu Kirim</dt><dd>' + esc(fmtDate(s.waktu)) + '</dd>' : '') +
      '<dt>Status</dt><dd>' + (sending ? '<span class="pill pill-gray"><span class="spin"></span> Mengunggah…</span>' : pillStatus('Menunggu')) + '</dd></dl>' +
      '<div class="actionbar" style="justify-content:center"><a class="btn btn-navy" href="#status">Cek Status</a><a class="btn btn-soft" href="#ketentuan">Kembali ke Beranda</a></div>';
  }

  // ============================================================
  // W-04 CEK STATUS (hasil terakhir tampil instan dari cache)
  // ============================================================
  function renderCek(d) {
    var box = $('#cek-hasil');
    if (!d) { box.innerHTML = ''; return; }
    if (!d.ditemukan) { box.innerHTML = '<div class="result none"><div class="bigicon gray">' + icon('search') + '</div><h3 style="text-align:center">Pengajuan tidak ditemukan</h3><p class="muted" style="text-align:center">Belum ada pengajuan dengan NIM tersebut untuk ' + esc(d.periode) + '.</p></div>'; return; }
    var cls = { Menunggu: 'wait', Disetujui: 'ok', Ditolak: 'no' }[d.status], ic = { Menunggu: ['clock', 'amber'], Disetujui: ['check', 'green'], Ditolak: ['x', 'navy'] }[d.status];
    var h = '<div class="result ' + cls + '"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' + pillStatus(d.status) + '<span class="muted">' + esc(d.periode) + '</span></div><h3>' + esc(d.nama) + '</h3>' +
      '<p class="muted">Diajukan ' + esc(fmtDate(d.waktu)) + (d.tglKeputusan ? ' · Diputuskan ' + esc(fmtDate(d.tglKeputusan)) : '') + '</p>';
    if (d.status === 'Menunggu') h += '<p>Pengajuan Anda sedang diperiksa akademik. Tidak perlu mengirim ulang.</p>';
    if (d.status === 'Disetujui') h += '<p>Pengajuan Anda sudah <b>disetujui</b> dan bersifat final, tidak dapat dikirim ulang. Tautan ujian akan dibagikan dosen pengampu.</p>';
    if (d.status === 'Ditolak') {
      h += '<div class="quote">' + esc(d.alasanPenolakan || 'Tidak ada catatan.') + '</div>';
      h += d.bolehAjukanUlang ? '<button class="btn btn-accent" id="btn-ulang">Ajukan Ulang ' + icon('arrowR') + '</button>' : '<p class="muted">Periode pengajuan sedang ditutup, sehingga belum bisa mengajukan ulang.</p>';
    }
    box.innerHTML = h + '</div>';
    var u = $('#btn-ulang'); if (u) u.onclick = function () { $('#f-nim').value = $('#cek-nim').value.trim(); saveDraft(); SS.set('agree', true); go('form'); };
  }
  async function cek(nim, silent) {
    var btn = $('#btn-cek'), er = $('.err[data-for="cek"]'); er.textContent = '';
    if (!/^[0-9A-Za-z.\-]{5,20}$/.test(nim)) { er.textContent = 'NIM tidak valid.'; return; }
    if (!silent) busy(btn, true, 'Mengecek…');
    var res = await API.post('cekStatus', { data: { nim: nim } });
    if (!silent) busy(btn, false);
    if (res.success) { renderCek(res.data); LS.set('cek', { nim: nim, data: res.data }); LS.set('nim', nim); }
    else if (!silent) er.textContent = res.message || 'Gagal mengecek status.';
  }
  $('#form-cek').addEventListener('submit', function (e) { e.preventDefault(); cek($('#cek-nim').value.trim(), false); });
  App.onShow.status = function () {
    var c = LS.get('cek', null), nim = $('#cek-nim').value || LS.get('nim', '');
    if (!$('#cek-nim').value && nim) $('#cek-nim').value = nim;
    if (c && c.nim === nim) { renderCek(c.data); cek(nim, true); }   // tampil instan, segarkan diam-diam
  };

  // ============================================================
  // INIT
  // ============================================================
  hydrateIcons(document);
  var cached = LS.get('cfg', null);
  if (cached && cached.t && cached.v) applyConfig(cached.v); else { show(route()); }

  window.__pc.then(function (res) {
    if (res.success) { LS.set('cfg', { t: Date.now(), v: res.data }); applyConfig(res.data); }
    else if (!App.cfg) {
      $('#terms-list').innerHTML = '<li><div><b>Tidak dapat memuat data</b><span>' + esc(res.message) + ' Muat ulang halaman untuk mencoba lagi.</span></div></li>';
      $('#pill-periode').innerHTML = '<i class="dot red"></i><span>Gagal memuat</span>';
    } else toast('Memakai data tersimpan (offline).', 'warn');
  });

  // segarkan konfigurasi saat tab kembali aktif (mis. admin baru membuka/menutup akses)
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    var c = LS.get('cfg', null);
    if (!c || Date.now() - c.t > C.CONFIG_TTL_MS) API.publicConfig().then(function (r) { if (r.success) { LS.set('cfg', { t: Date.now(), v: r.data }); applyConfig(r.data); } });
  });

  // logout & info pengguna staf
  App.refreshTopUser = function () {
    var u = App.staff;
    $('#top-user').hidden = !u;
    if (u) $('#top-user-name').textContent = u.role === 'admin' ? 'Admin' : 'Dosen';
  };
  App.refreshTopUser();
})();
