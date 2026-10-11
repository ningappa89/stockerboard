"""Snapshot certified, same-scope Gold stock metrics for the 20 SEO pilot pages.

Only already-computed Gold values are copied. The latest reported value must be
no later than the Dossier financial period and no older than 400 days.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT.parent / "data"
OUTPUT = ROOT / "stocks" / "pilot_asof_financials_v1.json"

SOURCES = {
    "balance_sheet": ("balance_sheet_gold", "balance_sheet_gold_v1_current.json", "balance_sheet_gold_metrics", "balance_sheet_date", ("NET_WORTH", "TOTAL_DEBT", "NET_DEBT", "BOOK_VALUE_PER_SHARE")),
    "ratios": ("financial_ratios_gold", "financial_ratios_gold_v1_current.json", "financial_ratio_metrics", "financial_period_date", ("DEBT_TO_EQUITY", "CURRENT_RATIO")),
}


def build() -> dict:
    registry = json.loads((ROOT / "company_slug_registry_v1.json").read_text(encoding="utf-8"))
    pilot = [c for c in registry["companies"] if c["status"] == "ACTIVE_PILOT"]
    if len(pilot) != 20:
        raise ValueError("Expected exactly 20 pilot companies")
    dossier_pointer = json.loads((DATA / "dossiers" / "dossier_current.json").read_text(encoding="utf-8"))
    result = {"contract": "PILOT_ASOF_FINANCIALS_V1", "dossier_release_id": dossier_pointer["release_id"], "max_age_days": 400, "sources": {}, "companies": {}}
    for company in pilot:
        symbol = company["symbol"]
        shard = "".join(c if c.isascii() and c.isalnum() else "_" for c in symbol[:2]).ljust(2, "_")
        dossier = json.loads((ROOT / "stocks" / shard / f"{symbol}.json").read_text(encoding="utf-8"))["v2_canonical"]
        period = (dossier.get("business_performance") or {}).get("REVENUE_TTM") or {}
        asof = period.get("financial_period_end")
        scope = period.get("scope")
        if not asof or scope not in ("CONSOLIDATED", "STANDALONE"):
            raise ValueError(f"Missing reporting date/scope for {symbol}")
        result["companies"][symbol] = {"company_id": dossier["company"]["canonical_company_id"], "as_of": asof, "scope": scope, "metrics": {}}

    for section, (folder, pointer_name, table, date_col, keys) in SOURCES.items():
        release_root = DATA / "fundamentals" / folder
        pointer = json.loads((release_root / pointer_name).read_text(encoding="utf-8"))
        if pointer.get("status") != "PROMOTED_VALIDATED":
            raise ValueError(f"{section} release is not promoted and validated")
        db_file = release_root / "releases" / pointer["release_file"]
        if not db_file.is_file():
            raise FileNotFoundError(db_file)
        digest = hashlib.sha256()
        with db_file.open("rb") as source:
            for chunk in iter(lambda: source.read(8 * 1024 * 1024), b""):
                digest.update(chunk)
        if digest.hexdigest() != pointer["physical_db_sha256"]:
            raise ValueError(f"{section} release bytes do not match promoted pointer")
        result["sources"][section] = {"release_id": pointer["release_id"], "contract_version": pointer["contract_version"], "physical_db_sha256": pointer["physical_db_sha256"]}
        with sqlite3.connect(db_file.as_uri() + "?mode=ro", uri=True) as conn:
            for symbol, company in result["companies"].items():
                cutoff = (dt.date.fromisoformat(company["as_of"]) - dt.timedelta(days=400)).isoformat()
                for key in keys:
                    # A null latest quarter is expected; select the latest certified
                    # reported value within the same company and reporting scope.
                    rows = conn.execute(
                        f"SELECT {date_col}, value, unit, reason_code, metric_id FROM {table} "
                        f"WHERE canonical_company_id=? AND scope=? AND metric_key=? "
                        f"AND {date_col}<=? AND {date_col}>=? AND value IS NOT NULL "
                        f"AND reason_code='OK' ORDER BY {date_col} DESC LIMIT 1",
                        (company["company_id"], company["scope"], key, company["as_of"], cutoff),
                    ).fetchone()
                    if rows:
                        date, value, unit, reason, metric_id = rows
                        company["metrics"][key] = {"value": value, "unit": unit, "period_end": date, "source": section, "lineage_ref": metric_id}
    return result


if __name__ == "__main__":
    args = argparse.ArgumentParser()
    args.add_argument("--check", action="store_true")
    options = args.parse_args()
    payload = json.dumps(build(), indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    if options.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != payload:
            raise SystemExit("Pilot as-of index differs from promoted Gold sources")
        print("PASS: pilot as-of index matches current certified Gold releases")
    else:
        OUTPUT.write_text(payload, encoding="utf-8")
        print(f"Built {OUTPUT}")
