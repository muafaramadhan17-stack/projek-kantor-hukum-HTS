import { pgTable, text, serial, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * ============================================================================
 * DATABASE SCHEMA - KANTOR HUKUM HTS & PARTNERS (Cloud SQL / PostgreSQL)
 * ============================================================================
 * Sangat terstruktur, rapi, dan mudah dijelaskan saat Sidang PKL:
 * 1. konsultasi_hukum: Menyimpan data pendaftaran jadwal konsultasi klien
 * 2. riwayat_chat_ai: Menyimpan log interaksi tanya jawab Asisten AI HTS
 * 3. layanan_hukum: Daftar katalog perkara (Pidana, Perdata, TUN, Ketenagakerjaan)
 * ============================================================================
 */

// 1. TABEL KONSULTASI HUKUM (Daftar Pengajuan Klien)
export const konsultasiHukum = pgTable('konsultasi_hukum', {
  id: serial('id').primaryKey(),
  namaLengkap: varchar('nama_lengkap', { length: 255 }).notNull(),
  nomorWhatsapp: varchar('nomor_whatsapp', { length: 50 }).notNull(),
  kategoriPerkara: varchar('kategori_perkara', { length: 100 }).notNull(), // Perkara Pidana, Perkara Perdata, Sengketa TUN, Ketenagakerjaan
  urgensiKasus: varchar('urgensi_kasus', { length: 50 }).default('Standar'), // Mendesak, Standar, Jadwal Khusus
  uraianMasalah: text('uraian_masalah').notNull(),
  status: varchar('status', { length: 50 }).default('MENUNGGU_VERIFIKASI'), // MENUNGGU_VERIFIKASI, DIJADWALKAN, SELESAI, DIBATALKAN
  catatanAdvokat: text('catatan_advokat'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 2. TABEL LOG RIWAYAT CHAT AI (Virtual Assistant)
export const riwayatChatAi = pgTable('riwayat_chat_ai', {
  id: serial('id').primaryKey(),
  sessionId: varchar('session_id', { length: 100 }).notNull(),
  pertanyaanUser: text('pertanyaan_user').notNull(),
  jawabanAi: text('jawaban_ai').notNull(),
  kategoriTopik: varchar('kategori_topik', { length: 100 }).default('Umum'), // Pidana, Perdata, TUN, Biaya, Kontak
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 3. TABEL KATALOG LAYANAN & PERKARA HUKUM (Master Data)
export const layananHukum = pgTable('layanan_hukum', {
  id: serial('id').primaryKey(),
  kodeLayanan: varchar('kode_layanan', { length: 50 }).unique().notNull(),
  namaLayanan: varchar('nama_layanan', { length: 255 }).notNull(),
  kategori: varchar('kategori', { length: 100 }).notNull(),
  deskripsi: text('deskripsi').notNull(),
  tahapanProsedur: text('tahapan_prosedur'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type KonsultasiHukum = typeof konsultasiHukum.$inferSelect;
export type InsertKonsultasiHukum = typeof konsultasiHukum.$inferInsert;

export type RiwayatChatAi = typeof riwayatChatAi.$inferSelect;
export type InsertRiwayatChatAi = typeof riwayatChatAi.$inferInsert;

export type LayananHukum = typeof layananHukum.$inferSelect;
export type InsertLayananHukum = typeof layananHukum.$inferInsert;
