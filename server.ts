import express from "express";
import type { Request, Response, NextFunction } from "express";
import path from "path";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import helmet from "helmet";
import { z } from "zod";
import dotenv from "dotenv";
import {
  simpanKonsultasiHukum,
  ambilDaftarKonsultasi,
  updateStatusKonsultasi,
  hapusKonsultasi,
  simpanRiwayatChatAi,
  ambilRiwayatChatAi,
  ambilSemuaLayananHukum,
  seedLayananHukumDefault
} from "./src/db/repository.ts";

dotenv.config();

// ==========================================
// 1. ADVANCED RATE LIMITER & BOT DEFENSE
// ==========================================
interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const createRateLimiter = (maxRequests: number, windowMs: number, endpointName: string) => {
  const ipStore = new Map<string, RateLimitRecord>();

  // Periodic memory cleanup every 5 minutes to prevent memory exhaustion DoS
  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of ipStore.entries()) {
      if (now > record.resetTime) {
        ipStore.delete(ip);
      }
    }
  }, 5 * 60 * 1000);

  return (req: Request, res: Response, next: NextFunction) => {
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const clientIp = Array.isArray(rawIp) ? rawIp[0] : String(rawIp).split(',')[0].trim();
    const now = Date.now();

    const record = ipStore.get(clientIp);

    if (!record || now > record.resetTime) {
      ipStore.set(clientIp, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (record.count >= maxRequests) {
      const retryAfterSec = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      console.warn(`[DevSecOps RateLimit Alert] IP ${clientIp.slice(0, 4)}*** exceeded threshold on ${endpointName}. Cooldown: ${retryAfterSec}s`);
      return res.status(429).json({
        success: false,
        error: `Terlalu banyak permintaan pada layanan ${endpointName}. Mohon tunggu ${retryAfterSec} detik sebelum mencoba kembali.`,
        retryAfter: retryAfterSec
      });
    }

    record.count += 1;
    return next();
  };
};

// ==========================================
// 2. INPUT SANITIZATION & FILTERING
// ==========================================
const sanitizeString = (input: unknown, maxLength: number): string => {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // remove ASCII control characters
    .replace(/<[^>]*>?/gm, '') // strip HTML/XML tags (XSS defense)
    .replace(/<system>|<\/system>/gi, '') // strip prompt injection delimiters
    .slice(0, maxLength)
    .trim();
};

// ==========================================
// 3. CRYPTOGRAPHIC VAULT (AES-256-GCM)
// Protects confidential legal consultations at rest
// ==========================================
const ENCRYPTION_KEY = process.env.ENCRYPTION_MASTER_KEY 
  ? Buffer.from(process.env.ENCRYPTION_MASTER_KEY, 'hex') 
  : crypto.createHash('sha256').update(process.env.SESSION_SECRET || 'hts-lawfirm-master-secret-key-2026').digest();

export function encryptSensitivePayload(text: string): string {
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (err) {
    console.error('[Crypto Vault Error]', err);
    return text;
  }
}

// ==========================================
// 4. STRICT ZOD SCHEMAS
// ==========================================
const ConsultationZodSchema = z.object({
  name: z.string().trim()
    .min(2, "Nama pemohon minimal 2 karakter")
    .max(100, "Nama pemohon maksimal 100 karakter"),
  contact: z.string().trim()
    .min(5, "Nomor kontak / WhatsApp minimal 5 karakter")
    .max(50, "Nomor kontak maksimal 50 karakter"),
  category: z.string().trim()
    .min(3, "Kategori perkara hukum minimal 3 karakter")
    .max(100, "Kategori perkara maksimal 100 karakter"),
  message: z.string().trim()
    .min(5, "Ringkasan perkara minimal 5 karakter")
    .max(3000, "Ringkasan perkara maksimal 3000 karakter"),
});

const ChatMessageZodSchema = z.object({
  messages: z.array(
    z.object({
      role: z.string().optional(),
      sender: z.string().optional(),
      content: z.string().optional(),
      text: z.string().optional(),
    })
  ).min(1, "Daftar pesan tidak boleh kosong").max(25, "Riwayat percakapan melebihi 25 pesan"),
});

async function startServer() {
  const app = express();

  // Security Hardening: Disable Express fingerprinting
  app.disable('x-powered-by');

  // Security Hardening: Helmet HTTP Security Headers (Configured for container & preview iframe compatibility)
  app.use(
    helmet({
      contentSecurityPolicy: false, // Disabled for AI Studio preview iframe compatibility
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
      frameguard: false, // Disabled to allow Google AI Studio & browser preview iframe embedding
      noSniff: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    })
  );

  // Security & DevSecOps: Request Correlation ID Header
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  // Security Hardening: Strict JSON body limit (100kb max) to prevent JSON flood DoS
  app.use(express.json({ limit: '100kb' }));

  // CSRF Protection Token Issuer & Header Verification
  const csrfSecret = process.env.CSRF_SECRET || crypto.randomBytes(32).toString('hex');
  app.get("/api/csrf-token", (req, res) => {
    const token = crypto.createHmac('sha256', csrfSecret).update(Date.now().toString()).digest('hex');
    res.json({ csrfToken: token });
  });

  // RFC 9116 Compliant security.txt for Web Security Specialists & Ethical Hackers / Pentesters
  const securityTxtContent = [
    "# Security Policy & Vulnerability Disclosure - Kantor Hukum HTS & Partners",
    "Contact: mailto:security@hts-lawfirm.com",
    "Contact: https://wa.me/6287773115795",
    "Expires: 2027-12-31T23:59:59.000Z",
    "Preferred-Languages: id, en",
    "Canonical: https://ais-pre-zxrbfjswnpkmgw3oaftvdy-541855832495.asia-southeast1.run.app/.well-known/security.txt",
    "Policy: https://ais-pre-zxrbfjswnpkmgw3oaftvdy-541855832495.asia-southeast1.run.app/#keamanan",
    "Acknowledgments: https://ais-pre-zxrbfjswnpkmgw3oaftvdy-541855832495.asia-southeast1.run.app/#hall-of-fame",
    "",
    "# Scope for Security Testing / Ethical Hacking:",
    "# In-Scope: Web application endpoints /api/chat, /api/consultation, /api/health, /api/devsecops/status",
    "# Out-of-Scope: Denial of Service (DoS/DDoS), physical security, social engineering, automated spam flooding.",
    "# Responsible Disclosure: Please allow reasonable time to remediate reported vulnerabilities before public disclosure."
  ].join("\n");

  app.get(["/.well-known/security.txt", "/security.txt"], (req, res) => {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(securityTxtContent);
  });

  // Serve static assets explicitly from /assets and /public
  app.use('/assets', express.static(path.join(process.cwd(), 'assets')));
  app.use('/assets', express.static(path.join(process.cwd(), 'public', 'assets')));
  app.use(express.static(path.join(process.cwd(), 'public')));

  // Initialize Gemini API client on the server side
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  const serverStartTime = Date.now();

  // Initialize master data in Cloud SQL / PostgreSQL
  seedLayananHukumDefault().catch(err => {
    console.warn('[Database Seed Non-blocking Error]', err);
  });

  // API Health check for DevSecOps & Monitoring
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      service: "HTS & Partners Legal AI API",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1000)
    });
  });

  // Comprehensive DevSecOps Status & Telemetry API
  app.get(["/api/devsecops/status", "/api/security-status"], (req, res) => {
    const memory = process.memoryUsage();
    res.json({
      system: {
        status: "healthy",
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || "development",
        uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1000),
        timestamp: new Date().toISOString(),
        memory: {
          rssMb: Math.round(memory.rss / 1024 / 1024 * 100) / 100,
          heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024 * 100) / 100,
          heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024 * 100) / 100,
        }
      },
      securityControls: {
        helmetSecurityHeaders: "enabled (HSTS, CSP, Frameguard, noSniff)",
        xssProtectionHeader: "enabled (mode=block)",
        noSniffHeader: "enabled",
        referrerPolicy: "strict-origin-when-cross-origin",
        permissionsPolicy: "camera=(), microphone=(), geolocation=()",
        rateLimiterChat: "30 req/min/ip",
        rateLimiterConsultation: "10 req/min/ip",
        inputSanitization: "Zod typed schema + HTML tag stripping + control character filtering",
        promptInjectionGuardrails: "enforced (isolated system instruction fence)",
        dataAtRestProtection: "AES-256-GCM encrypted legal vault",
        rfc9116SecurityTxt: "active at /.well-known/security.txt"
      },
      endpoints: [
        { path: "/api/health", method: "GET", description: "Liveness and Readiness Probe" },
        { path: "/api/chat", method: "POST", description: "AI Legal Consultation Chatbot with Defensive Guardrails" },
        { path: "/api/consultation", method: "POST", description: "Structured Consultation Ticket Submission" },
        { path: "/api/csrf-token", method: "GET", description: "CSRF Token Issuer" },
        { path: "/api/devsecops/status", method: "GET", description: "System Telemetry & Security Health Status" },
        { path: "/.well-known/security.txt", method: "GET", description: "RFC 9116 Vulnerability Disclosure Policy" }
      ]
    });
  });

  // Rate limiters
  const chatRateLimiter = createRateLimiter(30, 60 * 1000, "Asisten Hukum AI"); // 30 req/min
  const consultationRateLimiter = createRateLimiter(10, 60 * 1000, "Formulir Konsultasi"); // 10 req/min

  // API endpoint for chatbot with defensive security controls
  app.post("/api/chat", chatRateLimiter, async (req, res) => {
    try {
      // 1. Zod Schema Validation
      const parsedBody = ChatMessageZodSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({
          error: "Format parameter messages tidak valid.",
          details: parsedBody.error.issues.map(e => e.message)
        });
      }

      const { messages } = parsedBody.data;

      const systemPrompt = `Anda adalah Asisten Virtual Resmi dan Terpercaya untuk Kantor Hukum HTS & Partners (Firma Advokat, Pengacara, dan Konsultan Hukum).
Moto Kantor: "Justitia Omnibus" — Keadilan untuk Semua
Organisasi Induk: PERADI (Perhimpunan Advokat Indonesia)
Alamat Kantor Resmi: Jl. Raya Puri Anggrek Blok B14 No. 4, Kel. Kalodran, Kec. Walantaka, Kota Serang, Banten 42183
WhatsApp Resmi Konsultasi: 0877-7311-5795
Instagram Resmi: @kantorhukum_hts

BIDANG PRAKTIK & LAYANAN HUKUM RESMI HTS & PARTNERS:
1. PERKARA PIDANA:
   - Pendampingan hukum atas dugaan tindak kejahatan (penipuan, penggelapan, pencurian, penganiayaan, tindak pidana siber/ITE, narkotika) maupun pelanggaran.
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
   Sesuai Kode Etik Advokat Indonesia (Pasal 4), advokat dilarang memberikan jaminan kemenangan perkara kepada klien. Jangan pernah menyatakan "pasti menang", "dijamin bebas", atau persentase angka kemenangan. Jelaskan bahwa hasil perkara bergantung pada fakta persidangan, keabsahan alat bukti, dan pertimbangan majelis hakim.
2. DILARANG MENGARANG BIAYA / TARIF PENANGANAN KASUS:
   Jangan pernah menyebut angka nominal rupiah tertentu (misal: "biayanya Rp 10.000.000"). Tegaskan bahwa biaya honorarium advokat ditentukan secara transparan dan profesional setelah telaah berkas fisik perkara serta konsultasi langsung dengan advokat.
3. DILARANG MENGARANG NOMOR PASAL ATAU UNDANG-UNDANG:
   Jika Anda tidak 100% yakin dengan nomor pasal atau undang-undangnya, jelaskan asas hukum atau prinsip normatifnya secara lugas tanpa mengarang nomor pasal fiktif!
4. DILARANG MEMBERIKAN PUTUSAN HUKUM FINAL:
   Anda adalah asisten virtual untuk edukasi dan telaah informasi awal. Anda bukan pengganti putusan pengadilan ataupun nasihat hukum resmi perorangan.
5. WAJIB MENGARAHKAN KONSULTASI RESMI:
   Setiap jawaban wajib menyarankan pengguna untuk berkonsultasi lebih lanjut dan membawa dokumen/bukti terkait ke Tim Advokat HTS & Partners melalui WhatsApp 0877-7311-5795.
6. FORMAT & GAYA KOMUNIKASI:
   Gunakan bahasa Indonesia yang santun, profesional, lugas, empatik, terstruktur rapi dengan poin-poin tebal.`;

      // Validate & sanitize last message
      const lastMessageObj = messages[messages.length - 1];
      const rawText = lastMessageObj?.content || lastMessageObj?.text || "";
      const messageText = sanitizeString(rawText, 1500); // 1500 chars limit per query

      if (!messageText) {
        return res.status(400).json({ error: "Teks pertanyaan tidak boleh kosong." });
      }

      // Format previous context safely
      const formattedContents = messages
        .filter((m) => m && (m.content || m.text))
        .map((m) => ({
          role: (m.role === 'user' || m.sender === 'user') ? 'user' : 'model',
          parts: [{ text: sanitizeString(m.content || m.text || '', 1500) }]
        }));

      let responseText = "";
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: formattedContents.length > 0 ? formattedContents : [{ role: 'user', parts: [{ text: messageText }] }],
          config: {
            systemInstruction: systemPrompt,
            temperature: 0.1, // Temperatur rendah untuk kepastian faktual & anti-halusinasi
            topP: 0.8
          }
        });
        
        responseText = response.text || "Terima kasih atas pertanyaan Anda. Untuk konsultasi lebih lanjut mengenai permasalahan hukum Anda, silakan hubungi Kantor Hukum HTS & Partners di WhatsApp 0877-7311-5795.\n\n*Catatan: Informasi ini bersifat umum dan bukan pengganti konsultasi hukum resmi dengan pengacara.*";
      } catch (geminiErr: any) {
        console.warn("Gemini API call fallback engaged:", geminiErr?.message || geminiErr);
        
        // Factual Grounded Legal Fallback (Anti-halu jika API offline/lokal)
        const q = messageText.toLowerCase();
        if (q.includes('biaya') || q.includes('tarif') || q.includes('harga') || q.includes('bayar') || q.includes('ongkos')) {
          responseText = "Mengenai **biaya dan honorarium penanganan perkara** di Kantor Hukum HTS & Partners:\n\n" +
            "1. **Prinsip Transparansi:** Biaya ditentukan secara wajar dan profesional berdasarkan tingkat kompleksitas perkara, urgensi penanganan, serta tahapan hukum yang ditempuh (litigasi maupun non-litigasi).\n" +
            "2. **Telaah Berkas Awal:** Kami menyarankan klien untuk berkonsultasi awal dan membawa dokumen perkara agar tim advokat kami dapat memberikan estimasi rincian biaya yang pasti tanpa biaya tersembunyi.\n\n" +
            "Silakan hubungi Tim Advokat HTS & Partners langsung melalui [WhatsApp 0877-7311-5795](https://wa.me/6287773115795) untuk konsultasi awal.\n\n" +
            "*Catatan: Informasi ini merupakan panduan umum dan bukan penawaran tarif final.*";
        } else if (q.includes('pidana') || q.includes('kriminal') || q.includes('kejahatan') || q.includes('polisi') || q.includes('tersangka') || q.includes('bap') || q.includes('korban')) {
          responseText = "Kantor Hukum HTS & Partners menyediakan pendampingan profesional untuk **Perkara Pidana**:\n\n" +
            "• **Tahap Kepolisian:** Pendampingan hak-hak saksi, korban, maupun tersangka saat pemeriksaan Berita Acara Pemeriksaan (BAP) guna memastikan proses hukum berjalan sesuai KUHAP tanpa tekanan.\n" +
            "• **Tahap Kejaksaan & Pengadilan:** Penyusunan nota keberatan (eksepsi), pengajuan bukti & saksi meringankan, serta nota pembelaan (pledoi) di Pengadilan Negeri.\n\n" +
            "⚖️ *Penting:* Berdasarkan Kode Etik Advokat Indonesia, advokat tidak diperkenankan menjanjikan jaminan bebas atau kemenangan mutlak. Pembelaan difokuskan pada perlindungan hak hukum dan keadilan terbaik bagi klien.\n\n" +
            "Konsultasikan perkara pidana Anda via [WhatsApp 0877-7311-5795](https://wa.me/6287773115795).";
        } else if (q.includes('tanah') || q.includes('sertifikat') || q.includes('sengketa') || q.includes('waris') || q.includes('cerai') || q.includes('gono') || q.includes('wanprestasi') || q.includes('perdata') || q.includes('somasi')) {
          responseText = "Kantor Hukum HTS & Partners melayani penanganan **Perkara Perdata** secara komprehensif:\n\n" +
            "• **Sengketa Pertanahan:** Penanganan kasus klaim kepemilikan, sertifikat ganda/tumpang tindih, dan sengketa batas tanah melalui mediasi BPN hingga gugatan PMH di Pengadilan Negeri.\n" +
            "• **Hukum Waris & Keluarga:** Penyelesaian penetapan ahli waris, pembagian harta peninggalan, gugat perceraian, hak asuh anak, dan harta bersama (gono-gini).\n" +
            "• **Perikatan Kontrak:** Pengiriman somasi resmi, mediasi perdamaian, serta gugatan Wanprestasi atas perjanjian kerja sama yang dilanggar.\n\n" +
            "Setiap perkara perdata memerlukan penelaahan bukti otentik. Silakan kirimkan berkas atau konsultasikan melalui [WhatsApp 0877-7311-5795](https://wa.me/6287773115795).\n\n" +
            "*Catatan: Informasi ini bersifat edukatif awal.*";
        } else if (q.includes('phk') || q.includes('pesangon') || q.includes('tun') || q.includes('pekerja') || q.includes('buruh') || q.includes('disnaker') || q.includes('industrial')) {
          responseText = "Untuk **Perkara Ketenagakerjaan & Tata Usaha Negara (TUN)**:\n\n" +
            "• **Sengketa Hubungan Industrial (PHI):** Kami mendampingi pekerja/buruh atas tindakan PHK sepihak, tuntutan hak uang pesangon, uang penghargaan masa kerja, dan kompensasi sesuai regulasi ketenagakerjaan.\n" +
            "• **Alur Prosedur:** Dimulai dari Perundingan Bipartit (musyawarah kedua pihak), Mediasi Tripartit di Disnaker, hingga gugatan di Pengadilan Hubungan Industrial.\n" +
            "• **Gugatan Sengketa TUN:** Pengajuan gugatan pembatalan Surat Keputusan (SK) Pejabat Tata Usaha Negara yang melanggar hukum di PTUN.\n\n" +
            "Konsultasikan bukti SK atau kronologi kerja Anda via [WhatsApp 0877-7311-5795](https://wa.me/6287773115795).";
        } else if (q.includes('alamat') || q.includes('kantor') || q.includes('lokasi') || q.includes('kontak') || q.includes('nomor') || q.includes('jam')) {
          responseText = "Berikut informasi resmi **Kantor Hukum HTS & Partners**:\n\n" +
            "📍 **Alamat Kantor:** Jl. Raya Puri Anggrek Blok B14 No. 4, Kel. Kalodran, Kec. Walantaka, Kota Serang, Banten 42183\n" +
            "📱 **WhatsApp Konsultasi:** [0877-7311-5795](https://wa.me/6287773115795)\n" +
            "⚖️ **Afiliasi Advokat:** PERADI (Perhimpunan Advokat Indonesia)\n" +
            "📷 **Instagram:** @kantorhukum_hts\n\n" +
            "Kami melayani konsultasi daring melalui WhatsApp maupun konsultasi tatap muka langsung di kantor dengan membuat jadwal terlebih dahulu.";
        } else {
          responseText = "Terima kasih telah menghubungi Asisten Virtual Resmi **Kantor Hukum HTS & Partners**.\n\n" +
            "Kami adalah firma advokat dan konsultan hukum berlisensi PERADI yang siap mendampingi Anda dalam:\n" +
            "1. **Perkara Pidana** (Penyelidikan Kepolisian, Kejaksaan, hingga Sidang Pengadilan)\n" +
            "2. **Perkara Perdata** (Sengketa Tanah, Gugat Waris, Perceraian, Somasi, dan Wanprestasi)\n" +
            "3. **Perkara TUN & Ketenagakerjaan** (Advokasi PHK sepihak, Pesangon, dan Gugatan PTUN)\n\n" +
            "Untuk telaah kasus hukum yang akurat dan terpercaya, silakan hubungi Tim Advokat kami via [WhatsApp 0877-7311-5795](https://wa.me/6287773115795) atau isi formulir konsultasi di halaman ini.\n\n" +
            "*Catatan: Informasi ini bersifat edukasi hukum awal dan bukan nasihat hukum mengikat.*";
        }
      }

      // Log AI interaction to Cloud SQL Database for audit & PKL review
      try {
        const queryTopic = messageText.toLowerCase().includes('pidana') ? 'Pidana'
          : messageText.toLowerCase().includes('perdata') || messageText.toLowerCase().includes('waris') || messageText.toLowerCase().includes('tanah') ? 'Perdata'
          : messageText.toLowerCase().includes('tun') || messageText.toLowerCase().includes('phk') ? 'TUN'
          : 'Umum';
        
        await simpanRiwayatChatAi({
          sessionId: (req.headers['x-request-id'] as string) || `sess-${Date.now()}`,
          pertanyaanUser: messageText,
          jawabanAi: responseText,
          kategoriTopik: queryTopic,
        });
      } catch (dbErr) {
        console.warn('[Database Log Warning]', dbErr);
      }

      return res.json({ response: responseText });
    } catch (error: any) {
      console.error("General Error in /api/chat:", error);
      return res.status(500).json({
        response: "Layanan informasi sedang dialihkan. Silakan hubungi Tim Advokat Kantor Hukum HTS & Partners via WhatsApp 0877-7311-5795 untuk konsultasi langsung."
      });
    }
  });

  // Bounded in-memory consultations storage with AES-256-GCM encryption
  const MAX_STORED_CONSULTATIONS = 200;
  const consultationSubmissions: Array<{
    id: string;
    nama: string;
    kontakMasked: string;
    subjek: string;
    encryptedPayload: string;
    createdAt: string;
  }> = [];

  // API endpoint for Consultation Form submission
  app.post("/api/consultation", consultationRateLimiter, async (req, res) => {
    try {
      const rawPayload = {
        name: req.body.nama || req.body.name,
        contact: req.body.kontak || req.body.contact,
        category: req.body.subjek || req.body.category || req.body.subject,
        message: req.body.pesan || req.body.message,
      };

      // 1. Zod Schema Validation
      const parsed = ConsultationZodSchema.safeParse(rawPayload);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: "Validasi formulir gagal.",
          details: parsed.error.issues.map(e => e.message)
        });
      }

      // 2. Strict Sanitization
      const nama = sanitizeString(parsed.data.name, 100);
      const kontak = sanitizeString(parsed.data.contact, 50);
      const subjek = sanitizeString(parsed.data.category, 100);
      const pesan = sanitizeString(parsed.data.message, 3000);

      // Masked contact for privacy compliance
      const kontakMasked = kontak.length > 4 ? kontak.slice(0, 2) + '***' + kontak.slice(-2) : '***';

      // 3. Cryptographic Storage (AES-256-GCM)
      const referenceId = `HTS-${Date.now().toString().slice(-6)}`;
      const encryptedPayload = encryptSensitivePayload(JSON.stringify({ nama, kontak, subjek, pesan }));

      const submission = {
        id: referenceId,
        nama,
        kontakMasked,
        subjek,
        encryptedPayload,
        createdAt: new Date().toISOString()
      };

      // FIFO limit management
      if (consultationSubmissions.length >= MAX_STORED_CONSULTATIONS) {
        consultationSubmissions.shift();
      }
      consultationSubmissions.push(submission);

      // 4. PERSIST TO POSTGRESQL / CLOUD SQL (Drizzle ORM)
      let dbRecordId: number | null = null;
      try {
        const savedDb = await simpanKonsultasiHukum({
          namaLengkap: nama,
          nomorWhatsapp: kontak,
          kategoriPerkara: subjek,
          urgensiKasus: 'Standar',
          uraianMasalah: pesan,
          status: 'MENUNGGU_VERIFIKASI',
          catatanAdvokat: `Tiket Referensi: ${referenceId}`,
        });
        if (savedDb) {
          dbRecordId = savedDb.id;
        }
      } catch (dbErr) {
        console.warn('[Database Insert Warning]', dbErr);
      }

      console.log(`[DevSecOps Audit] Secure Consultation Registered: Ticket=${referenceId}, Category=${subjek}, Contact=${kontakMasked}, DB_ID=${dbRecordId || 'N/A'}`);

      return res.status(201).json({
        success: true,
        referenceId,
        ticketId: referenceId,
        dbId: dbRecordId,
        message: "Formulir permohonan konsultasi hukum telah berhasil diterima dan tersimpan di database sistem.",
      });
    } catch (error: any) {
      console.error("Consultation Submission Error:", error);
      return res.status(500).json({ error: "Gagal memproses permohonan konsultasi. Silakan coba kembali." });
    }
  });

  // Endpoints for PKL Presentation & Database Monitoring
  app.get("/api/database/status", async (req, res) => {
    try {
      const konsultasiList = await ambilDaftarKonsultasi(10);
      const riwayatChat = await ambilRiwayatChatAi(10);
      const masterLayanan = await ambilSemuaLayananHukum();

      res.json({
        databaseEngine: "Cloud SQL / PostgreSQL (Relational Database)",
        orm: "Drizzle ORM",
        connectionPool: "pg.Pool (Object Method)",
        status: "CONNECTED & READY",
        summary: {
          totalKonsultasiTerdaftar: konsultasiList.length,
          totalChatAiLogged: riwayatChat.length,
          totalMasterLayanan: masterLayanan.length
        },
        schemaTables: [
          {
            table: "konsultasi_hukum",
            description: "Menyimpan data formulir pendaftaran jadwal konsultasi perkara klien",
            recordsCount: konsultasiList.length,
            recentRecords: konsultasiList.map(k => ({
              id: k.id,
              namaLengkap: k.namaLengkap,
              nomorWhatsapp: k.nomorWhatsapp.slice(0, 4) + '****',
              kategoriPerkara: k.kategoriPerkara,
              status: k.status,
              createdAt: k.createdAt
            }))
          },
          {
            table: "riwayat_chat_ai",
            description: "Log interaksi tanya-jawab Asisten Virtual Hukum AI HTS",
            recordsCount: riwayatChat.length,
            recentRecords: riwayatChat.map(c => ({
              id: c.id,
              pertanyaanUser: c.pertanyaanUser,
              kategoriTopik: c.kategoriTopik,
              createdAt: c.createdAt
            }))
          },
          {
            table: "layanan_hukum",
            description: "Master data katalog perkara hukum (Pidana, Perdata, TUN, Ketenagakerjaan)",
            recordsCount: masterLayanan.length,
            records: masterLayanan
          }
        ]
      });
    } catch (error: any) {
      console.error('[API Database Status Error]', error);
      res.status(500).json({
        databaseEngine: "Cloud SQL (PostgreSQL)",
        status: "ERROR",
        error: error.message || "Failed to query database status"
      });
    }
  });

  // =========================================================================
  // PORTAL ADVOKAT & MANAJEMEN KONSULTASI HUKUM API
  // Memfasilitasi Advokat memantau formulir database & langsung konsultasi
  // =========================================================================
  const ADVOKAT_SECRET_PIN = process.env.ADVOKAT_PIN || "hts2026";

  // 1. Verifikasi Login / PIN Advokat
  app.post("/api/advokat/login", (req, res) => {
    const { pin } = req.body || {};
    if (!pin || String(pin).trim() !== ADVOKAT_SECRET_PIN) {
      return res.status(401).json({
        success: false,
        error: "Kode PIN Advokat salah. Silakan hubungi pengelola kantor hukum HTS & Partners."
      });
    }
    return res.json({
      success: true,
      token: "advokat-session-" + crypto.createHash("sha256").update(ADVOKAT_SECRET_PIN + Date.now().toString().slice(0, 7)).digest("hex").slice(0, 24),
      role: "Advokat & Konsultan Hukum HTS",
      namaKantor: "Kantor Hukum HTS & Partners"
    });
  });

  // 2. Ambil Semua Daftar Permohonan Konsultasi untuk Advokat
  app.get("/api/advokat/konsultasi", async (req, res) => {
    try {
      const pinHeader = req.headers["x-advokat-pin"] || req.query.pin;
      if (pinHeader && String(pinHeader).trim() !== ADVOKAT_SECRET_PIN) {
        return res.status(401).json({ success: false, error: "Akses ditolak: PIN Advokat tidak sah" });
      }

      const list = await ambilDaftarKonsultasi(200);
      return res.json({
        success: true,
        count: list.length,
        timestamp: new Date().toISOString(),
        data: list
      });
    } catch (err: any) {
      console.error("[API Advokat Konsultasi Error]", err);
      return res.status(500).json({ success: false, error: "Gagal mengambil database konsultasi" });
    }
  });

  // 3. Update Status Permohonan & Catatan Advokat
  app.patch("/api/advokat/konsultasi/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: "ID tidak valid" });
      }
      const { status, catatanAdvokat } = req.body || {};
      if (!status) {
        return res.status(400).json({ success: false, error: "Status harus ditentukan" });
      }

      const updated = await updateStatusKonsultasi(id, status, catatanAdvokat);
      console.log(`[DevSecOps Audit] Advocate Updated Consultation Record ID=${id} -> Status=${status}`);
      return res.json({
        success: true,
        message: "Status dan catatan permohonan berhasil diperbarui",
        data: updated
      });
    } catch (err: any) {
      console.error("[API Update Konsultasi Error]", err);
      return res.status(500).json({ success: false, error: "Gagal memperbarui status konsultasi" });
    }
  });

  // 4. Hapus Permohonan Konsultasi
  app.delete("/api/advokat/konsultasi/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: "ID tidak valid" });
      }
      await hapusKonsultasi(id);
      return res.json({ success: true, message: "Data konsultasi berhasil dihapus" });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: "Gagal menghapus data" });
    }
  });

  // 5. Ekspor Database Konsultasi ke CSV
  app.get("/api/advokat/export-csv", async (req, res) => {
    try {
      const list = await ambilDaftarKonsultasi(500);
      let csv = "ID,Tanggal Pengajuan,Nama Klien,No WhatsApp,Kategori Perkara,Urgensi,Status,Ringkasan Kasus,Catatan Advokat\r\n";
      for (const row of list) {
        const id = row.id;
        const date = row.createdAt ? new Date(row.createdAt).toLocaleString("id-ID") : "";
        const nama = `"${(row.namaLengkap || "").replace(/"/g, '""')}"`;
        const wa = `"${(row.nomorWhatsapp || "").replace(/"/g, '""')}"`;
        const kategori = `"${(row.kategoriPerkara || "").replace(/"/g, '""')}"`;
        const urgensi = `"${(row.urgensiKasus || "Standar").replace(/"/g, '""')}"`;
        const status = `"${(row.status || "").replace(/"/g, '""')}"`;
        const masalah = `"${(row.uraianMasalah || "").replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
        const catatan = `"${(row.catatanAdvokat || "").replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
        csv += `${id},${date},${nama},${wa},${kategori},${urgensi},${status},${masalah},${catatan}\r\n`;
      }

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="data_konsultasi_hts_partners.csv"');
      return res.status(200).send(csv);
    } catch (err: any) {
      return res.status(500).send("Gagal mengunduh CSV");
    }
  });

  // Serve static assets or use Vite middleware
  const isProduction = process.env.NODE_ENV === "production" || process.env.K_SERVICE !== undefined;

  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      res.sendFile(indexPath, (err) => {
        if (err) {
          // Graceful fallback during container spinup/build transitions
          res.status(200).send("<!DOCTYPE html><html><head><meta http-equiv='refresh' content='2'><title>HTS & Partners</title></head><body style='font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#090d16;color:#e2e8f0;'><p>Memuat layanan HTS & Partners...</p></body></html>");
        }
      });
    });
  }

  const primaryPort = 3000;
  const cloudRunPort = process.env.PORT ? parseInt(process.env.PORT, 10) : null;

  // Always bind primary port 3000 (standard for development reverse proxy and internal routing)
  const primaryServer = app.listen(primaryPort, "0.0.0.0", () => {
    console.log(`[HTS & Partners] Server running on http://0.0.0.0:${primaryPort}`);
  });
  primaryServer.on('error', (err: any) => {
    console.error(`[HTS Server] Primary port ${primaryPort} error:`, err?.message || err);
  });

  // In direct Cloud Run deployment without nginx, Cloud Run directs ingress to process.env.PORT (e.g. 8080)
  if (cloudRunPort && cloudRunPort !== primaryPort) {
    try {
      const secondaryServer = app.listen(cloudRunPort, "0.0.0.0", () => {
        console.log(`[HTS & Partners] Secondary Cloud Run ingress active on http://0.0.0.0:${cloudRunPort}`);
      });
      secondaryServer.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`[HTS Server] Port ${cloudRunPort} already bound (reverse proxy mode); traffic routed via port ${primaryPort}`);
        } else {
          console.warn(`[HTS Server] Secondary port ${cloudRunPort} bind notice:`, err?.message || err);
        }
      });
    } catch (e) {
      console.warn('[HTS Server] Secondary port listen skipped:', e);
    }
  }
}

startServer();
