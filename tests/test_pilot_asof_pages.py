"""Pilot pages consume the same certified Dossier values as public stock JSON."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from build_company_seo_pages import build_view_model, generate_pilot_pages  # noqa: E402


def dossier_for(symbol):
    shard = "".join(c if c.isascii() and c.isalnum() else "_" for c in symbol[:2]).ljust(2, "_")
    return json.loads((ROOT / "stocks" / shard / f"{symbol}.json").read_text(encoding="utf-8"))


def range_for(symbol):
    index = json.loads((ROOT / "stocks" / "price_range_index_v1.json").read_text(encoding="utf-8"))
    return index["stocks"][symbol]


def test_20_pages_match_canonical_dossiers():
    manifest, _ = generate_pilot_pages(check_only=True)
    release = json.loads((ROOT / "stocks" / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["pilot_count"] == 20
    assert not (ROOT / "stocks" / "pilot_asof_financials_v1.json").exists()
    for entry in manifest["pages"]:
        dossier = dossier_for(entry["symbol"])
        assert dossier["v2_canonical"]["metadata"]["dossier_contract"] in ("DOSSIER_V2_PIT_1.1.0", "DOSSIER_V2_FY26_ROE_1.0.0")
        for section in ("balance_sheet", "ratios"):
            for envelope in dossier["v2_canonical"][section].values():
                source = envelope.get("source_period")
                target = envelope.get("effective_as_of")
                if source:
                    assert target and source <= target
        html = (ROOT / entry["target_file"]).read_text(encoding="utf-8")
        assert "{{" not in html
        assert entry["symbol"] in html
    assert release["source_dossier_release_id"] == json.loads((ROOT / "stocks" / "financial_index_v1.json").read_text(encoding="utf-8"))["source_dossier_release_id"]


def test_reliance_reports_prior_balance_sheet_but_not_uncertified_roe():
    dossier = dossier_for("RELIANCE")
    vm = build_view_model({"symbol": "RELIANCE", "canonical_slug": "reliance", "display_name": "Reliance Industries Limited"}, dossier, range_row=range_for("RELIANCE"))
    net_worth = dossier["v2_canonical"]["balance_sheet"]["NET_WORTH"]
    assert net_worth["source_period"] == "2026-03-31"
    assert net_worth["effective_as_of"] == "2026-06-30"
    assert vm["health"]["net_worth_crore"]["raw"] == dossier["net_worth_crore"]
    assert vm["health"]["net_worth_crore"]["period_note"] == "Reported 31 Mar 2026 · Balance Sheet Gold"
    assert vm["health"]["debt_to_equity"]["raw"] == dossier["debt_to_equity"]
    assert vm["returns"]["roe"]["status"] == "AVAILABLE"
    assert vm["returns"]["roe"]["card_val"] == "7.7%"
    assert vm["returns"]["roce"]["status"] == "PENDING_LAYER"


def test_financial_company_domain_exclusions_remain_unavailable():
    dossier = dossier_for("HDFCBANK")
    vm = build_view_model({"symbol": "HDFCBANK", "canonical_slug": "hdfc-bank", "display_name": "HDFC Bank Limited"}, dossier, range_row=range_for("HDFCBANK"))
    assert vm["health"]["debt_to_equity"]["status"] == "NOT_APPLICABLE"
    assert vm["health"]["current_ratio"]["status"] == "NOT_APPLICABLE"
