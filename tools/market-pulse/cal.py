"""Economic calendar for the Market Pulse page, built from calendar.json.

Renders one horizontal timeline per month (same visual language as the
report's timeline in the PDF) and writes an .ics file visitors can add to
their own calendar app. Times in calendar.json are UTC; the page shows Tehran
time (UTC+03:30, no daylight saving).
"""
import calendar as pycal
import hashlib
import html
import json
from datetime import date, datetime, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
e = html.escape
FA_DIGITS = str.maketrans('0123456789', '۰۱۲۳۴۵۶۷۸۹')
G_MONTHS = ['ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن', 'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر']
J_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
TEHRAN = timedelta(hours=3, minutes=30)
SLOTS = ('u1', 'd1', 'u2', 'd2')
GAP = 12.0  # minimum % distance between labels sharing a row


def fa(x):
    return str(x).translate(FA_DIGITS)


def to_jalali(g):
    """Gregorian date -> (jy, jm, jd). Standard arithmetic conversion."""
    gy, gm, gd = g.year, g.month, g.day
    g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
    gy2 = gy + 1 if gm > 2 else gy
    days = 355666 + (365 * gy) + ((gy2 + 3) // 4) - ((gy2 + 99) // 100) + ((gy2 + 399) // 400) + gd + g_d_m[gm - 1]
    jy = -1595 + (33 * (days // 12053))
    days %= 12053
    jy += 4 * (days // 1461)
    days %= 1461
    if days > 365:
        jy += (days - 1) // 365
        days = (days - 1) % 365
    jm = 1 + days // 31 if days < 186 else 7 + (days - 186) // 30
    jd = 1 + (days % 31 if days < 186 else (days - 186) % 30)
    return jy, jm, jd


def tehran(ev):
    if ev.get('allDay') or not ev.get('time'):
        return None
    dt = datetime.fromisoformat(f'{ev["date"]}T{ev["time"]}') + TEHRAN
    return dt


def load():
    return json.loads((HERE / 'calendar.json').read_text(encoding='utf-8'))


def months(cal):
    start, end = date.fromisoformat(cal['from']), date.fromisoformat(cal['to'])
    y, m = start.year, start.month
    while date(y, m, 1) <= end:
        yield y, m
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def month_block(cal, y, m, css):
    last = pycal.monthrange(y, m)[1]
    evs = sorted((ev for ev in cal['events'] if ev['date'][:7] == f'{y:04d}-{m:02d}'),
                 key=lambda ev: (ev['date'], ev.get('time', '')))
    j1, j2 = to_jalali(date(y, m, 1)), to_jalali(date(y, m, last))
    jal = J_MONTHS[j1[1] - 1] if j1[1] == j2[1] else f'{J_MONTHS[j1[1] - 1]} – {J_MONTHS[j2[1] - 1]}'
    mid = f'cal-{y:04d}-{m:02d}'
    slots = {k: -99.0 for k in SLOTS}
    items = []
    for i, ev in enumerate(evs, 1):
        dd = date.fromisoformat(ev['date'])
        x = (dd.day - 1) / (last - 1) * 100
        slot = next((k for k in SLOTS if x - slots[k] >= GAP), min(SLOTS, key=lambda k: slots[k]))
        slots[slot] = x
        css.append(f'#{mid} .e{i}{{--x:{x:.2f}%}}')
        cls = ['tl__ev', f'e{i}']
        if ev.get('impact', 2) >= 3:
            cls.append('tl__ev--major')
        elif ev.get('impact', 2) <= 1:
            cls.append('tl__ev--muted')
        t = tehran(ev)
        when = f'{fa(dd.day)} {G_MONTHS[m - 1]}' + (f' · {fa(t.strftime("%H:%M"))}' if t else '')
        iso = f'{ev["date"]}T{ev["time"]}:00Z' if t else ev['date']
        detail = f'<span class="tl__detail">{e(ev["detail"])}</span>' if ev.get('detail') else ''
        items.append(
            f'<li class="{" ".join(cls)}" data-slot="{slot}" data-cat="{ev["cat"]}" data-date="{ev["date"]}">'
            f'<span class="tl__dot" aria-hidden="true"></span>'
            f'<span class="tl__txt"><time datetime="{iso}">{when}</time><b>{e(ev["title"])}</b>{detail}</span></li>')
    count = f'{fa(len(evs))} رویداد'
    return f'''        <section class="cal-month" aria-labelledby="{mid}-h" data-reveal>
          <header class="cal-month__head">
            <h3 id="{mid}-h">{G_MONTHS[m - 1]} {fa(y)}</h3>
            <span class="cal-month__jal">{jal} {fa(j1[0]) if j1[0] == j2[0] else fa(j1[0]) + '–' + fa(j2[0])}</span>
            <span class="cal-month__count">{count}</span>
          </header>
          <div class="tl cal-tl" id="{mid}" data-start="{y:04d}-{m:02d}-01" data-end="{y:04d}-{m:02d}-{last:02d}">
            <span class="tl__track" aria-hidden="true"><span class="tl__today"><span>امروز</span></span></span>
            <ol class="tl__events" role="list">
              {chr(10).join('              ' + it for it in items).strip()}
            </ol>
          </div>
        </section>'''


def ics_text(cal):
    def fold(line):
        out, raw = [], line.encode('utf-8')
        while len(raw) > 74:
            cut = 74
            while (raw[cut] & 0xC0) == 0x80:  # never split a UTF-8 sequence
                cut -= 1
            out.append(raw[:cut].decode('utf-8'))
            raw = b' ' + raw[cut:]
        out.append(raw.decode('utf-8'))
        return '\r\n'.join(out)

    def esc(s):
        return s.replace('\\', '\\\\').replace(';', '\\;').replace(',', '\\,').replace('\n', '\\n')

    stamp = cal['updated'].replace('-', '') + 'T000000Z'
    lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Blue Pyramid//Market Pulse//FA', 'CALSCALE:GREGORIAN',
             'METHOD:PUBLISH', 'X-WR-CALNAME:' + esc('نبض بازار — هرم آبی'), 'X-WR-TIMEZONE:Asia/Tehran']
    for ev in cal['events']:
        uid = hashlib.sha1(f'{ev["date"]}{ev["title"]}'.encode()).hexdigest()[:16] + '@bluepyramid.pages.dev'
        lines += ['BEGIN:VEVENT', f'UID:{uid}', f'DTSTAMP:{stamp}']
        if ev.get('allDay') or not ev.get('time'):
            d0 = date.fromisoformat(ev['date'])
            lines += [f'DTSTART;VALUE=DATE:{d0:%Y%m%d}', f'DTEND;VALUE=DATE:{d0 + timedelta(days=1):%Y%m%d}']
        else:
            t = datetime.fromisoformat(f'{ev["date"]}T{ev["time"]}')
            lines += [f'DTSTART:{t:%Y%m%dT%H%M%SZ}', f'DTEND:{t + timedelta(minutes=30):%Y%m%dT%H%M%SZ}']
        lines.append('SUMMARY:' + esc(ev['title']))
        if ev.get('detail'):
            lines.append('DESCRIPTION:' + esc(ev['detail'] + ' — نبض بازار هرم آبی'))
        lines.append('END:VEVENT')
    lines.append('END:VCALENDAR')
    return '\r\n'.join(fold(l) for l in lines) + '\r\n'


def section(css):
    cal = load()
    blocks = '\n'.join(month_block(cal, y, m, css) for y, m in months(cal))
    ics = ics_text(cal)
    out = ROOT / 'assets/data/market-calendar.ics'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(ics.encode('utf-8'))
    ver = hashlib.sha1(ics.encode()).hexdigest()[:8]
    status_path = HERE / 'calendar-status.json'
    checked = ''
    if status_path.exists():
        st = json.loads(status_path.read_text(encoding='utf-8'))
        t = datetime.strptime(st['checked'], '%Y-%m-%dT%H:%M:%SZ') + TEHRAN
        checked = f'؛ آخرین بررسی: {fa(t.strftime("%Y/%m/%d %H:%M"))} به وقت تهران'
    chips = ''.join(
        f'<button type="button" class="cal-chip" data-cat="{k}" aria-pressed="true">'
        f'<span class="cal-chip__sw" aria-hidden="true"></span>{e(v["label"])}</button>'
        for k, v in cal['categories'].items())
    return f'''  <section class="section section--tight" id="calendar" aria-labelledby="cal-title">
    <div class="container">
      <div class="section-head pulse-head" data-reveal>
        <p class="eyebrow">Economic Calendar</p>
        <h2 class="section-title" id="cal-title">{e(cal["title"])}</h2>
        <p class="section-lead">جلسات بانک‌های مرکزی و انتشار داده‌هایی که روی طلا و کریپتو اثر می‌گذارند. ساعت‌ها به وقت تهران است؛ دایره‌های بزرگ‌تر یعنی اثر بیشتر.</p>
      </div>
      <p class="cal-next" data-cal-next hidden></p>
      <div class="cal-tools" data-reveal>
        <div class="cal-filter" role="group" aria-label="نمایش دسته‌ها">{chips}</div>
        <a class="btn btn--ghost btn--sm cal-ics" href="/assets/data/market-calendar.ics?v={ver}" download="blue-pyramid-market-calendar.ics"><svg aria-hidden="true"><use href="/assets/img/icons.svg#i-file"/></svg><span>افزودن به تقویم من</span></a>
      </div>
      <div class="card tl-card cal" data-cal>
{blocks}
      </div>
      <p class="pulse-foot__src cal-src">{e(cal["sources"])} تقویم هر روز به‌طور خودکار از این منابع به‌روز می‌شود{checked}.</p>
    </div>
  </section>'''
