// Cloudflare Pages Function — route: /api/lead
// Sends every Blue Pyramid signup/consultation submission to Telegram, instantly.
// Secrets are read from environment variables (set in the Cloudflare Pages dashboard):
//   TELEGRAM_BOT_TOKEN  — token from @BotFather
//   TELEGRAM_CHAT_ID    — your personal chat id (or a group/channel id)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  });
}

const esc = (s) =>
  String(s == null ? '' : s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

const line = (label, val) => (val && String(val).trim() ? `<b>${label}:</b> ${esc(val)}\n` : '');

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestPost({ request, env }) {
  try {
    // --- parse body (accepts JSON or form-encoded) ---
    let data = {};
    const ct = (request.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('application/json')) {
      data = await request.json();
    } else {
      const fd = await request.formData();
      for (const [k, v] of fd.entries()) data[k] = v;
    }

    // --- silent spam / honeypot guard ---
    if (data._gotcha) return json({ ok: true }, 200);

    const token = env.TELEGRAM_BOT_TOKEN;
    const chatId = env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
      return json({ ok: false, error: 'telegram_not_configured' }, 500);
    }

    // --- build the message ---
    const when = new Date().toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' });
    const text =
      '🔔 <b>ثبت‌نام جدید — هرم آبی</b>\n\n' +
      line('نام', data.name) +
      line('تلفن', data.phone) +
      line('ایمیل', data.email) +
      line('شرکت', data.company) +
      line('حوزه', data.industry) +
      line('خدمت', data.service) +
      line('توضیح', data.message) +
      `\n🕒 ${esc(when)}`;

    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      return json({ ok: false, error: 'telegram_send_failed', detail }, 502);
    }
    return json({ ok: true }, 200);
  } catch (e) {
    return json({ ok: false, error: String(e && e.message ? e.message : e) }, 500);
  }
}
