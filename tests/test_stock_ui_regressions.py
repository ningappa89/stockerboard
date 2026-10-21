from pathlib import Path
import re
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]


def test_generated_stock_pages_have_no_template_syntax_or_broken_logo_sources():
    pages = list((ROOT / "stocks").glob("*/index.html"))
    assert len(pages) >= 20
    for page in pages:
        text = page.read_text(encoding="utf-8")
        assert "{%" not in text and "{{" not in text, page
        soup = BeautifulSoup(text, "html.parser")
        for image in soup.select(".company-logo-slot img"):
            assert image["src"].startswith("/assets/company-logos/")
            assert (ROOT / image["src"].lstrip("/")).is_file()
        learn = soup.select_one("[aria-label='Main navigation'] a[href='/learn/']")
        assert learn is not None, page
        quote = soup.select_one("#companyMarketQuote").get_text()
        assert soup.select_one("#companyMarketPrice").get_text() in quote, page
        pin = soup.select_one(".hero-range-pin")["style"]
        assert 0 <= float(re.search(r"left:([\d.]+)%", pin)[1]) <= 100


def test_website_source_pill_removed():
    text = (ROOT / "index.html").read_text(encoding="utf-8")
    assert "dossierWebsiteSourceBadge" not in text
    assert "webBadge.textContent" not in text
