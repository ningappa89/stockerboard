"""Shared Stockerboard header used by every static page generator."""
from pathlib import Path

HEADER_PATH = Path(__file__).resolve().parents[1] / "templates/partials/header.html"


def render_header(section: str) -> str:
    html = HEADER_PATH.read_text(encoding="utf-8")
    return html.replace(f'data-nav-section="{section}"', f'data-nav-section="{section}" aria-current="page"')
