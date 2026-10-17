# Stockerboard Learn — Official Implementation Plan & Pedagogical Governance
**Document Version:** 2.0.0  
**Status:** Approved Architecture & Freeze Gate  
**Authority:** Stockerboard Core Team & Financial Review Gate  
**Target Release:** Q4 2026 / FY27 Product Release  

---

## 1. Executive Summary & Core Philosophy

Stockerboard Learn is built on a single, non-negotiable principle:
> **"Education connected to trustworthy market research, grounded in audited financial reality."**

The platform differentiates itself not by making exaggerated claims about what chart patterns "prove" or by understating market incumbents, but through a seamless **Learn → Screen → Journal** loop that transforms passive reading into independent, evidence-based research:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. LEARN       Understand the financial/market concept      │
│      ↓                                                      │
│ 2. INSPECT     See StockMe-certified point-in-time data     │
│      ↓                                                      │
│ 3. SCREEN      Filter candidate companies in live universe  │
│      ↓                                                      │
│ 4. INVESTIGATE Examine dossiers, filings & peer metrics     │
│      ↓                                                      │
│ 5. JOURNAL     Log hypotheses, risk R-budget & decisions    │
│      ↓                                                      │
│ 6. YOUR VIEW   Form independent, disciplined conclusions    │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Objective Competitive Landscape

Stockerboard respects the strengths of existing platforms while carving out its specific, credible opportunity:

| Platform | Core Strength | Current Limitation | Stockerboard Opportunity |
| :--- | :--- | :--- | :--- |
| **Zerodha Varsity** | Deep, structured, encyclopedic modules (16-chapter Risk & Psychology, TA, Financial Modelling, Option Strategies) | Disconnected from live market research; reading is isolated from execution | **Connect theory directly to live research.** Readers immediately verify concepts on real scrips with Point-in-time-aware StockMe-certified data lineage. |
| **Screener.in** | Industry-standard fundamental screening, deep financial statements, custom formulas | Minimal price/volume market context; queries require prior accounting knowledge | **Progressive concept onboarding.** Demystify financial statements progressively while providing structured valuation & price context. |
| **TradingView** | World-class charting, multi-asset technical indicators, flexible screeners | High complexity, overwhelming indicator density, cognitive overload for Indian stock learners | **Streamlined, distraction-free workflow.** Focus on high-signal concepts, clean candidate screening, and mathematical risk management. |
| **Stockerboard** | Integrated Learn → Inspect → Screen → Compare → Journal workflow | Early stage content library; requires rigorous certification | **The Trustworthy Research Moat.** First-principles literacy tied directly to certified data provenance and risk-budgeted decision journaling. |

---

## 3. The 15 Mandatory Financial, Pedagogical & Technical Rules

### Rule 1: Data Provenance Terminology
* **Forbidden:** "Exchange-Certified" (exchanges do not certify third-party derived metrics).
* **Mandatory Standard:** **"Point-in-time aware, StockMe-certified data lineage"** or **"Source-aware, point-in-time data provenance"**.
* **Rationale:** Reflects our actual audited ingestion pipeline, quality gates, and corporate filing lineage truthfully.

### Rule 2: Objective Positioning
* **Standard:** Position Stockerboard by its unique workflow integration (Learn → Screen → Journal), not by disparaging or understating competitors.

### Rule 3: P/E Ratio Financial Definition
* **Core Definition:** The market price currently paid per ₹1 of current annual Earnings Per Share (EPS):
  $$\text{P/E Ratio} = \frac{\text{Current Market Price (CMP)}}{\text{Trailing 12-Month EPS}}$$
* **Payback Clarification:** The bakery or payback period analogy must explicitly carry the disclaimer:
  > *"You can loosely think of it as the price investors place on today's earnings stream — but it is not a literal payback-period calculation, because business earnings can grow, shrink, or disappear over time."*

### Rule 4: Volume & Base Formation Nuance
* **Forbidden:** Asserting that consolidation bases or volume dry-ups "prove institutional accumulation" or "institutional float lockdown."
* **Mandatory Standard:** A tightening base with declining volume indicates **diminishing selling pressure and supply contraction**. While momentum methodologies interpret this as constructive accumulation, price and volume alone do not identify *who* is transacting. Ownership inference is only valid when corroborated by shareholding disclosures, bulk/block deals, or insider filings.

### Rule 5: Risk-Per-Trade Framework (Not "Guaranteed Survival")
* **Forbidden:** Claiming that a "1% risk rule is non-negotiable" or that correct sizing "guarantees survival / eliminates anxiety."
* **Mandatory Standard:** Teach a **Risk-Per-Trade Framework**. A common conservative heuristic is risking 0.5%–1.5% of equity per trade. The optimal allocation depends on strategy expectancy, asset volatility, portfolio concentration, cross-asset correlation, and trader drawdown tolerance. Sizing mitigates risk; it never eliminates it.

### Rule 6: Technical Integrity in Stage Analysis
* **Mathematical Correction:** A 30-week moving average spans $30 \times 5 = 150\text{ trading days}$, **not 200 days**.
* **Methodological Separation:** Never conflate Stan Weinstein's Stage Analysis with Mark Minervini's Trend Template:
  1. *Weinstein Stage Analysis:* 30-week moving average slope, 4-stage market cycle (Basing, Markup, Distribution, Capitulation), volume confirmation.
  2. *Minervini Trend Template:* Specific moving average alignment (Price > 50 EMA > 150 SMA > 200 SMA), 52-week proximity, and Relative Strength (RS).
  3. *Stockerboard Trend Model:* Explicitly documented heuristic implemented in the platform screener.

### Rule 7: Screener Triggers as "Candidate Screens"
* **Standard:** Thresholds such as `Dist_52W_High >= -4%`, `Vol_Ratio <= 1.2x`, and `Momentum_Score >= 80` must be designated as the **"Stockerboard VCP Candidate Screen"**, not the definition of VCP. Screening generates candidate watchlists; structural contraction validation requires chart analysis.

### Rule 8: Pocket Pivot Candidate Criteria
* **Standard:** The preceding 10-session down-volume rule identifies a **Pocket Pivot Candidate**, not a confirmed setup. Full confirmation requires evaluating base maturity, moving average shelf support, and broader market regime.

### Rule 9: Corporate Action Vocabulary
* **Forbidden:** Using "dividend-adjusted" as an umbrella term for splits, bonuses, and rights issues.
* **Mandatory Standard:** Use **"Corporate-action adjusted series"** for splits, bonuses, and rights. Teach **"Total-return series"** separately when incorporating dividend reinvestment.

### Rule 10: Mathematical Trade Expectancy
* **Forbidden:** Stating that "a 40% win rate with 3:1 reward/risk makes you wealthy."
* **Mandatory Standard:** Teach the mathematical equation:
  $$E = (P_w \times R_w) - (P_l \times R_l)$$
  *Example:* With $P_w = 0.40, R_w = +3.0R, P_l = 0.60, R_l = -1.0R$:
  $$E = (0.40 \times 3.0) - (0.60 \times 1.0) = 1.20 - 0.60 = +0.60R\text{ per trade}$$
  Note that theoretical positive expectancy is calculated before transaction fees, STT, exchange turnover charges, slippage, and regime shifts. Positive expectancy provides mathematical edge, not guaranteed wealth.

### Rule 11: Multi-Model Exit Framework
* **Standard:** Present exit ladders as comparative strategy models rather than universal truths. Show how scaling out (e.g., $1/2$ at $2R$) alters realized average $R$:
  - *Model A: Fixed R Target* (Full exit at planned multiple).
  - *Model B: Scale-Out* (Derisk initial capital, reducing average $R$ on runners).
  - *Model C: Trend Trailing* (Trailing key moving averages until closing invalidation).
  - *Model D: Structural Invalidation* (Exiting when the underlying base or pivot fails).

### Rule 12: Level-Adapted Practical CTAs
Every lesson concludes with an action block tailored to reader proficiency:
* **Foundations (Beginner):**
  - `[ 🔍 See This Metric on Real Stocks → ]`
  - `[ ⚖️ Compare 2 Companies → ]`
* **Intermediate:**
  - `[ ⚡ Explore Matching Companies → ]`
  - `[ 📊 Compare Evidence → ]`
* **Advanced Research:**
  - `[ 🎯 Open Screener Preset → ]`
  - `[ 🧮 Position Calculator → ]`
  - `[ 📓 Add to Research Journal → ]`

### Rule 13: Neutral Track Architecture
* **Forbidden:** Equating "Beginner = Investor" and "Advanced = Trader".
* **Mandatory Standard:**
  - **Track 1: Foundations** *(Learn investing from first principles)*
  - **Track 2: Advanced Research** *(Momentum, risk & quantitative methods)*

### Rule 14: Progressive 3-Tier Depth Switcher
Each concept implements three explicit effort levels:
1. **⚡ Quick (~2 min):** Core definition, first-principles intuition, everyday analogy.
2. **📘 Understand (~5 min):** Mathematical formula, worked example, interpretation guide, common traps.
3. **🔬 Deep Dive (10+ min):** Structural edge cases, cyclical peak paradoxes, StockMe data lineage, interactive quiz.

### Rule 15: Strict Curriculum Execution Sequence
No advanced momentum lessons (VCP, Pocket Pivot) will be built until foundations are solid:
```
1. CERTIFY P/E PILOT (Completed)
      ↓
2. ROE & Capital Efficiency
      ↓
3. 52-Week Range & Positioning
      ↓
4. Profit vs Operating Cash Flow
      ↓
5. Complete 12 Foundations Concepts
      ↓
6. Connect Learn ↔ Screener Bridge
      ↓
7. Add Journal Research Bridge
      ↓
8. Launch Advanced Track:
   Trend → Moving Averages → Volume → Stage Analysis → Bases → VCP / Pocket Pivot
```

---

## 4. Frozen Curriculum Architecture

```
                       STOCKERBOARD ACADEMY
                                │
        ┌───────────────────────┴───────────────────────┐
        ▼                                               ▼
   FOUNDATIONS                                  ADVANCED RESEARCH
┌──────────────────────┐                    ┌──────────────────────┐
│ 1. What is a Stock?  │                    │ 1. Trend Direction   │
│ 2. Share Price       │                    │ 2. Moving Averages   │
│ 3. Market Cap        │                    │ 3. Volume Dynamics   │
│ 4. Revenue           │                    │ 4. Weinstein Stage   │
│ 5. Profit vs CashFlow│                    │ 5. Basing Structures │
│ 6. EPS               │                    │ 6. VCP Candidate Scrn│
│ 7. P/E Ratio (Pilot) │                    │ 7. Pocket Pivot Scrn │
│ 8. ROE / ROCE        │                    │ 8. Risk-per-Trade    │
│ 9. Debt & Solvency   │                    │ 9. Math Expectancy   │
│ 10. Earnings Growth  │                    │ 10. Multi-Model Exits│
│ 11. 52-Week Range    │                    │ 11. Corporate Actions│
│ 12. Compare Companies│                    │ 12. Journaling Alpha │
└──────────────────────┘                    └──────────────────────┘
        │                                               │
        └───────────────────────┬───────────────────────┘
                                ▼
                       REAL STOCK DATA SLOT
                                ↓
                      CANDIDATE SCREENER
                                ↓
                        DECISION JOURNAL
                                ↓
                      INDEPENDENT VIEW
```

---

## 5. P/E Pilot End-to-End Certification Report

The pilot lesson for **P/E Ratio** (`/learn/pe-ratio/`) has undergone rigorous end-to-end verification across 11 compliance dimensions:

### 1. Financial Correctness: PASSED
- P/E is defined strictly as market price paid per ₹1 of current annual EPS.
- Payback period is explicitly noted as an imperfect intuition rather than a literal recovery guarantee.
- Negative earnings edge case documented: negative EPS produces an undefined/meaningless P/E, rendered as `—` rather than negative or zero multiples.
- Cyclical peak trap detailed: commodity cyclical companies exhibiting low P/E multiples at peak margins.

### 2. Metric Source & Binding: PASSED
- Bound to canonical `stocks/financial_index_v1.json` (read-only).
- Metric key: `pe_ratio`.
- Sample cohort: `INFY` (Stable Technology), `TCS` (Large-Cap IT), `ABFRL` (Negative Earnings / Solvency Context).

### 3. Missing-Data & Coercion Behaviour: PASSED
- Verified on `ABFRL`: Renders `—` with `🔴 Negative Earnings` badge.
- Coercion check: Never defaults to `0.00x`, `1.00x`, or `NaN`.
- Verified by automated test: `test_05_missing_data_invariant` in `tests/test_learn_integrity.py`.

### 4. Progressive Depth UX (Quick / Understand / Deep Dive): PASSED
- **⚡ Quick (~2 min):** Clean hero, bakery analogy, key takeaway card.
- **📘 Understand (~5 min):** Formula breakdown, worked coffee company example, 3 interpretation questions, 2 fallacy/reality cards.
- **🔬 Deep Dive (10+ min):** Cyclical peaks, accounting mark-to-market adjustments, StockMe data provenance note, 2-question quiz.
- Sticky navigation buttons switch depth smoothly without jumping.

### 5. SEO & Crawlability: PASSED
- Canonical link: `<link rel="canonical" href="https://stockerboard.com/learn/pe-ratio/">`.
- Schema.org JSON-LD: `@type: LearningResource` with `educationalLevel: Foundations` and breadcrumb hierarchy.
- Sitemap integration: Verified entry in `sitemap.xml` with weekly change frequency and priority 0.8.

### 6. Responsive & Mobile Design: PASSED
- Single-column responsive layout on viewport width $\le 720\text{px}$.
- Depth switcher flexes vertically without clipping on mobile screens.
- Live data slot metrics stack into legible cards.

### 7. Dark & Light Mode Presentation: PASSED
- Anti-flicker inline theme bootstrap script executes in `<head>`.
- Dual palette support with high-contrast borders and tokenized CSS variables:
  - Dark: `--bg: #080C14; --surface: #0E1420; --text-primary: #F8FAFC;`
  - Light: `--bg: #FCFDFD; --surface: #FFFFFF; --text-primary: #0F172A;`

### 8. Accessibility: PASSED
- Contrast ratios exceed WCAG AA standards (green `#10B981` on dark, `#15803D` on light).
- Interactive quiz buttons use explicit focus states, semantic buttons, and ARIA breadcrumbs.

### 9. Pedagogical Quiz Standards: PASSED
- **Question 1 (Calculation):** Tests active formula application ($\text{CMP} ₹600 \div \text{EPS} ₹30 = 20.00\text{x}$).
- **Question 2 (Reasoning):** Contextual reasoning question where the correct answer is *"Not enough information to determine"*, training students to reject single-metric investment decisions.
- Verified by automated test: `test_02_pedagogical_quiz_standards`.

### 10. No Hardcoded Dynamic Numbers: PASSED
- Concept definition (`pe-ratio.json`) is strictly evergreen.
- Live market CMPs, P/E ratios, and dates are injected deterministically at compile time from the canonical financial index.
- Verified by automated test: `test_03_no_hardcoded_dynamic_numbers_in_content`.

### 11. Learn Metric Parity with Existing Surfaces: PASSED
- `INFY` P/E in `/learn/pe-ratio/` matches `financial_index_v1.json` and the company dossier exactly (`24.15x`).
- Verified by automated test: `test_04_metric_parity_invariant`.

---

## 6. Verification & Sign-Off Command

To independently verify the complete Learn integrity test suite at any time:
```powershell
python -m unittest tests/test_learn_integrity.py
```
**Current Test Status:** `6/6 PASSED (OK)`
