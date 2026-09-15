import { db } from './index.ts';
import { konsultasiHukum, riwayatChatAi, layananHukum, type InsertKonsultasiHukum, type InsertRiwayatChatAi, type InsertLayananHukum } from './schema.ts';
import { desc, eq } from 'drizzle-orm';
import { initMysqlPool, isMysqlActive, queryMysql } from './mysql.ts';

/**
 * ============================================================================
 * UNIVERSAL DATABASE REPOSITORY LAYER (XAMPP MYSQL + CLOUD SQL DUAL SUPPORT)
 * ============================================================================
 * 1. Mode XAMPP Localhost: Menggunakan MySQL (database `hts_law_firm`)
 * 2. Mode Cloud SQL: Menggunakan PostgreSQL dengan Drizzle ORM
 * 3. Mode Fallback Aman: Jika MySQL/Postgres belum dinyalakan, data dicatat di
 *    memori lokal agar aplikasi dan chat AI tetap 100% lancar tanpa crash.
 * ============================================================================
 */

// In-Memory fallback store
const inMemoryKonsultasi: any[] = [];
const inMemoryChatAi: any[] = [];
const inMemoryLayanan: any[] = [
  {
    id: 1,
    kodeLayanan: 'PID-01',
    namaLayanan: 'Litigasi Pembelaan Pidana',
    kategori: 'Perkara Pidana',
    deskripsi: 'Pendampingan hak tersangka, terdakwa, maupun saksi/korban atas dugaan tindak pidana dan kejahatan di Kepolisian, Kejaksaan, dan Pengadilan.',
    tahapanProsedur: '1. Berita Acara Pemeriksaan (BAP) di Kepolisian -> 2. Pelimpahan Berkas ke Kejaksaan -> 3. Pembelaan di Pengadilan Negeri'
  },
  {
    id: 2,
    kodeLayanan: 'PER-01',
    namaLayanan: 'Sengketa Pertanahan & Real Estat',
    kategori: 'Perkara Perdata',
    deskripsi: 'Penanganan sengketa sertifikat ganda, pembagian hak milik, klaim kepemilikan, dan perbuatan melawan hukum (PMH).',
    tahapanProsedur: '1. Somasi Hukum -> 2. Mediasi BPN / Para Pihak -> 3. Gugatan Perdata di Pengadilan Negeri'
  },
  {
    id: 3,
    kodeLayanan: 'PER-02',
    namaLayanan: 'Gugat Waris & Harta Bersama',
    kategori: 'Perkara Perdata',
    deskripsi: 'Penyelesaian sengketa penetapan ahli waris, pembagian harta peninggalan, dan sengketa wasiat / gono-gini.',
    tahapanProsedur: '1. Musyawarah & Telaah Bukti Silsilah -> 2. Mediasi -> 3. Penetapan Pengadilan Agama / Negeri'
  },
  {
    id: 4,
    kodeLayanan: 'TUN-01',
    namaLayanan: 'Sengketa Hubungan Industrial & PHK',
    kategori: 'Perkara TUN / Ketenagakerjaan',
    deskripsi: 'Pendampingan advokasi penyelesaian PHK sepihak, hak pesangon buruh/karyawan, dan perselisihan hak ketenagakerjaan.',
    tahapanProsedur: '1. Perundingan Bipartit -> 2. Mediasi Tripartit Disnaker -> 3. Gugatan ke Pengadilan Hubungan Industrial (PHI)'
  }
];

// Helper: Check if MySQL is preferred (e.g., when running on local machine with XAMPP)
function preferMysql(): boolean {
  // In Cloud Run / AI Studio container with Cloud SQL socket, prioritize PostgreSQL
  if (process.env.SQL_HOST) {
    return false;
  }
  if (process.env.DB_TYPE === 'mysql' || process.env.MYSQL_DATABASE || process.env.MYSQL_HOST) {
    return true;
  }
  return true;
}

// 1. KONSULTASI HUKUM REPOSITORY
export async function simpanKonsultasiHukum(data: InsertKonsultasiHukum) {
  // A. Coba simpan ke MySQL (XAMPP localhost) jika diaktifkan atau tidak ada Cloud SQL
  if (preferMysql()) {
    try {
      const pool = await initMysqlPool();
      if (pool) {
        const [result]: any = await pool.execute(
          `INSERT INTO konsultasi_hukum (nama_lengkap, nomor_whatsapp, kategori_perkara, urgensi_kasus, uraian_masalah, status, catatan_advokat)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            data.namaLengkap,
            data.nomorWhatsapp,
            data.kategoriPerkara,
            data.urgensiKasus || 'Standar',
            data.uraianMasalah,
            data.status || 'MENUNGGU_VERIFIKASI',
            data.catatanAdvokat || null
          ]
        );
        return {
          id: result.insertId,
          ...data,
          createdAt: new Date()
        };
      }
    } catch (mysqlErr) {
      console.warn('[Repository Warning] Gagal simpan ke MySQL XAMPP, beralih ke engine sekunder:', mysqlErr);
    }
  }

  // B. Coba simpan ke PostgreSQL / Cloud SQL (Drizzle)
  if (process.env.SQL_HOST) {
    try {
      const result = await db.insert(konsultasiHukum).values(data).returning();
      return result[0];
    } catch (pgErr) {
      console.warn('[Repository Warning] Gagal simpan ke Cloud SQL Postgres:', pgErr);
    }
  }

  // C. Fallback memori lokal
  const fallbackRecord = {
    id: inMemoryKonsultasi.length + 1,
    ...data,
    createdAt: new Date()
  };
  inMemoryKonsultasi.unshift(fallbackRecord);
  return fallbackRecord;
}

export async function ambilDaftarKonsultasi(limit: number = 50) {
  // A. MySQL XAMPP
  if (preferMysql()) {
    try {
      const pool = await initMysqlPool();
      if (pool) {
        const [rows]: any = await pool.execute(
          `SELECT id, nama_lengkap AS namaLengkap, nomor_whatsapp AS nomorWhatsapp, 
                  kategori_perkara AS kategoriPerkara, urgensi_kasus AS urgensiKasus, 
                  uraian_masalah AS uraianMasalah, status, catatan_advokat AS catatanAdvokat, 
                  created_at AS createdAt 
           FROM konsultasi_hukum 
           ORDER BY created_at DESC 
           LIMIT ?`,
          [limit]
        );
        return rows;
      }
    } catch (e) {
      // fallback
    }
  }

  // B. PostgreSQL / Cloud SQL
  if (process.env.SQL_HOST) {
    try {
      return await db.select().from(konsultasiHukum).orderBy(desc(konsultasiHukum.createdAt)).limit(limit);
    } catch (e) {
      // fallback
    }
  }

  // C. Fallback memori
  return inMemoryKonsultasi.slice(0, limit);
}

export async function cariKonsultasiKlien(identifier: string) {
  const all = await ambilDaftarKonsultasi(300);
  const cleanInput = identifier.trim().replace(/\D/g, '');
  const rawInput = identifier.trim().toLowerCase();

  return all.filter((item: any) => {
    const itemHp = String(item.nomorWhatsapp || '').replace(/\D/g, '');
    const itemId = String(item.id || '').toLowerCase();

    // 1. Cocokkan berdasarkan nomor telepon (minimal 6 digit)
    if (cleanInput.length >= 6 && itemHp.length >= 6) {
      if (itemHp.endsWith(cleanInput) || cleanInput.endsWith(itemHp)) {
        return true;
      }
    }
    // 2. Cocokkan berdasarkan ID / Format Tiket HTS
    if (
      itemId === rawInput ||
      `hts-${itemId}` === rawInput ||
      `hts-${itemId.padStart(4, '0')}` === rawInput ||
      rawInput.includes(itemId)
    ) {
      return true;
    }
    return false;
  });
}

export async function updateStatusKonsultasi(id: number, status: string, catatanAdvokat?: string) {
  // A. MySQL
  if (preferMysql()) {
    try {
      const pool = await initMysqlPool();
      if (pool) {
        if (catatanAdvokat !== undefined) {
          await pool.execute(
            `UPDATE konsultasi_hukum SET status = ?, catatan_advokat = ? WHERE id = ?`,
            [status, catatanAdvokat, id]
          );
        } else {
          await pool.execute(
            `UPDATE konsultasi_hukum SET status = ? WHERE id = ?`,
            [status, id]
          );
        }
      }
    } catch (e) {
      console.warn('[Repository Update Warning MySQL]', e);
    }
  }

  // B. PostgreSQL
  if (process.env.SQL_HOST) {
    try {
      const updateData: any = { status };
      if (catatanAdvokat !== undefined) {
        updateData.catatanAdvokat = catatanAdvokat;
      }
      await db.update(konsultasiHukum).set(updateData).where(eq(konsultasiHukum.id, id));
    } catch (e) {
      console.warn('[Repository Update Warning Postgres]', e);
    }
  }

  // C. In-Memory fallback
  const idx = inMemoryKonsultasi.findIndex(k => k.id === id);
  if (idx !== -1) {
    inMemoryKonsultasi[idx].status = status;
    if (catatanAdvokat !== undefined) {
      inMemoryKonsultasi[idx].catatanAdvokat = catatanAdvokat;
    }
    return inMemoryKonsultasi[idx];
  }
  return { id, status, catatanAdvokat };
}

export async function hapusKonsultasi(id: number) {
  if (preferMysql()) {
    try {
      const pool = await initMysqlPool();
      if (pool) {
        await pool.execute(`DELETE FROM konsultasi_hukum WHERE id = ?`, [id]);
      }
    } catch (e) {}
  }
  if (process.env.SQL_HOST) {
    try {
      await db.delete(konsultasiHukum).where(eq(konsultasiHukum.id, id));
    } catch (e) {}
  }
  const idx = inMemoryKonsultasi.findIndex(k => k.id === id);
  if (idx !== -1) {
    inMemoryKonsultasi.splice(idx, 1);
  }
  return { success: true, id };
}

// 2. RIWAYAT CHAT AI REPOSITORY
export async function simpanRiwayatChatAi(data: InsertRiwayatChatAi) {
  // A. MySQL XAMPP
  if (preferMysql()) {
    try {
      const pool = await initMysqlPool();
      if (pool) {
        const [result]: any = await pool.execute(
          `INSERT INTO riwayat_chat_ai (session_id, pertanyaan_user, jawaban_ai, kategori_topik)
           VALUES (?, ?, ?, ?)`,
          [
            data.sessionId,
            data.pertanyaanUser,
            data.jawabanAi,
            data.kategoriTopik || 'Umum'
          ]
        );
        return {
          id: result.insertId,
          ...data,
          createdAt: new Date()
        };
      }
    } catch (e) {
      // silent
    }
  }

  // B. PostgreSQL / Cloud SQL
  if (process.env.SQL_HOST) {
    try {
      const result = await db.insert(riwayatChatAi).values(data).returning();
      return result[0];
    } catch (e) {
      // silent
    }
  }

  // C. Fallback memori
  const fallbackChat = {
    id: inMemoryChatAi.length + 1,
    ...data,
    createdAt: new Date()
  };
  inMemoryChatAi.unshift(fallbackChat);
  return fallbackChat;
}

export async function ambilRiwayatChatAi(limit: number = 30) {
  if (preferMysql()) {
    try {
      const pool = await initMysqlPool();
      if (pool) {
        const [rows]: any = await pool.execute(
          `SELECT id, session_id AS sessionId, pertanyaan_user AS pertanyaanUser, 
                  jawaban_ai AS jawabanAi, kategori_topik AS kategoriTopik, 
                  created_at AS createdAt 
           FROM riwayat_chat_ai 
           ORDER BY created_at DESC 
           LIMIT ?`,
          [limit]
        );
        return rows;
      }
    } catch (e) {
      // fallback
    }
  }

  if (process.env.SQL_HOST) {
    try {
      return await db.select().from(riwayatChatAi).orderBy(desc(riwayatChatAi.createdAt)).limit(limit);
    } catch (e) {
      // fallback
    }
  }

  return inMemoryChatAi.slice(0, limit);
}

// 3. LAYANAN HUKUM REPOSITORY
export async function ambilSemuaLayananHukum() {
  if (preferMysql()) {
    try {
      const pool = await initMysqlPool();
      if (pool) {
        const [rows]: any = await pool.execute(
          `SELECT id, kode_layanan AS kodeLayanan, nama_layanan AS namaLayanan, 
                  kategori, deskripsi, tahapan_prosedur AS tahapanProsedur, 
                  created_at AS createdAt 
           FROM layanan_hukum`
        );
        if (rows && rows.length > 0) return rows;
      }
    } catch (e) {
      // fallback
    }
  }

  if (process.env.SQL_HOST) {
    try {
      const result = await db.select().from(layananHukum);
      if (result.length > 0) return result;
    } catch (e) {
      // fallback
    }
  }

  return inMemoryLayanan;
}

export async function seedLayananHukumDefault() {
  try {
    // 1. Check MySQL connection silently if configured
    if (preferMysql()) {
      try {
        await initMysqlPool();
      } catch {
        // non-blocking
      }
    }

    // 2. Seed to Postgres if present
    if (process.env.SQL_HOST) {
      try {
        const existing = await db.select().from(layananHukum);
        if (existing.length === 0) {
          for (const item of inMemoryLayanan) {
            await db.insert(layananHukum).values({
              kodeLayanan: item.kodeLayanan,
              namaLayanan: item.namaLayanan,
              kategori: item.kategori,
              deskripsi: item.deskripsi,
              tahapanProsedur: item.tahapanProsedur,
            });
          }
        }
      } catch (error: any) {
        // Safe fallback - inMemoryLayanan handles all responses seamlessly
        console.info('[Database Master Data] Default legal service catalog active.');
      }
    }
  } catch {
    // non-blocking startup routine
  }
}
