"""Build the compact Fresher ratio index from certified public Dossier V2 shards.

This copies published values and dates; it does not calculate financial metrics.
Usage: python scripts/build_dossier_financial_index.py [--check]
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "stocks" / "financial_index_v1.json"
RATIOS = ("pe", "pb", "roe", "roce", "debt_to_equity", "current_ratio")


def build(stocks_dir: Path = ROOT / "stocks") -> dict:
    stocks_dir = Path(stocks_dir)
    manifest_path = stocks_dir / "manifest.json"
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes)
    release_id = manifest.get("source_dossier_release_id")
    if not release_id or manifest.get("canonical_universe_count") != 2524:
        raise ValueError("public stocks manifest is not tied to a complete Dossier release")
    universe = json.loads((stocks_dir / "universe_index.json").read_text(encoding="utf-8"))
    if universe["count"] != 2524 or len(universe["stocks"]) != 2524:
        raise ValueError("canonical universe count changed")
    stocks: dict[str, dict] = {}
    coverage = {key: 0 for key in (*RATIOS, "market_cap", "debt_to_equity")}
    for row in universe["stocks"]:
        symbol = row[0]
        if symbol in stocks:
            raise ValueError(f"duplicate symbol: {symbol}")
        shard = "".join(ch if ch.isalnum() and ch.isascii() else "_" for ch in symbol[:2]).ljust(2, "_")
        dossier = json.loads((stocks_dir / shard / f"{symbol}.json").read_text(encoding="utf-8"))
        if dossier["symbol"] != symbol:
            raise ValueError(f"dossier identity mismatch: {symbol}")
        values = {}
        ratio_status = {}
        canonical = dossier.get("v2_canonical") or {}
        for key in RATIOS:
            value = dossier[key]
            status = dossier["ratios_status"][key]["status"]
            if value is not None and status != "AVAILABLE":
                raise ValueError(f"published ratio status mismatch: {symbol} {key}")
            if value is None and status == "AVAILABLE":
                raise ValueError(f"available ratio has no value: {symbol} {key}")
            values[key] = value
            section, canonical_key = ({
                "pe": ("valuation", "P_E"), "pb": ("valuation", "P_B"),
                "roe": ("ratios", "ROE"), "roce": ("ratios", "ROCE"),
                "debt_to_equity": ("ratios", "DEBT_TO_EQUITY"),
                "current_ratio": ("ratios", "CURRENT_RATIO"),
            })[key]
            envelope = (canonical.get(section) or {}).get(canonical_key) or {}
            if (status != envelope.get("status") or
                    dossier["ratios_status"][key]["reason"] != envelope.get("reason") or
                    value != envelope.get("value")):
                raise ValueError(f"ratio envelope mismatch: {symbol} {key}")
            ratio_status[key] = {
                "status": status,
                "reason": envelope.get("reason"),
                "scope": envelope.get("scope"),
                "source_period": envelope.get("source_period") or envelope.get("financial_period_end"),
                "effective_as_of": envelope.get("effective_as_of"),
            }
            if value is not None:
                coverage[key] += 1
        values["ratio_status"] = ratio_status
        for key, source_key in (("market_cap", "market_cap_crore"),):
            if dossier[source_key] is not None:
                coverage[key] += 1
        values["market_cap_crore"] = dossier["market_cap_crore"]
        for key in ("net_worth_crore", "total_debt_crore"):
            values[key] = dossier[key]
        values["pe_price_as_of"] = (canonical.get("valuation", {}).get("P_E") or {}).get("price_as_of")
        values["roe_period_end"] = (canonical.get("ratios", {}).get("ROE") or {}).get("financial_period_end")
        for key, canonical_key, section in (
            ("debt_to_equity", "DEBT_TO_EQUITY", "ratios"),
            ("current_ratio", "CURRENT_RATIO", "ratios"),
            ("net_worth", "NET_WORTH", "balance_sheet"),
            ("total_debt", "TOTAL_DEBT", "balance_sheet"),
        ):
            envelope = (canonical.get(section) or {}).get(canonical_key) or {}
            values[f"{key}_source_period"] = envelope.get("source_period") or envelope.get("financial_period_end")
            values[f"{key}_effective_as_of"] = envelope.get("effective_as_of")
        stocks[symbol] = values
    return {
        "schema_version": 1,
        "source": "certified_public_dossier_v2",
        "source_dossier_release_id": release_id,
        "public_manifest_sha256": hashlib.sha256(manifest_bytes).hexdigest(),
        "canonical_count": len(stocks),
        "coverage": coverage,
        "stocks": stocks,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--stocks-dir", type=Path, default=ROOT / "stocks")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    rendered = json.dumps(build(args.stocks_dir), ensure_ascii=False, separators=(",", ":")) + "\n"
    if args.check:
        if not args.output.exists() or args.output.read_text(encoding="utf-8") != rendered:
            raise SystemExit(f"STALE: {args.output}")
    else:
        args.output.write_text(rendered, encoding="utf-8")
    print("PASS: compact financial index matches all 2,524 certified public dossiers")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
