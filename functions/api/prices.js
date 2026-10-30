// Cloudflare Pages Function — route: /api/prices
// Live spot prices for the Market Pulse page (gold, bitcoin, ethereum).
//
// The browser only ever talks to this same-origin endpoint, so visitors whose
// network can't reach foreign market APIs still get live prices, and the CSP
// stays at connect-src 'self'. Upstream calls run on Cloudflare's edge, with a
// fallback source for each asset, and the combined answer is edge-cached for a
// few seconds so a burst of visitors costs one upstream request.

const CACHE_SECONDS = 8;
const TIMEOUT_MS = 4000;

const SOURCES = {
  swissquote: 'https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/XAU/USD',
  goldApi: 'https://api.gold-api.com/price/XAU',
  kraken: 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD,ETHUSD',
  coinbase: (sym) => `https://api.coinbase.com/v2/prices/${sym}-USD/spot`,
};

async function getJSON(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json', 'user-agent': 'BluePyramid-MarketPulse/1.0' } });
    if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const valid = (n) => Number.isFinite(n) && n > 0;

async function gold() {
  try {
    const feed = await getJSON(SOURCES.swissquote);
    const book = feed[0];
    const q = book.spreadProfilePrices.find((p) => p.spreadProfile === 'elite') || book.spreadProfilePrices[0];
    const price = (q.bid + q.ask) / 2;
    if (!valid(price)) throw new Error('swissquote: bad price');
    return { price, ts: book.ts, source: 'Swissquote' };
  } catch (e) {
    console.warn('prices: gold primary failed —', e.message);
    const d = await getJSON(SOURCES.goldApi);
    if (!valid(d.price)) throw new Error('gold-api: bad price');
    return { price: d.price, ts: Date.parse(d.updatedAt) || Date.now(), source: 'gold-api.com' };
  }
}

async function crypto() {
  try {
    const d = await getJSON(SOURCES.kraken);
    if (d.error && d.error.length) throw new Error('kraken: ' + d.error.join(', '));
    const pick = (t) => ({ price: Number(t.c[0]), open: Number(t.o), ts: Date.now(), source: 'Kraken' });
    const btc = pick(d.result.XXBTZUSD), eth = pick(d.result.XETHZUSD);
    if (!valid(btc.price) || !valid(eth.price)) throw new Error('kraken: bad price');
    return { btc, eth };
  } catch (e) {
    console.warn('prices: crypto primary failed —', e.message);
    const [b, x] = await Promise.all([getJSON(SOURCES.coinbase('BTC')), getJSON(SOURCES.coinbase('ETH'))]);
    const mk = (r) => ({ price: Number(r.data.amount), ts: Date.now(), source: 'Coinbase' });
    return { btc: mk(b), eth: mk(x) };
  }
}

function json(body, status, maxAge) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': maxAge ? `public, max-age=${maxAge}, s-maxage=${maxAge}` : 'no-store',
    },
  });
}

export async function onRequestGet(context) {
  const cache = caches.default;
  const key = new Request(new URL('/api/prices', context.request.url).toString(), { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;

  const [g, c] = await Promise.allSettled([gold(), crypto()]);
  const assets = {
    xau: g.status === 'fulfilled' ? g.value : null,
    btc: c.status === 'fulfilled' ? c.value.btc : null,
    eth: c.status === 'fulfilled' ? c.value.eth : null,
  };
  if (g.status === 'rejected') console.error('prices: gold unavailable —', g.reason && g.reason.message);
  if (c.status === 'rejected') console.error('prices: crypto unavailable —', c.reason && c.reason.message);

  const any = assets.xau || assets.btc || assets.eth;
  const res = json({ ok: !!any, ts: Date.now(), assets }, any ? 200 : 503, any ? CACHE_SECONDS : 0);
  if (any) context.waitUntil(cache.put(key, res.clone()));
  return res;
}

export async function onRequest() {
  return json({ ok: false, error: 'method_not_allowed' }, 405, 0);
}
