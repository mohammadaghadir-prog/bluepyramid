# نبض بازار (Market Pulse) — how to publish a new edition

The page `/market-pulse` is generated from one file: `data.json`.

1. Edit `tools/market-pulse/data.json` with the new report:
   - `reportDate` (YYYY-MM-DD), `dateFa`, `dateLine`, `headline`
   - `horizonDate` / `horizonFa`: the date the ladders, events and scenarios run to
   - `countdowns`: upcoming dates shown as chips under the title
   - `assets`: price, levels (`[low, high]` = zone, `[value]` = single line), 1σ range, stats
   - `drivers`, `events`, `scenarios`, `disclaimer`, `source`
2. Run `python tools/market-pulse/build.py` from the repo root.
   This rewrites `market-pulse.html` and `assets/css/market-pulse.gen.css` and updates the sitemap date.
3. Commit and push to `main`; Cloudflare Pages deploys it.

Notes
- Prices are live: `assets/js/market-pulse.js` polls `/api/prices` (functions/api/prices.js) every 15s.
  Gold = Swissquote spot mid (fallback gold-api.com); BTC/ETH = Kraken (fallback Coinbase). The
  endpoint is edge-cached for 8s. The levels, stats and scenarios still come from data.json.
- Levels above the current price are drawn as resistance (red), below as support (green).
- Countdown chips and the timeline's "today" marker are recalculated in the visitor's browser,
  so past dates show as «برگزار شد» automatically.
- `/tools/` is blocked from being served by `functions/_middleware.js`.
