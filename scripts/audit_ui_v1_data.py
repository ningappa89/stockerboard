"""Read-only coverage audit for the public investor UI contract.

Usage: python scripts/audit_ui_v1_data.py
Prints JSON. It does not rebuild or alter published artifacts.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FIELDS = (
    "mcap",
    "return_1y",
    "sales_growth_3y",
    "debt_to_equity",
    "pe",
    "roe",
)


def present(value: object) -> bool:
    return value is not None and value not in ("", "N/A", "—")


def load_app_data() -> dict:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    marker = "const APP_DATA = "
    start = html.find(marker)
    if start < 0:
        raise ValueError("APP_DATA marker missing from index.html")
    data, _ = json.JSONDecoder().raw_decode(html[start + len(marker) :])
    return data


def audit() -> dict:
    app = load_app_data()
    rows = app["market_screener"]
    fundamentals = json.loads((ROOT / "fundamentals.json").read_text(encoding="utf-8"))["stocks"]
    release = json.loads((ROOT / "release.manifest.json").read_text(encoding="utf-8"))
    dossier_manifest = json.loads((ROOT / "stocks" / "manifest.json").read_text(encoding="utf-8"))
    universe = json.loads((ROOT / "stocks" / "universe_index.json").read_text(encoding="utf-8"))
    universe_symbols = {row[0] for row in universe["stocks"]}
    universe_fields = {
        "price": sum(present(row[2]) for row in universe["stocks"]),
        "sector": sum(present(row[5]) for row in universe["stocks"]),
        "pe": sum(present(fundamentals.get(row[0], {}).get("pe")) for row in universe["stocks"]),
        "roe": sum(present(fundamentals.get(row[0], {}).get("roe")) for row in universe["stocks"]),
        "pb": sum(present(fundamentals.get(row[0], {}).get("pb")) for row in universe["stocks"]),
        "roce": sum(present(fundamentals.get(row[0], {}).get("roce")) for row in universe["stocks"]),
    }
    dossier_count = gold_count = 0
    dossier_symbols: set[str] = set()
    dossier_isins: dict[str, str] = {}
    gold_metrics: Counter[str] = Counter()
    gold_ok_metrics: Counter[str] = Counter()
    for path in (ROOT / "stocks").glob("*/*.json"):
        dossier = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(dossier, dict) or "symbol" not in dossier:
            continue
        dossier_count += 1
        dossier_symbols.add(dossier["symbol"])
        if dossier.get("isin"):
            dossier_isins[dossier["symbol"]] = dossier["isin"]
        gold = dossier.get("fundamental_gold") or {}
        if gold:
            gold_count += 1
            gold_metrics.update((gold.get("metrics") or {}).keys())
            gold_ok_metrics.update(
                key for key, value in (gold.get("metrics") or {}).items()
                if isinstance(value, dict) and value.get("status") == "OK"
            )
    return {
        "market_session": app.get("session_date"),
        "universe_as_of": app.get("universe_as_of"),
        "release_id": release.get("release_id"),
        "screener_count": len(rows),
        "dossier_count": dossier_count,
        "canonical_universe_count": dossier_manifest.get("canonical_universe_count"),
        "embedded_universe_matches_artifact": app.get("universe") == universe["stocks"],
        "universe_field_coverage": universe_fields,
        "manifest_dossier_count": dossier_manifest.get("dossiers_count"),
        "dossier_release_id": dossier_manifest.get("release_id"),
        "dossiers_outside_universe": sorted(dossier_symbols - universe_symbols),
        "outside_universe_identity": [
            {"symbol": symbol, "isin": dossier_isins.get(symbol),
             "canonical_symbols_with_same_isin": sorted(
                 other for other in universe_symbols
                 if dossier_isins.get(symbol) and dossier_isins.get(other) == dossier_isins[symbol]
             )}
            for symbol in sorted(dossier_symbols - universe_symbols)
        ],
        "universe_without_dossier": sorted(universe_symbols - dossier_symbols),
        "dossiers_with_gold": gold_count,
        "fundamentals_snapshot_count": len(fundamentals),
        "screener_field_coverage": {
            field: sum(present(row.get(field)) for row in rows) for field in FIELDS
        },
        "screener_snapshot_coverage": {
            field: sum(
                present(fundamentals.get(row["symbol"], {}).get(field))
                or present(row.get(field))
                for row in rows
            )
            for field in ("pe", "pb", "roe", "roce")
        },
        "gold_metric_coverage": dict(sorted(gold_metrics.items())),
        "gold_metric_ok_coverage": dict(sorted(gold_ok_metrics.items())),
    }


def check_dates() -> dict:
    app = load_app_data()
    home_session = app.get("session_date")
    universe_as_of = app.get("universe_as_of")

    market_index_path = ROOT / "stocks" / "market_universe_index_v1.json"
    market_date = None
    if market_index_path.exists():
        market_date = json.loads(market_index_path.read_text(encoding="utf-8")).get("as_of")

    pilot_manifest_path = ROOT / "pilot_seo_manifest_v1.json"
    pilot_matches = 0
    pilot_total = 0
    mismatched_pilots = []
    if pilot_manifest_path.exists():
        pilot_manifest = json.loads(pilot_manifest_path.read_text(encoding="utf-8"))
        pilot_total = len(pilot_manifest.get("pages", []))
        for p in pilot_manifest.get("pages", []):
            page_file = ROOT / p["target_file"]
            if page_file.exists():
                text = page_file.read_text(encoding="utf-8")
                if "Price as of 16 Oct 2026" in text or f"Price as of {home_session}" in text or 'data-as-of="2026-10-16"' in text:
                    pilot_matches += 1
                else:
                    mismatched_pilots.append(p["symbol"])
            else:
                mismatched_pilots.append(f"{p['symbol']} (missing)")

    dir_path = ROOT / "stocks" / "index.html"
    dir_has_date = False
    if dir_path.exists():
        dir_text = dir_path.read_text(encoding="utf-8")
        dir_has_date = "16 Oct 2026" in dir_text or "2026-10-16" in dir_text

    all_matched = (
        home_session == "2026-10-16"
        and universe_as_of == "2026-10-16"
        and market_date == "2026-10-16"
        and pilot_matches == pilot_total == 20
        and dir_has_date
    )

    return {
        "status": "PASSED" if all_matched else "FAILED",
        "home_session": home_session,
        "universe_as_of": universe_as_of,
        "market_universe_index_as_of": market_date,
        "pilot_pages_checked": pilot_total,
        "pilot_pages_matched": pilot_matches,
        "pilot_pages_mismatched": mismatched_pilots,
        "stocks_directory_has_date": dir_has_date,
        "date_parity_percent": 100.0 if all_matched else round((pilot_matches / max(1, pilot_total)) * 100, 1),
    }


if __name__ == "__main__":
    import sys
    if "--check-dates" in sys.argv:
        res = check_dates()
        print(json.dumps(res, indent=2, sort_keys=True))
        sys.exit(0 if res["status"] == "PASSED" else 1)
    else:
        print(json.dumps(audit(), indent=2, sort_keys=True))
