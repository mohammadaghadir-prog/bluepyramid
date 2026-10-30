/* Market Pulse — live prices.
 *
 * Polls the same-origin /api/prices every 15s while the tab is visible and
 * updates each asset card (price with an up/down flash, quote time, source).
 * If the feed is unreachable the status line says so and polling backs off.
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
      : 'اتصال به قیمت لحظه‌ای برقرار نشد؛ دوباره تلاش می‌کنیم…';
  }

  function update(card, q) {
    var id = card.getAttribute('data-asset');
    var dec = +card.getAttribute('data-decimals') || 0;
    var price = q.price;

    var priceEl = card.querySelector('[data-live-price]');
    var prefix = card.hasAttribute('data-prefix') ? card.getAttribute('data-prefix') : '$';
    priceEl.textContent = prefix + money(price, dec);
    if (last[id] != null && price !== last[id]) {
      var dir = price > last[id] ? 'is-up' : 'is-down';
      priceEl.classList.remove('is-up', 'is-down');
      void priceEl.offsetWidth; // restart the flash animation
      priceEl.classList.add(dir);
    }
    last[id] = price;

    var note = card.querySelector('[data-live-note]');
    var age = Date.now() - q.ts;
    var closed = age > STALE_MS;
    // Some feeds (Brent futures via Yahoo) publish with a few minutes' delay;
    // say so instead of calling them live.
    var label = closed ? 'بازار بسته است · آخرین قیمت ' : age > 2 * 60 * 1000 ? 'با تأخیر · ' : 'لحظه‌ای · ';
    note.textContent = label + clock.format(q.ts) + ' به وقت تهران · ' + q.source;
    card.classList.toggle('is-live', !closed);
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

/* Economic calendar: category filter + "next important event" line. */
(function () {
  'use strict';
  var cal = document.querySelector('[data-cal]');
  if (!cal) return;
  var FA = '۰۱۲۳۴۵۶۷۸۹';
  function fa(s) { return String(s).replace(/[0-9]/g, function (d) { return FA[+d]; }); }

  Array.prototype.forEach.call(document.querySelectorAll('.cal-chip'), function (chip) {
    chip.addEventListener('click', function () {
      var on = chip.getAttribute('aria-pressed') !== 'true';
      chip.setAttribute('aria-pressed', String(on));
      cal.classList.toggle('hide-' + chip.getAttribute('data-cat'), !on);
    });
  });

  var next = document.querySelector('[data-cal-next]');
  if (!next) return;
  var now = Date.now();
  var evs = Array.prototype.slice.call(cal.querySelectorAll('.tl__ev:not(.tl__ev--muted)'));
  var upcoming = evs.map(function (li) {
    var t = li.querySelector('time').getAttribute('datetime');
    var ms = Date.parse(t.length > 10 ? t : t + 'T00:00:00Z');
    return { li: li, ms: ms, allDay: t.length <= 10 };
  }).filter(function (x) { return x.ms + (x.allDay ? 864e5 : 0) > now; })
    .sort(function (a, b) { return a.ms - b.ms; })[0];
  if (!upcoming) return;
  var hours = (upcoming.ms - now) / 36e5;
  var rel = hours < 1 ? 'کمتر از یک ساعت دیگر' : hours < 24 ? fa(Math.round(hours)) + ' ساعت دیگر' : fa(Math.ceil(hours / 24)) + ' روز دیگر';
  next.textContent = 'رویداد مهم بعدی: ' + upcoming.li.querySelector('b').textContent + ' — ' +
    upcoming.li.querySelector('time').textContent + ' (' + rel + ')';
  next.hidden = false;
  upcoming.li.classList.add('is-next');
})();
