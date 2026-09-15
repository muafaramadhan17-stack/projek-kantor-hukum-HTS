import { GoogleGenAI } from "@google/genai";

const systemPrompt = `Anda adalah Asisten Virtual Resmi dan Terpercaya untuk Kantor Hukum HTS & Partners (Firma Advokat, Pengacara, dan Konsultan Hukum).
Moto Kantor: "Justitia Omnibus" — Keadilan untuk Semua
Organisasi Induk: PERADI (Perhimpunan Advokat Indonesia)
Alamat Kantor Resmi: Jl. Raya Puri Anggrek Blok B14 No. 4, Kel. Kalodran, Kec. Walantaka, Kota Serang, Banten 42183
WhatsApp Resmi Konsultasi: 0877-7311-5795
Instagram Resmi: @kantorhukum_hts

BIDANG PRAKTIK & LAYANAN HUKUM RESMI HTS & PARTNERS:
1. PERKARA PIDANA:
   - Pendampingan hukum atas dugaan tindak kejahatan maupun pelanggaran.
   - Pendampingan hak-hak tersangka, saksi, maupun korban pada tahap Penyelidikan dan Penyidikan di Kepolisian (proses BAP).
   - Pembelaan pada tahap Penuntutan di Kejaksaan hingga persidangan di Pengadilan Negeri (eksepsi, pemeriksaan saksi/ahli, pledoi/nota pembelaan).
2. PERKARA PERDATA:
   - Sengketa Pertanahan & Real Estat: Penanganan klaim kepemilikan, sertifikat ganda/tumpang tindih, sengketa batas tanah, penguasaan tanpa hak.
   - Hukum Keluarga & Kewarisan: Gugat waris, penetapan ahli waris, silsilah keluarga, gugat perceraian di Pengadilan Agama / Pengadilan Negeri, hak asuh anak, dan pembagian harta bersama (gono-gini).
   - Perikatan & Bisnis: Gugatan Wanprestasi (ingkar janji), Perbuatan Melawan Hukum (PMH), somasi hukum, sengketa utang-piutang, peninjauan kontrak.
3. PERKARA TATA USAHA NEGARA (TUN) & KETENAGAKERJAAN:
   - Perselisihan Hubungan Industrial: Pembelaan atas PHK sepihak, tuntutan pembayaran pesangon, perundingan Bipartit, Tripartit Disnaker, hingga Pengadilan Hubungan Industrial (PHI).
   - Gugatan Sengketa TUN: Pengujian dan pembatalan Keputusan Tata Usaha Negara (KTUN) pejabat publik yang merugikan di Pengadilan Tata Usaha Negara (PTUN).

ATURAN KETAT ANTI-HALUSINASI (ZERO-HALLUCINATION POLICY):
1. DILARANG MENJANJIKAN KEMENANGAN ATAU HASIL PERKARA:
   Sesuai Kode Etik Advokat Indonesia (Pasal 4), advokat dilarang memberikan jaminan kemenangan perkara kepada klien. Jangan pernah menyatakan "pasti menang", "dijamin bebas", atau persentase angka kemenangan.
2. DILARANG MENGARANG BIAYA / TARIF PENANGANAN KASUS:
   Jangan pernah menyebut angka nominal rupiah tertentu. Tegaskan bahwa honorarium ditentukan secara transparan dan profesional setelah telaah berkas fisik perkara serta konsultasi langsung dengan advokat.
3. DILARANG MENGARANG NOMOR PASAL ATAU UNDANG-UNDANG:
   Jika tidak 100% yakin dengan nomor pasal, jelaskan asas hukum atau prinsip normatifnya secara lugas tanpa mengarang nomor pasal fiktif.
4. DILARANG MEMBERIKAN PUTUSAN HUKUM FINAL:
   Anda adalah asisten virtual untuk edukasi dan telaah informasi awal, bukan pengganti putusan pengadilan ataupun nasihat hukum resmi perorangan.
5. WAJIB MENGARAHKAN KONSULTASI RESMI:
   Setiap jawaban wajib menyarankan pengguna untuk berkonsultasi lebih lanjut dan membawa dokumen/bukti terkait ke Tim Advokat HTS & Partners melalui WhatsApp 0877-7311-5795.
6. FORMAT & GAYA KOMUNIKASI:
   Gunakan bahasa Indonesia yang santun, profesional, lugas, empatik, terstruktur rapi dengan poin-poin tebal.`;

function sanitize(str: any, maxLen = 1500): string {
  if (!str) return "";
  return String(str)
    .replace(/<[^>]*>?/gm, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim()
    .slice(0, maxLen);
}

export default async function handler(req: any, res: any) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metode HTTP tidak diizinkan. Gunakan POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(200).json({
      response: "Layanan analisis AI memerlukan konfigurasi **GEMINI_API_KEY** di environment variables hosting (misalnya di Vercel Dashboard > Project Settings > Environment Variables).\n\nUntuk konsultasi hukum langsung dan telaah berkas perkara tanpa kendala, silakan hubungi Tim Advokat Kantor Hukum HTS & Partners langsung via [WhatsApp 0877-7311-5795](https://wa.me/6287773115795)."
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const messages = Array.isArray(body.messages) ? body.messages : [];

    const lastMessageObj = messages[messages.length - 1];
    const rawText = lastMessageObj?.content || lastMessageObj?.text || "";
    const messageText = sanitize(rawText, 1500);

    if (!messageText) {
      return res.status(400).json({ error: "Teks pertanyaan tidak boleh kosong." });
    }

    const formattedContents = messages
      .filter((m: any) => m && (m.content || m.text))
      .map((m: any) => ({
        role: (m.role === 'user' || m.sender === 'user') ? 'user' : 'model',
        parts: [{ text: sanitize(m.content || m.text || '', 1500) }]
      }));

    const ai = new GoogleGenAI({ apiKey });
    const candidateModels = ["gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.8-flash"];
    let responseText = "";
    let modelSuccess = false;

    for (const modelName of candidateModels) {
      try {
        const result = await ai.models.generateContent({
          model: modelName,
          contents: formattedContents.length > 0 ? formattedContents : [{ role: 'user', parts: [{ text: messageText }] }],
          config: {
            systemInstruction: systemPrompt,
            temperature: 0.2,
            topP: 0.85
          }
        });

        if (result && result.text) {
          responseText = result.text;
          modelSuccess = true;
          break;
        }
      } catch (err) {
        // try next model
      }
    }

    if (!modelSuccess) {
      // Contextual Legal Fallback
      const q = messageText.toLowerCase();
      if (q.includes('biaya') || q.includes('tarif') || q.includes('harga') || q.includes('bayar') || q.includes('ongkos')) {
        responseText = "Mengenai **biaya dan honorarium penanganan perkara** di Kantor Hukum HTS & Partners:\n\n" +
          "1. **Prinsip Transparansi:** Biaya ditentukan secara wajar dan profesional berdasarkan tingkat kompleksitas perkara, urgensi penanganan, serta tahapan hukum yang ditempuh (litigasi maupun non-litigasi).\n" +
          "2. **Telaah Berkas Awal:** Kami menyarankan klien untuk berkonsultasi awal dan membawa dokumen perkara agar tim advokat kami dapat memberikan estimasi rincian biaya yang pasti tanpa biaya tersembunyi.\n\n" +
          "Silakan hubungi Tim Advokat HTS & Partners langsung melalui [WhatsApp 0877-7311-5795](https://wa.me/6287773115795) untuk konsultasi awal.";
      } else {
        responseText = "Terima kasih telah menghubungi Asisten Virtual Resmi **Kantor Hukum HTS & Partners**.\n\n" +
          "Untuk penelaahan hukum yang spesifik dan akurat sesuai fakta berkas Anda, silakan hubungi Tim Advokat kami via [WhatsApp 0877-7311-5795](https://wa.me/6287773115795) atau isi formulir konsultasi resmi di situs ini.\n\n" +
          "*Catatan: Informasi ini bersifat panduan awal dan bukan pengganti nasihat hukum resmi langsung.*";
      }
    }

    return res.status(200).json({ response: responseText });
  } catch (error: any) {
    return res.status(500).json({
      response: "Layanan informasi sedang dialihkan. Silakan hubungi Tim Advokat Kantor Hukum HTS & Partners via WhatsApp 0877-7311-5795 untuk konsultasi langsung."
    });
  }
}
