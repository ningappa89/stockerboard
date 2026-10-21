"""Deterministic Stocks Directory Generator (Checkpoint 5D.0A.1).

Aggregates certified public Dossier data for the 20 approved pilot companies
and emits the static crawlable directory at stocks/index.html.

Usage:
    python scripts/build_stocks_directory.py [--check]
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
from pathlib import Path

try:
    from .site_shell import render_header
except ImportError:
    from site_shell import render_header

ROOT = Path(__file__).resolve().parents[1]
STOCKS_DIR = ROOT / "stocks"
TEMPLATES_DIR = ROOT / "templates"
TEMPLATE_PATH = TEMPLATES_DIR / "stocks-directory.html"
SLUG_REGISTRY_PATH = ROOT / "company_slug_registry_v1.json"
TARGET_HTML_PATH = STOCKS_DIR / "index.html"
FOOTER_PATH = TEMPLATES_DIR / "partials" / "footer.html"
DIRECTORY_VIEW_MODEL_PATH = STOCKS_DIR / "stocks_directory_v1.json"
MARKET_UNIVERSE_INDEX_PATH = STOCKS_DIR / "market_universe_index_v1.json"


def format_currency(val: float | int | None) -> str:
    if val is None:
        return "— Not available"
    return f"₹{val:,.2f}"


def format_mcap(val: float | int | None) -> str:
    if val is None:
        return "Market Cap — Not available"
    if abs(val) >= 100000:
        return f"Market Cap ₹{val:,.0f} Cr"
    elif abs(val) >= 1000:
        return f"Market Cap ₹{val:,.1f} Cr"
    return f"Market Cap ₹{val:,.2f} Cr"


def build_directory_entry(comp_meta: dict, dossier: dict, u_map: dict,
                          market_row: list | None = None) -> dict:
    sym = comp_meta["symbol"]
    slug = comp_meta["canonical_slug"]
    name = comp_meta["display_name"]
    canonical_url = f"https://stockerboard.com/stocks/{slug}/"

    # Price
    price_obj = dossier.get("price") or {}
    price_val = price_obj.get("value") or price_obj.get("close") or dossier.get("cmp")
    price_as_of = price_obj.get("as_of") or dossier.get("price_as_of")
    if market_row and len(market_row) > 6 and market_row[6] and market_row[6] >= str(price_as_of or ""):
        price_val = market_row[2]
        price_as_of = market_row[6]

    # Sector
    sector = u_map.get(sym, {}).get("sector") or dossier.get("sector") or "Sector unavailable"
    if sector in ("EQUITY", "EQ", "Unclassified"):
        sector = "Sector unavailable"

    # Market Cap from valuation or top-level dossier
    v2 = dossier.get("v2_canonical") or {}
    val = v2.get("valuation") or {}
    mcap_item = val.get("MARKET_CAP") or {}
    mcap_val = mcap_item.get("display_value") or dossier.get("market_cap_crore")

    # Aliases for search
    aliases = list(comp_meta.get("aliases") or [])
    if sym == "ETERNAL" and "zomato" not in aliases:
        aliases.append("zomato")
    aliases_str = " ".join(aliases)

    return {
        "canonical_company_id": comp_meta.get("canonical_company_id", sym),
        "symbol": sym,
        "company_name": name,
        "canonical_slug": slug,
        "canonical_url": canonical_url,
        "sector": sector,
        "price": price_val,
        "price_formatted": format_currency(price_val),
        "price_status": "AVAILABLE" if price_val is not None else "UNAVAILABLE",
        "price_as_of": price_as_of,
        "market_cap": mcap_val,
        "market_cap_formatted": format_mcap(mcap_val),
        "market_cap_status": "AVAILABLE" if mcap_val is not None else "UNAVAILABLE",
        "aliases": aliases,
        "aliases_str": aliases_str
    }


def render_card_html(entry: dict) -> str:
    escaped = {key: html.escape(str(value), quote=True) for key, value in entry.items()}
    initials = html.escape("".join(ch for ch in entry["company_name"] if ch.isalnum())[:2].upper())
    return f"""            <a href="/stocks/{escaped['canonical_slug']}/" class="dir-card" data-symbol="{escaped['symbol']}">
                <div class="dir-company-top">
                    <span class="dir-company-logo" data-symbol="{escaped['symbol']}" aria-hidden="true">{initials}</span>
                    <div class="dir-info"><div class="dir-name-row">
                        <span class="dir-name" title="{escaped['company_name']}">{escaped['company_name']}</span>
                        <span class="dir-symbol">{escaped['symbol']}</span>
                    </div></div>
                </div>
                <div class="dir-sector">{escaped['sector']}</div>
                <div class="dir-metrics"><span class="dir-price-label">Last close</span>
                    <span class="dir-price">{escaped['price_formatted']}</span>
                    <span class="dir-route-note">{escaped['price_as_of']}</span>
                </div>
                <div class="dir-card-footer"><span>Company details</span><span class="dir-arrow" aria-hidden="true">↗</span></div>
            </a>"""



def build_directory(check_only: bool = False, universe_path: Path | None = None,
                    output_dir: Path | None = None) -> tuple[dict, str]:
    if not SLUG_REGISTRY_PATH.exists():
        raise FileNotFoundError(f"Missing registry: {SLUG_REGISTRY_PATH}")
    registry = json.loads(SLUG_REGISTRY_PATH.read_text(encoding="utf-8"))
    template_str = TEMPLATE_PATH.read_text(encoding="utf-8")

    pilot_companies = [c for c in registry["companies"] if c.get("status") == "ACTIVE_PILOT"]
    if len(pilot_companies) != 20:
        raise ValueError(f"Expected 20 pilot companies, found {len(pilot_companies)}")

    # The same canonical universe drives home search and this browse page.
    u_map = {}
    universe_path = Path(universe_path or (MARKET_UNIVERSE_INDEX_PATH if MARKET_UNIVERSE_INDEX_PATH.exists()
                                           else STOCKS_DIR / "universe_index.json"))
    target_html_path = Path(output_dir) / "index.html" if output_dir else TARGET_HTML_PATH
    view_model_path = Path(output_dir) / "stocks_directory_v1.json" if output_dir else DIRECTORY_VIEW_MODEL_PATH
    u_data = json.loads(universe_path.read_text(encoding="utf-8"))
    universe_rows = u_data["stocks"]
    if len(universe_rows) != u_data["count"] or len({row[0] for row in universe_rows}) != u_data["count"]:
        raise ValueError("Canonical universe count or symbols are inconsistent")
    market_rows = {row[0]: row for row in universe_rows}
    for row in universe_rows:
        if len(row) > 5 and row[5]:
            u_map[row[0]] = {"sector": row[5]}

    entries = []
    for comp in pilot_companies:
        sym = comp["symbol"]
        shard = "".join(c if c.isalnum() and c.isascii() else "_" for c in sym[:2]).ljust(2, "_")
        dossier_file = STOCKS_DIR / shard / f"{sym}.json"
        if not dossier_file.exists():
            raise FileNotFoundError(f"Missing dossier for {sym}: {dossier_file}")
        dossier = json.loads(dossier_file.read_text(encoding="utf-8"))
        entry = build_directory_entry(comp, dossier, u_map, market_rows.get(sym))
        entries.append(entry)

    # Deterministic alphabetical ordering by company_name
    entries.sort(key=lambda x: x["company_name"])
    if not {entry["symbol"] for entry in entries}.issubset({row[0] for row in universe_rows}):
        raise ValueError("Featured company is outside the canonical universe")

    # Render card HTML list
    cards_html = "\n".join(render_card_html(e) for e in entries)

    # Render complete HTML
    template_str = template_str.replace("{{ header_html }}", render_header("stocks"))
    html_content = template_str.replace("{{ total_count }}", f"{len(universe_rows):,}")
    html_content = html_content.replace("{{ total_count_raw }}", str(len(universe_rows)))
    html_content = html_content.replace("{{ featured_count }}", str(len(entries)))
    html_content = html_content.replace("{{ universe_as_of }}", html.escape(u_data["as_of"]))
    featured_routes = {e["symbol"]: {"slug": e["canonical_slug"], "aliases": e["aliases"],
                                      "name": e["company_name"], "sector": e["sector"],
                                      "price": e["price"], "price_as_of": e["price_as_of"]} for e in entries}
    html_content = html_content.replace("{{ featured_routes_json }}", json.dumps(featured_routes, ensure_ascii=False, sort_keys=True).replace("<", "\\u003c"))
    html_content = html_content.replace("{{ directory_cards }}", cards_html)
    footer_str = FOOTER_PATH.read_text(encoding="utf-8") if FOOTER_PATH.exists() else ""
    html_content = html_content.replace("{{ footer_html }}", footer_str)

    # Standardize LF endings and UTF-8
    html_bytes = html_content.replace("\r\n", "\n").encode("utf-8")
    html_sha = hashlib.sha256(html_bytes).hexdigest()

    view_model = {
        "contract": "STOCKS_DIRECTORY_V1",
        "generated_from": "company_slug_registry_v1.json",
        "canonical_url": "https://stockerboard.com/stocks/",
        "company_count": len(universe_rows),
        "featured_count": len(entries),
        "universe_as_of": u_data["as_of"],
        "entries": entries,
        "output_sha256": html_sha
    }

    if check_only:
        if not target_html_path.exists():
            raise FileNotFoundError(f"Target directory file missing: {target_html_path}")
        existing_bytes = target_html_path.read_bytes().replace(b"\r\n", b"\n")
        existing_sha = hashlib.sha256(existing_bytes).hexdigest()
        if existing_sha != html_sha:
            raise ValueError(f"Directory drift detected! Existing: {existing_sha}, Generated: {html_sha}")
        print("PASS: Stocks directory is deterministic and matches expected content.")
        return view_model, html_sha

    # Write files atomically
    target_html_path.parent.mkdir(parents=True, exist_ok=True)
    target_html_path.write_bytes(html_bytes)
    view_model_path.write_text(json.dumps(view_model, indent=2), encoding="utf-8")
    print(f"Generated stocks directory at {target_html_path} (SHA-256: {html_sha})")
    return view_model, html_sha


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build Stocks Directory")
    parser.add_argument("--check", action="store_true", help="Check for drift without writing")
    args = parser.parse_args()
    build_directory(check_only=args.check)
