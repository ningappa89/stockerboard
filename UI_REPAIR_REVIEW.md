# UI repair and completed-task review — 21 October 2026

## Changes
- Repaired the shared company page generator and regenerated all 20 canonical stock pages. The template had Jinja conditionals and loops, but its renderer supports only simple placeholders; raw template code and empty image URLs were reaching the browser.
- Added generated logo markup with local asset validation and an initial fallback. Missing profile and website data are explicitly marked unavailable.
- Synchronized the static quote and provenance strip with the current market quote; removed repeated range explanations and clamped range markers.
- Routed stock-page Learn navigation to /learn/. Root Home consistently opens the beginner home, including after visiting Pro. Home and Pro header links now use real URL navigation.
- Removed the company website source pill and its rendering code. Website links remain available where present.
- Improved stock header wrapping for narrow screens.

## Verification
- 94 tests passed: stock UI regressions, pilot pages, Learn integrity, and financial-index lifecycle.
- 5 Pro snapshot unit tests passed in isolation (--noconftest; these tests do not require database fixtures). The standard suite fixture copies production databases and was not used for this focused verification.
- Company-page generator --pages-only --check passed for all 20 pages.
- Rebuilt UI coverage contract; --check passed.
- Browser verified Asian Paints rendering, matching quote dates, stock-to-Learn navigation, and Learn-to-Home navigation.

## Review of attached completed-task claims
- Published market universe and Pro snapshot both identify 2026-10-19; Home displays that date correctly.
- Financial values retain their certified report dates and statuses. The fundamentals source date remains 2026-10-16; it is separate from the market snapshot date.
- The canonical price universe contains 2,535 companies; the financial index contains 2,524. Full release readiness remains false because population reconciliation and complete planned metric contracts have not passed.
- ROCE and historical growth/return gaps remain explicit rather than being filled with estimates. Financial coverage counts are computed from the current artifacts by the contract builder.
- This review verifies the checked-in publication artifacts and focused pipeline logic. It does not certify scheduler execution or perform a new market ingestion/publication run.


## Follow-up: current market population reconciliation

The earlier 2,524 versus 2,535 comparison was a net difference. Exact symbol comparison found 16 new market symbols and 5 older certified symbols outside the current market cohort.

- The current financial projection now contains exactly the 2,535 current market symbols. Certified values remain unchanged; market-only rows carry null financial values and explicit UNAVAILABLE / DOSSIER_UNAVAILABLE statuses.
- All 16 missing market dossiers were published from the existing dated market corpus, after checking symbol, price and price date. Every one of the 2,535 current symbols now has a matching dossier file.
- The five older certified entries remain in outside_market_stocks and their original dossier files; they are not mixed into current-market coverage. Reintroducing an older symbol preserves its certified values.
- Daily candidate generation now includes the reconciled financial index and all market-only dossiers. Publication validates population equality and reconstructs the expected index from certified dossiers before accepting it.
- Fixed short-history labeling for new listings: observed highs/lows and actual session count replace misleading 52-week labels. Restored price range loading for the smaller certified cohort without requiring its count to equal the market universe.
- Coverage panel and company overview explicitly distinguish market data from pending financial certification.

### Verified results

- canonical_population_reconciled: true
- dossier_aliases_resolved: true
- universe_price_date_present: true
- Current certified dossiers: 2,519
- Current market-only dossiers: 16
- Current company views accounted for: 2,535 / 2,535
- 96 website Python tests passed; 5 focused Pro tests passed; all 7 Node financial-rendering checks passed.
- Isolated daily candidate reproduced the same financial index and all 16 market dossiers.
- Browser checked the ACEVECTOR quote, 11-session history labeling, financials-pending notice, return to Home, and the coverage panel showing 2,519 certified / 16 pending / 2,535 openable.

### Still unavailable

This fixes population alignment and missing company views. It does not certify financial data for the 16 market-only companies. Certified financial completion remains false, as does the pre-existing full-plan metric-contract gate. A new financial ingestion, validation and certified dossier release is needed to fill those values. Empty rows are not presented as certified financial coverage.
