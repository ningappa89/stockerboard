"""Build the public UI coverage contract from current canonical sources.

Usage: python scripts/build_ui_data_contract.py [--check | --release-gate]
No financial value is calculated or changed by this script.
"""
from __future__ import annotations

import argparse
import copy
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "ui_data_contract_v1.json"


def build(template: dict, financial_index: dict) -> dict:
    """Bind a staged UI contract to the exact certified Dossier projection."""
    if financial_index.get("canonical_count") != 2524 or not financial_index.get("source_dossier_release_id"):
        raise ValueError("Incomplete staged Dossier financial index")
    contract = copy.deepcopy(template)
    contract["source_dossier_release_id"] = financial_index["source_dossier_release_id"]
    for key, covered in financial_index["coverage"].items():
        metric = contract.get("metrics", {}).get(key)
        if metric and metric.get("source") == "certified_public_dossier_v2":
            metric["covered"] = covered
    contract.setdefault("release_gates", {})["canonical_population_reconciled"] = (
        len(financial_index["stocks"]) == 2524)
    contract["ready_for_full_v1_release"] = all(contract["release_gates"].values())
    return contract


def build_contract() -> dict:
    universe = json.loads((ROOT / "stocks/universe_index.json").read_text(encoding="utf-8"))
    financial = json.loads((ROOT / "stocks/financial_index_v1.json").read_text(encoding="utf-8"))
    count = universe["count"]
    symbols = {row[0] for row in universe["stocks"]}
    if count != 2524 or len(symbols) != count or financial["canonical_count"] != count or set(financial["stocks"]) != symbols:
        raise ValueError("financial index and canonical universe differ")
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    pro_date = re.search(r'"session_date"\s*:\s*"(\d{4}-\d{2}-\d{2})"', html)
    if not pro_date:
        raise ValueError("Pro technical session date not found")
    manifest = json.loads((ROOT / "fundamentals.manifest.json").read_text(encoding="utf-8"))

    def field(source: str, covered: int, definition: str, enabled: bool = True) -> dict:
        return {"source": source, "covered": covered, "population": count, "definition": definition, "enabled": enabled and covered > 0}

    cov = financial["coverage"]
    metrics = {
        "price": field("canonical_universe", sum(row[2] is not None for row in universe["stocks"]), "Last price in INR on the canonical universe date; not a live quote."),
        "sector": field("canonical_universe", sum(bool(row[5]) for row in universe["stocks"]), "Published sector label; unavailable when absent."),
        "pe": field("certified_public_dossier_v2", cov["pe"], "Published Dossier V2 P/E; its valuation price date can differ from the list quote date."),
        "pb": field("certified_public_dossier_v2", cov["pb"], "Published Dossier V2 price to book."),
        "roe": field("certified_public_dossier_v2", cov["roe"], "Published Dossier V2 return on equity; period end varies by company."),
        "roce": field("certified_public_dossier_v2", cov["roce"], "Published Dossier V2 return on capital employed; unavailable values stay null."),
        "market_cap": field("certified_public_dossier_v2", cov["market_cap"], "Published Dossier V2 market capitalization in crore; shown on the company page.", False),
        "debt_to_equity": field("certified_public_dossier_v2", cov["debt_to_equity"], "Published Dossier V2 debt/equity where applicable; not a beginner filter.", False),
        "revenue_yoy": field("unavailable_in_public_dossier", 0, "Quarterly revenue growth is not exposed as a certified public Dossier V2 field.", False),
        "return_1y": field("unavailable", 0, "One-year return needs an approved adjusted-price and corporate-action contract.", False),
        "sales_growth_3y": field("unavailable", 0, "Three-year sales growth needs comparable annual periods and scope.", False),
    }

    # Only actual published non-canonical shard files are classified as aliases.
    aliases = []
    canonical_isins = {}
    for symbol in symbols:
        shard = re.sub(r"[^A-Z0-9]", "_", symbol[:2]).ljust(2, "_")
        dossier = json.loads((ROOT / "stocks" / shard / f"{symbol}.json").read_text(encoding="utf-8"))
        if dossier.get("isin"):
            canonical_isins.setdefault(dossier["isin"], []).append(symbol)
    for shard in (ROOT / "stocks").iterdir():
        if not shard.is_dir():
            continue
        for file in shard.glob("*.json"):
            if file.stem in symbols:
                continue
            dossier = json.loads(file.read_text(encoding="utf-8"))
            isin = dossier.get("isin")
            matches = sorted(canonical_isins.get(isin, []))
            aliases.append({"symbol": file.stem, "isin": isin, "canonical_symbols_with_same_isin": matches, "classification": "SAME_ISIN_ALIAS" if len(matches) == 1 else "UNRESOLVED"})

    gates = {
        "canonical_population_reconciled": set(financial["stocks"]) == symbols,
        "dossier_aliases_resolved": all(item["classification"] == "SAME_ISIN_ALIAS" for item in aliases),
        "universe_price_date_present": bool(universe["as_of"]) and metrics["price"]["covered"] == count,
        "full_plan_metric_contracts_present": all(metrics[key]["enabled"] for key in ("market_cap", "return_1y", "sales_growth_3y", "debt_to_equity")),
    }
    return {
        "schema_version": 1,
        "population": {"name": "canonical_universe", "count": count, "canonical_universe_count": count, "claim_full_universe": True},
        "dates": {"pro_market_session": pro_date.group(1), "universe_as_of": universe["as_of"], "fundamentals_source_as_of": manifest["source_as_of"]},
        "metrics": metrics,
        "outside_universe_dossiers": sorted(aliases, key=lambda item: item["symbol"]),
        "release_gates": gates,
        "ready_for_full_v1_release": all(gates.values()),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--release-gate", action="store_true")
    args = parser.parse_args()
    contract = build_contract()
    rendered = json.dumps(contract, indent=2, sort_keys=True) + "\n"
    if args.check:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != rendered:
            print("STALE: ui_data_contract_v1.json")
            return 1
    elif not args.release_gate:
        OUT.write_text(rendered, encoding="utf-8")
    print(json.dumps({"ready_for_full_v1_release": contract["ready_for_full_v1_release"], "release_gates": contract["release_gates"]}, sort_keys=True))
    return 0 if not args.release_gate or contract["ready_for_full_v1_release"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
