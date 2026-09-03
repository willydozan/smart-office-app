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

// Health Check
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', service: 'Smart Office Bappeda Edge API', timestamp: new Date().toISOString() });
});

// 1. Permohonan Layanan Publik (Riset / Konsultasi)
app.post('/api/public/permohonan', async (c) => {
  try {
    const body = await c.req.json();
    const { nama_pemohon, instansi, jenis_layanan, perihal, email, no_hp } = body;
    
    // Simpan ke Supabase via REST API
    const supabaseUrl = c.env.SUPABASE_URL;
    const supabaseKey = c.env.SUPABASE_SERVICE_ROLE_KEY;

    const res = await fetch(`${supabaseUrl}/rest/v1/permohonan_layanan_publik`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ nama_pemohon, instansi, jenis_layanan, perihal, email, no_hp, status: 'PENDING' })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(data));

    // Kirim notifikasi Telegram ke Admin/Kasi terkait
    const ticket = data[0];
    const msg = `📥 *PERMOHONAN LAYANAN BARU*\n\n*ID:* ${ticket.id}\n*Nama:* ${nama_pemohon}\n*Instansi:* ${instansi}\n*Jenis:* ${jenis_layanan}\n*Perihal:* ${perihal}`;
    
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
      body: JSON.stringify({ nomor_surat, asal_surat, perihal, tanggal_surat, sifat })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(data));

    const surat = data[0];
    const msg = `✉️ *SURAT MASUK BARU*\n\n*Nomor:* ${nomor_surat}\n*Asal:* ${asal_surat}\n*Perihal:* ${perihal}\n*Sifat:* ${sifat}`;
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

      const newStatus = action === 'approve' ? 'DISETUJUI' : 'DITOLAK';

      await fetch(`${supabaseUrl}/rest/v1/permohonan_layanan_publik?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify({ status: newStatus })
      });

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
