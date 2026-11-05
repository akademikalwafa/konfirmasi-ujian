# Panduan Instalasi — Konfirmasi Ujian Online

Arsitektur: **Frontend** (folder ini) di **GitHub Pages**, **Backend** (`Kode.gs`) di **Google Apps Script**.
Kerjakan berurutan: A (backend) → B (isi config) → C (GitHub Pages) → D (uji coba).

---

## A. Backend — Google Apps Script

1. Buka https://script.google.com → **Proyek baru**.
2. Ganti nama proyek, mis. `Konfirmasi Ujian Online`.
3. Ganti nama berkas `Code.gs` menjadi `Kode`, hapus isinya, lalu **tempel seluruh isi `Kode.gs`**.
4. (Disarankan) Klik ikon roda gigi **Project Settings** → centang **Show "appsscript.json" manifest file in editor**. Buka `appsscript.json`, ganti isinya dengan berkas `appsscript.json` yang diberikan. Ini mengatur zona waktu `Asia/Jakarta`.
5. **Jalankan setup SATU KALI SAJA**:
   - Dropdown fungsi → pilih `setupAppEnvironment` → ▶ **Run**.
   - Klik **Review permissions** → pilih akun → *Advanced* → *Go to … (unsafe)* → **Allow** (aplikasi membutuhkan akses Drive, Sheets, dan Gmail).
   - Buka **Execution log**. Catat baris ini (tampil sekali saja):
     - `Username : admin` dan `Password : ……`
     - `KODE MASUK DOSEN awal : ……`
   - Cek Google Drive: folder 📁 *Konfirmasi Ujian Online* dan spreadsheet 🗃️ *Database* sudah terbuat.
   - ⚠️ Jangan jalankan setup dua kali. Jika dijalankan lagi, fungsi akan berhenti sendiri dan tidak membuat duplikat.
6. **Deploy → New deployment → ⚙ Select type → Web app**
   - *Execute as*: **Me**
   - *Who has access*: **Anyone**
   - Klik **Deploy**, lalu **salin URL Web app** (berakhiran `/exec`).
7. Setiap kali Anda mengubah `Kode.gs` nanti: **Deploy → Manage deployments → ✏ Edit → Version: New version → Deploy** (URL tetap sama).

> **Kuota email:** akun Gmail biasa hanya bisa mengirim sekitar 100 email/hari lewat Apps Script; akun Google Workspace kampus sekitar 1.500/hari. Untuk 300+ mahasiswa, pakai akun Workspace kampus. Kolom `Status_Email` di sheet *Pengajuan* mencatat email yang gagal terkirim.

> **Lupa kata sandi admin?** Di editor Apps Script, buka fungsi `resetPasswordAdmin`, ubah `PASSWORD_BARU`, pilih fungsi itu, lalu ▶ Run.

---

## B. Isi alamat backend di frontend

Folder kerja frontend = **folder hasil ekstrak ZIP `konfirmasi-ujian-online`** (yang berisi `index.html`, folder `css` dan `js`).

1. Buka `js/config.js` dengan Notepad.
2. Ganti `ISI_URL_EXEC_DI_SINI` dengan URL `/exec` dari langkah A6 (tetap di dalam tanda kutip).
3. Simpan.

---

## C. Deploy ke GitHub Pages (lewat terminal)

Semua perintah dijalankan **di dalam folder hasil ekstrak ZIP** (folder yang di dalamnya langsung terlihat `index.html`). Bukan folder induknya, bukan folder lain.

### C1. Pasang Git
- **Windows:** unduh dari https://git-scm.com/download/win, install dengan pengaturan default.
- **Mac:** buka Terminal, ketik `git --version` (ikuti tawaran instalasi bila muncul).
- Cek: `git --version`

### C2. Akun & identitas Git
1. Daftar di https://github.com (username Anda menjadi bagian alamat situs: `username.github.io`).
2. Di terminal (sekali saja per komputer):
```
git config --global user.name "Nama Anda"
git config --global user.email "email-akun-github@contoh.com"
```

### C3. Buat repository
GitHub → tombol **+** → **New repository** → nama, mis. `konfirmasi-ujian` → pilih **Public** → **jangan** centang README/.gitignore/license → **Create repository**. Biarkan halaman petunjuknya terbuka.

### C4. Buka terminal di folder yang benar
**Windows:** buka folder hasil ekstrak di File Explorer → klik address bar → ketik `powershell` → Enter.
Lalu cek isinya:
```
dir
```
Harus terlihat **`index.html`**, folder **`css`**, dan folder **`js`**. Jika yang terlihat hanya folder lain (mis. `konfirmasi-ujian-online`), masuk dulu ke dalamnya dengan `cd`. **Jangan lanjut sebelum `index.html` terlihat.**

### C5. Push pertama (satu per satu)
```
git init
git add .
git commit -m "Upload pertama"
git branch -M main
git remote add origin https://github.com/USERNAME/NAMA-REPO.git
git push -u origin main
```
Ganti `USERNAME` dan `NAMA-REPO`. Titik di `git add .` wajib ada.
Saat diminta password, tempel **Personal Access Token** (bukan password akun). Saat mengetik/menempel token, layar terlihat kosong — itu normal.

**Membuat token:** https://github.com/settings/tokens → *Generate new token (classic)* → centang **repo** → Generate → salin token (hanya tampil sekali).
Alternatif tanpa token: aplikasi **GitHub Desktop** (https://desktop.github.com) → *Add Local Repository* → pilih folder → *Publish repository*.

### C6. Aktifkan Pages
Repo di GitHub → **Settings → Pages** → *Source*: **Deploy from a branch** → *Branch*: **main** / **(root)** → **Save** → centang **Enforce HTTPS**. Tunggu 1–2 menit, alamat situs akan tampil: `https://USERNAME.github.io/NAMA-REPO/`

### C7. Update di kemudian hari
```
git add .
git commit -m "Update"
git push
```
Jika tampilan lama masih muncul, tekan **Ctrl+Shift+R**.

---

## D. Uji coba & pengaturan awal

1. Buka alamat GitHub Pages → portal mahasiswa tampil.
2. Buka `…/#admin` → login `admin` + password dari log setup.
3. **Pengaturan** (urutan disarankan):
   - *Prodi & Semester*: isi daftar prodi Anda (ganti contoh).
   - *Ujian & Jadwal*: jenis ujian (UTS/UAS), tahun akademik, jadwal mulai & selesai.
   - *Akses & Keamanan*: ganti kode dosen bila perlu, **ganti kata sandi admin**, salin link dosen.
   - *Ketentuan & Identitas*: nama kampus, URL logo, email bantuan, ketentuan.
4. Nyalakan saklar **Akses Pengajuan** (di kanan atas panel admin).
5. Uji sebagai mahasiswa (pakai email sendiri): ajukan → cek status → setujui/tolak di admin → cek email masuk.
6. Bagikan ke dosen: link `…/#dosen` + kode masuk (manual, mis. lewat WhatsApp).
7. Logo: unggah `logo.png` ke repository (letakkan di folder yang sama dengan `index.html`, lalu push), kemudian isi *URL Logo* dengan `https://USERNAME.github.io/NAMA-REPO/logo.png`.

---

## E. Troubleshooting cepat

| Gejala | Penyebab | Solusi |
|---|---|---|
| Situs 404 di GitHub Pages | `index.html` tidak di root repo | Buka repo di GitHub: jika terlihat folder pembungkus, ulangi C4–C5 dari folder yang benar (`git push -u origin main --force`) |
| Halaman tanpa styling | Folder `css`/`js` tidak ikut | Ulangi push lewat terminal (jangan upload via web GitHub) |
| "GAS_URL belum diisi" | `js/config.js` belum diedit | Lakukan langkah B, lalu push ulang |
| "Tidak dapat terhubung ke server" | Deploy Web App belum *Anyone*, atau URL salah | Cek A6; pastikan URL berakhiran `/exec` |
| Perubahan `Kode.gs` tidak berlaku | Belum membuat *New version* | Lihat A7 |
| Email tidak terkirim | Kuota harian / izin Gmail | Lihat kolom `Status_Email`; pakai akun Workspace |
| "Terlalu banyak percobaan gagal" | Salah login 5x | Tunggu 15 menit |
| Sesi berakhir | Token berlaku 6 jam | Masuk kembali |

## Glosarium singkat
- **Repository**: folder proyek di GitHub. **Commit**: simpan perubahan + catatan. **Push**: kirim ke GitHub. **Token**: "password khusus" untuk git push.
