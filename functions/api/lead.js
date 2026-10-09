// Cloudflare Pages Function — route: /api/lead
// Sends every Blue Pyramid consultation request to Telegram, instantly.
// Secrets are read from environment variables (set in the Cloudflare Pages dashboard):
//   TELEGRAM_BOT_TOKEN  — token from @BotFather
//   TELEGRAM_CHAT_ID    — your personal chat id (or a group/channel id)
//
// The form posts here from our own pages only, so there is deliberately no
// CORS allowance: browsers block cross-site calls, which keeps third-party
// sites from using this endpoint as a free spam relay.

const MAX_BODY = 16 * 1024; // bytes
const LIMITS = { name: 100, phone: 30, email: 120, company: 120, industry: 60, service: 60, message: 2000 };
const MIN_FILL_SECONDS = 3; // humans need longer than this to fill the form

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

const esc = (s) =>
  String(s == null ? '' : s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

const line = (label, val) => (val ? `<b>${label}:</b> ${esc(val)}\n` : '');

function clean(v, max) {
  return String(v == null ? '' : v)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

function normDigits(s) {
  return s
    .replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
}

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true; // same-origin navigations and non-browser clients omit it
  return origin === new URL(request.url).origin;
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ ok: false, error: 'forbidden' }, 403);

  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) return json({ ok: false, error: 'too_large' }, 413);

  let data = {};
  try {
    const ct = (request.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('application/json')) {
      const raw = await request.text();
      if (raw.length > MAX_BODY) return json({ ok: false, error: 'too_large' }, 413);
      data = JSON.parse(raw);
    } else {
      const fd = await request.formData();
      for (const [k, v] of fd.entries()) data[k] = typeof v === 'string' ? v : '';
    }
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400);
  }
  if (!data || typeof data !== 'object') return json({ ok: false, error: 'bad_request' }, 400);

  // Bots: a filled honeypot or an instant submit gets a silent "ok".
  if (data._gotcha) return json({ ok: true }, 200);
  const elapsed = Number(data._elapsed);
  if (Number.isFinite(elapsed) && elapsed < MIN_FILL_SECONDS) return json({ ok: true }, 200);

  const f = {};
  for (const k of Object.keys(LIMITS)) f[k] = clean(data[k], LIMITS[k]);
  f.phone = normDigits(f.phone);

  if (!f.name || !f.phone) return json({ ok: false, error: 'missing_fields' }, 422);
  if (!/^(\+|00)?[\d\s\-().]{8,20}$/.test(f.phone)) return json({ ok: false, error: 'invalid_phone' }, 422);
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email)) return json({ ok: false, error: 'invalid_email' }, 422);

  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error('lead: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not configured');
    return json({ ok: false, error: 'not_configured' }, 503);
  }

  const when = new Date().toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' });
  const lang = data._lang === 'en' ? 'EN' : 'FA';
  const text =
    '🔔 <b>درخواست مشاوره جدید — هرم آبی</b>\n\n' +
    line('نام', f.name) +
    line('تلفن', f.phone) +
    line('ایمیل', f.email) +
    line('شرکت', f.company) +
    line('حوزه', f.industry) +
    line('خدمت', f.service) +
    line('توضیح', f.message) +
    `\n🌐 ${lang}  ·  🕒 ${esc(when)}`;

  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    if (!resp.ok) {
      console.error('lead: telegram responded', resp.status, await resp.text());
      return json({ ok: false, error: 'delivery_failed' }, 502);
    }
  } catch (e) {
    console.error('lead: telegram request failed', e);
    return json({ ok: false, error: 'delivery_failed' }, 502);
  }
  return json({ ok: true }, 200);
}

export async function onRequest() {
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}
