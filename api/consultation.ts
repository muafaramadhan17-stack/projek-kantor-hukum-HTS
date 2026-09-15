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
    const name = body.nama || body.name || 'Klien';
    const contact = body.kontak || body.contact || '-';
    const category = body.subjek || body.category || 'Konsultasi Hukum';
    const message = body.pesan || body.message || '';

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Pesan konsultasi tidak boleh kosong.' });
    }

    const ticketId = `HTS-${Date.now().toString(36).toUpperCase()}`;

    return res.status(200).json({
      success: true,
      ticketId,
      message: `Permohonan konsultasi hukum atas nama ${name} berhasil diterima. Tim Advokat HTS & Partners akan segera menelaah dan menghubungi kontak Anda (${contact}).`,
      redirectWa: `https://wa.me/6287773115795?text=${encodeURIComponent(`Halo Advokat HTS & Partners, saya sudah mengisi formulir konsultasi (Tiket: ${ticketId}) mengenai: ${category}. Mohon informasi tindak lanjut.`)}`
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: 'Terjadi kendala saat memproses formulir.' });
  }
}
