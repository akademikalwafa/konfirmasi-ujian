# Konfirmasi Ujian Online

Aplikasi web pengajuan izin ujian online (kelas hybrid): mahasiswa mengajukan + unggah surat PDF, admin akademik menyetujui/menolak, mahasiswa menerima email, dosen melihat daftar per prodi & semester.

- **Frontend:** HTML/CSS/JS murni (folder ini) → GitHub Pages
- **Backend:** Google Apps Script sebagai REST API (`Kode.gs`, diberikan terpisah, tidak termasuk di repository ini)

```
index.html
css/style.css
js/config.js   ← isi GAS_URL di sini
js/api.js      ← fetch ke GAS
js/app.js      ← SPA + portal mahasiswa
js/staff.js    ← portal dosen + panel admin
```

Panduan langkah demi langkah: lihat **PANDUAN-INSTALASI.md**.
