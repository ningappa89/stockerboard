# Home research for the canonical universe — implementation plan

Prepared 2026-10-08. This is a plan, not a certification or a data rebuild.

## Product contract

- Home search resolves every active member of the canonical equity universe (currently 2,524) by current symbol, company name, and approved historical alias. It opens the same company dossier regardless of Pro scan membership.
- Pro screens and scan signals consume only their dated StockMe scan cohort (currently 350 in the public snapshot). Scan membership must not control search, ratio collection, or company page availability.
- A company page displays every **supported, valid, available** metric. A missing numeric value has a machine-readable reason and a plain-language explanation. Do not promise that every metric is numerically applicable to every issuer.
- A field is never filled by ticker-only matching, an undated fallback, a stale retained snapshot, or a value with an incompatible accounting scope.

## Current baseline

`ui_data_contract_v1.json` records 2,524 canonical companies and prices, but P/E for 453, ROE for 471, P/B for 429, ROCE for 473, sector for 246, and Gold revenue year-on-year for 1,969. The Pro market session is 2026-09-22; the universe price date is 2026-10-01. The fundamentals exporter has 485 symbols and merges older snapshot records. The weekly enrichment job selects companies near their 52-week high (default limit 150), so it cannot be the full-universe ratio pipeline. The ZOMATO dossier is a same-ISIN alias of canonical ETERNAL.

## Target architecture

```text
canonical universe + identity bridge
  -> research ingestion (all members; source-per-field; independent of scans)
  -> immutable observations / calculation inputs
  -> validated company research read model + coverage manifest
  -> static company shards and search index -> Home

StockMe scan engine -> dated, bounded scan snapshot -> Pro

certified/promoted Fundamental Gold -> approved filing-derived research metrics
dated price source -> price-dependent research metrics
```

Home and Pro may share identity and price infrastructure, but neither may treat the other's population as its authority. Publication should point atomically to a complete research release, retaining the preceding release for rollback.

## Work packages, in order

### 1. Freeze identity and field contracts

1. Use the canonical universe builder in `StockMe/core/analytics/canonical_universe.py` as the membership authority. Version its manifest and reconcile the 2,524 company IDs, symbols, ISINs, aliases, and dossier paths. Explicitly map ZOMATO to ETERNAL by approved identity evidence; reject ambiguous symbol reuse.
2. Define a field catalog: formula, unit, valid range, source, fiscal period, consolidation scope, publication/retrieval date, freshness policy, sector applicability, and UI label for each metric. Treat `period_end` as calculation truth, issuer fiscal labels as presentation, and period IDs as lineage.
3. Define `AVAILABLE`, `NOT_APPLICABLE`, `NOT_COLLECTED`, `SOURCE_FAILED`, `STALE`, `IDENTITY_AMBIGUOUS`, `SCOPE_MISMATCH`, and `CALCULATION_BLOCKED`. Do not represent these distinct states with an unexplained null.
4. Do not enable market cap, one-year return, three-year sales growth, or debt/equity until each has an approved source and formula. The existing contract identifies these as unsupported.

### 2. Approve sources before expanding ingestion

1. Inventory existing prices, certified/promoted Gold, issuer filings, ratios, and company profiles. Record the actual upstream origin of every stored field. The current HTML collector visits Screener.in while storing provider `NSE_PUBLIC`; correct this provenance in a versioned migration, without rewriting old evidence.
2. Select an authorized source for broad-universe ratio/profile data and verify display, storage, redistribution, volume, and refresh rights. Evaluate official filings plus internally defined calculations for filing-derived metrics, and licensed exchange/vendor feeds for price, company profile, and any sourced ratios. Do not scale HTML scraping as the full-universe solution.
3. Keep a source decision record for each field, including fallback precedence and what happens when a source becomes unavailable. The plan can proceed through identity/schema/coverage work while source selection is pending; production numeric coverage cannot be certified without it.

### 3. Build the independent research pipeline

1. Add a scheduled `sync_company_research_universe` pipeline keyed by canonical company ID and versioned universe manifest. Partition work into resumable batches; support retries, rate limits, checkpointing, and changed-company incremental refresh. Never derive its population from `get_52w_high_universe()` or `APP_DATA.market_screener`.
2. Store immutable observations with `canonical_company_id`, source symbol/ISIN, metric, value, unit, period end, accounting scope, source publication time, retrieval time, source document/payload hash, provider, calculation version, and status. Preserve rejected/older observations for audit; select one eligible value per company/field/read-model release.
3. Compute filing-derived measures only from approved, comparable inputs. Define P/E using a dated price and compatible positive TTM EPS; ROE using the approved earnings/equity period and scope; P/B and ROCE with explicit formulas. Handle banks, financial firms, negative earnings/equity, and unavailable share-count or corporate-action adjustments by applicability/status rules, not fabricated values.
4. Build sector/industry through its own canonical profile source, with taxonomy version and provenance. Do not infer a sector from scanned peers or broad labels such as “NSE Equities.”
5. Replace the `_assemble_stocks()` retention rule in `StockMe/core/fundamentals/fundamentals_snapshot.py` for the new read model. An older entry must pass the same identity, provenance, scope, and freshness checks as a new one. Quarantine unverified legacy entries; do not silently delete their raw evidence.

### 4. Publish a versioned research read model

1. Build a candidate release in a temporary directory/database. Validate, then atomically promote a manifest/pointer; leave the current public release intact on failure.
2. Emit a compact search index for 2,524 members and a shard per canonical company. Add `research_release_id`, `universe_manifest_hash`, source revisions, generated time, per-field status, source and dates. Keep aliases as redirects to the canonical shard.
3. Extend `stockerboard_repo/scripts/build_ui_data_contract.py` to derive coverage by status and by sector, source age, source type, and accounting scope. Record both numeric coverage and 100% status coverage. A release must not claim full metric coverage based only on an index count.
4. Keep the published Gold read boundary: consume only the promoted/certified production pointer where certification is required. Never read an uncertified candidate into the public read model.

### 5. Integrate Home and Pro without cross-population leakage

1. Home search and dossier route use canonical identity and the research release. Retain the existing `#stock/SYMBOL` deep links; resolve approved aliases. Search suggestions show current symbol/name/sector and dated price where available.
2. Company cards and screens consume the same field DTO. Show source, period, and scope in one accessible detail disclosure; show a short reason for unavailable or stale metrics. Missing values sort last and never pass numeric filters.
3. Pro reads only the dated scan cohort and labels its scan session. It may link to the same canonical company dossier, but dossier fundamentals come from the research release, not scan membership.
4. Remove any implicit fallback from the research read model to technical scan rows or retained legacy ratio records. Keep UI rendering usable when a shard fails to load and report that failure distinctly from absent financial data.

### 6. Test, measure, and release

Automated gates:

- Identity: exactly one canonical search result and shard per active universe member; no unresolved alias or ticker-only collision; ZOMATO resolves to ETERNAL; all 2,524 search-to-dossier paths load.
- Separation: Pro population equals its dated scan manifest; Home population equals the canonical manifest; MRF, a non-scan sentinel, still gets its research shard and all valid sourced metrics.
- Metric: formulas, units, scope/period matching, negative and zero denominators, corporate actions, source age, and sector applicability are tested against known issuer cases. Each missing value has a valid status and reason.
- Reproducibility: same frozen inputs produce byte-identical candidate shards/manifests; changed source revisions produce a new release; a failed batch cannot alter the production pointer.
- UI: keyboard/mobile search, deep links, sorting/filtering with missing values, status explanations, source links, Pro screens, and slow/offline shard failure all regress.

Release gates: (1) approved source rights and truthful provenance; (2) 100% universe search and dossier resolution; (3) 100% per-field status coverage; (4) numeric coverage targets agreed **per field and issuer category** after source assessment, with no blanket 100% numeric promise; (5) freshness limits met or explicit stale status; (6) zero unresolved identity/scope mismatches; (7) candidate manifests, browser tests, and a rollback drill pass. Publish the new research release first, then enable expanded UI fields behind the manifest gate. Keep previous release rollback available.

## First implementation slice

Implement identity reconciliation, the field/status DTO, and a read-only coverage manifest from existing sources. Add a 2,524-member candidate shard set that marks missing ratios precisely, including MRF. This validates routing and UI semantics before acquiring or ingesting a broader source. The next slice is the approved all-universe ingestion; only then should numeric coverage claims expand.
