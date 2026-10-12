"""Publish dated 52-week OHLC ranges without changing certified dossiers.

The range ends on each dossier's price date. Its close must match the dossier
close, so a range from another market session cannot be shown beside that price.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STOCKS = ROOT / "stocks"
OHLC_DB = ROOT.parent / "data" / "ohlc" / "ohlc.sqlite"
DOSSIER_POINTER = ROOT.parent / "data" / "dossiers" / "dossier_current.json"
OUTPUT = STOCKS / "price_range_index_v1.json"


def shard_for(symbol: str) -> str:
    return "".join(ch if ch.isascii() and ch.isalnum() else "_" for ch in symbol[:2]).ljust(2, "_")


def build() -> dict:
    universe = json.loads((STOCKS / "universe_index.json").read_text(encoding="utf-8"))
    pointer = json.loads(DOSSIER_POINTER.read_text(encoding="utf-8"))
    if pointer.get("status") != "PROMOTED":
        raise ValueError("Dossier release is not promoted")
    symbols = [row[0] for row in universe["stocks"]]
    if len(symbols) != universe["count"] or len(set(symbols)) != len(symbols):
        raise ValueError("Canonical universe count or symbols are inconsistent")

    logical_digest = hashlib.sha256()
    ranges: dict[str, dict] = {}
    coverage = {"FULL_YEAR": 0, "PARTIAL_HISTORY": 0, "UNAVAILABLE": 0}
    with sqlite3.connect(OHLC_DB.as_uri() + "?mode=ro", uri=True) as connection:
        connection.execute("PRAGMA query_only=ON")
        for symbol in symbols:
            dossier = json.loads((STOCKS / shard_for(symbol) / f"{symbol}.json").read_text(encoding="utf-8"))
            price = dossier.get("price") or {}
            date = price.get("as_of")
            close = price.get("close")
            if dossier.get("symbol") != symbol or not date or not isinstance(close, (int, float)) or close <= 0:
                raise ValueError(f"Invalid dossier identity or price for {symbol}")
            start = (dt.date.fromisoformat(date) - dt.timedelta(days=364)).isoformat()
            rows = connection.execute(
                "SELECT date, high, low, close FROM ohlc WHERE symbol=? AND date BETWEEN ? AND ? ORDER BY date",
                (symbol + ".NS", start, date),
            ).fetchall()
            if len(rows) < 2 or rows[-1][0] != date or not math.isclose(rows[-1][3], close, abs_tol=0.011):
                ranges[symbol] = {"status": "UNAVAILABLE", "reason": "PRICE_OR_HISTORY_MISMATCH", "price_as_of": date}
                coverage["UNAVAILABLE"] += 1
                continue
            if any(not all(isinstance(value, (int, float)) and math.isfinite(value) and value > 0 for value in row[1:]) or
                   row[2] > row[1] or row[3] < row[2] or row[3] > row[1] for row in rows):
                raise ValueError(f"Invalid OHLC row for {symbol}")
            high = max(row[1] for row in rows)
            low = min(row[2] for row in rows)
            if not low <= close <= high:
                raise ValueError(f"Price outside its source range for {symbol}")
            full_year = len(rows) >= 200 and (dt.date.fromisoformat(rows[0][0]) - dt.date.fromisoformat(start)).days <= 7
            label = "FULL_YEAR" if full_year else "PARTIAL_HISTORY"
            coverage[label] += 1
            ranges[symbol] = {
                "status": "AVAILABLE", "coverage": label, "price_as_of": date,
                "window_start": start, "first_observation": rows[0][0],
                "session_count": len(rows), "reference_close": close,
                "low": low, "high": high,
                "distance_from_high_pct": round((close / high - 1) * 100, 2),
            }
            for row in rows:
                logical_digest.update(json.dumps([symbol, *row], separators=(",", ":"), ensure_ascii=False).encode("utf-8") + b"\n")
    return {
        "contract": "PRICE_RANGE_INDEX_V1", "source": "OHLC_DAILY_HIGH_LOW",
        "dossier_release_id": pointer["release_id"], "universe_as_of": universe["as_of"],
        "canonical_count": len(symbols), "window_calendar_days": 365,
        "source_rows_sha256": logical_digest.hexdigest(), "coverage": coverage,
        "stocks": ranges,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    payload = json.dumps(build(), sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n"
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != payload:
            raise SystemExit("Price range index differs from current dossier and OHLC source")
        print("PASS: price range index matches dossier prices and OHLC source")
    else:
        OUTPUT.write_text(payload, encoding="utf-8")
        print(f"Built {OUTPUT}")
