# نبض بازار (Market Pulse) — how to publish a new edition

The page `/market-pulse` is generated from one file: `data.json`.

1. Edit `tools/market-pulse/data.json` with the new report:
   - `reportDate` (YYYY-MM-DD), `dateFa`, `dateLine`, `headline`
   - `horizonDate` / `horizonFa`: the date the ladders, events and scenarios run to
   - `countdowns`: upcoming dates shown as chips under the title
   - `assets`: price, levels (`[low, high]` = zone, `[value]` = single line), 1σ range, stats
   - `drivers`, `scenarios`, `disclaimer`, `source`
   - The 3-month economic calendar (`calendar.json`) is **generated** — don't edit it by hand.
     `.github/workflows/market-calendar.yml` runs `update_calendar.py` daily: it reads the Fed, ECB,
     BEA and BLS schedules, computes crypto expiries and US market holidays, rolls the window
     forward, rebuilds the page and commits if anything changed. Per-source results are in
     `calendar-status.json`. One-off events (e.g. elections) and BLS fallback dates go in
     `calendar-manual.json`.
2. Run `python tools/market-pulse/build.py` from the repo root.
   This rewrites `market-pulse.html`, `assets/css/market-pulse.gen.css` and
   `assets/data/market-calendar.ics` (the "add to my calendar" file), and updates the sitemap date.
3. Commit and push to `main`; Cloudflare Pages deploys it.

Notes
- Prices are live: `assets/js/market-pulse.js` polls `/api/prices` (functions/api/prices.js) every 15s.
  Gold = Swissquote spot mid (fallback gold-api.com); BTC/ETH = Kraken (fallback Coinbase). The
  endpoint is edge-cached for 8s. The levels, stats and scenarios still come from data.json.
- Levels above the current price are drawn as resistance (red), below as support (green).
- Countdown chips and the timeline's "today" marker are recalculated in the visitor's browser,
  so past dates show as «برگزار شد» automatically.
- `/tools/` is blocked from being served by `functions/_middleware.js`.
