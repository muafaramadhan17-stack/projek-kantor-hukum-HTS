-- ==============================================================================
-- DATABASE KANTOR HUKUM HTS & PARTNERS (XAMPP / MySQL / MariaDB)
-- File Import Siap Pakai untuk phpMyAdmin (http://localhost/phpmyadmin)
-- Sangat rapi, terstruktur, dan mudah dijelaskan saat Sidang PKL
-- ==============================================================================

CREATE DATABASE IF NOT EXISTS `hts_law_firm` 
DEFAULT CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE `hts_law_firm`;

-- ------------------------------------------------------------------------------
-- 1. TABEL: konsultasi_hukum
-- Fungsi: Menyimpan data pengajuan formulir konsultasi perkara dari klien
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `konsultasi_hukum`;
CREATE TABLE `konsultasi_hukum` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `nama_lengkap` VARCHAR(255) NOT NULL COMMENT 'Nama lengkap klien pemohon',
  `nomor_whatsapp` VARCHAR(50) NOT NULL COMMENT 'Nomor kontak WhatsApp klien',
  `kategori_perkara` VARCHAR(100) NOT NULL COMMENT 'Contoh: Perkara Pidana, Perkara Perdata, TUN, Ketenagakerjaan',
  `urgensi_kasus` VARCHAR(50) DEFAULT 'Standar' COMMENT 'Tingkat urgensi: Mendesak, Standar, Jadwal Khusus',
  `uraian_masalah` TEXT NOT NULL COMMENT 'Ringkasan kronologi kasus yang diajukan',
  `status` VARCHAR(50) DEFAULT 'MENUNGGU_VERIFIKASI' COMMENT 'Status: MENUNGGU_VERIFIKASI, DIJADWALKAN, SELESAI, DIBATALKAN',
  `catatan_advokat` TEXT NULL COMMENT 'Catatan telaah dari tim advokat HTS',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Waktu pengajuan otomatis',
  INDEX `idx_status` (`status`),
  INDEX `idx_kategori` (`kategori_perkara`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 2. TABEL: riwayat_chat_ai
-- Fungsi: Menyimpan log interaksi pertanyaan klien dan respon Asisten AI HTS
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `riwayat_chat_ai`;
CREATE TABLE `riwayat_chat_ai` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `session_id` VARCHAR(100) NOT NULL COMMENT 'Identifier sesi obrolan',
  `pertanyaan_user` TEXT NOT NULL COMMENT 'Teks pertanyaan dari pengunjung website',
  `jawaban_ai` TEXT NOT NULL COMMENT 'Respon analisis hukum awal dari AI',
  `kategori_topik` VARCHAR(100) DEFAULT 'Umum' COMMENT 'Klasifikasi topik perkara: Pidana, Perdata, TUN, Biaya, Kontak',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Waktu interaksi tanya-jawab',
  INDEX `idx_session` (`session_id`),
  INDEX `idx_topik` (`kategori_topik`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 3. TABEL: layanan_hukum
-- Fungsi: Master data katalog layanan pendampingan & litigasi perkara hukum
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `layanan_hukum`;
CREATE TABLE `layanan_hukum` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `kode_layanan` VARCHAR(50) NOT NULL UNIQUE COMMENT 'Kode unik layanan, misal: PID-01',
  `nama_layanan` VARCHAR(255) NOT NULL COMMENT 'Nama resmi layanan hukum',
  `kategori` VARCHAR(100) NOT NULL COMMENT 'Kategori perkara',
  `deskripsi` TEXT NOT NULL COMMENT 'Deskripsi ruang lingkup pendampingan hukum',
  `tahapan_prosedur` TEXT NULL COMMENT 'Alur penanganan kasus',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- DUMMY / INITIAL DATA: Master Layanan Hukum Resmi HTS & Partners
-- ------------------------------------------------------------------------------
INSERT INTO `layanan_hukum` (`kode_layanan`, `nama_layanan`, `kategori`, `deskripsi`, `tahapan_prosedur`) VALUES
('PID-01', 'Litigasi Pembelaan Pidana', 'Perkara Pidana', 'Pendampingan hak tersangka, terdakwa, maupun saksi/korban atas dugaan tindak kejahatan dan pelanggaran hukum pidana.', '1. Pemeriksaan BAP di Kepolisian -> 2. Pelimpahan Berkas ke Kejaksaan -> 3. Pembelaan & Pledoi di Pengadilan Negeri'),
('PER-01', 'Sengketa Pertanahan & Real Estat', 'Perkara Perdata', 'Penanganan sengketa sertifikat tanah ganda, pembagian hak milik, klaim kepemilikan, dan perbuatan melawan hukum (PMH).', '1. Somasi Hukum & Telaah Bukti Yuridis -> 2. Mediasi Para Pihak / BPN -> 3. Gugatan Perdata di Pengadilan Negeri'),
('PER-02', 'Gugat Waris & Pembagian Harta Bersama', 'Perkara Perdata', 'Penyelesaian sengketa penetapan ahli waris, pembagian harta warisan, gugat perceraian dan pembagian harta gono-gini.', '1. Musyawarah Keluarga & Silsilah -> 2. Mediasi Hukum -> 3. Gugatan / Permohonan Penetapan di Pengadilan Agama/Negeri'),
('TUN-01', 'Sengketa Hubungan Industrial & PHK', 'Perkara TUN / Ketenagakerjaan', 'Pendampingan advokasi perselisihan PHK sepihak, tuntutan hak pesangon buruh/pekerja, dan pelanggaran perjanjian kerja.', '1. Perundingan Bipartit -> 2. Mediasi Tripartit Disnaker -> 3. Gugatan ke Pengadilan Hubungan Industrial (PHI)'),
('TUN-02', 'Gugatan Keputusan Tata Usaha Negara', 'Perkara TUN', 'Pengajuan pembatalan surat keputusan pejabat/badan tata usaha negara yang melanggar asas umum pemerintahan yang baik (AUPB).', '1. Upaya Administratif & Keberatan -> 2. Banding Administratif -> 3. Gugatan Pembatalan di Pengadilan Tata Usaha Negara (PTUN)');

-- ------------------------------------------------------------------------------
-- DUMMY / INITIAL DATA: Contoh Data Konsultasi Masuk (Untuk Sidang PKL)
-- ------------------------------------------------------------------------------
INSERT INTO `konsultasi_hukum` (`nama_lengkap`, `nomor_whatsapp`, `kategori_perkara`, `urgensi_kasus`, `uraian_masalah`, `status`, `catatan_advokat`) VALUES
('Budi Santoso', '081298765432', 'Perkara Perdata', 'Mendesak', 'Terdapat klaim sertifikat ganda atas tanah warisan keluarga di wilayah Serang Banten.', 'DIJADWALKAN', 'Dijadwalkan tatap muka di kantor HTS hari Kamis pukul 14:00 WIB.'),
('Siti Rahmawati', '085712349876', 'Perkara TUN / Ketenagakerjaan', 'Standar', 'Terjadi PHK sepihak dari pihak perusahaan tanpa adanya pembayaran uang pesangon sesuai undang-undang.', 'MENUNGGU_VERIFIKASI', 'Menunggu berkas surat perjanjian kerja dan SK PHK.'),
('Ahmad Fauzi', '087811223344', 'Perkara Pidana', 'Mendesak', 'Mendapat panggilan sebagai saksi dugaan tindak pidana penipuan dan membutuhkan pendampingan advokat saat BAP.', 'MENUNGGU_VERIFIKASI', 'Klien telah dihubungi via WhatsApp untuk konfirmasi berkas.');

-- ------------------------------------------------------------------------------
-- DUMMY / INITIAL DATA: Contoh Log Chat AI (Asisten Virtual HTS)
-- ------------------------------------------------------------------------------
INSERT INTO `riwayat_chat_ai` (`session_id`, `pertanyaan_user`, `jawaban_ai`, `kategori_topik`) VALUES
('session-sample-01', 'Bagaimana prosedur mengurus sertifikat tanah yang tumpang tindih?', 'Langkah awal adalah melakukan pengecekan warkah dan riwayat tanah di kantor BPN terkait serta melayangkan surat somasi/klarifikasi kepada pihak yang mengklaim...', 'Perdata'),
('session-sample-02', 'Apa hak pekerja jika terkena PHK sepihak tanpa pesangon?', 'Berdasarkan regulasi ketenagakerjaan yang berlaku, pekerja berhak atas uang pesangon, uang penghargaan masa kerja, dan penggantian hak. Tahapannya dimulai dari Bipartit...', 'TUN');
