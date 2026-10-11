"""Certified Gold as-of values reach all eligible pilot SEO pages without scope drift."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from build_company_seo_pages import build_view_model, generate_pilot_pages  # noqa: E402


def test_20_pages_match_sources_and_asof_scope():
    manifest, _ = generate_pilot_pages(check_only=True)
    index = json.loads((ROOT / "stocks" / "pilot_asof_financials_v1.json").read_text(encoding="utf-8"))
    assert manifest["pilot_count"] == 20
    assert len(index["companies"]) == 20
    for entry in manifest["pages"]:
        symbol = entry["symbol"]
        company = index["companies"][symbol]
        shard = "".join(c if c.isascii() and c.isalnum() else "_" for c in symbol[:2]).ljust(2, "_")
        dossier = json.loads((ROOT / "stocks" / shard / f"{symbol}.json").read_text(encoding="utf-8"))
        assert company["company_id"] == dossier["canonical_company_id"]
        for metric in company["metrics"].values():
            assert metric["period_end"] <= company["as_of"]
        html = (ROOT / entry["target_file"]).read_text(encoding="utf-8")
        assert "{{" not in html
        assert symbol in html
        assert company["as_of"] in html


def test_reliance_reports_prior_balance_sheet_but_not_uncertified_roe():
    dossier = json.loads((ROOT / "stocks" / "RE" / "RELIANCE.json").read_text(encoding="utf-8"))
    index = json.loads((ROOT / "stocks" / "pilot_asof_financials_v1.json").read_text(encoding="utf-8"))
    company = dict(index["companies"]["RELIANCE"])
    company["metrics"] = {key: dict(row, source_release=index["sources"][row["source"]]["release_id"])
                          for key, row in company["metrics"].items()}
    vm = build_view_model({"symbol": "RELIANCE", "canonical_slug": "reliance", "display_name": "Reliance Industries Limited"}, dossier, asof_company=company)
    assert vm["business"]["revenue_crore"]["status"] == "AVAILABLE"
    assert vm["health"]["net_worth_crore"]["raw"] == company["metrics"]["NET_WORTH"]["value"] / 10_000_000
    assert vm["health"]["net_worth_crore"]["period_note"] == "Reported 31 Mar 2026 · Balance Sheet Gold"
    assert vm["health"]["debt_to_equity"]["raw"] == company["metrics"]["DEBT_TO_EQUITY"]["value"]
    assert vm["returns"]["roe"]["status"] == "UNAVAILABLE"
    assert vm["returns"]["roce"]["status"] == "PENDING_LAYER"


def test_financial_company_domain_exclusions_remain_unavailable():
    dossier = json.loads((ROOT / "stocks" / "HD" / "HDFCBANK.json").read_text(encoding="utf-8"))
    index = json.loads((ROOT / "stocks" / "pilot_asof_financials_v1.json").read_text(encoding="utf-8"))
    company = dict(index["companies"]["HDFCBANK"])
    company["metrics"] = {key: dict(row, source_release=index["sources"][row["source"]]["release_id"])
                          for key, row in company["metrics"].items()}
    vm = build_view_model({"symbol": "HDFCBANK", "canonical_slug": "hdfc-bank", "display_name": "HDFC Bank Limited"}, dossier, asof_company=company)
    assert vm["health"]["debt_to_equity"]["status"] == "NOT_APPLICABLE"
    assert vm["health"]["current_ratio"]["status"] == "NOT_APPLICABLE"


def test_no_eligible_financials_are_explained():
    dossier = json.loads((ROOT / "stocks" / "HD" / "HDFCLIFE.json").read_text(encoding="utf-8"))
    vm = build_view_model({"symbol": "HDFCLIFE", "canonical_slug": "hdfc-life", "display_name": "HDFC Life Insurance Company Limited"}, dossier)
    assert "data coverage gaps" in vm["coverage_notice"]
    assert vm["price"]["value"] is not None
