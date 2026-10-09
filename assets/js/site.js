/* Blue Pyramid — shared page behaviour.
 *
 * Every page ships its copy in both languages inside
 *   <script type="application/json" id="i18n">{ "fa": {…}, "en": {…} }</script>
 * (JSON, so it never executes and the CSP can forbid inline scripts).
 * Elements opt in with:
 *   data-i18n="key"              → innerHTML
 *   data-i18n-attr="attr:key,…"  → attributes (placeholder, aria-label, content …)
 * Persian is the default and the copy that ships in the HTML, so crawlers and
 * no-JS visitors always get a complete page.
 */
(function () {
  'use strict';

  var doc = document.documentElement;
  doc.classList.add('js');

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(pointer: fine)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ------------------------------------------------------------------ i18n */
  var COMMON = {
    fa: {
      skip: 'رفتن به محتوای اصلی',
      navServices: 'خدمات', navMethod: 'متدولوژی', navCases: 'نمونه‌کارها', navFaq: 'سؤالات', navAbout: 'درباره ما', navContact: 'تماس',
      navCta: 'مشاوره رایگان', menuOpen: 'باز کردن منو', menuClose: 'بستن منو', langLabel: 'EN — English version', langText: 'EN',
      brandLabel: 'هرم آبی — صفحه اصلی', quickContact: 'تماس سریع',
      navHome: 'خانه', toTop: 'بازگشت به بالا', callNow: 'تماس تلفنی',
      footerAbout: 'مشاوره استراتژیک و مالی داده‌محور برای سازمان‌ها، استارتاپ‌ها و سرمایه‌گذاران — از تشخیص مسئله تا پایش نتایج.',
      footerExplore: 'دسترسی سریع', footerCompany: 'شرکت', footerContact: 'ارتباط با ما',
      footerPrivacy: 'حریم خصوصی', footerTerms: 'شرایط و ضوابط', footerCity: 'تهران، ایران',
      footerCopy: '© ۱۴۰۴ هرم آبی — تمامی حقوق محفوظ است.', footerMade: 'Blue Pyramid Consulting'
    },
    en: {
      skip: 'Skip to main content',
      navServices: 'Services', navMethod: 'Method', navCases: 'Case Studies', navFaq: 'FAQ', navAbout: 'About', navContact: 'Contact',
      navCta: 'Free Consultation', menuOpen: 'Open menu', menuClose: 'Close menu', langLabel: 'FA — Persian version', langText: 'FA',
      brandLabel: 'Blue Pyramid — Home', quickContact: 'Quick contact',
      navHome: 'Home', toTop: 'Back to top', callNow: 'Call now',
      footerAbout: 'Data-driven strategic and financial consulting for organizations, startups and investors — from diagnosis to measurable results.',
      footerExplore: 'Explore', footerCompany: 'Company', footerContact: 'Get in touch',
      footerPrivacy: 'Privacy', footerTerms: 'Terms', footerCity: 'Tehran, Iran',
      footerCopy: '© 2025 Blue Pyramid — All rights reserved.', footerMade: 'Blue Pyramid Consulting'
    }
  };

  var PAGE = { fa: {}, en: {} };
  var pageData = $('#i18n');
  if (pageData) {
    try { PAGE = JSON.parse(pageData.textContent); } catch (e) { /* keep defaults */ }
  }
  function dict(lang) {
    var out = {}, k;
    for (k in COMMON[lang]) out[k] = COMMON[lang][k];
    for (k in (PAGE[lang] || {})) out[k] = PAGE[lang][k];
    return out;
  }

  // Persian is the source copy in the markup: snapshot it so we can switch back
  // without the JSON having to duplicate every Persian string.
  var original = new Map();
  $$('[data-i18n]').forEach(function (el) { original.set(el, el.innerHTML); });
  var originalAttrs = new Map();
  $$('[data-i18n-attr]').forEach(function (el) {
    var snap = {};
    el.getAttribute('data-i18n-attr').split(',').forEach(function (pair) {
      var a = pair.split(':')[0].trim();
      snap[a] = el.getAttribute(a);
    });
    originalAttrs.set(el, snap);
  });
  var originalTitle = document.title;

  function getLang() {
    var q = new URLSearchParams(location.search).get('lang');
    if (q === 'en' || q === 'fa') return q;
    try { return localStorage.getItem('bp-lang') || 'fa'; } catch (e) { return 'fa'; }
  }

  var current = 'fa';
  function setLang(lang, persist) {
    current = lang;
    var d = dict(lang);
    doc.lang = lang;
    doc.dir = lang === 'fa' ? 'rtl' : 'ltr';

    $$('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (lang === 'fa' && original.has(el)) el.innerHTML = original.get(el);
      else if (d[key] != null) el.innerHTML = d[key];
    });
    $$('[data-i18n-attr]').forEach(function (el) {
      el.getAttribute('data-i18n-attr').split(',').forEach(function (pair) {
        var parts = pair.split(':'), attr = parts[0].trim(), key = (parts[1] || '').trim();
        var snap = originalAttrs.get(el) || {};
        if (lang === 'fa' && snap[attr] != null) el.setAttribute(attr, snap[attr]);
        else if (d[key] != null) el.setAttribute(attr, d[key]);
      });
    });
    if (d.pageTitle && lang === 'en') document.title = d.pageTitle;
    else document.title = originalTitle;

    var t = $('#lang-toggle');
    if (t) { t.textContent = d.langText; t.setAttribute('aria-label', d.langLabel); }
    updateMenuLabel();
    if (persist) { try { localStorage.setItem('bp-lang', lang); } catch (e) {} }
    document.dispatchEvent(new CustomEvent('bp:lang', { detail: lang }));
  }

  /* ------------------------------------------------------------ navigation */
  var nav = $('.site-nav');
  var menuBtn = $('#menu-btn');
  var menu = $('#nav-menu');
  function updateMenuLabel() {
    if (!menuBtn) return;
    var open = menuBtn.getAttribute('aria-expanded') === 'true';
    menuBtn.setAttribute('aria-label', dict(current)[open ? 'menuClose' : 'menuOpen']);
  }
  function setMenu(open) {
    if (!menuBtn || !menu) return;
    menuBtn.setAttribute('aria-expanded', String(open));
    menu.classList.toggle('is-open', open);
    updateMenuLabel();
  }
  if (menuBtn) {
    menuBtn.addEventListener('click', function () { setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'); });
    $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
    document.addEventListener('click', function (e) {
      if (menu.classList.contains('is-open') && !menu.contains(e.target) && !menuBtn.contains(e.target)) setMenu(false);
    });
  }
  var lt = $('#lang-toggle');
  if (lt) lt.addEventListener('click', function () { setLang(current === 'fa' ? 'en' : 'fa', true); });

  /* active section highlighting */
  var sectionLinks = $$('.nav-links a[href^="#"], .nav-links a[href^="/#"]');
  if (sectionLinks.length && 'IntersectionObserver' in window) {
    var byId = {};
    sectionLinks.forEach(function (a) { byId[a.getAttribute('href').replace('/', '').slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        sectionLinks.forEach(function (a) { a.removeAttribute('aria-current'); });
        var a = byId[en.target.id];
        if (a) a.setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(byId).forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
  }

  /* ---------------------------------------------- scroll-driven chrome */
  var progress = $('.progress');
  var toTop = $('.to-top');
  var mobileCta = $('.mobile-cta');
  var contact = $('#contact');
  var contactVisible = false;
  if (contact && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (en) { contactVisible = en[0].isIntersecting; onScroll(); }, { threshold: 0.05 }).observe(contact);
  }
  var ticking = false;
  function onScroll() {
    var y = window.scrollY, h = document.documentElement.scrollHeight - window.innerHeight;
    if (nav) nav.classList.toggle('is-scrolled', y > 24);
    if (progress) progress.style.transform = 'scaleX(' + (h > 0 ? Math.min(y / h, 1) : 0) + ')';
    if (toTop) toTop.classList.toggle('is-visible', y > window.innerHeight * 1.2);
    if (mobileCta) mobileCta.classList.toggle('is-visible', y > window.innerHeight * 0.6 && !contactVisible);
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(onScroll); }
  }, { passive: true });
  window.requestAnimationFrame(onScroll); // first read after layout settles, not mid-parse
  if (toTop) toTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); });

  /* ------------------------------------------------------- reveal on scroll */
  function initReveal() {
    var targets = $$('[data-reveal]');
    if (!('IntersectionObserver' in window) || reduced) {
      targets.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var ro = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); ro.unobserve(en.target); }
      });
    }, { threshold: 0, rootMargin: '0px 0px -8% 0px' });
    targets.forEach(function (el) { ro.observe(el); });
  }

  /* ----------------------------------------------------- animated counters */
  var FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  function toLatin(s) { return String(s).replace(/[۰-۹]/g, function (c) { return FA_DIGITS.indexOf(c); }); }
  function toFa(s) { return String(s).replace(/[0-9]/g, function (c) { return FA_DIGITS[+c]; }); }
  var countGen = 0; // bumped on language change so in-flight counters stop writing stale digits
  document.addEventListener('bp:lang', function () { countGen++; });
  function animateCount(el) {
    var gen = countGen;
    var raw = el.textContent.trim();
    var latin = toLatin(raw);
    var m = latin.match(/^(\D*)(\d+)(.*)$/);
    if (!m || reduced) return;
    var useFa = /[۰-۹]/.test(raw);
    var target = +m[2], start = null, dur = 1600;
    function frame(ts) {
      if (gen !== countGen) return;
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1), e = 1 - Math.pow(1 - p, 4);
      var txt = m[1] + Math.round(target * e) + m[3];
      el.textContent = useFa ? toFa(txt) : txt;
      if (p < 1) window.requestAnimationFrame(frame);
      else el.textContent = raw;
    }
    window.requestAnimationFrame(frame);
  }
  function initCounters() {
    var els = $$('[data-count]');
    if (!els.length || !('IntersectionObserver' in window)) return;
    var co = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { animateCount(en.target); co.unobserve(en.target); }
      });
    }, { threshold: 0.6 });
    els.forEach(function (el) { co.observe(el); });
  }

  /* ---------------------------------- pointer effects (fine pointers only) */
  function initPointerFx() {
    if (!finePointer || reduced) return;
    $$('.card').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        card.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });
    $$('[data-tilt]').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
        card.style.setProperty('--ry', (px * 7).toFixed(2) + 'deg');
        card.style.setProperty('--rx', (-py * 7).toFixed(2) + 'deg');
      });
      card.addEventListener('pointerleave', function () {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    });
    $$('[data-magnetic]').forEach(function (btn) {
      btn.addEventListener('pointermove', function (e) {
        var r = btn.getBoundingClientRect();
        btn.style.setProperty('--mx', ((e.clientX - r.left - r.width / 2) * 0.18).toFixed(1) + 'px');
        btn.style.setProperty('--my', ((e.clientY - r.top - r.height / 2) * 0.28).toFixed(1) + 'px');
      });
      btn.addEventListener('pointerleave', function () {
        btn.style.setProperty('--mx', '0px');
        btn.style.setProperty('--my', '0px');
      });
    });
  }

  /* ---------------------------------------------- methodology timeline */
  function initTimeline() {
    var tl = $('.timeline');
    if (!tl) return;
    var rail = $('.timeline__rail span', tl);
    var steps = $$('.step', tl);
    function update() {
      var r = tl.getBoundingClientRect();
      var vh = window.innerHeight;
      var p = Math.min(Math.max((vh * 0.75 - r.top) / (r.height + vh * 0.25), 0), 1);
      if (reduced) p = 1;
      if (rail) rail.style.setProperty('--p', p.toFixed(3));
      steps.forEach(function (s, i) { s.classList.toggle('is-active', p >= i / steps.length + 0.02); });
    }
    window.addEventListener('scroll', function () { window.requestAnimationFrame(update); }, { passive: true });
    window.requestAnimationFrame(update);
  }

  /* ---------------------------------------------------------------- form */
  function initForm() {
    var form = $('#lead-form');
    if (!form) return;
    var card = form.closest('.form-card');
    var status = $('.form-status', card);
    var btn = $('.form-submit', form);
    var started = Date.now();

    var MSG = {
      fa: { required: 'این فیلد الزامی است.', phone: 'شماره تماس معتبر نیست (مثال: ۰۹۱۲۳۴۵۶۷۸۹).', email: 'ایمیل معتبر نیست.', fail: 'ارسال انجام نشد. لطفاً دوباره تلاش کنید یا مستقیم تماس بگیرید: ۰۹۲۰۷۴۱۳۱۷۵' },
      en: { required: 'This field is required.', phone: 'Please enter a valid phone number.', email: 'Please enter a valid email.', fail: 'Something went wrong. Please try again or call us at +98 920 741 3175.' }
    };
    function normDigits(s) {
      return String(s).replace(/[۰-۹]/g, function (c) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(c); })
        .replace(/[٠-٩]/g, function (c) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(c); });
    }
    function validPhone(v) {
      var d = normDigits(v).replace(/[\s\-().]/g, '');
      return /^(\+|00)?\d{8,15}$/.test(d);
    }
    function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }

    function check(input) {
      var field = input.closest('.field');
      var err = field && $('.field__error', field);
      var v = input.value.trim(), m = MSG[current], msg = '';
      if (input.required && !v) msg = m.required;
      else if (input.type === 'tel' && v && !validPhone(v)) msg = m.phone;
      else if (input.type === 'email' && v && !validEmail(v)) msg = m.email;
      if (field) field.classList.toggle('has-error', !!msg);
      if (err) err.textContent = msg;
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      return !msg;
    }
    var inputs = $$('input, textarea', form).filter(function (i) { return i.name && i.name.charAt(0) !== '_'; });
    inputs.forEach(function (i) {
      i.addEventListener('blur', function () { if (i.value) check(i); });
      i.addEventListener('input', function () { if (i.closest('.field').classList.contains('has-error')) check(i); });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      status.className = 'form-status';
      var ok = true, firstBad = null;
      inputs.forEach(function (i) { if (!check(i)) { ok = false; firstBad = firstBad || i; } });
      if (!ok) { firstBad.focus(); return; }

      var fd = new FormData(form);
      fd.set('phone', normDigits(fd.get('phone') || ''));
      fd.set('_elapsed', String(Math.round((Date.now() - started) / 1000)));
      fd.set('_lang', current);
      var payload = {};
      fd.forEach(function (v, k) { payload[k] = v; });

      btn.disabled = true;
      btn.classList.add('is-loading');

      // Two independent channels: Formspree (email record) and our own
      // /api/lead (instant Telegram ping). Success if either one lands.
      var toFormspree = fetch(form.action, { method: 'POST', body: fd, headers: { Accept: 'application/json' } })
        .then(function (r) { return r.ok; }).catch(function () { return false; });
      var toTelegram = fetch('/api/lead', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), keepalive: true })
        .then(function (r) { return r.ok; }).catch(function () { return false; });

      Promise.all([toFormspree, toTelegram]).then(function (res) {
        btn.disabled = false;
        btn.classList.remove('is-loading');
        if (res[0] || res[1]) {
          card.classList.add('is-sent');
          var s = $('.form-success', card);
          if (s) { s.setAttribute('tabindex', '-1'); s.focus({ preventScroll: true }); }
          form.reset();
        } else {
          status.textContent = MSG[current].fail;
          status.className = 'form-status is-error';
        }
      });
    });
  }

  /* --------------------------------------------------------------- intro */
  function initIntro() {
    var intro = $('#intro');
    // head.js already decided (before first paint) whether the intro plays.
    if (!intro) return Promise.resolve();
    if (!doc.classList.contains('has-intro') || !window.BPPyramid) {
      doc.classList.remove('has-intro');
      intro.remove();
      return Promise.resolve();
    }
    try { sessionStorage.setItem('bp-intro', '1'); } catch (e) {}

    return new Promise(function (resolve) {
      var done = false;
      function end() {
        if (done) return;
        done = true;
        intro.classList.add('is-done');
        doc.classList.remove('has-intro'); // releases the hero entrance animation
        resolve();
        setTimeout(function () { intro.remove(); }, 900);
      }
      $('.intro__skip', intro).addEventListener('click', end);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') end(); });
      setTimeout(end, 6000); // never leave the site locked behind the intro
      window.BPPyramid.mount($('canvas', intro), {
        mode: 'intro',
        onReveal: function () { intro.classList.add('is-reveal'); },
        onEnd: end
      });
    });
  }

  /* ------------------------------------------------------------------ boot */
  setLang(getLang(), false);
  initIntro().then(function () {
    initReveal();
    var hero = $('#hero-canvas');
    if (hero && window.BPPyramid) window.BPPyramid.mount(hero, { mode: 'hero' });
    var mini = $('#mini-canvas');
    if (mini && window.BPPyramid) window.BPPyramid.mount(mini, { mode: 'mini' });
  });
  initCounters();
  initPointerFx();
  initTimeline();
  initForm();
})();
