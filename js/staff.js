// ============================================================
// staff.js — Portal Dosen (read-only) + Panel Admin
// Prinsip gas-instant-ux:
//  - Login mengembalikan token + SEMUA data layar dalam 1 request (batch)
//  - Filter / cari / rekap dihitung lokal dari data di memori (0 ms)
//  - Setujui/Tolak: UI berubah seketika (optimistic), server menyusul, rollback bila gagal
//  - Surat PDF: di-prefetch saat kursor di atas baris + cache di memori
//  - Data disegarkan di latar belakang (polling 60 dtk saat tab terlihat)
// ============================================================
(function () {
  'use strict';
  var A = window.App, C = window.APP_CONFIG;
  var $ = A.$, $$ = A.$$, esc = A.esc, icon = A.icon, SS = A.SS, toast = A.toast, busy = A.busy, fmtDate = A.fmtDate, pill = A.pillStatus, fillSelect = A.fillSelect;

  var ST = { data: SS.get('boot', null), sel: null, tab: 'daftar', sub: 'prodi',
    f: { dosen: { q: '', prodi: '', semester: '', periode: '', status: 'Disetujui' }, admin: { q: '', prodi: '', semester: '', periode: '', status: 'Menunggu' } } };

  function role() { return A.staff ? A.staff.role : null; }
  function d() { return ST.data || { list: [], prodi: [], semester: [], pengaturan: {}, periodeAktif: '' }; }

  // ============================================================
  // LOGIN (token + bootstrap dalam 1 panggilan)
  // ============================================================
  async function login(kind, ev) {
    ev.preventDefault();
    var isAdmin = kind === 'admin', btn = $(isAdmin ? '#btn-admin-login' : '#btn-dosen-login'), er = $(isAdmin ? '#admin-err' : '#dosen-err');
    er.hidden = true;
    var payload = isAdmin ? { username: $('#adm-user').value.trim(), password: $('#adm-pass').value } : { kode: $('#dosen-kode').value.trim() };
    if (isAdmin ? (!payload.username || !payload.password) : !payload.kode) { er.hidden = false; er.textContent = 'Lengkapi isian terlebih dahulu.'; return; }
    busy(btn, true, 'Memverifikasi…');
    var res = await API.post(isAdmin ? 'loginAdmin' : 'loginDosen', { data: payload });
    busy(btn, false);
    if (!res.success) { er.hidden = false; er.textContent = res.message; return; }
    A.staff = { role: res.data.role, token: res.data.token };
    SS.set('staff', A.staff);
    applyBoot(res.data.boot, true);
    $('#adm-pass').value = ''; $('#dosen-kode').value = '';
    A.refreshTopUser();
    A.go(isAdmin ? 'admin' : 'dosen');
  }
  $('#form-dosen-login').addEventListener('submit', function (e) { login('dosen', e); });
  $('#form-admin-login').addEventListener('submit', function (e) { login('admin', e); });

  function logout(silent) {
    if (A.staff) API.post('logout', { token: A.staff.token });
    A.staff = null; ST.data = null; ST.sel = null; reviewSig = null;
    SS.del('staff'); SS.del('boot');
    pdfCache.forEach(function (p) { p.then(function (x) { URL.revokeObjectURL(x.url); }, function () {}); }); pdfCache.clear();
    A.refreshTopUser();
    if (!silent) toast('Anda telah keluar.');
    A.go('ketentuan');
  }
  $('#btn-logout').addEventListener('click', function () { logout(); });

  function onFail(res) {
    if (res && res.message === 'SESI_HABIS') { toast('Sesi berakhir, silakan masuk kembali.', 'warn'); logout(true); A.go(location.hash === '#admin' ? 'admin' : 'dosen'); return true; }
    return false;
  }

  // ============================================================
  // DATA (boot)
  // ============================================================
  function applyBoot(boot, reset) {
    var pend = {}; if (ST.data && !reset) ST.data.list.forEach(function (r) { if (r._pending) pend[r.id] = r; });
    boot.list = boot.list.map(function (r) { return pend[r.id] || r; });  // jangan timpa baris yang sedang disimpan
    ST.data = boot; if (reset) reviewSig = null;
    var F = ST.f; ['dosen', 'admin'].forEach(function (k) { if (reset || !F[k].periode) F[k].periode = boot.periodeAktif; });
    persist();
  }
  function persist() { var s = JSON.parse(JSON.stringify(ST.data)); s.list.forEach(function (r) { delete r._pending; }); SS.set('boot', s); }

  async function refresh(manual) {
    if (!A.staff) return;
    var btns = $$('[data-act="refresh"]'); if (manual) btns.forEach(function (b) { b.disabled = true; });
    var res = await API.post(role() === 'admin' ? 'adminBootstrap' : 'dosenBootstrap', { token: A.staff.token });
    btns.forEach(function (b) { b.disabled = false; });
    if (res.success) { applyBoot(res.data); renderActive(); if (manual) toast('Data dimuat ulang', 'success'); }
    else if (!onFail(res) && manual) toast(res.message, 'error');
  }
  setInterval(function () { if (document.visibilityState === 'visible' && A.staff && /^#(dosen|admin)$/.test(location.hash)) refresh(false); }, C.POLL_MS);

  function renderActive() {
    var h = location.hash, busySel = document.activeElement && document.activeElement.tagName === 'SELECT';
    if (h === '#dosen') { if (!busySel) syncFilterUI('dosen', '#dosen-filters', true); renderDosen(); }
    else if (h === '#admin') { if (!busySel) syncFilterUI('admin', '#adm-filters', false); renderAdmin(); }
  }

  // ============================================================
  // FILTER (lokal)
  // ============================================================
  function filtered(k, ignoreStatus) {
    var f = ST.f[k], q = f.q.trim().toLowerCase();
    return d().list.filter(function (r) {
      return (!f.periode || r.periode === f.periode) && (!f.prodi || r.prodi === f.prodi) && (!f.semester || r.semester === f.semester) &&
        (ignoreStatus || !f.status || r.status === f.status) && (!q || r.nama.toLowerCase().indexOf(q) >= 0 || r.nim.toLowerCase().indexOf(q) >= 0);
    });
  }
  function periodes() {
    var s = {}; d().list.forEach(function (r) { s[r.periode] = 1; }); if (d().periodeAktif) s[d().periodeAktif] = 1;
    return Object.keys(s).sort().reverse();
  }
  function semNum(a, b) { return (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0) || (a < b ? -1 : 1); }

  function bindFilters(k, rootSel, onChange) {
    var root = $(rootSel), t;
    root.addEventListener('input', function (e) { var el = e.target; if (el.dataset.f === 'q') { clearTimeout(t); t = setTimeout(function () { ST.f[k].q = el.value; onChange(); }, 150); } });
    root.addEventListener('change', function (e) { var el = e.target; if (el.tagName === 'SELECT') { ST.f[k][el.dataset.f] = el.value; onChange(); } });
    root.addEventListener('click', function (e) {
      var ch = e.target.closest('.chips button'); if (ch) { ST.f[k].status = ch.dataset.v; onChange(); }
      if (e.target.closest('[data-act="refresh"]')) refresh(true);
    });
  }
  function syncFilterUI(k, rootSel, withStatusSelect) {
    var root = $(rootSel), f = ST.f[k], D = d();
    fillSelect($('[data-f="prodi"]', root), D.prodi, f.prodi, 'Semua Program Studi');
    fillSelect($('[data-f="semester"]', root), D.semester, f.semester, 'Semua Semester');
    fillSelect($('[data-f="periode"]', root), periodes(), f.periode, 'Semua Periode');
    if (withStatusSelect) fillSelect($('select[data-f="status"]', root), ['Menunggu', 'Disetujui', 'Ditolak'], f.status, 'Semua Status');
  }

  // ============================================================
  // PDF — prefetch + cache di memori
  // ============================================================
  var pdfCache = new Map();
  function loadSurat(id) {
    if (!pdfCache.has(id)) {
      if (pdfCache.size >= 10) { var oldest = pdfCache.keys().next().value; pdfCache.get(oldest).then(function (x) { URL.revokeObjectURL(x.url); }, function () {}); pdfCache.delete(oldest); }
      var p = API.post('getSurat', { token: A.staff.token, data: { id: id }, timeout: 60000 }).then(function (res) {
        if (!res.success) { onFail(res); throw new Error(res.message); }
        var bin = atob(res.data.base64), bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return { url: URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), name: res.data.name };
      });
      p.catch(function () { pdfCache.delete(id); });
      pdfCache.set(id, p);
    }
    return pdfCache.get(id);
  }
  function pdfInto(box, id, guard) {
    box.innerHTML = '<div class="skeleton"></div>';
    loadSurat(id).then(function (x) {
      if (guard && !guard()) return;
      box.innerHTML = '<iframe title="Surat izin" src="' + x.url + '#view=FitH"></iframe>';
      var link = box.parentNode.querySelector('.pdf-open'); if (link) { link.href = x.url; link.hidden = false; }
    }).catch(function (e) { if (!guard || guard()) box.innerHTML = '<div class="empty">' + icon('alert') + '<br>Gagal memuat surat.<br><small>' + esc(e.message) + '</small></div>'; });
  }
  function prefetch(id) { if (A.staff && id) loadSurat(id).catch(function () {}); }

  // ============================================================
  // DOSEN
  // ============================================================
  function stat(cls, label, n, sub, ic) { return '<div class="stat ' + cls + '"><div><small>' + label + '</small><b>' + n + '</b><span>' + sub + '</span></div><div class="sico">' + icon(ic) + '</div></div>'; }

  function renderDosen() {
    var rows = filtered('dosen', true), all = rows.length, ok = rows.filter(function (r) { return r.status === 'Disetujui'; }).length, no = rows.filter(function (r) { return r.status === 'Ditolak'; }).length;
    $('#dosen-stats').innerHTML = stat('s-all', 'Total Pengajuan', all, 'Mahasiswa mendaftar sesi online', 'list') + stat('s-ok', 'Disetujui', ok, 'Memenuhi kriteria & surat valid', 'check') + stat('s-no', 'Ditolak', no, 'Wajib hadir ujian tatap muka', 'x');
    var list = filtered('dosen', false);
    if (!list.length) { $('#dosen-groups').innerHTML = '<div class="card empty"><div class="bigicon">' + icon('search') + '</div>Tidak ada data yang sesuai filter.</div>'; return; }
    var by = {}; list.forEach(function (r) { ((by[r.prodi] = by[r.prodi] || {})[r.semester] = (by[r.prodi][r.semester] || [])).push(r); });
    $('#dosen-groups').innerHTML = Object.keys(by).sort().map(function (p) {
      var sems = Object.keys(by[p]).sort(semNum), total = sems.reduce(function (s, x) { return s + by[p][x].length; }, 0);
      return '<div class="pgroup"><div class="pg-head"><h2>Program Studi: ' + esc(p) + '</h2><span class="pill pill-blue">Total: ' + total + ' Mahasiswa</span></div>' +
        sems.map(function (s) {
          return '<div class="sgroup"><div class="sg-head"><span>Semester ' + esc(s) + '</span><small class="muted">' + by[p][s].length + ' mahasiswa</small></div><div class="table-wrap"><table class="table"><thead><tr><th>No</th><th>NIM</th><th>Nama Lengkap</th><th>Alasan Izin</th><th>Status</th><th>Surat</th></tr></thead><tbody>' +
            by[p][s].map(function (r, i) {
              return '<tr><td class="num">' + (i + 1) + '</td><td>' + esc(r.nim) + '</td><td><b>' + esc(r.nama) + '</b><small>' + esc(r.email) + '</small></td><td class="alasan"><div>' + esc(r.alasan) + '</div></td><td>' + pill(r.status) + '</td><td><button class="btn btn-soft btn-sm" data-surat="' + esc(r.id) + '">' + icon('eye') + ' Lihat Surat</button></td></tr>';
            }).join('') + '</tbody></table></div></div>';
        }).join('') + '</div>';
    }).join('');
  }

  function bukaSuratModal(id) {
    var r = d().list.filter(function (x) { return x.id === id; })[0]; if (!r) return;
    var wrap = document.createElement('div');
    wrap.innerHTML = '<dl class="kv"><dt>Nama</dt><dd>' + esc(r.nama) + '</dd><dt>NIM</dt><dd>' + esc(r.nim) + '</dd><dt>Prodi / Smt</dt><dd>' + esc(r.prodi) + ' / ' + esc(r.semester) + '</dd><dt>Alasan</dt><dd>' + esc(r.alasan) + '</dd></dl><div class="pdf-head"><span>Surat Izin (PDF)</span><a class="pdf-open" target="_blank" rel="noopener" hidden>Buka di tab baru</a></div><div class="pdf-box"></div>';
    A.modal({ title: 'Surat Izin — ' + r.nama, big: true, body: wrap, actions: [{ label: 'Tutup', cls: 'btn-soft' }] });
    pdfInto($('.pdf-box', wrap), id);
  }

  function initDosen() {
    bindFilters('dosen', '#dosen-filters', renderDosen);
    $('#dosen-groups').addEventListener('click', function (e) { var b = e.target.closest('[data-surat]'); if (b) bukaSuratModal(b.dataset.surat); });
    $('#dosen-groups').addEventListener('pointerover', function (e) { var b = e.target.closest('[data-surat]'); if (b) prefetch(b.dataset.surat); });
  }
  A.onShow.dosen = function () {
    if (!ST.data) { var cached = SS.get('boot', null); if (cached) ST.data = cached; }
    if (ST.data) { var f = ST.f.dosen; if (!f.periode) f.periode = ST.data.periodeAktif; syncFilterUI('dosen', '#dosen-filters', true); $('#dosen-filters [data-f="q"]').value = f.q; renderDosen(); }
    else $('#dosen-groups').innerHTML = '<div class="card pad"><div class="skeleton" style="width:100%;height:160px"></div></div>';
    refresh(false);
  };

  // ============================================================
  // ADMIN — daftar & review
  // ============================================================
  function renderChips() {
    var rows = filtered('admin', true), cnt = { Menunggu: 0, Disetujui: 0, Ditolak: 0 };
    rows.forEach(function (r) { cnt[r.status]++; });
    var cur = ST.f.admin.status;
    $('#adm-filters .chips').innerHTML = [['', 'Semua', rows.length], ['Menunggu', 'Menunggu', cnt.Menunggu], ['Disetujui', 'Disetujui', cnt.Disetujui], ['Ditolak', 'Ditolak', cnt.Ditolak]].map(function (c) {
      return '<button type="button" data-v="' + c[0] + '" class="' + (cur === c[0] ? 'on' : '') + '">' + c[1] + (c[0] === 'Menunggu' ? ' <span class="n">' + c[2] + '</span>' : '') + '</button>';
    }).join('');
    var pend = d().list.filter(function (r) { return r.status === 'Menunggu'; }).length;
    $('#badge-pending').textContent = pend;
  }

  function renderQueue() {
    var rows = filtered('admin', false);
    if (!rows.some(function (r) { return r.id === ST.sel; })) ST.sel = rows.length ? rows[0].id : null;
    $('#queue-count').textContent = 'Menampilkan ' + rows.length + ' dari ' + d().list.length + ' data';
    var tb = $('#queue-table tbody');
    tb.innerHTML = rows.length ? rows.map(function (r) {
      return '<tr class="clickable ' + (r.id === ST.sel ? 'sel' : '') + '" data-id="' + esc(r.id) + '"><td><b>' + esc(r.id) + '</b><small>' + esc(fmtDate(r.ts, true)) + '</small></td><td><b>' + esc(r.nama) + '</b><small>' + esc(r.nim) + '</small></td><td>' + esc(r.prodi) + '<small>Semester ' + esc(r.semester) + '</small></td><td class="alasan"><div>' + esc(r.alasan) + '</div></td><td>' + pill(r.status, r._pending) + '</td></tr>';
    }).join('') : '<tr><td colspan="5"><div class="empty"><div class="bigicon">' + icon('check') + '</div>Tidak ada pengajuan pada filter ini.</div></td></tr>';
  }

  var reviewSig = null;
  function renderReview() {
    var r = d().list.filter(function (x) { return x.id === ST.sel; })[0], box = $('#review');
    var sig = r ? [r.id, r.status, r._pending ? 1 : 0, r.statusEmail, r.alasanTolak].join('|') : 'none';
    if (sig === reviewSig) return;            // tidak ada perubahan -> jangan sentuh iframe PDF
    reviewSig = sig;
    if (!r) { box.innerHTML = '<div class="panel" style="grid-column:1/-1"><div class="empty"><div class="bigicon">' + icon('file') + '</div>Pilih pengajuan dari antrean untuk meninjau suratnya.</div></div>'; return; }
    var decided = r.status !== 'Menunggu';
    box.innerHTML =
      '<div class="panel"><div class="pdf-head"><span>' + icon('file') + ' Surat Izin (PDF)</span><a class="pdf-open" target="_blank" rel="noopener" hidden>Buka di tab baru</a></div><div class="pdf-box" id="pdf-main"></div></div>' +
      '<div class="panel"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div><small class="muted">ID PERMOHONAN</small><h2>' + esc(r.id) + '</h2></div>' + pill(r.status, r._pending) + '</div>' +
      '<div class="meta"><div class="box"><b>' + esc(r.nama) + '</b><small>NIM ' + esc(r.nim) + ' · ' + esc(r.email) + '</small></div>' +
      '<div class="box"><small>Program Studi / Semester</small>' + esc(r.prodi) + ' · Semester ' + esc(r.semester) + '</div>' +
      '<div class="box"><small>Alasan Permohonan</small>' + esc(r.alasan) + '</div>' +
      '<div class="box"><small>Diajukan</small>' + esc(fmtDate(r.ts)) + '</div>' +
      (decided ? '<div class="box"><small>Keputusan' + (r.tglKeputusan ? ' · ' + esc(fmtDate(r.tglKeputusan)) : '') + '</small>' + esc(r.status) + (r.alasanTolak ? ' — ' + esc(r.alasanTolak) : '') + (r.statusEmail ? '<br><small>Email: ' + esc(r.statusEmail) + '</small>' : '') + '</div>' : '') + '</div>' +
      (decided ? '' : '<div class="decide"><button class="btn btn-green btn-lg" id="btn-setuju" ' + (r._pending ? 'disabled' : '') + '>' + icon('check') + ' Setujui Pengajuan</button><button class="btn btn-red-o btn-lg" id="btn-tolak" ' + (r._pending ? 'disabled' : '') + '>' + icon('x') + ' Tolak Pengajuan</button><small class="muted" style="text-align:center">Keputusan langsung dikirim ke email mahasiswa.</small></div>') + '</div>';
    var rid = r.id;
    pdfInto($('#pdf-main'), rid, function () { return ST.sel === rid; });
    var s = $('#btn-setuju'), t = $('#btn-tolak');
    if (s) s.onclick = function () { confirmDecision(r, 'Disetujui'); };
    if (t) t.onclick = function () { confirmDecision(r, 'Ditolak'); };
  }

  function pickNext(fromId) {
    var rows = filtered('admin', false), i = rows.findIndex(function (r) { return r.id === fromId; });
    var next = rows.slice(i + 1).concat(rows.slice(0, i)).filter(function (r) { return r.status === 'Menunggu' && r.id !== fromId; })[0];
    if (next) ST.sel = next.id;
  }

  function confirmDecision(r, hasil) {
    if (hasil === 'Disetujui') {
      A.modal({ title: 'Setujui pengajuan?', body: '<p>Setujui izin ujian online atas nama <b>' + esc(r.nama) + '</b> (' + esc(r.nim) + ')? Email persetujuan akan dikirim otomatis dan keputusan bersifat final.</p>',
        actions: [{ label: 'Batal', cls: 'btn-soft' }, { label: 'Ya, Setujui', cls: 'btn-green', onClick: function () { decide(r.id, 'Disetujui', ''); } }] });
    } else {
      var m = A.modal({ title: 'Tolak Pengajuan', body: '<div class="field"><label for="tolak-alasan">Alasan Penolakan (wajib)</label><textarea id="tolak-alasan" maxlength="300" placeholder="Contoh: Surat belum mencantumkan stempel/tanda tangan resmi."></textarea><div class="err" id="tolak-err"></div></div><small class="muted">Alasan ini dikirim ke email mahasiswa.</small>',
        actions: [{ label: 'Batal', cls: 'btn-soft' }, { label: 'Konfirmasi Tolak', cls: 'btn-red', keep: true, onClick: function (close) {
          var v = $('#tolak-alasan').value.trim();
          if (v.length < 5) { $('#tolak-err').textContent = 'Alasan penolakan wajib diisi (min. 5 karakter).'; return false; }
          decide(r.id, 'Ditolak', v); close();
        } }] });
      setTimeout(function () { var t = $('#tolak-alasan'); if (t) t.focus(); }, 30);
    }
  }

  async function decide(id, hasil, alasan) {
    var row = d().list.filter(function (x) { return x.id === id; })[0]; if (!row || row._pending) return;
    var prev = { status: row.status, alasanTolak: row.alasanTolak, tglKeputusan: row.tglKeputusan, statusEmail: row.statusEmail };
    Object.assign(row, { status: hasil, alasanTolak: alasan, tglKeputusan: new Date().toISOString(), _pending: true });   // optimistic
    pickNext(id); renderAdmin();
    toast(hasil + ' — menyimpan & mengirim email…');
    var res = await API.post('keputusan', { token: A.staff && A.staff.token, data: { id: id, keputusan: hasil, alasan: alasan }, timeout: 60000 });
    row._pending = false;
    if (res.success) { Object.assign(row, { tglKeputusan: res.data.tglKeputusan, statusEmail: res.data.statusEmail }); persist(); toast('Tersimpan' + (/^Gagal/.test(res.data.statusEmail) ? ' — ' + res.data.statusEmail : ' • email terkirim'), /^Gagal/.test(res.data.statusEmail) ? 'warn' : 'success'); }
    else { Object.assign(row, prev); ST.sel = id; if (!onFail(res)) toast('Gagal: ' + res.message, 'error'); }
    renderAdmin();
  }

  function renderAdmin() { renderChips(); renderQueue(); renderReview(); if (ST.tab === 'rekap') renderRekap(); updateToggle(); }

  // ============================================================
  // ADMIN — rekap
  // ============================================================
  function renderRekap() {
    var sel = $('#rekap-periode'), cur = sel.value || d().periodeAktif;
    fillSelect(sel, periodes(), cur);
    var per = sel.value, by = {};
    d().list.filter(function (r) { return r.periode === per; }).forEach(function (r) { var o = by[r.prodi] = by[r.prodi] || { a: 0, s: 0, t: 0 }; o.a++; if (r.status === 'Disetujui') o.s++; if (r.status === 'Ditolak') o.t++; });
    var keys = Object.keys(by).sort(), tot = { a: 0, s: 0, t: 0 };
    keys.forEach(function (k) { tot.a += by[k].a; tot.s += by[k].s; tot.t += by[k].t; });
    $('#rekap-table').innerHTML = '<thead><tr><th>Program Studi</th><th class="num-r">Diajukan</th><th class="num-r">Disetujui</th><th class="num-r">Ditolak</th></tr></thead><tbody>' +
      (keys.length ? keys.map(function (k) { return '<tr><td>' + esc(k) + '</td><td class="num-r">' + by[k].a + '</td><td class="num-r">' + by[k].s + '</td><td class="num-r">' + by[k].t + '</td></tr>'; }).join('') + '<tr class="total"><td>Total</td><td class="num-r">' + tot.a + '</td><td class="num-r">' + tot.s + '</td><td class="num-r">' + tot.t + '</td></tr>' : '<tr><td colspan="4"><div class="empty">Belum ada pengajuan pada periode ini.</div></td></tr>') + '</tbody>';
  }

  // ============================================================
  // ADMIN — pengaturan
  // ============================================================
  async function savePeng(payload, btn, okMsg) {
    if (btn) busy(btn, true, 'Menyimpan…');
    var res = await API.post('simpanPengaturan', { token: A.staff.token, data: payload });
    if (btn) busy(btn, false);
    if (res.success) {
      ST.data.pengaturan = res.data.pengaturan; ST.data.prodi = res.data.prodi; ST.data.semester = res.data.semester; ST.data.periodeAktif = res.data.periodeAktif; persist();
      if (res.data.publik) { A.LS.set('cfg', { t: Date.now(), v: res.data.publik }); A.cfg = res.data.publik; }
      toast(okMsg || 'Pengaturan tersimpan', 'success'); return true;
    }
    if (!onFail(res)) toast(res.message, 'error');
    return false;
  }

  function updateToggle() {
    var on = d().pengaturan && d().pengaturan.AKSES_MANUAL === 'DIBUKA';
    $('#adm-toggle').checked = !!on; $('#adm-akses-label').textContent = on ? 'DIBUKA' : 'DITUTUP';
  }
  $('#adm-toggle').addEventListener('change', async function (e) {
    var want = e.target.checked ? 'DIBUKA' : 'DITUTUP', P = d().pengaturan, old = P.AKSES_MANUAL;
    P.AKSES_MANUAL = want; updateToggle(); if (A.cfg) { A.cfg.akses.manual = want; }       // optimistic
    var ok = await savePeng({ pengaturan: { AKSES_MANUAL: want } }, null, 'Akses pengajuan mahasiswa: ' + want);
    if (!ok) { P.AKSES_MANUAL = old; if (A.cfg) A.cfg.akses.manual = old; updateToggle(); }
  });

  function field(label, id, val, type, hint) { return '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(val || '') + '">' + (hint ? '<small class="hint">' + hint + '</small>' : '') + '</div>'; }
  function saveBar(id) { return '<div class="savebar"><button class="btn btn-navy" id="' + id + '">Simpan Pengaturan</button></div>'; }

  function renderAtur() {
    var P = d().pengaturan || {}, body = $('#atur-body');
    $$('#atur-tabs button').forEach(function (b) { b.classList.toggle('active', b.dataset.s === ST.sub); });
    if (ST.sub === 'prodi') {
      body.innerHTML = '<div class="form-grid"><div class="field"><label for="a-prodi">Daftar Program Studi <span class="count">satu per baris</span></label><textarea id="a-prodi" rows="9">' + esc(d().prodi.join('\n')) + '</textarea></div><div class="field"><label for="a-sem">Daftar Semester <span class="count">satu per baris</span></label><textarea id="a-sem" rows="9">' + esc(d().semester.join('\n')) + '</textarea></div></div><small class="hint">Daftar ini menjadi pilihan dropdown di form mahasiswa dan pengelompokan di tampilan dosen.</small>' + saveBar('a-save');
      $('#a-save').onclick = function () { savePeng({ prodi: $('#a-prodi').value.split('\n'), semester: $('#a-sem').value.split('\n') }, this, 'Prodi & semester tersimpan').then(function (ok) { if (ok) { renderAtur(); renderAdmin(); } }); };
    } else if (ST.sub === 'ujian') {
      body.innerHTML = '<div class="form-grid"><div class="field"><label for="a-jenis">Jenis Ujian Aktif</label><select id="a-jenis"><option>UTS</option><option>UAS</option></select></div>' + field('Tahun Akademik', 'a-tahun', P.TAHUN_AKADEMIK, 'text', 'Contoh: Gasal 2025/2026. Periode = jenis ujian + tahun akademik; aturan "1 kali pengajuan" berlaku per periode.') +
        field('Pengajuan Dibuka Mulai (WIB)', 'a-mulai', P.JADWAL_MULAI, 'datetime-local') + field('Pengajuan Ditutup Pada (WIB)', 'a-selesai', P.JADWAL_SELESAI, 'datetime-local') + '</div><small class="hint">Mahasiswa hanya bisa mengirim jika tombol "Akses Pengajuan" di atas DIBUKA <b>dan</b> waktu berada dalam rentang ini. Kosongkan jadwal untuk tanpa batas waktu.</small>' + saveBar('a-save');
      $('#a-jenis').value = P.JENIS_UJIAN || 'UTS';
      $('#a-save').onclick = function () { savePeng({ pengaturan: { JENIS_UJIAN: $('#a-jenis').value, TAHUN_AKADEMIK: $('#a-tahun').value, JADWAL_MULAI: $('#a-mulai').value, JADWAL_SELESAI: $('#a-selesai').value } }, this).then(function (ok) { if (ok) { renderAtur(); renderAdmin(); syncFilterUI('admin', '#adm-filters'); } }); };
    } else if (ST.sub === 'akses') {
      var link = location.origin + location.pathname + '#dosen';
      body.innerHTML = '<div class="field"><label for="a-kode">Kode Masuk Dosen</label><input id="a-kode" type="text" value="' + esc(P.KODE_DOSEN) + '"><small class="hint">Mengganti kode akan mengeluarkan semua dosen yang sedang masuk.</small></div>' +
        '<div class="field"><label>Link Portal Dosen (bagikan manual)</label><div class="codebox"><input type="text" readonly value="' + esc(link) + '" id="a-link"><button class="btn btn-soft" id="a-copy" type="button">Salin Link</button></div></div>' + saveBar('a-save') +
        '<hr style="border:0;border-top:1px solid var(--border);margin:22px 0"><h2>Ganti Kata Sandi Admin</h2><div class="form-grid" style="margin-top:12px">' + field('Kata sandi lama', 'a-pl', '', 'password') + field('Kata sandi baru (min. 8 karakter)', 'a-pb', '', 'password') + '</div><button class="btn btn-soft" id="a-pw">Ganti Kata Sandi</button>';
      $('#a-save').onclick = function () { savePeng({ pengaturan: { KODE_DOSEN: $('#a-kode').value } }, this, 'Kode masuk dosen diperbarui'); };
      $('#a-copy').onclick = function () { var l = $('#a-link').value; (navigator.clipboard ? navigator.clipboard.writeText(l) : Promise.reject()).then(function () { toast('Link disalin', 'success'); }, function () { $('#a-link').select(); toast('Tekan Ctrl+C untuk menyalin'); }); };
      $('#a-pw').onclick = async function () { busy(this, true, 'Menyimpan…'); var r = await API.post('gantiPassword', { token: A.staff.token, data: { lama: $('#a-pl').value, baru: $('#a-pb').value } }); busy(this, false); if (r.success) { toast('Kata sandi diperbarui', 'success'); $('#a-pl').value = ''; $('#a-pb').value = ''; } else if (!onFail(r)) toast(r.message, 'error'); };
    } else {
      var kt = P.KETENTUAN || [];
      body.innerHTML = '<div class="form-grid">' + field('Nama Kampus', 'a-kampus', P.NAMA_KAMPUS) + field('URL Logo Kampus', 'a-logo', P.LOGO_URL, 'text', 'Alamat gambar (https://…). Contoh: unggah logo.png ke repository, lalu pakai https://USERNAME.github.io/REPO/logo.png') + field('Email Bantuan Akademik', 'a-bantu', P.EMAIL_BANTUAN, 'text') +
        field('URL Aplikasi (untuk tombol "Ajukan Ulang" di email)', 'a-front', P.FRONTEND_URL || (location.origin + location.pathname), 'text') + '</div><h2 style="margin:10px 0">Ketentuan Pengajuan</h2><div id="kt-list"></div><button class="btn btn-soft btn-sm" id="kt-add" type="button">+ Tambah Ketentuan</button>' + saveBar('a-save');
      var render = function () { $('#kt-list').innerHTML = kt.map(function (k, i) { return '<div class="kt-item"><input type="text" data-k="j" data-i="' + i + '" value="' + esc(k.judul) + '" placeholder="Judul"><textarea data-k="s" data-i="' + i + '" placeholder="Isi ketentuan">' + esc(k.isi) + '</textarea><button type="button" class="btn btn-red-o btn-sm" data-del="' + i + '">Hapus</button></div>'; }).join(''); };
      render();
      $('#kt-list').addEventListener('input', function (e) { var i = e.target.dataset.i; if (i == null) return; kt[i][e.target.dataset.k === 'j' ? 'judul' : 'isi'] = e.target.value; });
      $('#kt-list').addEventListener('click', function (e) { var b = e.target.closest('[data-del]'); if (b) { kt.splice(+b.dataset.del, 1); render(); } });
      $('#kt-add').onclick = function () { kt.push({ judul: '', isi: '' }); render(); };
      $('#a-save').onclick = function () { savePeng({ pengaturan: { NAMA_KAMPUS: $('#a-kampus').value, LOGO_URL: $('#a-logo').value, EMAIL_BANTUAN: $('#a-bantu').value, FRONTEND_URL: $('#a-front').value, KETENTUAN: kt } }, this).then(function (ok) { if (ok) A.show(); }); };
    }
  }

  // ============================================================
  // ADMIN — init & tabs
  // ============================================================
  function setTab(t) {
    ST.tab = t;
    $$('#adm-tabs button').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === t); });
    $$('.atab').forEach(function (x) { x.classList.toggle('active', x.id === 'atab-' + t); });
    if (t === 'rekap') renderRekap();
    if (t === 'atur') renderAtur();
  }
  function initAdmin() {
    $('#adm-tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setTab(b.dataset.tab); });
    $('#atur-tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { ST.sub = b.dataset.s; renderAtur(); } });
    $('#rekap-periode').addEventListener('change', renderRekap);
    bindFilters('admin', '#adm-filters', function () { renderAdmin(); });
    var tb = $('#queue-table tbody');
    tb.addEventListener('click', function (e) { var tr = e.target.closest('tr[data-id]'); if (!tr) return; ST.sel = tr.dataset.id; renderQueue(); renderReview(); if (window.innerWidth < 1000) $('#review').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    tb.addEventListener('pointerover', function (e) { var tr = e.target.closest('tr[data-id]'); if (tr) prefetch(tr.dataset.id); });
  }
  A.onShow.admin = function () {
    if (!ST.data) { var cached = SS.get('boot', null); if (cached) ST.data = cached; }
    if (ST.data) {
      if (!ST.f.admin.periode) ST.f.admin.periode = ST.data.periodeAktif;
      syncFilterUI('admin', '#adm-filters', false); $('#adm-filters [data-f="q"]').value = ST.f.admin.q;
      renderAdmin(); setTab(ST.tab);
      // pra-muat surat pertama yang menunggu → terasa instan
      if (ST.sel) prefetch(ST.sel);
    }
    refresh(false);
  };

  initDosen(); initAdmin();
  A.show();   // jalankan ulang rute aktif sekarang setelah handler staf terpasang
  A.onConfig.push(function () { A.refreshTopUser(); });
})();
