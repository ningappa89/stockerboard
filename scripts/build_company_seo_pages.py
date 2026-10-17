"""Deterministic Crawlable Company SEO Page Generator (5D.0A).

Reads certified public Dossier V2 shards and emits static canonical HTML pages
for the approved pilot cohort into stocks/{canonical_slug}/index.html.

Usage:
    python scripts/build_company_seo_pages.py [--check] [--cohort-only]
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STOCKS_DIR = ROOT / "stocks"
TEMPLATES_DIR = ROOT / "templates"
TEMPLATE_PATH = TEMPLATES_DIR / "company-page.html"
SLUG_REGISTRY_PATH = ROOT / "company_slug_registry_v1.json"
SITEMAP_PATH = ROOT / "sitemap.xml"
FOOTER_PATH = TEMPLATES_DIR / "partials" / "footer.html"


def format_date_str(date_str: str | None) -> str:
    if not date_str:
        return "—"
    try:
        dt = datetime.datetime.strptime(date_str.strip(), "%Y-%m-%d")
        return dt.strftime("%d %b %Y").lstrip("0")
    except Exception:
        return date_str


def format_currency(val: float | int | None) -> str:
    if val is None:
        return "—"
    return f"₹{val:,.2f}"


def format_crore(val: float | int | None) -> str:
    if val is None:
        return "—"
    if abs(val) >= 100000:
        return f"₹{val:,.0f} Cr"
    elif abs(val) >= 1000:
        return f"₹{val:,.1f} Cr"
    return f"₹{val:,.2f} Cr"


def format_ratio(val: float | int | None) -> str:
    if val is None:
        return "—"
    return f"{val:.2f}x"


def format_percent(val: float | int | None) -> str:
    if val is None:
        return "—"
    return f"{val:.1f}%"


def build_view_model(company_meta: dict, dossier: dict, u_map: dict | None = None,
                     range_row: dict | None = None) -> dict:
    symbol = company_meta["symbol"]
    slug = company_meta["canonical_slug"]
    display_name = company_meta["display_name"]
    canonical_url = f"https://stockerboard.com/stocks/{slug}/"
    legacy_app_url = f"/#stock/{symbol}"

    # Extract price
    price_obj = dossier.get("price") or {}
    price_val = price_obj.get("value") or price_obj.get("close") or dossier.get("cmp")
    price_as_of = price_obj.get("as_of") or dossier.get("price_as_of")

    # Extract metadata from v2_canonical
    v2 = dossier.get("v2_canonical") or {}
    biz = v2.get("business_performance") or {}
    val = v2.get("valuation") or {}
    ratios = v2.get("ratios") or {}
    bs = v2.get("balance_sheet") or {}

    # Scope & Period
    rev_item = biz.get("REVENUE_TTM") or {}
    financial_period = rev_item.get("financial_period_end") or "2026-06-30"
    scope = rev_item.get("scope") or "CONSOLIDATED"

    # Helper for ratio values and statuses
    def get_metric(item_dict: dict, top_val: Any, formatter, unit_type: str) -> dict:
        status = item_dict.get("status") if item_dict else None
        reason = item_dict.get("reason") if item_dict else None

        # Prefer certified top_val (e.g. revenue_crore) or display_value before raw unscaled value
        if unit_type == "CRORE" and item_dict and item_dict.get("display_value") is not None:
            val_raw = item_dict.get("display_value")
        elif top_val is not None:
            val_raw = top_val
        elif item_dict and item_dict.get("value") is not None:
            val_raw = item_dict.get("value")
            # If unit is raw INR and unit_type is CRORE, scale to crores
            if unit_type == "CRORE" and val_raw and abs(val_raw) > 100000000:
                val_raw = val_raw / 10000000.0
        else:
            val_raw = None

        # Status semantics recertification per Checkpoint 5D.0A RC3 mandate:
        # AVAILABLE -> formatted value
        # NOT_APPLICABLE -> "Not applicable for this company type"
        # PENDING_LAYER -> "Not available yet"
        # UNAVAILABLE -> em dash + "Not available" ("— Not available")
        # Unknown/unrecognized -> fail closed as "Not available"
        if status == "AVAILABLE" and val_raw is not None:
            formatted = formatter(val_raw)
            card_val = formatter(val_raw)
            status_label = "Available"
            canonical_status = "AVAILABLE"
        elif status == "NOT_APPLICABLE" or reason == "NOT_APPLICABLE" or reason == "DOMAIN_NOT_APPLICABLE":
            formatted = "Not applicable for this company type"
            card_val = "Not applicable"
            status_label = "Not applicable for this company type"
            canonical_status = "NOT_APPLICABLE"
        elif status == "PENDING_LAYER" or reason == "UNSUPPORTED_INPUT_CONTRACT":
            formatted = "Not available yet"
            card_val = "Not available yet"
            status_label = "Not available yet"
            canonical_status = "PENDING_LAYER"
        elif status == "UNAVAILABLE" or status is None or val_raw is None:
            formatted = "— Not available"
            card_val = "—"
            status_label = "Not available"
            canonical_status = "UNAVAILABLE"
        else:
            formatted = "— Not available"
            card_val = "—"
            status_label = "Not available"
            canonical_status = "UNAVAILABLE"

        return {
            "raw": val_raw,
            "formatted_value": formatted,
            "card_val": card_val,
            "status": canonical_status,
            "status_label": status_label,
            "period_note": (f"Reported {format_date_str(item_dict.get('financial_period_end'))} · "
                            f"{str(item_dict.get('source_layer', 'Dossier V2')).replace('_', ' ').title()}"
                            if item_dict and item_dict.get("financial_period_end") and canonical_status == "AVAILABLE" else "")
        }

    # Market Cap
    mcap_crore = dossier.get("market_cap_crore") or (val.get("MARKET_CAP") or {}).get("display_value")

    # Sector resolution
    u_sec = (u_map or {}).get(symbol) or company_meta.get("sector")
    sector_display = u_sec if (u_sec and u_sec != "EQUITY") else (dossier.get("sector") if dossier.get("sector") != "EQUITY" else "Public Equity")
    industry_display = dossier.get("industry") if dossier.get("industry") != "EQ" else "NSE Listed Equity"

    # Build structured view model
    vm = {
        "identity": {
            "canonical_company_id": company_meta.get("canonical_company_id", symbol),
            "company_name": display_name,
            "symbol": symbol,
            "sector": sector_display,
            "industry": industry_display
        },
        "price": {
            "value": price_val,
            "as_of": price_as_of,
            "formatted_value": format_currency(price_val),
            "formatted_date": format_date_str(price_as_of)
        },
        "market_range": {
            "title": "52-Week Price Spectrum" if range_row["coverage"] == "FULL_YEAR" else "Available Price History",
            "low_label": "52W Low" if range_row["coverage"] == "FULL_YEAR" else "Observed Low",
            "high_label": "52W High" if range_row["coverage"] == "FULL_YEAR" else "Observed High",
            "low": format_currency(range_row["low"]),
            "high": format_currency(range_row["high"]),
            "position_pct": round(100 * (price_val - range_row["low"]) / (range_row["high"] - range_row["low"]), 1) if range_row["high"] > range_row["low"] else 50,
            "distance": f"{abs(range_row['distance_from_high_pct']):.1f}% below high",
            "note": (f"{range_row['session_count']} trading sessions · daily high/low through {format_date_str(range_row['price_as_of'])}"
                     if range_row["coverage"] == "FULL_YEAR" else
                     f"History since {format_date_str(range_row['first_observation'])} · {range_row['session_count']} trading sessions"),
        },
        "size": {
            "market_cap_crore": mcap_crore,
            "formatted_value": format_crore(mcap_crore)
        },
        "business": {
            "revenue_crore": get_metric(biz.get("REVENUE_TTM"), dossier.get("revenue_crore"), format_crore, "CRORE"),
            "pat_crore": get_metric(biz.get("PAT_TTM"), dossier.get("pat_crore"), format_crore, "CRORE"),
            "eps": get_metric(biz.get("EPS_BASIC_TTM"), dossier.get("eps"), format_currency, "INR"),
            "net_margin_pct": get_metric(biz.get("NET_MARGIN_PCT"), dossier.get("net_margin_pct"), format_percent, "PERCENT")
        },
        "health": {
            "net_worth_crore": get_metric(bs.get("NET_WORTH"), dossier.get("net_worth_crore"), format_crore, "CRORE"),
            "total_debt_crore": get_metric(bs.get("TOTAL_DEBT"), dossier.get("total_debt_crore"), format_crore, "CRORE"),
            "net_debt_crore": get_metric(bs.get("NET_DEBT"), dossier.get("net_debt"), format_crore, "CRORE"),
            "debt_to_equity": get_metric(ratios.get("DEBT_TO_EQUITY"), dossier.get("debt_to_equity"), format_ratio, "RATIO"),
            "current_ratio": get_metric(ratios.get("CURRENT_RATIO"), dossier.get("current_ratio"), format_ratio, "RATIO")
        },
        "returns": {
            "roe": get_metric(ratios.get("ROE"), dossier.get("roe"), format_percent, "PERCENT"),
            "roce": get_metric(ratios.get("ROCE"), dossier.get("roce"), format_percent, "PERCENT")
        },
        "valuation": {
            "pe": get_metric(val.get("P_E"), dossier.get("pe"), format_ratio, "RATIO"),
            "pb": get_metric(val.get("P_B"), dossier.get("pb"), format_ratio, "RATIO"),
            "bvps": get_metric(bs.get("BVPS"), dossier.get("bvps"), format_currency, "INR")
        },
        "freshness": {
            "price_as_of": price_as_of,
            "financial_period_end": financial_period,
            "consolidation_scope": scope
        },
        "provenance": {
            "source_basis": "Official exchange/company filings via Stockerboard Dossier V2",
            "contract_version": "5D.0A"
        },
        "route": {
            "canonical_slug": slug,
            "canonical_url": canonical_url,
            "legacy_app_url": legacy_app_url
        },
        "title": f"{display_name} Share Price, Fundamentals & Financials | Stockerboard",
        "meta_description": f"Explore {display_name} share price, market cap, revenue, profit, ROE, P/E, P/B and financial health using Stockerboard exchange-filing-based data.",
        "canonical_url": canonical_url
    }
    financial_groups = ("business", "health", "returns", "valuation")
    available_financials = sum(metric["status"] == "AVAILABLE" for group in financial_groups
                               for metric in vm[group].values())
    vm["coverage_notice"] = (
        "This company has a current price and market value, but this certified release has no eligible financial statement or ratio values. The blanks below are data coverage gaps."
        if available_financials == 0 else ""
    )
    return vm


def render_template(template_str: str, vm: dict) -> str:
    """Deterministic micro-renderer replacing Jinja placeholders {{ path.to.var }}."""
    output = template_str

    def resolve_key(path_str: str) -> str:
        parts = path_str.strip().split(".")
        curr = vm
        for p in parts:
            if isinstance(curr, dict) and p in curr:
                curr = curr[p]
            else:
                return ""
        return str(curr) if curr is not None else ""

    # Replace simple expressions {{ ... }}
    def replacer(match):
        expr = match.group(1).strip()
        # Handle simple 'or' e.g. {{ identity.sector or 'Unclassified' }}
        if " or " in expr:
            left, right = expr.split(" or ", 1)
            left_val = resolve_key(left.strip())
            if left_val and left_val != "None" and left_val != "—":
                return left_val
            right_val = right.strip().strip("'\"")
            return right_val
        return resolve_key(expr)

    output = re.sub(r"\{\{\s*(.*?)\s*\}\}", replacer, output)
    return output


def generate_pilot_pages(check_only: bool = False, *, stocks_dir: Path = STOCKS_DIR,
                         sitemap_path: Path = SITEMAP_PATH) -> tuple[dict, list[str]]:
    if not SLUG_REGISTRY_PATH.exists():
        raise FileNotFoundError(f"Missing registry: {SLUG_REGISTRY_PATH}")
    registry = json.loads(SLUG_REGISTRY_PATH.read_text(encoding="utf-8"))
    template_str = TEMPLATE_PATH.read_text(encoding="utf-8")

    pilot_companies = [c for c in registry["companies"] if c.get("status") == "ACTIVE_PILOT"]
    if len(pilot_companies) != 20:
        raise ValueError(f"Expected 20 pilot companies, found {len(pilot_companies)}")
    price_range_index = json.loads((stocks_dir / "price_range_index_v1.json").read_text(encoding="utf-8"))
    market_index_path = stocks_dir / "market_universe_index_v1.json"
    market_rows = {}
    if market_index_path.exists():
        market_index = json.loads(market_index_path.read_text(encoding="utf-8"))
        if len(market_index.get("stocks", [])) != market_index.get("count"):
            raise ValueError("Market universe index count mismatch")
        market_rows = {row[0]: row for row in market_index["stocks"]}
    public_manifest = json.loads((stocks_dir / "manifest.json").read_text(encoding="utf-8"))
    dossier_release_id = public_manifest["source_dossier_release_id"]
    if price_range_index.get("contract") != "PRICE_RANGE_INDEX_V1" or price_range_index.get("dossier_release_id") != dossier_release_id:
        raise ValueError("Price range index does not match promoted Dossier release")

    # Load sector taxonomy from universe_index.json if present
    u_map = {}
    universe_path = stocks_dir / "universe_index.json"
    if universe_path.exists():
        try:
            u_data = json.loads(universe_path.read_text(encoding="utf-8"))
            for row in u_data.get("stocks", []):
                if len(row) > 5 and row[5]:
                    u_map[row[0]] = row[5]
        except Exception:
            pass

    learn_concepts_dir = ROOT / "content" / "learn" / "concepts"
    learn_concept_urls = [
        f"https://stockerboard.com/learn/{p.stem}/"
        for p in sorted(learn_concepts_dir.glob("*.json"))
    ] if learn_concepts_dir.exists() else []

    canonical_urls = [
        "https://stockerboard.com/",
        "https://stockerboard.com/stocks/",
        "https://stockerboard.com/learn/",
        *learn_concept_urls,
        "https://stockerboard.com/methodology/",
        "https://stockerboard.com/data-sources/",
        "https://stockerboard.com/about/",
        "https://stockerboard.com/contact/",
        "https://stockerboard.com/disclaimer/",
        "https://stockerboard.com/privacy/",
        "https://stockerboard.com/terms/",
    ]
    footer_str = FOOTER_PATH.read_text(encoding="utf-8") if FOOTER_PATH.exists() else ""
    manifest_entries = []

    for comp in pilot_companies:
        sym = comp["symbol"]
        slug = comp["canonical_slug"]
        shard = "".join(c if c.isalnum() and c.isascii() else "_" for c in sym[:2]).ljust(2, "_")
        dossier_file = stocks_dir / shard / f"{sym}.json"
        if not dossier_file.exists():
            raise FileNotFoundError(f"Missing dossier for {sym}: {dossier_file}")

        dossier = json.loads(dossier_file.read_text(encoding="utf-8"))
        range_row = price_range_index["stocks"].get(sym)
        price = dossier.get("price") or {}
        if (not range_row or range_row.get("status") != "AVAILABLE" or
            range_row.get("price_as_of") != price.get("as_of") or
            abs(range_row.get("reference_close", 0) - (price.get("close") or 0)) > 0.011):
            raise ValueError(f"Price range does not match dossier price for {sym}")
        vm = build_view_model(comp, dossier, u_map=u_map, range_row=range_row)
        vm["footer_html"] = footer_str
        market_row = market_rows.get(sym)
        if market_row and len(market_row) > 6 and market_row[6] and market_row[6] >= str(vm["price"]["as_of"] or ""):
            vm["price"].update(value=market_row[2], as_of=market_row[6],
                               formatted_value=format_currency(market_row[2]),
                               formatted_date=format_date_str(market_row[6]))
            vm["freshness"]["price_as_of"] = market_row[6]
            if market_row[6] != range_row["price_as_of"]:
                vm["market_range"]["distance"] = "Earlier range snapshot"
                vm["market_range"]["note"] = (
                    f"52-week range through {format_date_str(range_row['price_as_of'])}; "
                    "latest price shown above. Range position reflects the earlier snapshot."
                )
        html_content = render_template(template_str, vm)

        # Enforce LF endings and UTF-8 encoding
        html_bytes = html_content.replace("\r\n", "\n").encode("utf-8")
        html_sha256 = hashlib.sha256(html_bytes).hexdigest()

        target_dir = stocks_dir / slug
        target_file = target_dir / "index.html"
        canonical_urls.append(vm["canonical_url"])

        manifest_entries.append({
            "symbol": sym,
            "canonical_slug": slug,
            "canonical_url": vm["canonical_url"],
            "target_file": f"stocks/{slug}/index.html",
            "size_bytes": len(html_bytes),
            "sha256": html_sha256
        })

        if check_only:
            if not target_file.exists():
                raise FileNotFoundError(f"[CHECK] Missing generated file: {target_file}")
            existing_bytes = target_file.read_bytes()
            if hashlib.sha256(existing_bytes.replace(b"\r\n", b"\n")).hexdigest() != html_sha256:
                raise ValueError(f"[CHECK] Content mismatch for: {target_file}")
        else:
            target_dir.mkdir(parents=True, exist_ok=True)
            target_file.write_bytes(html_bytes)

    # Build sitemap XML
    sitemap_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    ]
    today_str = datetime.date.today().isoformat()
    for u in canonical_urls:
        sitemap_lines.append("  <url>")
        sitemap_lines.append(f"    <loc>{u}</loc>")
        sitemap_lines.append(f"    <lastmod>{today_str}</lastmod>")
        sitemap_lines.append("  </url>")
    sitemap_lines.append("</urlset>\n")
    sitemap_content = "\n".join(sitemap_lines)

    if not check_only:
        sitemap_path.write_text(sitemap_content, encoding="utf-8")

    manifest = {
        "checkpoint": "5D.0A.1",
        "pilot_count": len(manifest_entries),
        "generated_timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "pages": manifest_entries,
        "sitemap_urls_count": len(canonical_urls)
    }

    return manifest, canonical_urls


def main() -> int:
    parser = argparse.ArgumentParser(description="Build 20-company SEO pilot pages.")
    parser.add_argument("--check", action="store_true", help="Validate existing files without modifying them.")
    parser.add_argument("--stocks-dir", type=Path, default=STOCKS_DIR)
    parser.add_argument("--sitemap-path", type=Path, default=SITEMAP_PATH)
    parser.add_argument("--pages-only", action="store_true", help="Skip the public Stocks directory builder for isolated candidates.")
    args = parser.parse_args()

    manifest, urls = generate_pilot_pages(
        check_only=args.check, stocks_dir=args.stocks_dir, sitemap_path=args.sitemap_path
    )

    # Automatically build or check stocks directory
    if not args.pages_only:
        sys.path.insert(0, str(ROOT))
        from scripts.build_stocks_directory import build_directory
        build_directory(check_only=args.check)

    if args.check:
        print(f"PASS: All {manifest['pilot_count']} pilot SEO pages and Stocks directory match certified sources.")
    else:
        manifest_path = (args.stocks_dir.parent if args.pages_only else ROOT) / "pilot_seo_manifest_v1.json"
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        print(f"SUCCESS: Generated {manifest['pilot_count']} pilot SEO pages + stocks directory + updated sitemap.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
