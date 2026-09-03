/**
 * Smart Office Bappeda & Litbang Terintegrasi - Cloudflare Worker Backend
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

app.use('/*', cors());

// Helper: Send Telegram Notification
async function sendTelegramNotification(token, chatId, message, replyMarkup = null) {
  if (!token || !chatId) return;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: message,
    parse_mode: 'Markdown'
  };
  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error('Telegram error:', err);
  }
}

// Helper: Generate Ticket Number (e.g., REQ-20250225-0001)
function generateTicketNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `REQ-${year}${month}${day}-${randomNum}`;
}

// Helper: Map frontend enum values to PostgreSQL ENUM values
function mapJenisLayanan(val) {
  const mapping = {
    'Riset / Penelitian': 'penelitian_riset',
    'Magang / PKL': 'magang_pkl',
    'Konsultasi RKPD': 'konsultasi_rkpd'
  };
  return mapping[val] || 'penelitian_riset';
}

// Health Check
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', service: 'Smart Office Bappeda Edge API', timestamp: new Date().toISOString() });
});

// 1. Permohonan Layanan Publik (Riset / Konsultasi)
app.post('/api/public/permohonan', async (c) => {
  try {
    const body = await c.req.json();
    const { nama_pemohon, instansi, jenis_layanan, perihal, email, no_hp } = body;
    
    const nomor_tiket = generateTicketNumber();
    const dbJenisLayanan = mapJenisLayanan(jenis_layanan);
    
    const supabaseUrl = c.env.SUPABASE_URL;
    const supabaseKey = c.env.SUPABASE_SERVICE_ROLE_KEY;

    const payload = {
      nomor_tiket,
      nama_pemohon,
      instansi,
      jenis_layanan: dbJenisLayanan,
      judul_keperluan: perihal,
      status: 'pending'
    };

    const res = await fetch(`${supabaseUrl}/rest/v1/permohonan_layanan_publik`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(typeof data === 'string' ? data : JSON.stringify(data));

    const ticket = Array.isArray(data) ? data[0] : data;
    if (!ticket) throw new Error('Failed to insert permohonan record');

    // Kirim notifikasi Telegram ke Admin/Kasi terkait
    const msg = `📥 *PERMOHONAN LAYANAN BARU*\n\n*Tiket:* ${nomor_tiket}\n*Nama:* ${nama_pemohon}\n*Instansi:* ${instansi}\n*Jenis:* ${jenis_layanan}\n*Keperluan:* ${perihal}`;
    
    await sendTelegramNotification(c.env.TELEGRAM_BOT_TOKEN, c.env.TELEGRAM_ADMIN_CHAT_ID, msg, {
      inline_keyboard: [
        [
          { text: '✅ Setujui', callback_data: `approve_${ticket.id}` },
          { text: '❌ Tolak', callback_data: `reject_${ticket.id}` }
        ]
      ]
    });

    return c.json({ success: true, message: 'Permohonan berhasil dikirim', data: ticket });
  } catch (err) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// 2. Surat Masuk & Disposisi
app.post('/api/surat/masuk', async (c) => {
  try {
    const body = await c.req.json();
    const { nomor_surat, asal_surat, perihal, tanggal_surat, sifat } = body;
    const supabaseUrl = c.env.SUPABASE_URL;
    const supabaseKey = c.env.SUPABASE_SERVICE_ROLE_KEY;

    const res = await fetch(`${supabaseUrl}/rest/v1/surat_masuk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ nomor_surat, asal_surat, perihal, tanggal_surat, sifat_surat: sifat || 'Biasa' })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(typeof data === 'string' ? data : JSON.stringify(data));

    const surat = Array.isArray(data) ? data[0] : data;
    const msg = `✉️ *SURAT MASUK BARU*\n\n*Nomor:* ${nomor_surat}\n*Asal:* ${asal_surat}\n*Perihal:* ${perihal}\n*Sifat:* ${sifat || 'Biasa'}`;
    await sendTelegramNotification(c.env.TELEGRAM_BOT_TOKEN, c.env.TELEGRAM_ADMIN_CHAT_ID, msg);

    return c.json({ success: true, message: 'Surat masuk tercatat', data: surat });
  } catch (err) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// 3. Telegram Webhook Handler (untuk interaksi tombol inline)
app.post('/api/telegram/webhook', async (c) => {
  try {
    const update = await c.req.json();
    if (update.callback_query) {
      const query = update.callback_query;
      const data = query.data; // e.g., "approve_UUID"
      const [action, id] = data.split('_');

      const supabaseUrl = c.env.SUPABASE_URL;
      const supabaseKey = c.env.SUPABASE_SERVICE_ROLE_KEY;

      const newStatus = action === 'approve' ? 'diverifikasi' : 'ditolak';

      const res = await fetch(`${supabaseUrl}/rest/v1/permohonan_layanan_publik?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (!res.ok) {
        const errData = await res.text();
        console.error('Supabase update error:', errData);
      }

      // Balas callback query Telegram
      await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: query.id, text: `Status berhasil diubah menjadi ${newStatus}` })
      });
    }
    return c.json({ status: 'ok' });
  } catch (err) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

export default app;
