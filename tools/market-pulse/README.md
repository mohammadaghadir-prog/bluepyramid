# نبض بازار (Market Pulse)

`/market-pulse` shows live prices for gold, bitcoin and ethereum and a 3-month economic calendar.
It carries no market analysis.

- `data.json` — the three assets (name, pair, colour, decimals), the disclaimer and the source note.
- Live prices: `assets/js/market-pulse.js` polls `/api/prices` (functions/api/prices.js) every 15s.
  Gold = Swissquote spot mid (fallback gold-api.com); BTC/ETH = Kraken (fallback Coinbase); the
  endpoint is edge-cached for 8s.
- Calendar: `calendar.json` is **generated** — don't edit it by hand.
  `.github/workflows/market-calendar.yml` runs `update_calendar.py` daily: it reads the Fed, ECB,
  BEA and BLS schedules, computes crypto expiries and US market holidays, rolls the window
  forward, rebuilds the page and commits if anything changed. Per-source results are in
  `calendar-status.json`. One-off events (e.g. elections) and BLS fallback dates go in
  `calendar-manual.json`.
- After changing `data.json`, `cal.py` or the template, run `python tools/market-pulse/build.py`
  from the repo root; it rewrites `market-pulse.html`, `assets/css/market-pulse.gen.css` and
  `assets/data/market-calendar.ics`, and updates the sitemap date.
- `/tools/` is blocked from being served by `functions/_middleware.js`.
