"""Refresh calendar.json from official sources — run daily by GitHub Actions.

    python tools/market-pulse/update_calendar.py [--today YYYY-MM-DD]

Window: three calendar months, starting with the month of (today + 7 days),
so in the last week of a month the calendar already rolls forward.

Sources (all times stored in UTC):
  fed     federalreserve.gov FOMC calendar        decision 14:00 New York
  ecb     ecb.europa.eu Governing Council schedule decision 14:15 Frankfurt
  bea     apps.bea.gov release_dates.json          GDP + Personal Income & Outlays (PCE)
  bls     bls.gov schedule pages                   CPI, PPI, Employment Situation (NFP)
  rules   computed                                 crypto option expiries, US market holidays
  manual  calendar-manual.json                     one-off events; BLS fallback dates

A source that can't be fetched or parsed never empties the calendar: its
events from the previous calendar.json are kept, and BLS falls back to the
dates in calendar-manual.json. Per-source results go to calendar-status.json.
"""
import json
import re
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone
from html import unescape
from pathlib import Path

HERE = Path(__file__).resolve().parent
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) '
      'Chrome/130.0 Safari/537.36 BluePyramidCalendar/1.0 (+https://bluepyramid.pages.dev)')
MONTHS_EN = {m: i for i, m in enumerate(
    ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
     'september', 'october', 'november', 'december'], 1)}
MONTHS_FA = ['ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن', 'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر']


# ------------------------------------------------------------------ time zones
def nth_weekday(y, m, weekday, n):
    """n-th weekday (Mon=0) of a month; n=-1 for the last one."""
    if n > 0:
        d = date(y, m, 1)
        d += timedelta(days=(weekday - d.weekday()) % 7)
        return d + timedelta(weeks=n - 1)
    d = date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)
    return d - timedelta(days=(d.weekday() - weekday) % 7)


def ny_offset(d):
    """US Eastern offset from UTC in hours (DST: 2nd Sun Mar – 1st Sun Nov)."""
    return -4 if nth_weekday(d.year, 3, 6, 2) <= d < nth_weekday(d.year, 11, 6, 1) else -5


def cet_offset(d):
    """Central European offset (DST: last Sun Mar – last Sun Oct)."""
    return 2 if nth_weekday(d.year, 3, 6, -1) <= d < nth_weekday(d.year, 10, 6, -1) else 1


def to_utc(d, hh, mm, offset):
    t = datetime(d.year, d.month, d.day, hh, mm) - timedelta(hours=offset)
    return t.date().isoformat(), t.strftime('%H:%M')


# ------------------------------------------------------------------ fetching
def get(url, timeout=30):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'text/html,application/json;q=0.9,*/*;q=0.8',
                                               'Accept-Language': 'en-US,en;q=0.8'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8', errors='replace')


def text(html):
    return re.sub(r'\s+', ' ', unescape(re.sub(r'<[^>]+>', ' ', html))).strip()


# ------------------------------------------------------------------ sources
def fed():
    page = get('https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm')
    out = []
    for m in re.finditer(r'(\d{4}) FOMC Meetings', page):
        year = int(m.group(1))
        nxt = page.find(' FOMC Meetings', m.end())
        block = page[m.end(): nxt if nxt > 0 else len(page)]
        rows = re.findall(r'fomc-meeting__month[^>]*>\s*<strong>([^<]+)</strong>.*?fomc-meeting__date[^>]*>([^<]+)<', block, re.S)
        for mon, days in rows:
            mon, days = mon.strip(), days.strip()
            if 'notation' in days.lower() or 'unscheduled' in days.lower():
                continue
            sep = '*' in days
            nums = re.findall(r'\d+', days)
            if not nums:
                continue
            last_mon = mon.split('/')[-1].strip().lower()
            mi = next((v for k, v in MONTHS_EN.items() if k.startswith(last_mon[:3])), None)
            if not mi:
                continue
            d = date(year, mi, int(nums[-1]))
            dd, tt = to_utc(d, 14, 0, ny_offset(d))
            out.append({'date': dd, 'time': tt, 'cat': 'fed', 'impact': 3, 'title': 'تصمیم فدرال',
                        'detail': 'همراه با پیش‌بینی‌های اقتصادی (SEP) و نشست خبری' if sep else 'بیانیه و نشست خبری رئیس فدرال',
                        'src': 'fed'})
    if not out:
        raise ValueError('no FOMC meetings parsed')
    return out


def ecb():
    page = get('https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html')
    out = []
    for dt, dd in re.findall(r'<dt>\s*([\d/]+)\s*</dt>\s*<dd>(.*?)</dd>', page, re.S):
        desc = text(dd).lower()
        if 'monetary policy meeting' in desc and 'non-monetary' not in desc and ('day 2' in desc or 'press conference' in desc):
            d0, m0, y0 = map(int, dt.split('/'))
            d = date(y0, m0, d0)
            day, tt = to_utc(d, 14, 15, cet_offset(d))
            out.append({'date': day, 'time': tt, 'cat': 'fed', 'impact': 2, 'title': 'تصمیم بانک مرکزی اروپا',
                        'detail': 'ECB — نرخ بهره و نشست خبری', 'src': 'ecb'})
    if not out:
        raise ValueError('no ECB policy meetings parsed')
    return out


def bea():
    data = json.loads(get('https://apps.bea.gov/API/signup/release_dates.json'))
    found = {}
    for name, key in (('Gross Domestic Product', 'gdp'), ('Personal Income and Outlays', 'pce')):
        for iso in data.get(name, {}).get('release_dates', []):
            t = datetime.fromisoformat(iso).astimezone(timezone.utc)
            found.setdefault((t.date().isoformat(), t.strftime('%H:%M')), set()).add(key)
    out = []
    for (d, tt), keys in sorted(found.items()):
        if keys == {'gdp', 'pce'}:
            title, detail, imp = 'GDP و PCE', 'تولید ناخالص داخلی آمریکا و تورم PCE (شاخص محبوب فدرال)', 2
        elif 'gdp' in keys:
            title, detail, imp = 'GDP', 'تولید ناخالص داخلی آمریکا', 2
        else:
            title, detail, imp = 'تورم PCE', 'تورم هزینه‌های مصرفی (شاخص محبوب فدرال)', 2
        out.append({'date': d, 'time': tt, 'cat': 'growth', 'impact': imp, 'title': title, 'detail': detail, 'src': 'bea'})
    if not out:
        raise ValueError('no BEA dates parsed')
    return out


BLS = [('cpi', 'infl', 3, 'تورم CPI', 'تورم مصرف‌کننده'),
       ('empsit', 'jobs', 3, 'اشتغال NFP', 'گزارش اشتغال'),
       ('ppi', 'infl', 2, 'PPI', 'تورم تولیدکننده')]


def bls():
    out = []
    for slug, cat, imp, title, label in BLS:
        page = get(f'https://www.bls.gov/schedule/news_release/{slug}.htm')
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', page, re.S)
        n = 0
        for row in rows:
            cells = [text(c) for c in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', row, re.S)]
            if len(cells) < 3:
                continue
            ref, rel, tm = cells[0], cells[1], cells[2]
            rm = re.match(r'([A-Za-z]+)\.?\s+(\d{1,2}),\s*(\d{4})', rel)
            tmm = re.match(r'(\d{1,2}):(\d{2})\s*([AP]M)', tm)
            if not rm or not tmm:
                continue
            mi = next((v for k, v in MONTHS_EN.items() if k.startswith(rm.group(1).lower()[:3])), None)
            if not mi:
                continue
            d = date(int(rm.group(3)), mi, int(rm.group(2)))
            hh = int(tmm.group(1)) % 12 + (12 if tmm.group(3) == 'PM' else 0)
            day, tt = to_utc(d, hh, int(tmm.group(2)), ny_offset(d))
            refm = re.match(r'([A-Za-z]+)\s+\d{4}', ref)
            ref_fa = MONTHS_FA[MONTHS_EN[refm.group(1).lower()] - 1] if refm and refm.group(1).lower() in MONTHS_EN else ''
            out.append({'date': day, 'time': tt, 'cat': cat, 'impact': imp, 'title': title,
                        'detail': f'{label} {ref_fa}'.strip(), 'src': 'bls'})
            n += 1
        if not n:
            raise ValueError(f'no rows parsed from BLS {slug}')
    return out


def easter(y):
    a, b, c = y % 19, y // 100, y % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    return date(y, (h + l - 7 * m + 114) // 31, ((h + l - 7 * m + 114) % 31) + 1)


def observed(d, allow_saturday=True):
    if d.weekday() == 5:
        return d - timedelta(days=1) if allow_saturday else None
    if d.weekday() == 6:
        return d + timedelta(days=1)
    return d


def rules(start, end):
    out = []
    for y in range(start.year, end.year + 1):
        for m in range(1, 13):
            fri = nth_weekday(y, m, 4, -1)
            quarterly = m in (3, 6, 9, 12)
            out.append({'date': fri.isoformat(), 'time': '08:00', 'cat': 'crypto', 'impact': 3 if quarterly else 2,
                        'title': 'سررسید فصلی اپشن کریپتو' if quarterly else 'سررسید ماهانه اپشن کریپتو',
                        'detail': 'بزرگ‌ترین سررسید سه‌ماهه در Deribit' if quarterly else 'Deribit', 'src': 'rules'})
        hol = [
            (observed(date(y, 1, 1), allow_saturday=False), 'تعطیلی سال نو'),
            (nth_weekday(y, 1, 0, 3), 'تعطیلی مارتین لوتر کینگ'),
            (nth_weekday(y, 2, 0, 3), 'تعطیلی روز رؤسای جمهور'),
            (easter(y) - timedelta(days=2), 'تعطیلی جمعه‌ی نیک'),
            (nth_weekday(y, 5, 0, -1), 'تعطیلی روز یادبود'),
            (observed(date(y, 6, 19)), 'تعطیلی جونتینث'),
            (observed(date(y, 7, 4)), 'تعطیلی روز استقلال'),
            (nth_weekday(y, 9, 0, 1), 'تعطیلی روز کار'),
            (nth_weekday(y, 11, 3, 4), 'تعطیلی شکرگزاری'),
            (observed(date(y, 12, 25)), 'تعطیلی کریسمس'),
        ]
        for d, title in hol:
            if d:
                out.append({'date': d.isoformat(), 'cat': 'event', 'impact': 1, 'title': title,
                            'detail': 'بازارهای آمریکا تعطیل', 'allDay': True, 'src': 'rules'})
    return out


# ------------------------------------------------------------------ main
def main():
    args = sys.argv[1:]
    today = date.fromisoformat(args[args.index('--today') + 1]) if '--today' in args else datetime.now(timezone.utc).date()
    anchor = today + timedelta(days=7)
    start = date(anchor.year, anchor.month, 1)
    em = start.month + 2
    ey, em = start.year + (em - 1) // 12, (em - 1) % 12 + 1
    end = date(ey + (em == 12), em % 12 + 1, 1) - timedelta(days=1)

    cal_path = HERE / 'calendar.json'
    prev = json.loads(cal_path.read_text(encoding='utf-8'))
    manual = json.loads((HERE / 'calendar-manual.json').read_text(encoding='utf-8'))['events']

    events, status = [], {}
    for name, fn in (('fed', fed), ('ecb', ecb), ('bea', bea), ('bls', bls)):
        try:
            got = fn()
            events += got
            status[name] = {'ok': True, 'events': len(got)}
        except Exception as exc:  # keep last known good data for this source
            kept = [e for e in prev['events'] if e.get('src') == name]
            if name == 'bls':
                known = {(e['date'], e['title']) for e in kept}
                kept += [e for e in manual if e.get('src') == 'bls' and (e['date'], e['title']) not in known]
            events += kept
            status[name] = {'ok': False, 'error': f'{type(exc).__name__}: {exc}'[:200], 'fallback_events': len(kept)}
    events += rules(start, end)
    events += [e for e in manual if e.get('src') == 'manual']
    status['rules'] = {'ok': True}

    # window + de-duplicate (same day, same title)
    seen, final = set(), []
    for e in sorted(events, key=lambda e: (e['date'], e.get('time', '99'), e['title'])):
        if not (start.isoformat() <= e['date'] <= end.isoformat()):
            continue
        k = (e['date'], e['title'])
        if k in seen:
            continue
        seen.add(k)
        final.append(e)

    cal = dict(prev)
    cal.update({'from': start.isoformat(), 'to': end.isoformat(), 'events': final})
    changed = json.dumps(cal.get('events')) != json.dumps(prev.get('events')) or cal['from'] != prev.get('from')
    if changed:
        cal['updated'] = today.isoformat()
    cal_path.write_text(json.dumps(cal, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    (HERE / 'calendar-status.json').write_text(json.dumps(
        {'checked': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'window': [cal['from'], cal['to']],
         'events': len(final), 'sources': status}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps({'window': [cal['from'], cal['to']], 'events': len(final), 'changed': changed,
                      'sources': {k: v.get('ok') for k, v in status.items()}}))


if __name__ == '__main__':
    main()
