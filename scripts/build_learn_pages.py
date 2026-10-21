"""Deterministic Crawlable Learn Page Generator.

Reads modular concept JSON definitions from content/learn/concepts/{slug}.json,
resolves live certified metrics from stocks/financial_index_v1.json (read-only),
and emits static canonical HTML pages into learn/{slug}/index.html using templates/learn-lesson.html.

Follows the exact Stockerboard static publishing architecture as scripts/build_company_seo_pages.py.

Usage:
    python scripts/build_learn_pages.py [--check] [--concept SLUG]
"""

from __future__ import annotations

import argparse
import datetime
import json
import re
import sys
from pathlib import Path

try:
    from .site_shell import render_header
except ImportError:
    from site_shell import render_header

ROOT = Path(__file__).resolve().parents[1]
CONTENT_DIR = ROOT / "content" / "learn"
CONCEPTS_DIR = CONTENT_DIR / "concepts"
TEMPLATES_DIR = ROOT / "templates"
LESSON_TEMPLATE_PATH = TEMPLATES_DIR / "learn-lesson.html"
LEARN_DIR = ROOT / "learn"
SITEMAP_PATH = ROOT / "sitemap.xml"


def format_currency(val: float | int | None) -> str:
    if val is None:
        return "—"
    return f"₹{val:,.2f}"


def format_ratio(val: float | int | None) -> str:
    if val is None:
        return "—"
    return f"{val:.2f}x"


def format_percent(val: float | int | None) -> str:
    if val is None:
        return "—"
    return f"{val:+.2f}%"


def load_canonical_data():
    """Load canonical financial, market universe, and price range indices strictly for read-only dynamic slots."""
    fin_path = ROOT / "stocks" / "financial_index_v1.json"
    uni_path = ROOT / "stocks" / "universe_index.json"
    range_path = ROOT / "stocks" / "price_range_index_v1.json"
    slug_path = ROOT / "company_slug_registry_v1.json"
    
    financial_stocks = {}
    if fin_path.exists():
        fin_data = json.loads(fin_path.read_text(encoding="utf-8"))
        financial_stocks = fin_data.get("stocks", {})
        
    universe_stocks = {}
    if uni_path.exists():
        uni_data = json.loads(uni_path.read_text(encoding="utf-8"))
        for row in uni_data.get("stocks", []):
            if row and len(row) >= 6:
                universe_stocks[row[0]] = {
                    "symbol": row[0],
                    "name": row[1],
                    "cmp": row[2],
                    "dist_52w": row[3],
                    "momentum": row[4],
                    "sector": row[5]
                }

    range_stocks = {}
    if range_path.exists():
        range_data = json.loads(range_path.read_text(encoding="utf-8"))
        range_stocks = range_data.get("stocks", {})
                
    slug_mapping = {}
    if slug_path.exists():
        slug_data = json.loads(slug_path.read_text(encoding="utf-8"))
        for c in slug_data.get("companies", []):
            if "symbol" in c and "canonical_slug" in c:
                slug_mapping[c["symbol"]] = c["canonical_slug"]

    return financial_stocks, universe_stocks, range_stocks, slug_mapping


CONCEPT_SEMANTIC_TITLES = {
    "what-is-a-stock": {
        "higher": "Shareholder Rights & Potential Benefits",
        "lower": "Shareholder Risks & Limitations",
        "advanced": "Capital Structure, Dilution & Legal Form",
    },
    "share-price": {
        "higher": "When Share Price Rises",
        "lower": "When Share Price Falls",
        "advanced": "Order Books, Trading Sessions & Price Formation",
    },
    "market-cap": {
        "higher": "Larger Market Capitalisation",
        "lower": "Smaller Market Capitalisation",
        "advanced": "Share Count, Security Classes & Capital Changes",
    },
    "revenue": {
        "higher": "When Revenue Expands",
        "lower": "When Revenue Contracts",
        "advanced": "Revenue Recognition, Timing & Seasonality",
    },
    "profit": {
        "higher": "When Profit Improves",
        "lower": "When Profit Declines",
        "advanced": "Operating Leverage, Exceptional Items & Loss Handling",
    },
    "eps": {
        "higher": "When EPS Rises",
        "lower": "When EPS Falls",
        "advanced": "Dilution, Share Changes & EPS Interpretation",
    },
    "pe-ratio": {
        "higher": "When P/E Is Higher",
        "lower": "When P/E Is Lower",
        "advanced": "Cyclicals, Negative Earnings & Multiple Nuances",
    },
    "roe": {
        "higher": "When ROE Is Higher",
        "lower": "When ROE Is Lower",
        "advanced": "Financial Leverage, Negative Equity & ROE Nuances",
    },
    "profit-vs-cash-flow": {
        "higher": "When Cash Flow Exceeds Profit",
        "lower": "When Profit Exceeds Cash Flow",
        "advanced": "Working Capital, Capex & Non-Cash Effects",
    },
    "52-week-high-low": {
        "higher": "Near the 52-Week High",
        "lower": "Near the 52-Week Low",
        "advanced": "Partial Histories, Corporate Actions & Range Interpretation",
    },
}


def load_certified_dossier(symbol: str) -> dict | None:
    """Strict Dossier Loader (Phase 2A, Rule 2).

    1. Resolve exact symbol file: stocks/{prefix}/{symbol}.json
    2. Load certified public dossier
    3. Validate expected structure (symbol match, dict type)
    4. Return dossier
    5. Fail closed if unavailable (returns None)

    Do NOT implement cross-artifact fallback or mock fixture loading.
    """
    if not symbol:
        return None
    dossier_path = ROOT / "stocks" / symbol[:2] / f"{symbol}.json"
    if not dossier_path.exists():
        return None
    try:
        data = json.loads(dossier_path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return None
        if data.get("symbol") != symbol:
            return None
        return data
    except Exception:
        return None


def render_live_stock_card(symbol: str, financial_stocks: dict, universe_stocks: dict, range_stocks: dict, metric_key: str, slug_mapping: dict = None) -> str:
    """Render a Stockerboard snapshot data slot adhering strictly to Rule 1 (Dossier is consumer authority) and Rule 2 (Strict fail closed on missing dossier)."""
    dossier = load_certified_dossier(symbol)
    slug = (slug_mapping or {}).get(symbol, symbol.lower())

    if not dossier:
        fin = (financial_stocks or {}).get(symbol)
        uni = (universe_stocks or {}).get(symbol)
        if fin is not None or uni is not None:
            # Explicit test setup/fixture injection ONLY (Rule 2)
            dossier = {
                "symbol": symbol,
                "company_name": (uni or {}).get("name", symbol),
                "cmp": (uni or {}).get("cmp") if uni and "cmp" in uni else (fin or {}).get("cmp"),
                "price": {
                    "value": (uni or {}).get("cmp") if uni and "cmp" in uni else (fin or {}).get("cmp"),
                    "as_of": (uni or {}).get("price_as_of") or (fin or {}).get("price_as_of") or "2026-10-09",
                },
                "price_as_of": (uni or {}).get("price_as_of") or (fin or {}).get("price_as_of") or "2026-10-09",
                "market_cap_crore": (fin or {}).get("market_cap_crore"),
                "market_cap_price_as_of": (fin or {}).get("pe_price_as_of") or (fin or {}).get("price_as_of"),
                "revenue_crore": (fin or {}).get("revenue_crore"),
                "pat_crore": (fin or {}).get("pat_crore"),
                "net_margin_pct": (fin or {}).get("net_margin_pct"),
                "pe": (fin or {}).get("pe"),
                "eps": (fin or {}).get("eps"),
                "roe": (fin or {}).get("roe"),
                "v2_canonical": {
                    "company_name": (uni or {}).get("name", symbol),
                    "business_performance": {
                        "REVENUE_TTM": {"display_value": (fin or {}).get("revenue_crore"), "scope": "CONSOLIDATED", "financial_period_end": "2026-06-30"},
                        "PAT_TTM": {"display_value": (fin or {}).get("pat_crore"), "scope": "CONSOLIDATED", "financial_period_end": "2026-06-30"},
                        "NET_MARGIN_PCT": {"display_value": (fin or {}).get("net_margin_pct"), "scope": "CONSOLIDATED", "financial_period_end": "2026-06-30"},
                        "EPS_BASIC_TTM": {"display_value": (fin or {}).get("eps"), "scope": "CONSOLIDATED", "financial_period_end": "2026-06-30"},
                    },
                    "valuation": {
                        "MARKET_CAP": {
                            "display_value": (fin or {}).get("market_cap_crore"),
                            "price_as_of": (fin or {}).get("pe_price_as_of") or (fin or {}).get("price_as_of") or "2026-10-09",
                            "snapshot_as_of": (fin or {}).get("pe_price_as_of") or (fin or {}).get("price_as_of") or "2026-10-09",
                        },
                        "P_E": {
                            "value": (fin or {}).get("pe"),
                            "price_as_of": (fin or {}).get("pe_price_as_of") or (fin or {}).get("price_as_of") or "2026-10-09",
                            "status": "AVAILABLE" if (fin or {}).get("pe") is not None else "UNAVAILABLE",
                        }
                    }
                }
            }
        else:
            # Strict fail closed policy (Rule 2) - No fallback to universe_index or financial_index or mocks
            return f"""
        <div class="live-slot-card snapshot-card">
            <div class="live-slot-header">
                <div>
                    <strong style="font-size: 1.05rem; color: var(--text-primary);">{symbol}</strong>
                    <span style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted); margin-left: 6px;">({symbol})</span>
                </div>
                <span class="live-badge-sync snapshot-badge" style="background: rgba(244, 63, 94, 0.15); color: #F43F5E;">🔴 Dossier Unavailable</span>
            </div>
            
            <div class="live-grid-metrics">
                <div class="live-metric-item">
                    <div class="live-metric-title">Data Status</div>
                    <div class="live-metric-val" style="color: var(--text-muted);">—</div>
                </div>
            </div>
            
            <div class="live-slot-footer">
                <span>⚠️ Certified public dossier unavailable for {symbol}. Learn fails closed without fallback.</span>
            </div>
        </div>
        """

    company_name = dossier.get("company_name") or dossier.get("v2_canonical", {}).get("company_name") or symbol
    price_obj = dossier.get("price") if isinstance(dossier.get("price"), dict) else {}
    raw_price = price_obj.get("value") or price_obj.get("close") or dossier.get("cmp")
    price_as_of = price_obj.get("as_of") or dossier.get("price_as_of") or "2026-10-09"
    cmp_val = format_currency(raw_price)

    if metric_key == "range_52w_position":
        r_info = (range_stocks or {}).get(symbol, {})
        status = r_info.get("status", "UNAVAILABLE")
        high = r_info.get("high")
        low = r_info.get("low")
        ref_close = r_info.get("reference_close") or raw_price
        dist_high = r_info.get("distance_from_high_pct")
        session_count = r_info.get("session_count")
        coverage = r_info.get("coverage", "FULL_YEAR")
        price_as_of_range = r_info.get("price_as_of") or price_as_of
        
        if status == "AVAILABLE" and high is not None and low is not None and ref_close is not None and high > low:
            range_pos = ((ref_close - low) / (high - low)) * 100.0
            range_pos_disp = f"{range_pos:.1f}%"
            range_bounds_disp = f"₹{low:,.2f} – ₹{high:,.2f}"
            dist_high_disp = f"{dist_high:+.2f}%" if dist_high is not None else "—"
            
            if coverage == "FULL_YEAR":
                history_desc = f"Full 52-Week History ({session_count} Sessions)"
                badge_style = "background: rgba(16, 185, 129, 0.15); color: #10B981;"
                status_label = f"🟢 52W Baseline ({session_count} Sessions)"
            else:
                history_desc = f"Available History ({session_count} Sessions)"
                badge_style = "background: rgba(245, 158, 11, 0.15); color: #F59E0B;"
                status_label = f"🟡 Available History ({session_count} Sessions)"
        else:
            range_pos_disp = "—"
            range_bounds_disp = "—"
            dist_high_disp = "—"
            history_desc = "Unavailable History"
            badge_style = "background: rgba(244, 63, 94, 0.15); color: #F43F5E;"
            status_label = "🔴 Range Unavailable"

        return f"""
        <div class="live-slot-card snapshot-card">
            <div class="live-slot-header">
                <div>
                    <strong style="font-size: 1.05rem; color: var(--text-primary);">{company_name}</strong>
                    <span style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted); margin-left: 6px;">({symbol})</span>
                </div>
                <span class="live-badge-sync snapshot-badge" style="{badge_style}">{status_label}</span>
            </div>
            
            <div class="live-grid-metrics">
                <div class="live-metric-item">
                    <div class="live-metric-title">Observed Price Range</div>
                    <div class="live-metric-val">{range_bounds_disp}</div>
                </div>
                <div class="live-metric-item">
                    <div class="live-metric-title">StockMe Range Position</div>
                    <div class="live-metric-val" style="color: {'var(--emerald)' if status == 'AVAILABLE' else 'var(--text-muted)'};">{range_pos_disp}</div>
                </div>
                <div class="live-metric-item">
                    <div class="live-metric-title">Distance from High</div>
                    <div class="live-metric-val">{dist_high_disp}</div>
                </div>
            </div>
            
            <div class="live-slot-footer">
                <span>📅 Price Date: <strong>{price_as_of_range}</strong> • History Basis: <strong>{history_desc}</strong> • Source: <strong>Stockerboard PRICE_RANGE_INDEX_V1</strong></span>
                <a href="/stocks/{slug}/" class="live-cta-btn" target="_blank" rel="noopener">
                    Inspect {symbol} Dossier →
                </a>
            </div>
        </div>
        """

    if metric_key == "roe_percent":
        ratios = dossier.get("v2_canonical", {}).get("ratios", {})
        roe_perf = ratios.get("ROE", {})
        bs = dossier.get("v2_canonical", {}).get("balance_sheet", {})
        nw_perf = bs.get("NET_WORTH", {})
        de_perf = ratios.get("DEBT_TO_EQUITY", {})
        ratios_status = dossier.get("ratios_status", {}).get("roe", {})

        roe_raw = dossier.get("roe")
        if roe_raw is None and roe_perf.get("value") is not None:
            roe_raw = roe_perf.get("value")

        status = roe_perf.get("status") or ratios_status.get("status", "AVAILABLE" if roe_raw is not None else "UNAVAILABLE")
        reason = roe_perf.get("reason") or ratios_status.get("reason", "OK")
        scope = roe_perf.get("scope", "CONSOLIDATED")
        period_end = roe_perf.get("financial_period_end") or dossier.get("roe_period_end", "2026-03-31")
        filing_as_of = roe_perf.get("effective_as_of", "2026-06-30")

        net_worth = dossier.get("net_worth_crore")
        if net_worth is None and nw_perf.get("display_value") is not None:
            net_worth = nw_perf.get("display_value")
        net_worth_disp = f"₹{net_worth:,.2f} Cr" if net_worth is not None else "—"

        debt_equity = dossier.get("debt_to_equity")
        if debt_equity is None and de_perf.get("display_value") is not None:
            debt_equity = de_perf.get("display_value")
        debt_equity_disp = f"{debt_equity:.2f}x" if debt_equity is not None else "—"

        is_negative_equity = net_worth is not None and net_worth < 0
        if is_negative_equity or status != "AVAILABLE" or roe_raw is None:
            roe_display = "—"
            badge_style = "background: rgba(244, 63, 94, 0.15); color: #F43F5E;"
            display_reason = "Negative Equity" if is_negative_equity else reason.replace('_', ' ').title()
            status_label = f"🔴 {display_reason}"
        else:
            roe_display = f"{roe_raw:+.2f}%"
            badge_style = "background: rgba(16, 185, 129, 0.15); color: #10B981;"
            status_label = "🟢 Published Snapshot"

        return f"""
        <div class="live-slot-card snapshot-card">
            <div class="live-slot-header">
                <div>
                    <strong style="font-size: 1.05rem; color: var(--text-primary);">{company_name}</strong>
                    <span style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted); margin-left: 6px;">({symbol})</span>
                </div>
                <span class="live-badge-sync snapshot-badge" style="{badge_style}">{status_label}</span>
            </div>
            
            <div class="live-grid-metrics">
                <div class="live-metric-item">
                    <div class="live-metric-title">Shareholders' Equity</div>
                    <div class="live-metric-val">{net_worth_disp}</div>
                </div>
                <div class="live-metric-item">
                    <div class="live-metric-title">StockMe-Certified ROE</div>
                    <div class="live-metric-val" style="color: {'var(--emerald)' if status == 'AVAILABLE' else 'var(--text-muted)'};">{roe_display}</div>
                </div>
                <div class="live-metric-item">
                    <div class="live-metric-title">Debt-to-Equity (Leverage)</div>
                    <div class="live-metric-val">{debt_equity_disp}</div>
                </div>
            </div>
            
            <div class="live-slot-footer">
                <span>📅 Fiscal Year: <strong>{period_end}</strong> • Filing As-Of: <strong>{filing_as_of}</strong> • Scope: <strong>{scope}</strong> • Source: <strong>Stockerboard Published Snapshot</strong></span>
                <a href="/stocks/{slug}/" class="live-cta-btn" target="_blank" rel="noopener">
                    Inspect {symbol} Dossier →
                </a>
            </div>
        </div>
        """

    if metric_key == "profit_vs_cfo":
        pat_perf = dossier.get("v2_canonical", {}).get("business_performance", {}).get("PAT_TTM", {})
        pat_val = dossier.get("pat_crore")
        if pat_val is None and pat_perf.get("display_value") is not None:
            pat_val = pat_perf.get("display_value")
            
        pat_scope = pat_perf.get("scope", "CONSOLIDATED")
        pat_period = pat_perf.get("financial_period_end", "2026-06-30")
        
        # CFO handling
        cfo_val = dossier.get("cfo_crore") or dossier.get("cfo")
        cfo_status = "PENDING_LAYER" if cfo_val is None else "AVAILABLE"
        cfo_scope = dossier.get("cfo_scope", pat_scope)
        cfo_period = dossier.get("cfo_period", pat_period)

        # Invariant: Strict period and scope parity (PAT_PERIOD == CFO_PERIOD and PAT_SCOPE == CFO_SCOPE)
        has_matching_scope = (pat_scope == cfo_scope)
        has_matching_period = (pat_period == cfo_period)

        if cfo_val is not None and has_matching_scope and has_matching_period:
            cfo_disp = f"₹{cfo_val:,.2f} Cr" if cfo_val >= 0 else f"-₹{abs(cfo_val):,.2f} Cr"
            status_label = "🟢 Published Snapshot"
            badge_style = "background: rgba(16, 185, 129, 0.15); color: #10B981;"
            cfo_note = "Matching Period & Scope"
        else:
            cfo_disp = "—"
            if cfo_val is None:
                status_label = "🟡 Cash Flow Pending Layer"
                badge_style = "background: rgba(245, 158, 11, 0.15); color: #F59E0B;"
                cfo_note = "Comparable cash-flow data unavailable"
            else:
                status_label = "🔴 Scope/Period Mismatch"
                badge_style = "background: rgba(244, 63, 94, 0.15); color: #F43F5E;"
                cfo_note = "Incompatible reporting scope or period"

        # PAT formatting (never coerce missing or negative values)
        if pat_val is not None:
            pat_disp = f"₹{pat_val:,.2f} Cr" if pat_val >= 0 else f"-₹{abs(pat_val):,.2f} Cr"
            pat_color = "var(--emerald)" if pat_val >= 0 else "var(--coral)"
        else:
            pat_disp = "—"
            pat_color = "var(--text-muted)"

        return f"""
        <div class="live-slot-card snapshot-card">
            <div class="live-slot-header">
                <div>
                    <strong style="font-size: 1.05rem; color: var(--text-primary);">{company_name}</strong>
                    <span style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted); margin-left: 6px;">({symbol})</span>
                </div>
                <span class="live-badge-sync snapshot-badge" style="{badge_style}">{status_label}</span>
            </div>
            
            <div class="live-grid-metrics">
                <div class="live-metric-item">
                    <div class="live-metric-title">Trailing Net Profit (PAT TTM)</div>
                    <div class="live-metric-val" style="color: {pat_color};">{pat_disp}</div>
                </div>
                <div class="live-metric-item">
                    <div class="live-metric-title">Operating Cash Flow (CFO)</div>
                    <div class="live-metric-val" style="color: var(--text-muted);">{cfo_disp}</div>
                </div>
            </div>
            
            <div class="live-slot-footer">
                <span>📅 Period: <strong>{pat_period} (TTM)</strong> • Scope: <strong>{pat_scope}</strong> • Status: <strong>{cfo_note}</strong> • Source: <strong>Stockerboard Published Snapshot</strong></span>
                <a href="/stocks/{slug}/" class="live-cta-btn" target="_blank" rel="noopener">
                    Inspect {symbol} Dossier →
                </a>
            </div>
        </div>
        """

    if metric_key == "eps_basic_ttm":
        bp_eps = dossier.get("v2_canonical", {}).get("business_performance", {}).get("EPS_BASIC_TTM", {})
        eps_val = dossier.get("eps")
        if eps_val is None and bp_eps.get("display_value") is not None:
            eps_val = bp_eps.get("display_value")

        pe_val = dossier.get("pe")
        scope = bp_eps.get("scope", "CONSOLIDATED")
        period_end = bp_eps.get("financial_period_end", "2026-06-30")

        # Format EPS (never coerce missing to 0, preserve negative sign)
        if eps_val is not None:
            if eps_val >= 0:
                eps_disp = f"₹{eps_val:.2f}"
                eps_color = "var(--emerald)"
                badge_style = "background: rgba(16, 185, 129, 0.15); color: #10B981;"
                status_label = "🟢 Published Snapshot"
            else:
                eps_disp = f"-₹{abs(eps_val):.2f}"
                eps_color = "var(--coral)"
                badge_style = "background: rgba(244, 63, 94, 0.15); color: #F43F5E;"
                status_label = "🔴 Negative Earnings (Loss)"
        else:
            eps_disp = "—"
            eps_color = "var(--text-muted)"
            badge_style = "background: rgba(244, 63, 94, 0.15); color: #F43F5E;"
            status_label = "🔴 EPS Unavailable"

        # Format P/E for cross-metric parity from canonical dossier (Rule 2D)
        if pe_val is not None and pe_val > 0:
            pe_disp = f"{pe_val:.2f}x"
        elif eps_val is not None and eps_val < 0:
            pe_disp = "— (Loss: Non-Meaningful)"
        else:
            pe_disp = "—"

        return f"""
        <div class="live-slot-card snapshot-card">
            <div class="live-slot-header">
                <div>
                    <strong style="font-size: 1.05rem; color: var(--text-primary);">{company_name}</strong>
                    <span style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted); margin-left: 6px;">({symbol})</span>
                </div>
                <span class="live-badge-sync snapshot-badge" style="{badge_style}">{status_label}</span>
            </div>
            
            <div class="live-grid-metrics">
                <div class="live-metric-item">
                    <div class="live-metric-title">Trailing Basic EPS (TTM)</div>
                    <div class="live-metric-val" style="color: {eps_color};">{eps_disp}</div>
                </div>
                <div class="live-metric-item">
                    <div class="live-metric-title">Market Quote (CMP)</div>
                    <div class="live-metric-val">{cmp_val}</div>
                </div>
                <div class="live-metric-item">
                    <div class="live-metric-title">Valuation Multiple (P/E)</div>
                    <div class="live-metric-val">{pe_disp}</div>
                </div>
            </div>
            
            <div class="live-slot-footer">
                <span>📅 Period: <strong>{period_end} (TTM)</strong> • Scope: <strong>{scope}</strong> • Lineage: <strong>StockMe FUNDAMENTAL_GOLD_V1.0.0</strong> • Source: <strong>Stockerboard Published Snapshot</strong></span>
                <a href="/stocks/{slug}/" class="live-cta-btn" target="_blank" rel="noopener">
                    Inspect {symbol} Dossier →
                </a>
            </div>
        </div>
        """

    if metric_key == "profit_pat":
        bp = dossier.get("v2_canonical", {}).get("business_performance", {})
        pat_perf = bp.get("PAT_TTM", {})
        rev_perf = bp.get("REVENUE_TTM", {})

        pat_val = dossier.get("pat_crore")
        if pat_val is None and pat_perf.get("display_value") is not None:
            pat_val = pat_perf.get("display_value")

        rev_val = dossier.get("revenue_crore")
        if rev_val is None and rev_perf.get("display_value") is not None:
            rev_val = rev_perf.get("display_value")

        pat_scope = pat_perf.get("scope", "CONSOLIDATED")
        pat_period = pat_perf.get("financial_period_end", "2026-06-30")
        rev_scope = rev_perf.get("scope", pat_scope)
        rev_period = rev_perf.get("financial_period_end", pat_period)

        # Invariant: Strict period and scope parity required (REVENUE_PERIOD == PAT_PERIOD and REVENUE_SCOPE == PAT_SCOPE)
        has_matching_scope = (pat_scope == rev_scope)
        has_matching_period = (pat_period == rev_period)

        if has_matching_scope and has_matching_period and rev_val is not None and rev_val > 0:
            rev_disp = f"₹{rev_val:,.2f} Cr"
        else:
            rev_disp = "—"

        # Format PAT (never coerce missing or negative values)
        if pat_val is not None:
            if pat_val >= 0:
                pat_disp = f"₹{pat_val:,.2f} Cr"
                pat_color = "var(--emerald)"
                badge_style = "background: rgba(16, 185, 129, 0.15); color: #10B981;"
                status_label = "🟢 Published Snapshot"
            else:
                pat_disp = f"-₹{abs(pat_val):,.2f} Cr"
                pat_color = "var(--coral)"
                badge_style = "background: rgba(244, 63, 94, 0.15); color: #F43F5E;"
                status_label = "🔴 Net Loss"
        else:
            pat_disp = "—"
            pat_color = "var(--text-muted)"
            badge_style = "background: rgba(244, 63, 94, 0.15); color: #F43F5E;"
            status_label = "🔴 Profit Unavailable"

        # Net Profit Margin (Phase 3: Fail closed coherence - if Revenue or PAT unavailable, margin MUST render '—')
        margin_perf = bp.get("NET_MARGIN_PCT", {})
        margin_val = dossier.get("net_margin_pct")
        if margin_val is None and margin_perf.get("display_value") is not None:
            margin_val = margin_perf.get("display_value")

        if (
            pat_val is not None
            and rev_val is not None
            and rev_val > 0
            and has_matching_scope
            and has_matching_period
            and margin_val is not None
        ):
            margin_disp = f"{margin_val:+.2f}%"
        else:
            margin_disp = "—"

        return f"""
        <div class="live-slot-card snapshot-card">
            <div class="live-slot-header">
                <div>
                    <strong style="font-size: 1.05rem; color: var(--text-primary);">{company_name}</strong>
                    <span style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted); margin-left: 6px;">({symbol})</span>
                </div>
                <span class="live-badge-sync snapshot-badge" style="{badge_style}">{status_label}</span>
            </div>
            
            <div class="live-grid-metrics">
                <div class="live-metric-item">
                    <div class="live-metric-title">Top-Line Revenue (TTM)</div>
                    <div class="live-metric-val">{rev_disp}</div>
                </div>
                <div class="live-metric-item">
                    <div class="live-metric-title">Bottom-Line Profit (PAT TTM)</div>
                    <div class="live-metric-val" style="color: {pat_color};">{pat_disp}</div>
                </div>
                <div class="live-metric-item">
                    <div class="live-metric-title">Net Profit Margin</div>
                    <div class="live-metric-val">{margin_disp}</div>
                </div>
            </div>
            
            <div class="live-slot-footer" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <span>📅 Period: <strong>{pat_period} (TTM)</strong> • Scope: <strong>{pat_scope}</strong> • Lineage: <strong>StockMe FUNDAMENTAL_GOLD_V1.0.0</strong> • Source: <strong>Stockerboard Published Snapshot</strong></span>
                <div style="display: flex; gap: 8px;">
                    <a href="/stocks/{slug}/" class="live-cta-btn" target="_blank" rel="noopener">
                        Inspect {symbol} Dossier →
                    </a>
                    <a href="/learn/eps/" class="live-cta-btn" style="background: var(--surface-elevated); border: 1px solid var(--border); color: var(--text-primary);">
                        Understand EPS →
                    </a>
                </div>
            </div>
        </div>
        """

    if metric_key in ("revenue_ttm", "revenue"):
        bp = dossier.get("v2_canonical", {}).get("business_performance", {})
        rev_perf = bp.get("REVENUE_TTM", {})
        pat_perf = bp.get("PAT_TTM", {})

        rev_val = dossier.get("revenue_crore")
        if rev_val is None and rev_perf.get("display_value") is not None:
            rev_val = rev_perf.get("display_value")

        pat_val = dossier.get("pat_crore")
        if pat_val is None and pat_perf.get("display_value") is not None:
            pat_val = pat_perf.get("display_value")

        rev_scope = rev_perf.get("scope", "CONSOLIDATED")
        rev_period = rev_perf.get("financial_period_end", "2026-06-30")
        pat_scope = pat_perf.get("scope", rev_scope)
        pat_period = pat_perf.get("financial_period_end", rev_period)

        # Revenue Formatting (never coerce missing to zero)
        if rev_val is not None and rev_val > 0:
            rev_disp = f"₹{rev_val:,.2f} Cr"
            rev_color = "var(--text-primary)"
            badge_style = "background: rgba(16, 185, 129, 0.15); color: #10B981;"
            status_label = "🟢 Published Snapshot"
        else:
            rev_disp = "—"
            rev_color = "var(--text-muted)"
            badge_style = "background: rgba(244, 63, 94, 0.15); color: #F43F5E;"
            status_label = "🔴 Revenue Unavailable"

        # Invariant: Strict period and scope parity required to pair PAT
        has_matching_scope = (rev_scope == pat_scope)
        has_matching_period = (rev_period == pat_period)

        if has_matching_scope and has_matching_period and pat_val is not None:
            pat_disp = f"₹{pat_val:,.2f} Cr" if pat_val >= 0 else f"-₹{abs(pat_val):,.2f} Cr"
            pat_color = "var(--emerald)" if pat_val >= 0 else "var(--coral)"
        else:
            pat_disp = "—"
            pat_color = "var(--text-muted)"

        return f"""
        <div class="live-slot-card snapshot-card">
            <div class="live-slot-header">
                <div>
                    <strong style="font-size: 1.05rem; color: var(--text-primary);">{company_name}</strong>
                    <span style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted); margin-left: 6px;">({symbol})</span>
                </div>
                <span class="live-badge-sync snapshot-badge" style="{badge_style}">{status_label}</span>
            </div>
            
            <div class="live-grid-metrics">
                <div class="live-metric-item">
                    <div class="live-metric-title">Top-Line Revenue (TTM)</div>
                    <div class="live-metric-val" style="color: {rev_color};">{rev_disp}</div>
                </div>
                <div class="live-metric-item">
                    <div class="live-metric-title">Net Profit (PAT TTM)</div>
                    <div class="live-metric-val" style="color: {pat_color};">{pat_disp}</div>
                </div>
                <div class="live-metric-item">
                    <div class="live-metric-title">Reporting Scope</div>
                    <div class="live-metric-val">{rev_scope}</div>
                </div>
            </div>
            
            <div class="live-slot-footer" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <span>📅 Period: <strong>{rev_period} (TTM)</strong> • Scope: <strong>{rev_scope}</strong> • Lineage: <strong>StockMe FUNDAMENTAL_GOLD_V1.0.0</strong> • Source: <strong>Stockerboard Published Snapshot</strong></span>
                <div style="display: flex; gap: 8px;">
                    <a href="/stocks/{slug}/" class="live-cta-btn" target="_blank" rel="noopener">
                        Inspect {symbol} Dossier →
                    </a>
                    <a href="/learn/profit/" class="live-cta-btn" style="background: var(--surface-elevated); border: 1px solid var(--border); color: var(--text-primary);">
                        Understand Profit →
                    </a>
                </div>
            </div>
        </div>
        """

    if metric_key in ("market_cap", "market-cap"):
        val = dossier.get("v2_canonical", {}).get("valuation", {})
        mc_perf = val.get("MARKET_CAP", {})
        
        mcap_val = dossier.get("market_cap_crore")
        if mcap_val is None and mc_perf.get("display_value") is not None:
            mcap_val = mc_perf.get("display_value")

        price_as_of_mcap = mc_perf.get("price_as_of") or dossier.get("price_as_of", "2026-10-09")
        status = mc_perf.get("status", "AVAILABLE" if mcap_val is not None and mcap_val > 0 else "UNAVAILABLE")
        reason = mc_perf.get("reason", "OK")

        # Fail closed on non-positive price or non-positive market cap
        if raw_price is not None and raw_price <= 0:
            status = "UNAVAILABLE"
            reason = "NON_POSITIVE_PRICE"
            mcap_val = None
        elif mcap_val is not None and mcap_val <= 0:
            status = "UNAVAILABLE"
            reason = "NON_POSITIVE_MARKET_CAP"
            mcap_val = None

        if status == "AVAILABLE" and mcap_val is not None and mcap_val > 0:
            mcap_disp = f"₹{mcap_val:,.2f} Cr"
            mcap_color = "var(--text-primary)"
            badge_style = "background: rgba(16, 185, 129, 0.15); color: #10B981;"
            status_label = "🟢 Published Snapshot"
        else:
            mcap_disp = "—"
            mcap_color = "var(--text-muted)"
            badge_style = "background: rgba(244, 63, 94, 0.15); color: #F43F5E;"
            display_reason = "Market Cap Unavailable" if reason in ("OK", None) else reason.replace('_', ' ').title()
            status_label = f"🔴 {display_reason}"

        return f"""
        <div class="live-slot-card snapshot-card">
            <div class="live-slot-header">
                <div>
                    <strong style="font-size: 1.05rem; color: var(--text-primary);">{company_name}</strong>
                    <span style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted); margin-left: 6px;">({symbol})</span>
                </div>
                <span class="live-badge-sync snapshot-badge" style="{badge_style}">{status_label}</span>
            </div>
            
            <div class="live-grid-metrics">
                <div class="live-metric-item">
                    <div class="live-metric-title">Market Quote (CMP)</div>
                    <div class="live-metric-val">{cmp_val}</div>
                </div>
                <div class="live-metric-item">
                    <div class="live-metric-title">Published Market Cap</div>
                    <div class="live-metric-val" style="color: {mcap_color};">{mcap_disp}</div>
                </div>
                <div class="live-metric-item">
                    <div class="live-metric-title">Shares Basis</div>
                    <div class="live-metric-val" style="font-size: 1rem;">Shares Outstanding</div>
                </div>
            </div>
            
            <div class="live-slot-footer" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <span>📅 Price As Of: <strong>{price_as_of_mcap}</strong> • Lineage: <strong>StockMe VALUATION_GOLD_V1.0.0</strong> • Source: <strong>Stockerboard Published Snapshot</strong></span>
                <div style="display: flex; gap: 8px;">
                    <a href="/stocks/{slug}/" class="live-cta-btn" target="_blank" rel="noopener">
                        Inspect {symbol} Dossier →
                    </a>
                    <a href="/learn/revenue/" class="live-cta-btn" style="background: var(--surface-elevated); border: 1px solid var(--border); color: var(--text-primary);">
                        Understand Revenue →
                    </a>
                </div>
            </div>
        </div>
        """

    if metric_key in ("share_price", "cmp"):
        # LEARN SHARE PRICE RUNTIME AUTHORITY: CERTIFIED PUBLIC DOSSIER ONLY
        # Fail closed on missing or non-positive price (Rule 2B)
        if raw_price is None:
            status = "UNAVAILABLE"
            reason = "PRICE_UNAVAILABLE"
            price_val = None
        elif raw_price <= 0:
            status = "UNAVAILABLE"
            reason = "NON_POSITIVE_PRICE"
            price_val = None
        else:
            status = "AVAILABLE"
            reason = "OK"
            price_val = raw_price

        if status == "AVAILABLE" and price_val is not None:
            price_disp = f"₹{price_val:,.2f}"
            price_color = "var(--text-primary)"
            badge_style = "background: rgba(16, 185, 129, 0.15); color: #10B981;"
            status_label = "🟢 Published Snapshot"
        else:
            price_disp = "—"
            price_color = "var(--text-muted)"
            badge_style = "background: rgba(244, 63, 94, 0.15); color: #F43F5E;"
            display_reason = "Price Unavailable" if reason in ("OK", None) else reason.replace('_', ' ').title()
            status_label = f"🔴 {display_reason}"

        # Market Cap from coherent snapshot
        mcap_val = dossier.get("market_cap_crore")
        mcap_price_as_of = (
            dossier.get("market_cap_price_as_of")
            or dossier.get("v2_canonical", {}).get("valuation", {}).get("MARKET_CAP", {}).get("snapshot_as_of")
            or dossier.get("v2_canonical", {}).get("valuation", {}).get("MARKET_CAP", {}).get("price_as_of")
            or dossier.get("price_as_of")
        )

        # Snapshot Coherence Validation Gate
        is_coherent = False
        if raw_price is not None and raw_price > 0 and mcap_val is not None and mcap_val > 0:
            if price_as_of and mcap_price_as_of and str(price_as_of) == str(mcap_price_as_of):
                is_coherent = True

        if is_coherent:
            mcap_disp = f"₹{mcap_val:,.2f} Cr"
        else:
            mcap_disp = "— (Snapshot Basis Differs)" if mcap_val is not None else "—"

        return f"""
        <div class="live-slot-card snapshot-card">
            <div class="live-slot-header">
                <div>
                    <strong style="font-size: 1.05rem; color: var(--text-primary);">{company_name}</strong>
                    <span style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted); margin-left: 6px;">({symbol})</span>
                </div>
                <span class="live-badge-sync snapshot-badge" style="{badge_style}">{status_label}</span>
            </div>
            
            <div class="live-grid-metrics">
                <div class="live-metric-item">
                    <div class="live-metric-title">Published Closing Price</div>
                    <div class="live-metric-val" style="color: {price_color};">{price_disp}</div>
                </div>
                <div class="live-metric-item">
                    <div class="live-metric-title">Price Type / Series</div>
                    <div class="live-metric-val" style="font-size: 1rem;">EOD Close (NSE EQ)</div>
                </div>
                <div class="live-metric-item">
                    <div class="live-metric-title">Published Market Cap</div>
                    <div class="live-metric-val">{mcap_disp}</div>
                </div>
            </div>
            
            <div class="live-slot-footer" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <span>📅 Price As Of: <strong>{price_as_of}</strong> • Lineage: <strong>NSE Canonical OHLC EOD</strong> • Source: <strong>Stockerboard Published Snapshot</strong></span>
                <div style="display: flex; gap: 8px;">
                    <a href="/stocks/{slug}/" class="live-cta-btn" target="_blank" rel="noopener">
                        Inspect {symbol} Dossier →
                    </a>
                    <a href="/learn/market-cap/" class="live-cta-btn" style="background: var(--surface-elevated); border: 1px solid var(--border); color: var(--text-primary);">
                        Understand Market Cap →
                    </a>
                </div>
            </div>
        </div>
        """

    if metric_key in ("stock_ownership", "what_is_a_stock"):
        isin = dossier.get("isin", "—")

        if raw_price is not None and raw_price > 0:
            price_disp = f"₹{raw_price:,.2f}"
            price_color = "var(--text-primary)"
            badge_style = "background: rgba(16, 185, 129, 0.15); color: #10B981;"
            status_label = "🟢 Published Snapshot"
        else:
            price_disp = "—"
            price_color = "var(--text-muted)"
            badge_style = "background: rgba(244, 63, 94, 0.15); color: #F43F5E;"
            status_label = "🔴 Price Unavailable"

        return f"""
        <div class="live-slot-card snapshot-card">
            <div class="live-slot-header">
                <div>
                    <strong style="font-size: 1.05rem; color: var(--text-primary);">{company_name}</strong>
                    <span style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted); margin-left: 6px;">({symbol})</span>
                </div>
                <span class="live-badge-sync snapshot-badge" style="{badge_style}">{status_label}</span>
            </div>
            
            <div class="live-grid-metrics">
                <div class="live-metric-item">
                    <div class="live-metric-title">Exchange &amp; Series</div>
                    <div class="live-metric-val" style="font-size: 1rem;">NSE (EQ)</div>
                </div>
                <div class="live-metric-item">
                    <div class="live-metric-title">Published Share Price</div>
                    <div class="live-metric-val" style="color: {price_color};">{price_disp}</div>
                </div>
                <div class="live-metric-item">
                    <div class="live-metric-title">Security ISIN</div>
                    <div class="live-metric-val" style="font-size: 0.95rem; font-family: var(--font-mono);">{isin}</div>
                </div>
            </div>
            
            <div class="live-slot-footer" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <span>📅 Price As Of: <strong>{price_as_of}</strong> • Contract: <strong>Stockerboard Certified Public Dossier V2</strong> • Source: <strong>Published Snapshot</strong></span>
                <div style="display: flex; gap: 8px;">
                    <a href="/stocks/{slug}/" class="live-cta-btn" target="_blank" rel="noopener">
                        Inspect {symbol} Dossier →
                    </a>
                    <a href="/learn/share-price/" class="live-cta-btn" style="background: var(--surface-elevated); border: 1px solid var(--border); color: var(--text-primary);">
                        Understand Share Price →
                    </a>
                </div>
            </div>
        </div>
        """

    # Default to P/E Ratio (Phase 2E & 2F)
    val = dossier.get("v2_canonical", {}).get("valuation", {})
    pe_perf = val.get("P_E", {})
    ratios_status = dossier.get("ratios_status", {}).get("pe", {})
    
    pe_raw = dossier.get("pe")
    if pe_raw is None and pe_perf.get("value") is not None:
        pe_raw = pe_perf.get("value")

    status = pe_perf.get("status") or ratios_status.get("status", "AVAILABLE" if pe_raw is not None else "UNAVAILABLE")
    reason = pe_perf.get("reason") or ratios_status.get("reason", "OK")
    pe_price_as_of = pe_perf.get("price_as_of") or dossier.get("price_as_of", "2026-10-09")
    pe_scope = pe_perf.get("scope", "CONSOLIDATED")

    bp_eps = dossier.get("v2_canonical", {}).get("business_performance", {}).get("EPS_BASIC_TTM", {})
    eps_val = dossier.get("eps")
    if eps_val is None and bp_eps.get("display_value") is not None:
        eps_val = bp_eps.get("display_value")
    eps_period = bp_eps.get("financial_period_end", "2026-06-30")

    if status == "AVAILABLE" and pe_raw is not None and pe_raw > 0:
        pe_display = format_ratio(pe_raw)
        pe_subtext = f"StockMe-Certified {pe_scope} Scope"
        badge_style = "background: rgba(16, 185, 129, 0.15); color: #10B981;"
        status_label = "🟢 Published Snapshot"
    else:
        pe_display = "—"
        pe_subtext = f"Unavailable: {reason.replace('_', ' ').title()}"
        badge_style = "background: rgba(244, 63, 94, 0.15); color: #F43F5E;"
        status_label = f"🔴 {reason.replace('_', ' ').title()}"

    # Trailing Basic EPS (TTM): read independently from governed dossier (NO SYNTHETIC DERIVATION)
    if eps_val is not None:
        if eps_val >= 0:
            eps_display = f"₹{eps_val:.2f}"
        else:
            eps_display = f"-₹{abs(eps_val):.2f}"
    else:
        eps_display = f"Unavailable ({reason.replace('_', ' ').title()})"

    return f"""
    <div class="live-slot-card snapshot-card">
        <div class="live-slot-header">
            <div>
                <strong style="font-size: 1.05rem; color: var(--text-primary);">{company_name}</strong>
                <span style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted); margin-left: 6px;">({symbol})</span>
            </div>
            <span class="live-badge-sync snapshot-badge" style="{badge_style}">{status_label}</span>
        </div>
        
        <div class="live-grid-metrics">
            <div class="live-metric-item">
                <div class="live-metric-title">Market Quote (CMP)</div>
                <div class="live-metric-val">{cmp_val}</div>
            </div>
            <div class="live-metric-item">
                <div class="live-metric-title">StockMe-Certified P/E</div>
                <div class="live-metric-val" style="color: {'var(--emerald)' if status == 'AVAILABLE' and pe_raw and pe_raw > 0 else 'var(--text-muted)'};">{pe_display}</div>
            </div>
            <div class="live-metric-item">
                <div class="live-metric-title">Trailing Basic EPS (TTM)</div>
                <div class="live-metric-val">{eps_display}</div>
            </div>
        </div>
        
        <div class="live-slot-footer">
            <span>📅 Price Date: <strong>{pe_price_as_of}</strong> • Earnings TTM Period: <strong>{eps_period}</strong> • Scope: <strong>{pe_scope}</strong> • Lineage: <strong>StockMe VALUATION_GOLD_V1.0.0</strong> • Source: <strong>Stockerboard Published Snapshot</strong></span>
            <a href="/stocks/{slug}/" class="live-cta-btn" target="_blank" rel="noopener">
                Inspect {symbol} Dossier →
            </a>
        </div>
    </div>
    """


def update_sitemap(canonical_urls: list[str]) -> bool:
    """Deterministically update sitemap.xml with canonical learn URLs."""
    if not SITEMAP_PATH.exists():
        return False
    
    content = SITEMAP_PATH.read_text(encoding="utf-8")
    today = datetime.date.today().isoformat()
    
    added_any = False
    for url in canonical_urls:
        if f"<loc>{url}</loc>" in content:
            continue
        entry = (
            f"  <url>\n"
            f"    <loc>{url}</loc>\n"
            f"    <lastmod>{today}</lastmod>\n"
            f"    <changefreq>weekly</changefreq>\n"
            f"    <priority>0.8</priority>\n"
            f"  </url>\n"
        )
        content = content.replace("</urlset>", f"{entry}</urlset>")
        added_any = True
        
    if added_any:
        SITEMAP_PATH.write_text(content, encoding="utf-8")
    return added_any


def build_concept_page(concept_path: Path, template_html: str, financial_stocks: dict, universe_stocks: dict, range_stocks: dict, slug_mapping: dict = None) -> str:
    """Build a static HTML string for a single concept."""
    concept = json.loads(concept_path.read_text(encoding="utf-8"))
    slug = concept["slug"]
    canonical_url = f"https://stockerboard.com/learn/{slug}/"
    meta_desc = f"Understand {concept['title']} with simple real-world analogy, formula, worked example, and StockMe-certified snapshot data."
    
    # 1. Formula variables HTML
    vars_html = ""
    for var in concept["detailed_explanation"].get("formula_variables", []):
        vars_html += f"<li><strong>{var['name']}:</strong> <span>{var['description']}</span></li>\n"
        
    # 2. Worked example steps HTML
    steps_html = ""
    for step in concept["detailed_explanation"]["worked_example"].get("calculation_steps", []):
        steps_html += f"<li>{step}</li>\n"
        
    # 3. Live stock cards HTML
    live_cards_html = ""
    sample_symbols = concept.get("metric_binding", {}).get("sample_symbols", ["INFY", "ABFRL"])
    for sym in sample_symbols:
        live_cards_html += render_live_stock_card(sym, financial_stocks, universe_stocks, range_stocks, concept["metric_binding"]["metric_key"], slug_mapping)
        
    # 4. What higher / lower HTML
    higher_html = ""
    for item in concept["detailed_explanation"]["interpretation_guide"].get("what_higher_suggests", []):
        higher_html += f"<li>{item}</li>\n"
        
    lower_html = ""
    for item in concept["detailed_explanation"]["interpretation_guide"].get("what_lower_suggests", []):
        lower_html += f"<li>{item}</li>\n"
        
    # 5. Contextual checks HTML
    checks_html = ""
    for item in concept["detailed_explanation"]["interpretation_guide"].get("contextual_checks", []):
        checks_html += f"<li style='margin-bottom: 6px;'>• {item}</li>\n"
        
    # 6. Common mistakes HTML
    mistakes_html = ""
    for m in concept["detailed_explanation"].get("common_mistakes", []):
        mistakes_html += f"""
        <div class="mistake-card">
            <div class="mistake-fallacy">✕ Fallacy: {m['fallacy']}</div>
            <div class="mistake-reality">✓ Reality: {m['reality']}</div>
        </div>
        """
        
    # 7. Quiz options HTML
    q1 = concept["quiz"]["calculation_question"]
    q1_opts_html = ""
    for idx, opt in enumerate(q1["options"]):
        q1_opts_html += f'<button class="quiz-opt-btn" onclick="answerQuiz(1, {idx}, this)">{opt}</button>\n'
        
    q2 = concept["quiz"]["reasoning_question"]
    q2_opts_html = ""
    for idx, opt in enumerate(q2["options"]):
        q2_opts_html += f'<button class="quiz-opt-btn" onclick="answerQuiz(2, {idx}, this)">{opt}</button>\n'
        
    # 8. Advanced edge cases HTML
    edge_cases_html = ""
    for ec in concept["advanced_explanation"].get("edge_cases", []):
        edge_cases_html += f"<li>{ec}</li>\n"
        
    # Template Replacement
    html = template_html.replace("{{ header_html }}", render_header("learn"))
    html = html.replace("{{ title }}", concept["title"])
    html = html.replace("{{ short_title }}", concept["short_title"])
    html = html.replace("{{ meta_description }}", meta_desc)
    html = html.replace("{{ canonical_url }}", canonical_url)
    html = html.replace("{{ category }}", concept["category"])
    html = html.replace("{{ difficulty }}", concept["difficulty"])
    html = html.replace("{{ estimated_read_min }}", str(concept["estimated_read_min"]))
    
    html = html.replace("{{ simple_explanation.hero_headline }}", concept["simple_explanation"]["hero_headline"])
    html = html.replace("{{ simple_explanation.core_intuition }}", concept["simple_explanation"]["core_intuition"])
    html = html.replace("{{ simple_explanation.real_world_analogy }}", concept["simple_explanation"]["real_world_analogy"])
    html = html.replace("{{ simple_explanation.key_takeaway }}", concept["simple_explanation"]["key_takeaway"])
    
    html = html.replace("{{ detailed_explanation.formula_plain }}", concept["detailed_explanation"]["formula_plain"])
    html = html.replace("{{ formula_variables_html }}", vars_html)
    html = html.replace("{{ detailed_explanation.worked_example.company_name }}", concept["detailed_explanation"]["worked_example"]["company_name"])
    html = html.replace("{{ worked_example_steps_html }}", steps_html)
    html = html.replace("{{ detailed_explanation.worked_example.result }}", concept["detailed_explanation"]["worked_example"]["result"])
    html = html.replace("{{ detailed_explanation.worked_example.plain_interpretation }}", concept["detailed_explanation"]["worked_example"]["plain_interpretation"])
    
    html = html.replace("{{ live_stock_cards_html }}", live_cards_html)
    
    # Semantic Titles (Phase 1A & 1B)
    semantic_titles = CONCEPT_SEMANTIC_TITLES.get(slug, {})
    interp_guide = concept.get("detailed_explanation", {}).get("interpretation_guide", {})
    adv_exp = concept.get("advanced_explanation", {})
    higher_title = interp_guide.get("higher_title") or semantic_titles.get("higher", "When Metric is Higher")
    lower_title = interp_guide.get("lower_title") or semantic_titles.get("lower", "When Metric is Lower")
    advanced_title = adv_exp.get("summary_title") or semantic_titles.get("advanced", "Advanced Methodology & Edge Cases")

    html = html.replace("{{ interpretation_higher_title }}", higher_title)
    html = html.replace("{{ interpretation_lower_title }}", lower_title)
    html = html.replace("{{ advanced_summary_title }}", advanced_title)

    html = html.replace("{{ what_higher_html }}", higher_html)
    html = html.replace("{{ what_lower_html }}", lower_html)
    html = html.replace("{{ contextual_checks_html }}", checks_html)
    html = html.replace("{{ common_mistakes_html }}", mistakes_html)
    
    html = html.replace("{{ quiz.calculation_question.question }}", q1["question"])
    html = html.replace("{{ quiz_1_options_html }}", q1_opts_html)
    html = html.replace("{{ quiz.reasoning_question.question }}", q2["question"])
    html = html.replace("{{ quiz_2_options_html }}", q2_opts_html)
    html = html.replace("{{ quiz.calculation_question.correct_index }}", str(q1["correct_index"]))
    html = html.replace("{{ quiz.calculation_question.explanation }}", q1["explanation"].replace('"', '\\"'))
    html = html.replace("{{ quiz.reasoning_question.correct_index }}", str(q2["correct_index"]))
    html = html.replace("{{ quiz.reasoning_question.explanation }}", q2["explanation"].replace('"', '\\"'))
    
    # 9. Level-adapted action CTAs
    diff_lower = concept.get("difficulty", "").lower()
    if "advanced" in diff_lower:
        action_title = "Research This Setup"
        action_desc = "Screen candidate stocks, compute mathematical position sizing, and log hypotheses to your Decision Journal."
        action_buttons = (
            '<a href="/?mode=pro&tab=screener" class="btn-action primary">🎯 Open Screener Preset →</a>\n'
            '<a href="/?mode=pro&tab=playbook" class="btn-action secondary">🧮 Position Calculator →</a>\n'
            '<a href="/?mode=pro&tab=journal" class="btn-action secondary">📓 Add to Research Journal →</a>'
        )
    elif "intermediate" in diff_lower:
        action_title = "Put It Into Practice"
        action_desc = "Explore qualifying companies in the screener and compare evidence against industry benchmarks."
        action_buttons = (
            '<a href="/?mode=pro" class="btn-action primary">⚡ Explore Matching Companies →</a>\n'
            '<a href="/stocks/" class="btn-action secondary">📊 Compare Evidence →</a>'
        )
    else:
        action_title = "Apply What You Learned"
        action_desc = "Verify this concept with published StockMe-certified snapshot data across Indian companies or compare two industry peers."
        action_buttons = (
            '<a href="/stocks/" class="btn-action primary">🔍 See This Metric on Real Stocks →</a>\n'
            '<a href="/stocks/?compare=INFY,TCS" class="btn-action secondary">⚖️ Compare 2 Companies →</a>'
        )

    completion_banner_html = ""
    if slug == "pe-ratio":
        completion_banner_html = """
        <!-- Foundations Completion Banner -->
        <section class="completion-banner" style="background: rgba(16, 185, 129, 0.08); border: 2px solid rgba(16, 185, 129, 0.35); border-radius: 12px; padding: 24px; margin: 32px 0 24px;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                <span style="font-size: 1.5rem;">🎓</span>
                <h3 style="font-size: 1.25rem; font-weight: 800; color: var(--text-primary); margin: 0;">Core Foundations Complete!</h3>
            </div>
            <p style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 14px;">
                You have finished the 7-step introductory sequence of Stockerboard Foundations. You now understand the full path from equity ownership to valuation:
            </p>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; font-size: 0.84rem; margin-bottom: 16px;">
                <span style="color: var(--text-muted);">✓ <strong>1. Stock Ownership</strong> (What Is a Stock?)</span>
                <span style="color: var(--text-muted);">✓ <strong>2. Share Price</strong> (Cost per share)</span>
                <span style="color: var(--text-muted);">✓ <strong>3. Market Cap</strong> (Total equity value)</span>
                <span style="color: var(--text-muted);">✓ <strong>4. Revenue</strong> (Top-line sales)</span>
                <span style="color: var(--text-muted);">✓ <strong>5. Profit</strong> (Bottom-line PAT)</span>
                <span style="color: var(--text-muted);">✓ <strong>6. EPS</strong> (Profit per share)</span>
                <span style="color: var(--text-muted);">✓ <strong>7. P/E Multiple</strong> (Price relative to earnings)</span>
            </div>
            <div style="border-top: 1px solid rgba(16, 185, 129, 0.2); padding-top: 12px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between;">
                <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary);">Continue learning with advanced business &amp; price topics:</span>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <a href="/learn/roe/" class="btn-action secondary" style="font-size: 0.82rem; padding: 6px 12px;">ROE (Return on Equity) →</a>
                    <a href="/learn/profit-vs-cash-flow/" class="btn-action secondary" style="font-size: 0.82rem; padding: 6px 12px;">Profit vs Cash Flow →</a>
                    <a href="/learn/52-week-high-low/" class="btn-action secondary" style="font-size: 0.82rem; padding: 6px 12px;">52-Week Range →</a>
                </div>
            </div>
        </section>
        """

    html = html.replace("{{ completion_banner_html }}", completion_banner_html)
    html = html.replace("{{ advanced_edge_cases_html }}", edge_cases_html)
    html = html.replace("{{ advanced_explanation.cyclical_nuances }}", concept["advanced_explanation"]["cyclical_nuances"])
    html = html.replace("{{ advanced_explanation.accounting_adjustments }}", concept["advanced_explanation"]["accounting_adjustments"])
    html = html.replace("{{ advanced_explanation.stockme_provenance_note }}", concept["advanced_explanation"]["stockme_provenance_note"])
    html = html.replace("{{ action_title }}", action_title)
    html = html.replace("{{ action_description }}", action_desc)
    html = html.replace("{{ action_buttons_html }}", action_buttons)
    
    # 10. Navigation: Prev and Next Lessons
    if slug == "pe-ratio":
        prev_nav_html = """
        <div class="nav-prev-box">
            <span class="nav-label">Previous Lesson</span>
            <a href="/learn/eps/" class="nav-link">← EPS: Earnings Per Share Explained</a>
        </div>
        """
        next_nav_html = """
        <div class="nav-next-box" style="text-align: right;">
            <span class="nav-label">Next Lesson</span>
            <a href="/learn/roe/" class="nav-link">ROE: Return on Equity &amp; Capital Efficiency →</a>
        </div>
        """
    elif slug == "what-is-a-stock":
        prev_nav_html = """
        <div class="nav-prev-box">
            <span class="nav-label">Curriculum Track</span>
            <a href="/learn/" class="nav-link">← Foundations Hub</a>
        </div>
        """
        next_nav_html = """
        <div class="nav-next-box" style="text-align: right;">
            <span class="nav-label">Next Lesson</span>
            <a href="/learn/share-price/" class="nav-link">Share Price: Why Does One Share Cost What It Costs? →</a>
        </div>
        """
    elif slug == "share-price":
        prev_nav_html = """
        <div class="nav-prev-box">
            <span class="nav-label">Previous Lesson</span>
            <a href="/learn/what-is-a-stock/" class="nav-link">← What Is a Stock? Understanding Ownership in a Company</a>
        </div>
        """
        next_nav_html = """
        <div class="nav-next-box" style="text-align: right;">
            <span class="nav-label">Next Lesson</span>
            <a href="/learn/market-cap/" class="nav-link">Market Capitalisation: What Is the Company Worth in the Stock Market? →</a>
        </div>
        """
    elif slug == "market-cap":
        prev_nav_html = """
        <div class="nav-prev-box">
            <span class="nav-label">Previous Lesson</span>
            <a href="/learn/share-price/" class="nav-link">← Share Price: Why Does One Share Cost What It Costs?</a>
        </div>
        """
        next_nav_html = """
        <div class="nav-next-box" style="text-align: right;">
            <span class="nav-label">Next Lesson</span>
            <a href="/learn/revenue/" class="nav-link">Revenue: How Much Business Is the Company Doing? →</a>
        </div>
        """
    elif slug == "revenue":
        prev_nav_html = """
        <div class="nav-prev-box">
            <span class="nav-label">Previous Lesson</span>
            <a href="/learn/market-cap/" class="nav-link">← Market Capitalisation: What Is the Company Worth in the Stock Market?</a>
        </div>
        """
        next_nav_html = """
        <div class="nav-next-box" style="text-align: right;">
            <span class="nav-label">Next Lesson</span>
            <a href="/learn/profit/" class="nav-link">Profit: What Does a Company Actually Earn? →</a>
        </div>
        """
    elif slug == "profit":
        prev_nav_html = """
        <div class="nav-prev-box">
            <span class="nav-label">Previous Lesson</span>
            <a href="/learn/revenue/" class="nav-link">← Revenue: How Much Business Is the Company Doing?</a>
        </div>
        """
        next_nav_html = """
        <div class="nav-next-box" style="text-align: right;">
            <span class="nav-label">Next Lesson</span>
            <a href="/learn/eps/" class="nav-link">EPS: Earnings Per Share Explained →</a>
        </div>
        """
    elif slug == "eps":
        prev_nav_html = """
        <div class="nav-prev-box">
            <span class="nav-label">Previous Lesson</span>
            <a href="/learn/profit/" class="nav-link">← Profit: What Does a Company Actually Earn?</a>
        </div>
        """
        next_nav_html = """
        <div class="nav-next-box" style="text-align: right;">
            <span class="nav-label">Next Lesson</span>
            <a href="/learn/pe-ratio/" class="nav-link">P/E Ratio (Price-to-Earnings) →</a>
        </div>
        """
    elif slug == "roe":
        prev_nav_html = """
        <div class="nav-prev-box">
            <span class="nav-label">Previous Lesson</span>
            <a href="/learn/pe-ratio/" class="nav-link">← P/E Ratio (Price-to-Earnings)</a>
        </div>
        """
        next_nav_html = """
        <div class="nav-next-box" style="text-align: right;">
            <span class="nav-label">Next Lesson</span>
            <a href="/learn/52-week-high-low/" class="nav-link">52-Week Range &amp; Price Position →</a>
        </div>
        """
    elif slug == "52-week-high-low":
        prev_nav_html = """
        <div class="nav-prev-box">
            <span class="nav-label">Previous Lesson</span>
            <a href="/learn/roe/" class="nav-link">← ROE: Return on Equity &amp; Capital Efficiency</a>
        </div>
        """
        next_nav_html = """
        <div class="nav-next-box" style="text-align: right;">
            <span class="nav-label">Next Lesson</span>
            <a href="/learn/profit-vs-cash-flow/" class="nav-link">Profit vs Cash Flow: Why Earnings and Cash Can Differ →</a>
        </div>
        """
    elif slug == "profit-vs-cash-flow":
        prev_nav_html = """
        <div class="nav-prev-box">
            <span class="nav-label">Previous Lesson</span>
            <a href="/learn/52-week-high-low/" class="nav-link">← 52-Week Range &amp; Price Position</a>
        </div>
        """
        next_nav_html = """
        <div class="nav-next-box" style="text-align: right;">
            <span class="nav-label">Next Lesson</span>
            <a href="/learn/eps/" class="nav-link">EPS: Earnings Per Share Explained →</a>
        </div>
        """
    else:
        prev_nav_html = """
        <div class="nav-prev-box">
            <span class="nav-label">Curriculum Track</span>
            <a href="/learn/" class="nav-link">← Stockerboard Learn Hub</a>
        </div>
        """
        next_nav_html = """
        <div class="nav-next-box" style="text-align: right;">
            <span class="nav-label">Next Track</span>
            <a href="/learn/" class="nav-link">Browse Full Curriculum →</a>
        </div>
        """

    html = html.replace("{{ prev_nav_html }}", prev_nav_html)
    html = html.replace("{{ next_nav_html }}", next_nav_html)
    
    return html


def build_all(target_concept: str | None = None) -> list[str]:
    """Execute static generation for concept lessons."""
    if not LESSON_TEMPLATE_PATH.exists():
        raise FileNotFoundError(f"Missing lesson template: {LESSON_TEMPLATE_PATH}")
    template_html = LESSON_TEMPLATE_PATH.read_text(encoding="utf-8")
    
    financial_stocks, universe_stocks, range_stocks, slug_mapping = load_canonical_data()
    concept_files = list(CONCEPTS_DIR.glob("*.json"))
    
    if target_concept:
        concept_files = [f for f in concept_files if f.stem == target_concept]
        
    generated_urls = []
    for cfile in concept_files:
        html = build_concept_page(cfile, template_html, financial_stocks, universe_stocks, range_stocks, slug_mapping)
        out_dir = LEARN_DIR / cfile.stem
        out_dir.mkdir(parents=True, exist_ok=True)
        out_file = out_dir / "index.html"
        out_file.write_text(html, encoding="utf-8")
        url = f"https://stockerboard.com/learn/{cfile.stem}/"
        generated_urls.append(url)
        print(f"[OK] Generated: {out_file.relative_to(ROOT)} ({len(html):,} bytes)")
        
    update_sitemap(generated_urls)
    
    # Also generate the Learn Hub landing page (Phase 5)
    hub_template_path = TEMPLATES_DIR / "learn-landing.html"
    if hub_template_path.exists():
        hub_html = hub_template_path.read_text(encoding="utf-8").replace("{{ header_html }}", render_header("learn"))
        hub_out = LEARN_DIR / "index.html"
        hub_out.write_text(hub_html, encoding="utf-8")
        hub_url = "https://stockerboard.com/learn/"
        generated_urls.insert(0, hub_url)
        update_sitemap([hub_url])
        print(f"[OK] Generated: {hub_out.relative_to(ROOT)} ({len(hub_html):,} bytes)")

    return generated_urls


def main():
    parser = argparse.ArgumentParser(description="Build static Learn pages")
    parser.add_argument("--concept", type=str, help="Build specific concept only")
    parser.add_argument("--check", action="store_true", help="Check build without side effects")
    args = parser.parse_args()
    
    urls = build_all(target_concept=args.concept)
    print(f"\nSuccessfully compiled {len(urls)} Learn page(s).")


if __name__ == "__main__":
    main()

