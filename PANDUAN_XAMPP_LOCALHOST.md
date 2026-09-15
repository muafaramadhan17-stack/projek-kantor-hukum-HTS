# PANDUAN MENJALANKAN DI LOCALHOST DENGAN XAMPP (UNTUK SIDANG PKL)

Panduan ini disiapkan agar aplikasi **Kantor Hukum HTS & Partners** beserta **Database MySQL** dan **Chatbot AI** dapat dijalankan dan didemonstrasikan di laptop Anda secara lokal (*localhost*) untuk keperluan sidang PKL.

---

## 1. Persiapan XAMPP & Database MySQL

1. **Buka XAMPP Control Panel**:
   - Klik tombol **Start** pada modul **Apache**.
   - Klik tombol **Start** pada modul **MySQL**.

2. **Buka phpMyAdmin**:
   - Buka browser dan akses: `http://localhost/phpmyadmin`

3. **Import Database (1-Klik)**:
   - Klik tab **Import** pada menu atas phpMyAdmin.
   - Pilih file `database.sql` yang berada di folder utama proyek ini.
   - Klik tombol **Import / Kirim** di bagian bawah.
   - Database `hts_law_firm` beserta 3 tabel (`konsultasi_hukum`, `riwayat_chat_ai`, `layanan_hukum`) dan data contoh akan otomatis terbuat!

---

## 2. Konfigurasi Environment (`.env`)

1. Buat file `.env` di folder utama (atau salin dari `.env.example`).
2. Masukkan konfigurasi berikut:

```env
# Database MySQL XAMPP
DB_TYPE=mysql
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=hts_law_firm

# Kunci API Gemini untuk Chatbot AI (Opsional jika ingin respon AI dinamis)
GEMINI_API_KEY=AIzaSy...your_gemini_api_key...
```

> **Catatan Penting untuk Sidang PKL:**
> Jika laptop Anda tidak terhubung ke internet saat sidang atau tidak memasukkan `GEMINI_API_KEY`, **Chatbot AI HTS tetap dapat menjawab dengan sempurna** karena sistem sudah dilengkapi dengan mesin *Deterministic Grounded Knowledge Base* bawaan kantor hukum yang tidak halusinasi!

---

## 3. Menjalankan Aplikasi di Localhost

Buka Terminal / Command Prompt di folder proyek, lalu jalankan:

```bash
# 1. Install dependensi
npm install

# 2. Jalankan server lokal
npm run dev
```

Buka browser dan buka:
👉 **`http://localhost:3000`**

---

## 4. Poin Penjelasan untuk Dosen Penguji Sidang PKL

1. **Arsitektur Sistem**:
   - **Frontend**: React + Tailwind CSS + Lucide Icons (Responsif di desktop & HP).
   - **Backend**: Node.js + Express REST API (Dilengkapi DevSecOps: Rate Limiting, Input Sanitization, Helmet Security Headers).
   - **Database**: MySQL / MariaDB (via XAMPP di `localhost:3306`) menggunakan Connection Pooling untuk efisiensi transaksi data.

2. **Pembuktian Data di phpMyAdmin**:
   - **Tabel `konsultasi_hukum`**: Saat pengunjung mengisi formulir konsultasi di web, data langsung tersimpan di tabel ini lengkap dengan nama, nomor kontak, kategori perkara, dan ringkasan masalah.
   - **Tabel `riwayat_chat_ai`**: Setiap pertanyaan dan respon asisten hukum otomatis tersimpan sebagai riwayat audit (*audit trail*).
   - **Tabel `layanan_hukum`**: Menyimpan katalog resmi penanganan perkara (Pidana, Perdata, TUN, Ketenagakerjaan).

3. **Keunggulan AI (Anti-Halusinasi)**:
   - Menggunakan model `gemini-3.8-flash` dengan konfigurasi temperatur rendah (`0.1`) agar jawaban akurat, faktual, dan patuh pada Kode Etik Advokat Indonesia (dilarang menjamin kemenangan, dilarang mengarang tarif sembarangan, dan wajib menyertakan arahan konsultasi resmi).
