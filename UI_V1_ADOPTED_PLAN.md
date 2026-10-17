# Stockerboard public UI V1 — audited and adopted plan

Audit date: 2026-10-08. Scope: the public static site in `stockerboard_repo/index.html` and its published data artifacts. The separate Streamlit investigation workspace in `StockMe/ui` remains the professional workflow. This is a product and code audit, not a study of Stockerboard users; the investor observations below are usability hypotheses to validate with real visitors.

## What already exists

| Proposed capability | Current implementation | Decision |
| --- | --- | --- |
| Beginner landing | Fresher mode has a search hero and five quick screens | Keep the working path; simplify its wording and priorities |
| Search | Company/symbol autocomplete, keyboard navigation, Ctrl+K, and a universal index | Reuse and test against the full universe |
| Results | 350 canonical screener rows, sector selection, sort, pagination, active chips, empty state, mobile table | Rework the beginner presentation after field coverage is proven |
| Advanced tools | Existing sliders, technical presets, Pro mode, watchlist, drawer, charts, journal, and risk tools | Preserve behind progressive disclosure |
| Company view | Full-screen dossier, chart, ratios, peer module, hash deep link `#stock/SYMBOL` | Refactor the information order and explain data provenance; keep deep links working |
| Design system | Extensive CSS variables and Streamlit tokens, but public styles and markup live in one 3.1 MB HTML file | Inventory and consolidate before creating a new component library |
| Data coverage | 2,525 dossier files, 2,524 canonical-universe members; the extra dossier is `ZOMATO`; 2,261 dossiers have `fundamental_gold`; separate fundamentals snapshot has 485 symbols | Reconcile the legacy/out-of-universe dossier and do not imply all metrics cover the same population |

Current public screener evidence: `APP_DATA.session_date` is 2026-09-22 while the search universe and the dossier example are dated 2026-10-01. Of 350 screener rows, 48 contain market cap, none contain a 1-year return, 3-year sales growth, or debt/equity field. The fundamentals snapshot covers all 350 symbols and supplies a usable P/E for 323 and ROE for 339. Published Gold metrics include TTM revenue, quarter/year revenue change, PAT, EPS, and margin; its current contract does not contain 3-year sales growth or debt/equity. The dossier manifest reports one more dossier than canonical-universe members: `ZOMATO` is absent from `universe_index.json`. This needs identity reconciliation before a public universe count is asserted. These counts describe field presence, not independently verified financial accuracy. Regenerate the evidence with `python scripts/audit_ui_v1_data.py`.

## Investor experience critique

1. **The first screen explains trading setups more than company research.** “Breakouts”, “Near 52W High”, momentum, 52-week position, and volume dominate the beginner result. A first-time long-term investor is more likely to ask what the company does, whether it is profitable, how it grew, and what period each number covers. Keep technical discovery in Pro.
2. **Several preset names overstate their rule.** “Quality” currently means ROE at least 15%; “Value” means positive P/E at most 25. These are single-ratio screens, not broad judgments about company quality or cheapness. Rename or qualify them until multi-factor contracts exist. A bank's ROE, a cyclical company's P/E, and high debt can change interpretation.
3. **The proposed seven-column beginner table exceeds current data coverage.** Rendering blank columns or deriving 1-year returns from a 252-session dossier history without a published corporate-action and return contract would make the page look complete while weakening trust. Require field definitions, coverage, as-of dates, and tests first.
4. **Freshness is inconsistent.** The screener session predates the 2026-10-01 dossier/universe release. Each visible price and financial metric needs its own as-of or a clear grouped timestamp. A generic “fresh” label would mislead.
5. **Mobile is functional but dense.** At 375 px the header wraps into several rows; the toolbar precedes the first useful stock. The table avoids horizontal overflow but suppresses much of the comparison. Use compact navigation and cards after the new fields are available.
6. **The dossier starts with setup regime and momentum rather than business context.** Its useful fundamentals panel is lower down. The current `#stock/SYMBOL` route should remain valid; a `/stocks/slug/` route needs static-host rewrite or generated-page support before it is promised.
7. **Some dossier adapters still synthesize financial-looking context.** Missing 52-week bounds can fall back to multiples of the current price, and missing momentum or volume can receive defaults. Remove those fallbacks as part of the trust gate; show “unavailable” with the source period instead.

The comparison is based on current product behavior, not an assertion that other sites' users prefer a particular design. [Screener.in shows a concise company summary, peer comparison, and period tables](https://www.screener.in/company/HDFCBANK/consolidated/). [Tickertape explains preset screens and the move from a simple idea into filters](https://www.tickertape.in/blog/use-pre-built-screens-to-discover-stocks-based-on-favourite-metrics/). [TradingView documents popular screens, applied filters, configurable columns, and saved views](https://www.tradingview.com/support/solutions/43000718866-tradingview-stock-screener-trade-smarter-not-harder/). These are patterns to evaluate with Stockerboard users, not a specification to copy wholesale.

## Revised delivery order

### 0. Data and trust contract — release gate

- Freeze one public data manifest with market session, dossier release, fundamentals release, metric coverage, calculation definition, scope, currency/units, and source lineage. Reconcile market, universe, and dossier dates explicitly.
- Define market cap, 1-year total/price return, 3-year sales growth, debt/equity, P/E, and ROE precisely. Cover sector-specific applicability, negative or zero denominators, corporate actions, and unavailable values. A field may be optional, but its absence must be visible and must not silently pass a filter.
- Decide the beginner population from a single canonical universe and show the real eligible count. Do not display the plan's illustrative “2,213 stocks” or apply presets to an unseen 350-row subset while implying full-market coverage.
- Remove synthetic dossier fallbacks for 52-week range, momentum, volume, and similar displayed metrics. Verify source-backed values or show a neutral unavailable state.
- Gate publication on coverage and source reconciliation. A metric-based preset is enabled only if its input has an approved contract and the applicable coverage is stated.

### 1. UI foundation

- Extract and map existing public CSS variables, typography, component patterns, and theme behavior. Introduce semantic aliases incrementally instead of replacing the stylesheet in one pass.
- Build reusable metric, source/as-of, state, table/card, filter, and disclosure primitives in the existing static architecture. Choose a framework only if a measured maintenance or performance problem warrants migration.
- Add keyboard, focus, touch target, color contrast, and screen-reader checks to the component contract.

### 2. Beginner home and screener

- Keep the hero, working search, and result continuity. Change the copy to accurately describe currently available research.
- Once phase 0 metrics exist, use Quality, Growth, Value, Low Debt, and Price Strength with plain-language, visible rules and coverage. Until then, show only supported screens with honest names such as “ROE ≥ 15%” and “P/E ≤ 25”.
- Show Stock + Sector, Price, Size, 1-year return, P/E, ROE, and 3-year sales growth only where the source contract supports them. Show “—” with an explanation for missing values and make the as-of date easy to find.
- Keep results immediately under search and presets. Move objective cards, market regime, and technical setup content lower or into Pro, preserving their functionality.

### 3. Filters and discovery

- Add a draft/apply filter experience with count feedback, removable chips, reset, and meaningful zero state. Only expose filters backed by phase 0 fields. Missing values must have explicit inclusion rules.
- Serialize supported filter state into the URL without indexing arbitrary combinations. Retain the existing hash dossier route while planning static-host support for clean company URLs.
- Offer relevant sort choices, label the default order, and maintain the order across pagination.

### 4. Company research page

- Reorder the dossier to company identity and business description, price/as-of, what stands out, growth, profitability, health, valuation, trend, peers, then advanced technicals.
- Generate “what stands out” only from audited deterministic rules. Pair each statement with period, source, and caveat. Do not turn single ratios into buy/sell advice.
- Use actual comparable peers and explain selection; permit fewer than four when data does not support four. Preserve watchlist and deep-link behavior.

### 5. Learn and explanation layer

- Keep short explanations beside metrics; link to longer lessons. Use one definition for each metric across screener, company page, filters, and Learn. Explain why a number can be unavailable or non-comparable.

### 6. Mobile and quality

- Use cards for the beginner result on narrow screens and a full-screen filter panel with an Apply count. Rework header wrapping and place the first stock higher.
- Validate common widths, keyboard and screen-reader paths, slow network/loading states, Core Web Vitals on representative devices, and the search → screen → company → filter journey.
- Measure completion and confusion in task tests with novice and experienced Indian equity investors before claiming that the redesign is easier. Record first-result visibility, successful search, filter completion, and missing-data comprehension.

## Release rule

The beginner redesign is ready to publish when the metric contract, population, freshness, and provenance gates pass; core search, watchlist, dossier, and Pro workflows regress cleanly; and mobile/accessible task paths work. Preserve production publication as a separate reviewed action. The current audit adopts the revised sequence and does not certify the existing data or UI for that release.

## Local implementation status — 2026-10-08

The supported portion of the revised plan is implemented locally. Fresher mode now presents plain-language ROE, P/E, and 52-week screens; a 24-row company/price/P/E/ROE table; mobile stock cards; and a draft/apply filter panel with matching count and URL restoration. The company view puts dated price and source-backed financial context before technical tools. Ratio scope, retrieval date, and source link are visible. The company view loads the dated dossier shard before the older screener row, suppresses invented 52-week/momentum/volume defaults when those values are absent, and selects only same-sector peers from the screened data. Pro mode, search, watchlist, hash links, and technical tools remain available.

The entire V1 plan is **not complete or certified for publication**. The initial 350-row beginner screen was extended to the canonical universe in the follow-up below. Market cap, 1-year return, 3-year sales growth, and debt/equity still lack suitable population-wide contracts. Growth and Low Debt presets and the proposed seven-column beginner table require those contracts and coverage first. Clean company URLs require hosting support. Core Web Vitals, screen-reader validation, and investor task studies remain release gates. No production publication or data rebuild is implied by these local UI changes.

### Additional implementation

`ui_data_contract_v1.json` freezes the currently supported metric definitions, coverage, dates, screened population, and release gates. `python scripts/build_ui_data_contract.py --check` detects a stale checked-in contract; `--release-gate` fails until all full V1 data gates pass. The extra `ZOMATO` dossier and canonical `ETERNAL` dossier have the same ISIN (`INE758T01015`), so the contract records a same-ISIN alias without inventing a separate issuer. The beginner page exposes a coverage and date disclosure from this contract. Its sort menu now names direction and places missing ratios last. Browser regression covers sorting, disclosure, filters, source links, keyboard entry, and seven responsive widths.

### Full-universe display repair

Fresher results now use the same 2,524-company canonical universe as search, with 2026-10-01 prices. Pro keeps the separate 350-stock technical snapshot dated 2026-09-22. The ratio snapshot has P/E for 453 and ROE for 471 canonical companies; these values appear in the table, mobile cards, filters, and company view. Published Gold quarterly revenue growth is available for 1,969 company dossiers; the company view shows its own period and scope. Missing ratios remain “—” and are explained in the page's coverage disclosure. Available ratios appear first by default, and users can choose published or numeric sorting. Search suggestions now use the canonical price rather than the older technical snapshot. Same-sector peers come from the canonical universe when the source provides a sector; the other companies are marked sector unavailable. A non-technical universe company with ratios (`3BBLACKBIO`) is covered in browser regression.

The full release gate remains closed because market cap, 1-year return, 3-year sales growth, and debt/equity lack suitable population-wide contracts. User research, screen-reader evaluation, Core Web Vitals measurements, and hosting support for clean company URLs have not been performed. These require new source data, product testing, or deployment configuration; local UI code cannot truthfully fill them in.
