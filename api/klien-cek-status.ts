export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Metode HTTP tidak diizinkan. Gunakan POST.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const identifier = body.identifier || '';

    if (!identifier || identifier.trim().length < 3) {
      return res.status(400).json({ success: false, error: 'Nomor WhatsApp atau ID Tiket tidak valid.' });
    }

    // Dynamic import to support Vercel execution
    const { cariKonsultasiKlien } = await import('../src/db/repository.ts');
    const records = await cariKonsultasiKlien(identifier);

    if (!records || records.length === 0) {
      return res.status(200).json({
        success: true,
        found: false,
        message: 'Tidak ditemukan riwayat konsultasi dengan kontak tersebut. Pastikan nomor kontak sesuai formulir.',
        data: []
      });
    }

    return res.status(200).json({
      success: true,
      found: true,
      count: records.length,
      data: records.map((c: any) => ({
        id: c.id,
        ticketCode: `HTS-${c.id.toString().padStart(4, '0')}`,
        namaLengkap: c.namaLengkap,
        nomorWhatsappMasked: c.nomorWhatsapp ? c.nomorWhatsapp.slice(0, 4) + '****' + c.nomorWhatsapp.slice(-2) : '-',
        kategoriPerkara: c.kategoriPerkara,
        urgensiKasus: c.urgensiKasus,
        uraianMasalah: c.uraianMasalah,
        status: c.status || 'MENUNGGU_VERIFIKASI',
        catatanAdvokat: c.catatanAdvokat || 'Berkas Anda sedang dalam antrean telaah oleh Advokat HTS & Partners.',
        createdAt: c.createdAt
      }))
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: 'Gagal memproses pengecekan status klien.' });
  }
}
