"""Build the «نبض بازار» (Market Pulse) page from data.json.

    python tools/market-pulse/build.py

Writes:
  market-pulse.html                 the page (static HTML, served at /market-pulse)
  assets/css/market-pulse.gen.css   ladder/timeline positions (the CSP forbids
                                    inline style attributes, so geometry lives here)
and refreshes the /market-pulse <lastmod> in sitemap.xml.

The page chrome (head icons/fonts, nav, footer) is copied from about.html so
the header and footer always match the rest of the site.
"""
import hashlib
import html
import json
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
SITE = 'https://bluepyramid.pages.dev'
FA_DIGITS = str.maketrans('0123456789', '۰۱۲۳۴۵۶۷۸۹')

e = html.escape


def fa(n):
    return str(n).translate(FA_DIGITS)


PERSIAN = re.compile(r'[؀-ۿ]')
NUM = re.compile(r'\$?\d[\d,.]*(?:\s*[–-]\s*\$?\d[\d,.]*)?[%MK]?')


def val(text):
    """Escape a value for an RTL page so Latin numbers keep their order.

    Inside Persian text a range like 4,200–4,226 would be shown reversed by the
    bidi algorithm, so each number/range is isolated as LTR. A value with no
    Persian at all is isolated as a whole."""
    t = e(text)
    if not PERSIAN.search(text):
        return f'<span class="ltr">{t}</span>'
    return NUM.sub(lambda m: f'<span class="ltr">{m.group(0)}</span>', t)


def d(s):
    return date.fromisoformat(s)


def fmt(v):
    return f'{v:,.0f}' if float(v).is_integer() else f'{v:,}'


# ---------------------------------------------------------------- chrome
def chrome():
    about = (ROOT / 'about.html').read_text(encoding='utf-8')
    head = about[about.index('  <link rel="icon"'):about.index('  <script type="application/ld+json">')]
    top = about[about.index('<body>'):about.index('<main id="main">')]
    foot = about[about.index('<footer class="site-footer">'):about.index('<script type="application/json" id="i18n">')]
    top = top.replace(' aria-current="page" data-i18n="navAbout"', ' data-i18n="navAbout"')
    marker = '<a href="/market-pulse" class="nav-pulse" data-i18n="navPulse">'
    assert marker in top, 'nav link to /market-pulse missing in about.html'
    top = top.replace(marker, '<a href="/market-pulse" class="nav-pulse" aria-current="page" data-i18n="navPulse">')
    return head, top, foot


# ---------------------------------------------------------------- sections
def countdowns(data):
    rd = d(data['reportDate'])
    out = []
    for c in data['countdowns']:
        days = (d(c['date']) - rd).days
        out.append(
            f'<li class="cd" data-until="{c["date"]}">'
            f'<span class="cd__num">{fa(days)}</span>'
            f'<span class="cd__unit">روز تا</span> '
            f'<span class="cd__what">{e(c["label"])}</span></li>')
    return '\n          '.join(out)


def ladder(asset, css):
    vals = [v for lv in asset['levels'] for v in lv] + list(asset['sigma']) + [asset['price']]
    lo, hi = min(vals), max(vals)
    pad = (hi - lo) * 0.05
    lo, hi = lo - pad, hi + pad

    def top(v):
        return (hi - v) / (hi - lo) * 100

    aid = asset['id']
    items = []
    for i, lv in enumerate(asset['levels'], 1):
        a, b = min(lv), max(lv)
        kind = 'res' if a > asset['price'] else 'sup'
        shape = 'zone' if len(lv) == 2 else 'line'
        t = top(b)
        h = max(top(a) - t, 0.9) if shape == 'zone' else 0
        css.append(f'#lad-{aid} .l{i}{{--t:{t:.2f}%;--h:{h:.2f}%}}')
        label = f'{fmt(a)}–{fmt(b)}' if shape == 'zone' else fmt(a)
        role = 'مقاومت' if kind == 'res' else 'حمایت'
        items.append(
            f'<li class="lv lv--{kind} lv--{shape} l{i}"><span class="lv__band" aria-hidden="true"></span>'
            f'<span class="lv__lbl"><span class="sr-only">{role}: </span>{label}</span></li>')
    s_lo, s_hi = asset['sigma']
    css.append(f'#lad-{aid} .ladder__sigma{{--t:{top(s_hi):.2f}%;--h:{top(s_lo) - top(s_hi):.2f}%}}')
    css.append(f'#lad-{aid} .ladder__price{{--t:{top(asset["price"]):.2f}%}}')
    return (
        f'<div class="ladder" id="lad-{aid}">\n'
        f'              <span class="ladder__sigma" aria-hidden="true"></span>\n'
        f'              <ul class="ladder__levels" role="list">\n                '
        + '\n                '.join(items) +
        f'\n              </ul>\n'
        f'              <span class="ladder__price" aria-hidden="true"><b>{fmt(asset["price"])}</b></span>\n'
        f'            </div>')


def asset_card(asset, horizon_fa, css):
    badges = ''.join(
        f'<span class="badge{" badge--down" if b.get("tone") == "down" else ""}">{e(b["text"])}</span>'
        for b in asset['badges'])
    stats = ''.join(f'<div><dt>{val(k)}</dt><dd>{val(v)}</dd></div>' for k, v in asset['stats'])
    return f'''        <article class="card asset asset--{asset["color"]}" data-reveal aria-labelledby="as-{asset["id"]}">
          <header class="asset__head">
            <h3 id="as-{asset["id"]}"><span class="asset__dot" aria-hidden="true"></span>{e(asset["name"])}</h3>
            <span class="asset__pair ltr">{e(asset["pair"])}</span>
          </header>
          <p class="asset__price ltr">{e(asset["priceText"])}</p>
          <p class="asset__note">{e(asset["priceNote"])}</p>
          <div class="asset__badges">{badges}</div>
          <figure class="asset__ladder">
            <figcaption class="sr-only">نردبان قیمت {e(asset["name"])} تا {e(horizon_fa)}؛ قیمت فعلی {e(asset["priceText"])}</figcaption>
            {ladder(asset, css)}
          </figure>
          <dl class="asset__stats">{stats}</dl>
        </article>'''


def drivers(data):
    cards = []
    for i, dr in enumerate(data['drivers']):
        tone = ' driver--down' if dr.get('tone') == 'down' else ''
        cards.append(
            f'<li class="card driver{tone}" data-reveal data-d="{i + 1}">'
            f'<span class="driver__lbl">{e(dr["label"])}</span>'
            f'<span class="driver__val ltr">{e(dr["value"])}</span>'
            f'<p>{val(dr["text"])}</p></li>')
    return '\n          '.join(cards)


def timeline(data, css):
    start, end = d(data['reportDate']), d(data['horizonDate'])
    span = (end - start).days
    slots = {'u1': -99.0, 'd1': -99.0, 'u2': -99.0, 'd2': -99.0}
    GAP = 13.0  # minimum % distance between labels sharing a row
    out = []
    for i, ev in enumerate(data['events'], 1):
        x = (d(ev['date']) - start).days / span * 100
        slot = next((k for k in ('u1', 'd1', 'u2', 'd2') if x - slots[k] >= GAP), 'd2')
        slots[slot] = x
        css.append(f'#tl .e{i}{{--x:{x:.2f}%}}')
        cls = ['tl__ev', f'e{i}']
        for flag in ('major', 'muted', 'end'):
            if ev.get(flag):
                cls.append(f'tl__ev--{flag}')
        out.append(
            f'<li class="{" ".join(cls)}" data-slot="{slot}" data-date="{ev["date"]}">'
            f'<span class="tl__dot" aria-hidden="true"></span>'
            f'<span class="tl__txt"><time datetime="{ev["date"]}">{e(ev["dateFa"])}</time>'
            f'<b>{e(ev["title"])}</b></span></li>')
    return '\n            '.join(out)


def scenarios(data):
    out = []
    for i, sc in enumerate(data['scenarios']):
        rows = ''.join(f'<div><dt>{e(k)}</dt><dd>{val(v)}</dd></div>' for k, v in sc['targets'])
        out.append(
            f'<article class="card scenario scenario--{sc["tone"]}" data-reveal data-d="{i + 1}">'
            f'<h3><span class="scenario__dot" aria-hidden="true"></span>{e(sc["title"])}</h3>'
            f'<p>{val(sc["condition"])}</p><dl>{rows}</dl></article>')
    return '\n        '.join(out)


# ---------------------------------------------------------------- page
def build():
    data = json.loads((HERE / 'data.json').read_text(encoding='utf-8'))
    head_common, body_top, footer = chrome()
    css = ['/* generated by tools/market-pulse/build.py — do not edit */']
    hz = data['horizonFa']

    assets_html = '\n'.join(asset_card(a, hz, css) for a in data['assets'])
    tl_html = timeline(data, css)
    css_text = '\n'.join(css) + '\n'
    ver = hashlib.sha1(css_text.encode()).hexdigest()[:8]
    (ROOT / 'assets/css/market-pulse.gen.css').write_text(css_text, encoding='utf-8', newline='\n')

    title = 'نبض بازار | گزارش بازار طلا، بیت‌کوین و اتریوم — هرم آبی'
    desc = (f'نبض بازار هرم آبی: گزارش دوره‌ای طلا، بیت‌کوین و اتریوم؛ سطوح حمایت و مقاومت، '
            f'عوامل اثرگذار، رویدادهای پیش‌رو و سه سناریو. به‌روزرسانی: {data["dateFa"]}.')
    url = f'{SITE}/market-pulse'
    ld = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'Article',
                '@id': f'{url}#report',
                'headline': f'نبض بازار — گزارش بازار طلا و کریپتو، {data["dateFa"]}',
                'description': data['headline'],
                'datePublished': data['reportDate'],
                'dateModified': data['reportDate'],
                'inLanguage': 'fa-IR',
                'image': f'{SITE}/assets/img/og-image.jpg',
                'mainEntityOfPage': url,
                'author': {'@id': f'{SITE}/#org'},
                'publisher': {'@id': f'{SITE}/#org'},
                'about': [{'@type': 'Thing', 'name': n} for n in ('طلا', 'بیت‌کوین', 'اتریوم')],
            },
            {
                '@type': 'BreadcrumbList',
                'itemListElement': [
                    {'@type': 'ListItem', 'position': 1, 'name': 'خانه', 'item': f'{SITE}/'},
                    {'@type': 'ListItem', 'position': 2, 'name': 'نبض بازار', 'item': url},
                ],
            },
        ],
    }
    i18n = {'en': {
        'pageTitle': 'Market Pulse | Gold, Bitcoin & Ethereum report — Blue Pyramid',
        'crumbLabel': 'Breadcrumb',
        'phoneDisplay': '+98&nbsp;920&nbsp;741&nbsp;3175',
    }}

    page = f'''<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>{e(title)}</title>
  <meta name="description" content="{e(desc)}">
  <link rel="canonical" href="{url}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta name="theme-color" content="#030a16">
  <meta name="format-detection" content="telephone=no">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Blue Pyramid — هرم آبی">
  <meta property="og:locale" content="fa_IR">
  <meta property="og:url" content="{url}">
  <meta property="og:title" content="نبض بازار — {e(data["dateFa"])}">
  <meta property="og:description" content="{e(data["headline"])}">
  <meta property="og:image" content="{SITE}/assets/img/og-image.jpg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="article:published_time" content="{data["reportDate"]}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="{SITE}/assets/img/og-image.jpg">

{head_common}  <link rel="stylesheet" href="/assets/css/market-pulse.css?v=2.9">
  <link rel="stylesheet" href="/assets/css/market-pulse.gen.css?v={ver}">
  <script type="application/ld+json">
{json.dumps(ld, ensure_ascii=False, indent=2)}
  </script>
</head>
{body_top}<main id="main">
  <p class="lang-note container pulse-note">Market Pulse is published in Persian only.</p>
  <div class="pulse" lang="fa" dir="rtl">
  <section class="page-hero pulse-hero" aria-labelledby="page-title">
    <div class="container">
      <nav aria-label="مسیر صفحه">
        <ol class="breadcrumb">
          <li><a href="/">خانه</a></li>
          <li aria-current="page">نبض بازار</li>
        </ol>
      </nav>
      <p class="eyebrow" data-enter>Market Pulse</p>
      <p class="pulse-hero__kicker" data-enter data-d="1">گزارش بازار طلا و کریپتو</p>
      <h1 id="page-title" data-enter="headline" data-d="2">نبض <span class="text-gradient">بازار</span></h1>
      <p class="pulse-hero__lead" data-enter data-d="3">{e(data["headline"])}</p>
      <p class="pulse-hero__date" data-enter data-d="4"><span class="live-dot" aria-hidden="true"></span><time datetime="{data["reportDate"]}">{e(data["dateFa"])}</time><span class="sep" aria-hidden="true">·</span>{e(data["dateLine"])}</p>
      <ul class="countdowns" role="list" data-enter data-d="5">
          {countdowns(data)}
      </ul>
    </div>
  </section>

  <section class="section section--tight" aria-labelledby="ladder-title">
    <div class="container">
      <div class="section-head pulse-head" data-reveal>
        <p class="eyebrow">Price Ladder</p>
        <h2 class="section-title" id="ladder-title">نردبان قیمت تا {e(hz)}</h2>
        <p class="section-lead">مقیاس هر نردبان خطی است. سطوح بالای قیمت فعلی مقاومت‌اند و سطوح پایین آن حمایت.</p>
        <ul class="legend" role="list">
          <li><span class="legend__sw legend__sw--res" aria-hidden="true"></span>مقاومت</li>
          <li><span class="legend__sw legend__sw--sup" aria-hidden="true"></span>حمایت</li>
          <li><span class="legend__sw legend__sw--sigma" aria-hidden="true"></span>دامنه ۱σ تا {e(hz)}</li>
          <li><span class="legend__sw legend__sw--price" aria-hidden="true"></span>قیمت فعلی</li>
        </ul>
      </div>
      <div class="assets-grid">
{assets_html}
      </div>
    </div>
  </section>

  <section class="section section--tight" aria-labelledby="drivers-title">
    <div class="container">
      <div class="section-head" data-reveal>
        <p class="eyebrow">Market Drivers</p>
        <h2 class="section-title" id="drivers-title">{e(data["driversTitle"])}</h2>
      </div>
      <ol class="drivers" role="list">
          {drivers(data)}
      </ol>
      <p class="drivers__summary" data-reveal>{e(data["driversSummary"])}</p>
    </div>
  </section>

  <section class="section section--tight" aria-labelledby="events-title">
    <div class="container">
      <div class="section-head" data-reveal>
        <p class="eyebrow">Calendar</p>
        <h2 class="section-title" id="events-title">رویدادها تا {e(hz)}</h2>
      </div>
      <div class="card tl-card" data-reveal>
        <div class="tl" id="tl">
          <span class="tl__track" aria-hidden="true"><span class="tl__today"><span>امروز</span></span></span>
          <ol class="tl__events" role="list">
            {tl_html}
          </ol>
        </div>
      </div>
    </div>
  </section>

  <section class="section section--tight" aria-labelledby="scen-title">
    <div class="container">
      <div class="section-head" data-reveal>
        <p class="eyebrow">Scenarios</p>
        <h2 class="section-title" id="scen-title">سه سناریو تا {e(hz)}</h2>
      </div>
      <div class="scenarios">
        {scenarios(data)}
      </div>
      <div class="pulse-foot" data-reveal>
        <p class="pulse-foot__warn"><svg aria-hidden="true"><use href="/assets/img/icons.svg#i-shield"/></svg>{e(data["disclaimer"])}</p>
        <p class="pulse-foot__src">{val(data["source"])}</p>
      </div>
    </div>
  </section>

  <section class="section section--tight" aria-labelledby="cta-title">
    <div class="container">
      <div class="cta-band" data-reveal="scale">
        <h2 id="cta-title">برای تصمیم مالی کسب‌وکارتان <span class="text-gradient">تحلیل اختصاصی</span> می‌خواهید؟</h2>
        <p>این گزارش عمومی است. در جلسه تشخیصی رایگان، اثر این متغیرها را روی کسب‌وکار و تصمیم‌های مالی خودتان بررسی می‌کنیم.</p>
        <div class="cta-band__actions">
          <a class="btn btn--primary" href="/#contact" data-magnetic><span>رزرو جلسه رایگان</span><svg class="icon-arrow" aria-hidden="true"><use href="/assets/img/icons.svg#i-arrow"/></svg></a>
        </div>
      </div>
    </div>
  </section>
  </div>
</main>

{footer}<script type="application/json" id="i18n">
{json.dumps(i18n, ensure_ascii=False, indent=2)}
</script>
<script src="/assets/js/site.js?v=2.8" defer></script>
</body>
</html>
'''
    (ROOT / 'market-pulse.html').write_text(page, encoding='utf-8', newline='\n')

    # sitemap: keep the /market-pulse entry, with lastmod = report date
    sm_path = ROOT / 'sitemap.xml'
    sm = sm_path.read_text(encoding='utf-8')
    entry = (f'  <url>\n    <loc>{url}</loc>\n    <lastmod>{data["reportDate"]}</lastmod>\n'
             f'    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>\n')
    if f'<loc>{url}</loc>' in sm:
        sm = re.sub(rf'  <url>\n    <loc>{re.escape(url)}</loc>.*?</url>\n', entry, sm, flags=re.S)
    else:
        sm = sm.replace('</urlset>', entry + '</urlset>')
    sm_path.write_text(sm, encoding='utf-8', newline='\n')
    print(f'built market-pulse.html for {data["reportDate"]} (css v={ver})')


if __name__ == '__main__':
    build()
