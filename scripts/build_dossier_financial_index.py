"""Build the compact Fresher ratio index from certified public Dossier V2 shards.

This copies published values and dates; it does not calculate financial metrics.
Usage: python scripts/build_dossier_financial_index.py [--check]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "stocks" / "financial_index_v1.json"
RATIOS = ("pe", "pb", "roe", "roce")


def build() -> dict:
    universe = json.loads((ROOT / "stocks" / "universe_index.json").read_text(encoding="utf-8"))
    if universe["count"] != 2524 or len(universe["stocks"]) != 2524:
        raise ValueError("canonical universe count changed")
    stocks: dict[str, dict] = {}
    coverage = {key: 0 for key in (*RATIOS, "market_cap", "debt_to_equity")}
    for row in universe["stocks"]:
        symbol = row[0]
        if symbol in stocks:
            raise ValueError(f"duplicate symbol: {symbol}")
        shard = "".join(ch if ch.isalnum() and ch.isascii() else "_" for ch in symbol[:2]).ljust(2, "_")
        dossier = json.loads((ROOT / "stocks" / shard / f"{symbol}.json").read_text(encoding="utf-8"))
        if dossier["symbol"] != symbol:
            raise ValueError(f"dossier identity mismatch: {symbol}")
        values = {}
        for key in RATIOS:
            value = dossier[key]
            status = dossier["ratios_status"][key]["status"]
            if value is not None and status != "AVAILABLE":
                raise ValueError(f"published ratio status mismatch: {symbol} {key}")
            values[key] = value
            if value is not None:
                coverage[key] += 1
        for key, source_key in (("market_cap", "market_cap_crore"), ("debt_to_equity", "debt_to_equity")):
            if dossier[source_key] is not None:
                coverage[key] += 1
        canonical = dossier.get("v2_canonical") or {}
        values["pe_price_as_of"] = (canonical.get("valuation", {}).get("P_E") or {}).get("price_as_of")
        values["roe_period_end"] = (canonical.get("ratios", {}).get("ROE") or {}).get("financial_period_end")
        stocks[symbol] = values
    return {
        "schema_version": 1,
        "source": "certified_public_dossier_v2",
        "canonical_count": len(stocks),
        "coverage": coverage,
        "stocks": stocks,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    rendered = json.dumps(build(), ensure_ascii=False, separators=(",", ":")) + "\n"
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != rendered:
            raise SystemExit("STALE: stocks/financial_index_v1.json")
    else:
        OUTPUT.write_text(rendered, encoding="utf-8")
    print("PASS: compact financial index matches all 2,524 certified public dossiers")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
