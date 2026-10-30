/* Market Pulse — live prices.
 *
 * Polls the same-origin /api/prices every 15s while the tab is visible and
 * updates each asset card: the big price, a "since the report" change, the
 * quote time/source, and the current-price line on the ladder. The ladder's
 * support/resistance levels stay as published in the report; only the price
 * moves. If the feed is unreachable the report's own prices stay on screen.
 */
(function () {
  'use strict';

  var cards = Array.prototype.slice.call(document.querySelectorAll('.asset[data-asset]'));
  if (!cards.length || !window.fetch) return;

  var INTERVAL = 15000;
  var MAX_INTERVAL = 120000;
  var STALE_MS = 20 * 60 * 1000; // older than this = market closed (gold at weekends)
  var status = document.querySelector('[data-live-status]');
  var FA = '۰۱۲۳۴۵۶۷۸۹';
  var timer = null, delay = INTERVAL, last = {};

  function fa(s) { return String(s).replace(/[0-9]/g, function (d) { return FA[+d]; }); }
  function money(n, dec) { return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
  var clock;
  try { clock = new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch (e) { clock = { format: function (t) { return fa(new Date(t).toTimeString().slice(0, 8)); } }; }

  function setStatus(state) {
    if (!status || status.getAttribute('data-state') === state) return;
    status.setAttribute('data-state', state);
    status.textContent = state === 'live'
      ? 'قیمت‌ها زنده هستند — به‌روزرسانی خودکار هر ۱۵ ثانیه'
      : 'اتصال به قیمت زنده برقرار نشد؛ قیمت‌های زمان گزارش نمایش داده می‌شود';
  }

  function update(card, q) {
    var id = card.getAttribute('data-asset');
    var dec = +card.getAttribute('data-decimals') || 0;
    var report = +card.getAttribute('data-report-price');
    var price = q.price;

    var priceEl = card.querySelector('[data-live-price]');
    priceEl.textContent = '$' + money(price, dec);
    if (last[id] != null && price !== last[id]) {
      var dir = price > last[id] ? 'is-up' : 'is-down';
      priceEl.classList.remove('is-up', 'is-down');
      void priceEl.offsetWidth; // restart the flash animation
      priceEl.classList.add(dir);
    }
    last[id] = price;

    var note = card.querySelector('[data-live-note]');
    var closed = Date.now() - q.ts > STALE_MS;
    note.textContent = (closed ? 'بازار بسته است · آخرین قیمت ' : 'لحظه‌ای · ') + clock.format(q.ts) + ' به وقت تهران · ' + q.source;
    card.classList.toggle('is-live', !closed);

    var chg = card.querySelector('[data-live-chg]');
    if (chg && report) {
      var pct = (price / report - 1) * 100;
      // An arrow instead of +/−: a minus sign next to a number in Persian
      // text gets moved to the wrong side by the bidi algorithm.
      var dir = pct > 0.005 ? 'up' : pct < -0.005 ? 'down' : '';
      chg.textContent = (dir === 'up' ? '▲ ' : dir === 'down' ? '▼ ' : '') + fa(Math.abs(pct).toFixed(2)) + '٪ نسبت به زمان گزارش';
      chg.className = 'asset__chg' + (dir ? ' is-' + dir : '');
      chg.hidden = false;
    }

    var ladder = card.querySelector('.ladder');
    var line = card.querySelector('.ladder__price');
    if (ladder && line) {
      var lo = +ladder.getAttribute('data-lo'), hi = +ladder.getAttribute('data-hi');
      var top = (hi - price) / (hi - lo) * 100;
      line.classList.toggle('is-off-scale', top < 0 || top > 100);
      line.style.setProperty('--t', Math.min(Math.max(top, 0), 100).toFixed(2) + '%');
      var tag = line.querySelector('b');
      if (tag) tag.textContent = money(price, dec);
    }
  }

  function schedule() {
    clearTimeout(timer);
    if (!document.hidden) timer = setTimeout(tick, delay);
  }

  function tick() {
    fetch('/api/prices', { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (data) {
        var got = 0;
        cards.forEach(function (card) {
          var q = data.assets && data.assets[card.getAttribute('data-asset')];
          if (q && q.price > 0) { update(card, q); got++; }
        });
        if (!got) throw new Error('empty');
        setStatus('live');
        delay = INTERVAL;
      })
      .catch(function () {
        if (!Object.keys(last).length) setStatus('error');
        delay = Math.min(delay * 2, MAX_INTERVAL); // back off while the feed is down
      })
      .then(schedule);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) clearTimeout(timer);
    else { clearTimeout(timer); tick(); }
  });
  tick();
})();
