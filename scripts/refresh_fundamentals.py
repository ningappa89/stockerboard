"""Build the site's shared fundamentals snapshot from its existing public provider.

No browser-side scraping or per-row requests. Uses bounded requests, evidence caching,
stock-specific source URLs, and atomic snapshots. Stops on throttling/access denial.
Missing ratios stay null. P/B is explicitly price / book value from the same page.
"""
from __future__ import annotations
import argparse, concurrent.futures, datetime as dt, gzip, hashlib, html, http.cookiejar, json, math
import re, sqlite3, threading, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KEYS = {'Stock P/E': 'pe', 'P/E': 'pe', 'ROE': 'roe', 'ROCE': 'roce', 'Book Value': 'book_value', 'Current Price': 'source_price'}

def number(value):
    try:
        value = float(value.replace(',', '').strip())
        return value if math.isfinite(value) else None
    except (ValueError, TypeError, AttributeError):
        return None

def parse_ratios(page):
    section = re.search(r'<ul\b[^>]*\bid=[\"\']top-ratios[\"\'][^>]*>(.*?)</ul>', page, re.S)
    if not section:
        raise ValueError('Missing top-ratios section')
    values = {}
    # Bound each match to its own li: an empty ratio cannot borrow the next value.
    for item in re.findall(r'<li\b[^>]*>(.*?)</li>', section[1], re.S):
        name = re.search(r'<span\b[^>]*class=[\"\']name[\"\'][^>]*>(.*?)</span>', item, re.S)
        raw = re.search(r'<span\b[^>]*class=[\"\']number[\"\'][^>]*>(.*?)</span>', item, re.S)
        if name:
            label = re.sub(r'\s+', ' ', html.unescape(re.sub('<[^>]+>', '', name[1]))).strip()
            if label in KEYS:
                values[KEYS[label]] = number(html.unescape(raw[1])) if raw else None
    result = {key: values.get(key) for key in ['pe', 'roe', 'roce']}
    price, book = values.get('source_price'), values.get('book_value')
    result['pb'] = round(price / book, 2) if price is not None and book is not None and book > 0 else None
    result['pb_basis'] = {'price': price, 'book_value': book, 'method': 'source_price / source_book_value'}
    return result

def atomic_json(path, value):
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'), sort_keys=True) + '\n', encoding='utf-8')
    temp.replace(path)

def import_canonical_snapshots(stocks, database, symbols_database):
    """Seed published ratios from the existing canonical DB without changing that DB."""
    with sqlite3.connect(symbols_database.resolve().as_uri() + '?mode=ro', uri=True) as conn:
        lookup = dict(conn.execute("SELECT s.isin,l.trading_symbol FROM security_issues s JOIN exchange_listings l ON l.security_id=s.security_id WHERE l.exchange='NSE' AND l.is_active=1"))
    records = {}
    with sqlite3.connect(database.resolve().as_uri() + '?mode=ro', uri=True) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute("SELECT * FROM ratio_snapshots WHERE is_current=1 AND provider='NSE_PUBLIC' AND ratio_type IN ('PE','PB','ROE','ROCE') ORDER BY as_of DESC,observed_at DESC")
        for row in rows:
            symbol = lookup.get(row['source_isin'])
            if not symbol:
                continue
            # Legacy enrichment stores Screener.in observations under NSE_PUBLIC.
            record = records.setdefault(symbol, dict.fromkeys(['pe','pb','roe','roce']))
            if 'metric_sources' not in record:
                record.update(source='Screener.in (stored snapshot)', source_url='https://www.screener.in/company/' + urllib.parse.quote(symbol, safe='') + '/', scope='standalone', retrieved_at=row['observed_at'], as_of=row['as_of'], stored_provider=row['provider'], metric_sources={})
            key = row['ratio_type'].lower()
            if key in record['metric_sources']:
                continue
            record[key] = row['value']
            record['metric_sources'][key] = {'as_of': row['as_of'], 'observed_at': row['observed_at'], 'payload_sha256': row['payload_hash']}
    for symbol, record in records.items():
        existing = stocks.get(symbol)
        if not existing or record['retrieved_at'] > existing.get('retrieved_at',''):
            stocks[symbol] = record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--limit', type=int)
    parser.add_argument('--scope', choices=['market', 'universe'], default='market')
    parser.add_argument('--workers', type=int, default=1)
    parser.add_argument('--database', type=Path)
    parser.add_argument('--symbols-database', type=Path)
    parser.add_argument('--cache-only', action='store_true', help='Import canonical snapshots without any network requests')
    parser.add_argument('--rps', type=float, default=2)
    parser.add_argument('--max-age-days', type=int, default=7)
    args = parser.parse_args()
    if args.rps <= 0 or args.rps > 4:
        parser.error('rps must be between 0 and 4')
    if args.workers < 1 or args.workers > 3:
        parser.error('workers must be between 1 and 3')
    args.cache.mkdir(parents=True, exist_ok=True)
    source = (ROOT / 'index.html').read_text(encoding='utf-8')
    app = json.loads(re.search(r'const APP_DATA = (.*);', source)[1])
    preferred = ['HDFCBANK','RELIANCE','TCS','INFY','ITC','SBIN'] + [s['symbol'] for s in app['market_screener']]
    universe = sorted(path.stem for path in (ROOT / 'stocks').glob('*/*.json'))
    scoped = [stock['symbol'] for stock in app['market_screener']] if args.scope == 'market' else universe
    symbols = list(dict.fromkeys(preferred + scoped))
    if args.limit: symbols = symbols[:args.limit]
    output = ROOT / 'fundamentals.json'
    previous = json.loads(output.read_text(encoding='utf-8')) if output.exists() else {}
    stocks = previous.get('stocks', {})
    if args.database or args.symbols_database:
        if not (args.database and args.symbols_database): parser.error('Provide both database paths')
        import_canonical_snapshots(stocks, args.database, args.symbols_database)
    if args.cache_only:
        atomic_json(output, {'schema_version': 1, 'generated_at': dt.datetime.now(dt.timezone.utc).isoformat(), 'stocks': stocks})
        print(json.dumps({'covered': len(stocks), 'network_requests': 0}))
        return
    now = dt.datetime.now(dt.timezone.utc)
    cutoff = now - dt.timedelta(days=args.max_age_days)
    pending = [symbol for symbol in symbols if symbol not in stocks or dt.datetime.fromisoformat(stocks[symbol]['retrieved_at']) < cutoff]
    lock, stop = threading.Lock(), threading.Event()
    next_request = [0.0]
    failures, done = {}, 0
    cookie_jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))
    def fetch(symbol):
        if stop.is_set(): return symbol, None, 'stopped'
        with lock:
            delay = max(0, next_request[0] - time.monotonic())
            next_request[0] = max(time.monotonic(), next_request[0]) + 1 / args.rps
        if delay: time.sleep(delay)
        if stop.is_set(): return symbol, None, 'stopped'
        url = 'https://www.screener.in/company/' + urllib.parse.quote(symbol, safe='') + '/'
        try:
            request = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.screener.in/',
            })
            with opener.open(request, timeout=20) as response:
                final = urllib.parse.urlparse(response.url)
                if final.hostname != 'www.screener.in' or urllib.parse.unquote(final.path).rstrip('/') != '/company/' + symbol:
                    raise ValueError('Unexpected stock redirect')
                raw = response.read()
            ratios = parse_ratios(raw.decode('utf-8'))
            retrieved = dt.datetime.now(dt.timezone.utc).isoformat()
            record = {**ratios, 'source': 'Screener.in', 'source_url': url, 'scope': 'standalone', 'retrieved_at': retrieved, 'payload_sha256': hashlib.sha256(raw).hexdigest()}
            evidence_name = hashlib.sha256(symbol.encode()).hexdigest()[:16] + '.html.gz'
            with gzip.open(args.cache / evidence_name, 'wb') as f: f.write(raw)
            return symbol, record, None
        except urllib.error.HTTPError as exc:
            if exc.code in (403,429): stop.set()
            return symbol, None, 'HTTP ' + str(exc.code) + ('; Retry-After=' + exc.headers['Retry-After'] if exc.headers.get('Retry-After') else '')
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            return symbol, None, type(exc).__name__ + ': ' + str(exc)
    def save():
        atomic_json(output, {'schema_version': 1, 'generated_at': dt.datetime.now(dt.timezone.utc).isoformat(), 'stocks': stocks})
        atomic_json(args.cache / 'coverage.json', {'requested': len(symbols), 'cached': len(symbols)-len(pending), 'completed': done, 'covered': sum(s in stocks for s in symbols), 'failures': failures, 'stopped': stop.is_set()})
    print(json.dumps({'requested': len(symbols), 'pending': len(pending)}), flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        for symbol, record, error in executor.map(fetch, pending):
            if error and error != 'stopped': failures[symbol] = error
            if record: stocks[symbol] = record
            if error != 'stopped': done += 1
            if done % 25 == 0 and error != 'stopped':
                save(); print(json.dumps({'completed': done, 'covered': len(stocks), 'failed': len(failures)}), flush=True)
    save()
    print(json.dumps({'completed': done, 'covered': len(stocks), 'failed': len(failures), 'stopped': stop.is_set()}), flush=True)
    if stop.is_set(): raise SystemExit('Provider throttled or denied access; refresh stopped.')

if __name__ == '__main__': main()
