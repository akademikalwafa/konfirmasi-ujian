// ============================================================
// KONFIGURASI — satu-satunya berkas yang perlu Anda edit
// Isi GAS_URL dengan URL Web App (berakhiran /exec) dari Apps Script
// ============================================================
window.APP_CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbz6rE3889wdMQ4NXRPstSHh5cAriyKI27GQKEta8ZLHn2j3M6a0p_QBM5lZNglq48PX/exec',
  CONFIG_TTL_MS: 5 * 60 * 1000, // pengaturan publik dianggap segar selama 5 menit (tetap disegarkan di latar belakang)
  POLL_MS: 60 * 1000,           // admin/dosen: segarkan data otomatis tiap 60 dtk saat tab terlihat
  MAX_PDF_MB: 5
};
