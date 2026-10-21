from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
ROUTES = {'home': '/', 'stocks': '/stocks/', 'learn': '/learn/', 'pro': '/?mode=pro'}


def test_all_generated_headers_share_brand_and_routes():
    pages = [ROOT/'index.html', ROOT/'stocks/index.html', *ROOT.glob('stocks/*/index.html'), *ROOT.glob('learn/**/index.html')]
    pages += [ROOT/name/'index.html' for name in ['about','contact','methodology','data-sources','disclaimer','privacy','terms']]
    for page in pages:
        soup = BeautifulSoup(page.read_text(encoding='utf-8'), 'html.parser')
        brand = soup.select_one('a[aria-label="Stockerboard home"]')
        assert brand is not None, page
        assert brand['href'] == '/', page
        assert brand.select_one('img')['src'] == '/assets/logo.svg', page
        assert 'Research' not in brand.get_text(), page
        links = {a['data-nav-section']: a['href'] for a in soup.select('[data-nav-section]')}
        assert links == ROUTES, (page, links)
        current = soup.select('[data-nav-section][aria-current="page"]')
        expected = 'stocks' if 'stocks' in page.parts else 'learn' if 'learn' in page.parts else None
        if expected:
            assert len(current) == 1 and current[0]['data-nav-section'] == expected, page
        assert soup.select_one('script[src="/scripts/site-shell.js"]') is not None, page
    assert (ROOT/'assets/logo.svg').is_file()


def test_learn_hub_has_all_ten_lessons_and_accessible_search():
    soup = BeautifulSoup((ROOT/'learn/index.html').read_text(encoding='utf-8'), 'html.parser')
    cards = soup.select('.chain-step,.secondary-card')
    assert len(cards) == 10
    for card in cards:
        assert (ROOT / card['href'].lstrip('/') / 'index.html').is_file(), card['href']
    assert soup.select_one('label[for="learnSearch"]')
    assert soup.select_one('#learnSearchStatus[aria-live="polite"]')
    assert len(soup.select('[data-learn-filter]')) == 4
    for page in (ROOT/'learn').glob('*/index.html'):
        text = page.read_text(encoding='utf-8')
        assert '{{' not in text and '{%' not in text, page
