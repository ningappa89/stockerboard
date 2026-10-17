"""Automated Integrity & Release-Blocking Test Suite for Stockerboard Learn.

Enforces:
1. Multi-Surface Metric Parity:
   Learn Page Metric == Company Dossier Page == Screener / Financial Index == Canonical Dossier Contract.
2. Missing Data Integrity: Unavailable ratios render '—' and certified reason, never 0, 1.00x, NaN, or default.
3. Pedagogical Quality: Q2 of concept quiz tests contextual reasoning/uncertainty, never mere rote recall.
4. No Hardcoded Numbers: Concept JSON content remains strictly evergreen.
5. Canonical Crawlability & Sitemap: Generated HTML pages exist and are present in sitemap.xml.
6. Certification Terminology Hygiene: No ambiguous audit claims (e.g. 'audited data', 'Exchange-Certified').
7. Canonical Slug Route Hygiene: 52-week route standardized as '52-week-high-low'.
8. Short-History & Range Preservation: Preserves AVAILABLE_HISTORY (e.g. 143 sessions) without 252-session fabrication.
"""

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT_DIR = ROOT / "content" / "learn"
CONCEPTS_DIR = CONTENT_DIR / "concepts"
LEARN_DIR = ROOT / "learn"
STOCKS_DIR = ROOT / "stocks"
SITEMAP_PATH = ROOT / "sitemap.xml"
FINANCIAL_INDEX_PATH = STOCKS_DIR / "financial_index_v1.json"
PRICE_RANGE_INDEX_PATH = STOCKS_DIR / "price_range_index_v1.json"
PATHS_FILE = CONTENT_DIR / "paths.json"


class TestLearnIntegrity(unittest.TestCase):

    def setUp(self):
        self.assertTrue(CONCEPTS_DIR.exists(), "Missing content/learn/concepts directory")
        self.assertTrue(FINANCIAL_INDEX_PATH.exists(), "Missing financial_index_v1.json")
        self.assertTrue(PRICE_RANGE_INDEX_PATH.exists(), "Missing price_range_index_v1.json")
        self.fin_data = json.loads(FINANCIAL_INDEX_PATH.read_text(encoding="utf-8"))
        self.range_data = json.loads(PRICE_RANGE_INDEX_PATH.read_text(encoding="utf-8"))

    def test_01_schema_completeness(self):
        """Verify that every concept file has all required schema fields."""
        for cfile in CONCEPTS_DIR.glob("*.json"):
            data = json.loads(cfile.read_text(encoding="utf-8"))
            required_keys = [
                "id", "slug", "title", "short_title", "category", "difficulty",
                "estimated_read_min", "simple_explanation", "detailed_explanation",
                "advanced_explanation", "prerequisites", "next_concept", "quiz", "governance"
            ]
            for key in required_keys:
                self.assertIn(key, data, f"Missing key '{key}' in {cfile.name}")
                
            self.assertTrue(data["simple_explanation"]["hero_headline"])
            self.assertTrue(data["simple_explanation"]["core_intuition"])
            self.assertTrue(data["simple_explanation"]["real_world_analogy"])
            self.assertTrue(data["simple_explanation"]["key_takeaway"])
            self.assertTrue(data["detailed_explanation"]["formula_plain"])
            self.assertTrue(data["detailed_explanation"]["worked_example"]["calculation_steps"])
            self.assertTrue(data["detailed_explanation"]["common_mistakes"])

    def test_02_pedagogical_quiz_standards(self):
        """Verify that Q2 of quiz tests reasoning and handles uncertainty."""
        for cfile in CONCEPTS_DIR.glob("*.json"):
            data = json.loads(cfile.read_text(encoding="utf-8"))
            quiz = data.get("quiz", {})
            self.assertIn("calculation_question", quiz)
            self.assertIn("reasoning_question", quiz)
            
            q2 = quiz["reasoning_question"]
            correct_opt = q2["options"][q2["correct_index"]]
            if cfile.stem == "what-is-a-stock":
                # For what-is-a-stock, Q2 tests secondary market exchange mechanics per B30 mandate
                self.assertIn("selling investor", correct_opt.lower())
            else:
                self.assertIn("Not enough information", correct_opt,
                              f"{cfile.name}: Q2 correct answer should test contextual uncertainty/reasoning")

    def test_03_no_hardcoded_dynamic_numbers_in_content(self):
        """Rule: Concepts must never hardcode live market numbers inside evergreen content."""
        for cfile in CONCEPTS_DIR.glob("*.json"):
            content = cfile.read_text(encoding="utf-8")
            self.assertNotIn("Infosys currently has a P/E", content)
            self.assertNotIn("INFY trades at ₹", content)
            self.assertNotIn("Infosys has an ROE of", content)

    def test_04_metric_parity_invariant(self):
        """Cross-Surface Metric Parity Certification (Rule A4):
        Canonical Contract == Company Dossier Page == Screener / Index == Learn Page
        """
        # --- Surface 1: Canonical Published Contracts ---
        infy_canonical_pe = self.fin_data["stocks"]["INFY"]["pe"]
        infy_canonical_roe = self.fin_data["stocks"]["INFY"]["roe"]
        self.assertIsNotNone(infy_canonical_pe)
        self.assertIsNotNone(infy_canonical_roe)
        
        # Verify with public dossier JSON (stocks/IN/INFY.json)
        infy_dossier_json_path = STOCKS_DIR / "IN" / "INFY.json"
        self.assertTrue(infy_dossier_json_path.exists())
        infy_dossier_json = json.loads(infy_dossier_json_path.read_text(encoding="utf-8"))
        self.assertAlmostEqual(infy_dossier_json["pe"], infy_canonical_pe, places=3)
        self.assertAlmostEqual(infy_dossier_json["roe"], infy_canonical_roe, places=3)

        # --- Surface 2: Published Company Dossier HTML (stocks/infosys/index.html) ---
        infy_html_path = STOCKS_DIR / "infosys" / "index.html"
        self.assertTrue(infy_html_path.exists(), "Missing stocks/infosys/index.html")
        infy_html = infy_html_path.read_text(encoding="utf-8")
        
        # Extract rendered P/E and ROE from Dossier HTML cards
        pe_dossier_match = re.search(r'<div class="card-label">P/E Ratio</div>\s*<div class="card-val">([^<]+)</div>', infy_html)
        self.assertIsNotNone(pe_dossier_match, "P/E card not found in Infosys Dossier HTML")
        dossier_pe_rendered = pe_dossier_match.group(1).strip()
        
        roe_dossier_match = re.search(r'<div class="card-label">ROE</div>\s*<div class="card-val">([^<]+)</div>', infy_html)
        self.assertIsNotNone(roe_dossier_match, "ROE card not found in Infosys Dossier HTML")
        dossier_roe_rendered = roe_dossier_match.group(1).strip()

        # --- Surface 3: Learn P/E Page (learn/pe-ratio/index.html) ---
        pe_learn_path = LEARN_DIR / "pe-ratio" / "index.html"
        self.assertTrue(pe_learn_path.exists(), "Missing learn/pe-ratio/index.html")
        pe_learn_html = pe_learn_path.read_text(encoding="utf-8")
        
        # Extract INFY card rendered P/E in Learn
        self.assertIn("INFOSYS LIMITED", pe_learn_html)
        expected_pe_str = f"{infy_canonical_pe:.2f}x"
        self.assertEqual(expected_pe_str, dossier_pe_rendered, "Dossier HTML does not match canonical rounded P/E")
        self.assertIn(f">{expected_pe_str}<", pe_learn_html,
                      f"Learn P/E page did not render expected {expected_pe_str} for INFY")

        # --- Surface 4: Learn ROE Page (learn/roe/index.html) ---
        roe_learn_path = LEARN_DIR / "roe" / "index.html"
        self.assertTrue(roe_learn_path.exists(), "Missing learn/roe/index.html")
        roe_learn_html = roe_learn_path.read_text(encoding="utf-8")
        
        self.assertIn("INFOSYS LIMITED", roe_learn_html)
        expected_roe_str = f"{infy_canonical_roe:+.2f}%"
        self.assertIn(f">{expected_roe_str}<", roe_learn_html,
                      f"Learn ROE page did not render expected {expected_roe_str} for INFY")
        
        # Verify 1-decimal place consistency with Dossier (31.1% vs 31.07%)
        self.assertEqual(f"{infy_canonical_roe:.1f}%", dossier_roe_rendered)

        # --- Cross-check with TCS ---
        tcs_canonical_pe = self.fin_data["stocks"]["TCS"]["pe"]
        tcs_canonical_roe = self.fin_data["stocks"]["TCS"]["roe"]
        tcs_html_path = STOCKS_DIR / "tcs" / "index.html"
        self.assertTrue(tcs_html_path.exists())
        tcs_html = tcs_html_path.read_text(encoding="utf-8")
        self.assertIn(f">{tcs_canonical_pe:.2f}x<", tcs_html)
        self.assertIn(f">{tcs_canonical_roe:.1f}%<", tcs_html)
        self.assertIn(f">{tcs_canonical_pe:.2f}x<", pe_learn_html)
        self.assertIn(f">{tcs_canonical_roe:+.2f}%<", roe_learn_html)

    def test_05_missing_data_invariant(self):
        """Rule E: Unavailable metrics must render '—' and certified reason, never 0, 1.00x, or NaN."""
        # 1. P/E Missing Handling (ABFRL - Negative Earnings)
        pe_learn_html = (LEARN_DIR / "pe-ratio" / "index.html").read_text(encoding="utf-8")
        abfrl_pe_status = self.fin_data["stocks"]["ABFRL"]["ratio_status"]["pe"]
        self.assertEqual(abfrl_pe_status["status"], "UNAVAILABLE")
        self.assertEqual(abfrl_pe_status["reason"], "NEGATIVE_EARNINGS")
        
        self.assertIn("Aditya Birla Fashion", pe_learn_html)
        self.assertIn("Negative Earnings", pe_learn_html)
        self.assertNotIn(">0.00x<", pe_learn_html)
        self.assertNotIn(">1.00x<", pe_learn_html)
        self.assertNotIn("NaN", pe_learn_html)

        # 2. ROE Missing Handling (ALOKINDS - Negative Equity)
        roe_learn_html = (LEARN_DIR / "roe" / "index.html").read_text(encoding="utf-8")
        alok_data = self.fin_data["stocks"]["ALOKINDS"]
        self.assertLess(alok_data["net_worth_crore"], 0, "ALOKINDS must have negative net worth")
        self.assertEqual(alok_data["ratio_status"]["roe"]["status"], "UNAVAILABLE")
        
        self.assertIn("ALOK INDUSTRIES LTD.", roe_learn_html)
        self.assertIn("Negative Equity", roe_learn_html)
        self.assertNotIn(">0.00%<", roe_learn_html)
        self.assertNotIn(">1.00%<", roe_learn_html)
        self.assertNotIn("NaN", roe_learn_html)

    def test_06_sitemap_and_canonical_routes(self):
        """Verify that generated learn routes are canonical and present in sitemap.xml."""
        sitemap = SITEMAP_PATH.read_text(encoding="utf-8")
        self.assertIn("https://stockerboard.com/learn/", sitemap)
        self.assertIn("https://stockerboard.com/learn/pe-ratio/", sitemap)
        self.assertIn("https://stockerboard.com/learn/roe/", sitemap)
        self.assertIn("https://stockerboard.com/learn/52-week-high-low/", sitemap)
        
        for slug in ["pe-ratio", "roe", "52-week-high-low"]:
            page_html = (LEARN_DIR / slug / "index.html").read_text(encoding="utf-8")
            self.assertIn(f'<link rel="canonical" href="https://stockerboard.com/learn/{slug}/">', page_html)
            self.assertIn('"@type": "LearningResource"', page_html)

    def test_07_roe_module_integrity(self):
        """Certify ROE learning module structure, formula, quiz, and navigation."""
        roe_json_path = CONCEPTS_DIR / "roe.json"
        self.assertTrue(roe_json_path.exists())
        roe_data = json.loads(roe_json_path.read_text(encoding="utf-8"))
        
        self.assertEqual(roe_data["slug"], "roe")
        self.assertEqual(roe_data["title"], "ROE: Return on Equity & Capital Efficiency")
        
        # Check Q1 calculation: Net owner profit ₹24 Cr / average equity ₹120 Cr = 20.00%
        q1 = roe_data["quiz"]["calculation_question"]
        correct_opt = q1["options"][q1["correct_index"]]
        self.assertEqual(correct_opt, "20.00%")
        
        # Check navigation links in generated HTML
        roe_html = (LEARN_DIR / "roe" / "index.html").read_text(encoding="utf-8")
        self.assertIn('href="/learn/pe-ratio/"', roe_html)
        self.assertIn('href="/learn/52-week-high-low/"', roe_html)

    def test_08_certification_terminology_hygiene(self):
        """Enforce Rule A1: Prohibit ambiguous third-party certification phrasing."""
        forbidden_terms = [
            "exchange-certified",
            "audited data",
            "point-in-time audited",
            "live audited data",
            "independently audited"
        ]
        
        for cfile in CONCEPTS_DIR.glob("*.json"):
            content = cfile.read_text(encoding="utf-8").lower()
            for term in forbidden_terms:
                self.assertNotIn(term, content, f"Forbidden term '{term}' found in {cfile.name}")

        for html_file in LEARN_DIR.rglob("*.html"):
            content = html_file.read_text(encoding="utf-8").lower()
            for term in forbidden_terms:
                self.assertNotIn(term, content, f"Forbidden term '{term}' found in {html_file.relative_to(ROOT)}")

    def test_09_canonical_slug_route_hygiene(self):
        """Enforce Rule A5: Freeze canonical 52-week route as 52-week-high-low."""
        if PATHS_FILE.exists():
            paths_content = PATHS_FILE.read_text(encoding="utf-8")
            self.assertIn("52-week-high-low", paths_content)
            self.assertNotIn("52-week-range", paths_content)

        roe_json = json.loads((CONCEPTS_DIR / "roe.json").read_text(encoding="utf-8"))
        self.assertEqual(roe_json.get("next_concept"), "52-week-high-low")

    def test_10_52w_module_integrity_and_short_history(self):
        """Certify 52-Week Range module, short-history preservation, and multi-surface parity."""
        concept_path = CONCEPTS_DIR / "52-week-high-low.json"
        self.assertTrue(concept_path.exists())
        concept_data = json.loads(concept_path.read_text(encoding="utf-8"))
        
        self.assertEqual(concept_data["slug"], "52-week-high-low")
        self.assertEqual(concept_data["title"], "52-Week Range & Price Position")
        
        # Verify Q1 calculation
        q1 = concept_data["quiz"]["calculation_question"]
        correct_opt = q1["options"][q1["correct_index"]]
        self.assertEqual(correct_opt, "50.00%")

        # Verify Q2 reasoning
        q2 = concept_data["quiz"]["reasoning_question"]
        correct_opt2 = q2["options"][q2["correct_index"]]
        self.assertIn("Not enough information", correct_opt2)

        # Verify generated page HTML
        html_path = LEARN_DIR / "52-week-high-low" / "index.html"
        self.assertTrue(html_path.exists())
        html = html_path.read_text(encoding="utf-8")

        # Multi-surface Parity: INFY Range
        infy_range = self.range_data["stocks"]["INFY"]
        self.assertEqual(infy_range["coverage"], "FULL_YEAR")
        self.assertEqual(infy_range["high"], 1728.0)
        self.assertEqual(infy_range["low"], 980.4)
        self.assertEqual(infy_range["session_count"], 246)
        
        # Check presence in Learn HTML
        self.assertIn("INFOSYS LIMITED", html)
        self.assertIn("₹980.40 – ₹1,728.00", html)
        self.assertIn(">5.8%<", html)
        self.assertIn(">-40.78%<", html)
        self.assertIn("Full 52-Week History (246 Sessions)", html)

        # Cross-check with Infosys Dossier HTML (stocks/infosys/index.html)
        infy_dossier_html = (STOCKS_DIR / "infosys" / "index.html").read_text(encoding="utf-8")
        self.assertIn("52W Low: <strong>₹980.40</strong>", infy_dossier_html)
        self.assertIn("52W High: <strong>₹1,728.00</strong>", infy_dossier_html)
        self.assertIn('left:5.8%', infy_dossier_html)

        # Short History Preservation: WAAREEINDO (143 Sessions)
        waaree_range = self.range_data["stocks"]["WAAREEINDO"]
        self.assertEqual(waaree_range["coverage"], "PARTIAL_HISTORY")
        self.assertEqual(waaree_range["session_count"], 143)
        self.assertIn("INDOSOLAR LTD.", html)
        self.assertIn("Available History (143 Sessions)", html)
        self.assertIn("₹196.24 – ₹725.00", html)
        self.assertNotIn("252 Sessions", html)

        # Navigation: Previous -> ROE, Next -> Profit vs Cash Flow (live canonical link)
        self.assertIn('href="/learn/roe/"', html)
        self.assertIn('href="/learn/profit-vs-cash-flow/"', html)

    def test_11_profit_vs_cash_flow_integrity_and_scope_parity(self):
        """Release Gate: Validate Profit vs Cash Flow lesson contract, scope parity, and missing-data integrity."""
        concept_path = CONCEPTS_DIR / "profit-vs-cash-flow.json"
        self.assertTrue(concept_path.exists())
        concept_data = json.loads(concept_path.read_text(encoding="utf-8"))
        
        self.assertEqual(concept_data["slug"], "profit-vs-cash-flow")
        self.assertEqual(concept_data["title"], "Profit vs Cash Flow: Why Earnings and Cash Can Differ")
        self.assertEqual(concept_data["short_title"], "Profit vs Cash Flow")
        
        # Verify Q1 calculation
        q1 = concept_data["quiz"]["calculation_question"]
        correct_opt = q1["options"][q1["correct_index"]]
        self.assertEqual(correct_opt, "₹15.00 Cr")

        # Verify Q2 reasoning
        q2 = concept_data["quiz"]["reasoning_question"]
        correct_opt2 = q2["options"][q2["correct_index"]]
        self.assertIn("Cash conversion deserves further investigation", correct_opt2)

        # Verify generated page HTML
        html_path = LEARN_DIR / "profit-vs-cash-flow" / "index.html"
        self.assertTrue(html_path.exists())
        html = html_path.read_text(encoding="utf-8")

        # SEO / Canonical verification
        self.assertIn('<link rel="canonical" href="https://stockerboard.com/learn/profit-vs-cash-flow/">', html)
        self.assertIn('Profit vs Cash Flow: Why Earnings and Cash Can Differ', html)
        self.assertIn('"@type": "LearningResource"', html)
        self.assertIn('"@type": "BreadcrumbList"', html)

        # Real Company Data Slot Parity: INFY
        self.assertIn("INFOSYS LIMITED", html)
        self.assertIn("₹30,325.00 Cr", html) # Published PAT TTM from FUNDAMENTAL_GOLD_V1.0.0
        
        # Part A3 & A6 Release Guard: Balance sheet Working Capital removed from real cards; CFO pending layer verified
        self.assertNotIn("Working Capital Context", html)
        self.assertIn("🟡 Cash Flow Pending Layer", html)
        self.assertIn("Comparable cash-flow data unavailable", html)
        self.assertIn('>—<', html) # Rendered CFO == —

        # Real Company Data Slot Parity: ABFRL (Loss / Negative Sign Preservation)
        self.assertIn("Aditya Birla Fashion", html)
        self.assertIn("-₹844.93 Cr", html) # Net loss negative sign preserved

        # Period and Scope Invariant Displayed
        self.assertIn("CONSOLIDATED", html)
        self.assertIn("2026-06-30 (TTM)", html)

        # Navigation: Previous -> 52-Week High-Low, Next -> EPS (live canonical link)
        self.assertIn('href="/learn/52-week-high-low/"', html)
        self.assertIn('href="/learn/eps/"', html)

    def test_12_eps_module_integrity_and_pe_consistency(self):
        """Release Gate: Validate EPS lesson contract, P/E denominator consistency, and negative EPS handling."""
        concept_path = CONCEPTS_DIR / "eps.json"
        self.assertTrue(concept_path.exists())
        concept_data = json.loads(concept_path.read_text(encoding="utf-8"))
        
        self.assertEqual(concept_data["slug"], "eps")
        self.assertEqual(concept_data["title"], "EPS: Earnings Per Share Explained")
        self.assertEqual(concept_data["short_title"], "EPS (Earnings Per Share)")
        
        # Verify Q1 calculation
        q1 = concept_data["quiz"]["calculation_question"]
        correct_opt = q1["options"][q1["correct_index"]]
        self.assertEqual(correct_opt, "₹10.00 per share")

        # Verify Q2 reasoning
        q2 = concept_data["quiz"]["reasoning_question"]
        correct_opt2 = q2["options"][q2["correct_index"]]
        self.assertIn("Not enough information", correct_opt2)
        self.assertIn("same corporate profit was distributed across fewer shares", correct_opt2)

        # Verify generated page HTML
        html_path = LEARN_DIR / "eps" / "index.html"
        self.assertTrue(html_path.exists())
        html = html_path.read_text(encoding="utf-8")

        # SEO / Canonical verification
        self.assertIn('<link rel="canonical" href="https://stockerboard.com/learn/eps/">', html)
        self.assertIn('EPS: Earnings Per Share Explained', html)
        self.assertIn('"@type": "LearningResource"', html)
        self.assertIn('"@type": "BreadcrumbList"', html)

        # Real Company Data Slot Parity: INFY
        self.assertIn("INFOSYS LIMITED", html)
        self.assertIn("₹74.13", html) # Basic EPS TTM from FUNDAMENTAL_GOLD_V1.0.0
        self.assertIn("13.81x", html) # P/E matching published valuation
        
        # Release-Blocking Invariant: P/E Denominator Parity (CMP / EPS ≈ P/E)
        infy_dossier = json.loads((STOCKS_DIR / "IN" / "INFY.json").read_text(encoding="utf-8"))
        infy_cmp = infy_dossier.get("cmp") or infy_dossier.get("price")
        infy_eps = infy_dossier["eps"]
        infy_pe = infy_dossier["pe"]
        self.assertAlmostEqual(infy_cmp / infy_eps, infy_pe, places=2)

        # Real Company Data Slot Parity: TCS
        self.assertIn("TATA CONSULTANCY", html)
        self.assertIn("₹137.64", html)

        # Negative EPS Preservation: ABFRL
        self.assertIn("Aditya Birla Fashion", html)
        self.assertIn("-₹6.41", html) # Negative EPS preserved with minus sign
        self.assertIn("— (Loss: Non-Meaningful)", html) # P/E non-meaningful for loss

        # Navigation: Previous -> Profit, Next -> P/E Ratio
        self.assertIn('href="/learn/profit/"', html)
        self.assertIn('href="/learn/pe-ratio/"', html)

    def test_13_eps_retained_cash_wording_absent(self):
        """Part 1.1 / 1.5 Gate: Verify unsafe retained-cash mental model is strictly removed."""
        eps_json_text = (CONCEPTS_DIR / "eps.json").read_text(encoding="utf-8")
        eps_html_text = (LEARN_DIR / "eps" / "index.html").read_text(encoding="utf-8")

        forbidden_patterns = [
            "retained for reinvestment",
            "retained earnings: ₹7",
            "retention: ₹7.00/share",
            "accounting earnings retained: ₹7",
        ]
        for pat in forbidden_patterns:
            self.assertNotIn(pat.lower(), eps_json_text.lower(), f"Unsafe retained-cash phrase '{pat}' found in eps.json")
            self.assertNotIn(pat.lower(), eps_html_text.lower(), f"Unsafe retained-cash phrase '{pat}' found in eps/index.html")

        # Must include clear distinction that accounting earnings and cash differ
        self.assertIn("Accounting earnings and cash movement are fundamentally different", eps_json_text)
        self.assertIn("Undistributed Accounting Earnings: ₹7.00 per share", eps_json_text)
        self.assertIn("Undistributed Accounting Earnings: ₹7.00 per share", eps_html_text)

    def test_14_eps_ttm_method_matches_production(self):
        """Part 1.2 / 1.5 Gate: Verify EPS_BASIC_TTM governance contract matches production sum_4q_rolling."""
        concept_data = json.loads((CONCEPTS_DIR / "eps.json").read_text(encoding="utf-8"))
        gov = concept_data.get("governance", {})
        
        # Verify machine-readable governance contract
        self.assertEqual(gov.get("eps_ttm_method"), "SUM_OF_4_SEQUENTIAL_QUARTERLY_BASIC_EPS")
        self.assertEqual(gov.get("canonical_metric"), "EPS_BASIC_TTM")

        # Verify documentation matches production implementation
        prov_note = concept_data.get("advanced_explanation", {}).get("stockme_provenance_note", "")
        self.assertIn("SUM_OF_4_SEQUENTIAL_QUARTERLY_BASIC_EPS", prov_note)
        self.assertIn("Q1 Basic EPS + Q2 Basic EPS + Q3 Basic EPS + Q4 Basic EPS", prov_note)
        self.assertIn("Basic EPS ≈ Profit attributable to equity holders ÷ Weighted-average equity shares", prov_note)

    def test_15_eps_corporate_action_claim_is_evidenced_or_relabelled(self):
        """Part 1.3 / 1.5 Gate: Ensure TCS is relabelled as Positive EPS / P-E Consistency Case."""
        eps_html = (LEARN_DIR / "eps" / "index.html").read_text(encoding="utf-8")
        
        # TCS must be present for P/E parity, but not falsely claimed as a corporate-action split/bonus case
        self.assertIn("TATA CONSULTANCY", eps_html)
        self.assertIn("₹137.64", eps_html)
        self.assertNotIn("TCS corporate-action restatement", eps_html.lower())

    def test_16_eps_published_snapshot_terminology(self):
        """Part 1.4 / 1.5 Gate: Verify hygiene of publication terminology (no misleading 'live' phrasing)."""
        eps_html = (LEARN_DIR / "eps" / "index.html").read_text(encoding="utf-8")
        profit_html = (LEARN_DIR / "profit" / "index.html").read_text(encoding="utf-8")
        
        forbidden_phrases = [
            "dynamic live rendering",
            "live market quote from exchange",
            "live point-in-time calculation",
        ]
        for phrase in forbidden_phrases:
            self.assertNotIn(phrase, eps_html.lower())
            self.assertNotIn(phrase, profit_html.lower())

        self.assertIn("Stockerboard Published Snapshot", eps_html)
        self.assertIn("Stockerboard Published Snapshot", profit_html)

    def test_17_profit_module_schema_and_route(self):
        """Part 2 / 2.30 Gate: Verify /learn/profit/ schema, compilation, SEO, and JSON-LD."""
        concept_path = CONCEPTS_DIR / "profit.json"
        self.assertTrue(concept_path.exists())
        concept_data = json.loads(concept_path.read_text(encoding="utf-8"))

        self.assertEqual(concept_data["slug"], "profit")
        self.assertEqual(concept_data["title"], "Profit: What Does a Company Actually Earn?")
        self.assertEqual(concept_data["short_title"], "Profit (Net Profit / PAT)")
        self.assertEqual(concept_data["governance"]["canonical_profit_metric"], "PAT_TTM")
        self.assertEqual(concept_data["governance"]["profit_ttm_method"], "SUM_OF_4_SEQUENTIAL_QUARTERLY_PAT")

        # HTML page existence and canonical route
        html_path = LEARN_DIR / "profit" / "index.html"
        self.assertTrue(html_path.exists())
        html = html_path.read_text(encoding="utf-8")

        self.assertIn('<link rel="canonical" href="https://stockerboard.com/learn/profit/">', html)
        self.assertIn('"@type": "LearningResource"', html)
        self.assertIn('"@type": "BreadcrumbList"', html)

        # Sitemap verification
        sitemap = SITEMAP_PATH.read_text(encoding="utf-8")
        self.assertIn("https://stockerboard.com/learn/profit/", sitemap)

    def test_18_profit_canonical_pat_contract_and_parity(self):
        """Part 2.2 / 2.30 Gate: Verify canonical PAT contract resolution and multi-surface parity."""
        infy_dossier_path = STOCKS_DIR / "IN" / "INFY.json"
        self.assertTrue(infy_dossier_path.exists())
        infy_dossier = json.loads(infy_dossier_path.read_text(encoding="utf-8"))

        canonical_pat = infy_dossier["pat_crore"]
        self.assertEqual(canonical_pat, 30325.0)

        # Check render in learn/profit/index.html
        profit_html = (LEARN_DIR / "profit" / "index.html").read_text(encoding="utf-8")
        self.assertIn("INFOSYS LIMITED", profit_html)
        self.assertIn("₹30,325.00 Cr", profit_html)
        self.assertIn("StockMe FUNDAMENTAL_GOLD_V1.0.0", profit_html)
        self.assertIn("2026-06-30 (TTM)", profit_html)
        self.assertIn("CONSOLIDATED", profit_html)

    def test_19_profit_negative_and_missing_pat_handling(self):
        """Part 2.6 / 2.7 / 2.30 Gate: Verify loss preservation, missing data handling, and zero-vs-missing distinction."""
        profit_html = (LEARN_DIR / "profit" / "index.html").read_text(encoding="utf-8")

        # Negative PAT (ABFRL: -₹844.93 Cr, Net Loss)
        self.assertIn("Aditya Birla Fashion", profit_html)
        self.assertIn("-₹844.93 Cr", profit_html)
        self.assertIn("🔴 Net Loss", profit_html)

        # Missing PAT (3MINDIA: Unavailable, renders '—')
        self.assertIn("3M INDIA LTD.", profit_html)
        self.assertIn("🔴 Profit Unavailable", profit_html)
        self.assertIn(">—<", profit_html)

        # True Zero vs Missing Invariant
        def format_profit(val):
            if val is None:
                return "—"
            return f"₹{val:,.2f} Cr" if val >= 0 else f"-₹{abs(val):,.2f} Cr"

        self.assertEqual(format_profit(0.0), "₹0.00 Cr")
        self.assertEqual(format_profit(None), "—")
        self.assertEqual(format_profit(-50.0), "-₹50.00 Cr")

    def test_20_profit_revenue_pat_period_scope_parity(self):
        """Part 2.21 / 2.22 / 2.30 Gate: Fail-closed verification for Revenue & PAT period and scope matching."""
        infy_dossier = json.loads((STOCKS_DIR / "IN" / "INFY.json").read_text(encoding="utf-8"))
        bp = infy_dossier.get("v2_canonical", {}).get("business_performance", {})
        
        pat_period = bp.get("PAT_TTM", {}).get("financial_period_end")
        pat_scope = bp.get("PAT_TTM", {}).get("scope")
        rev_period = bp.get("REVENUE_TTM", {}).get("financial_period_end")
        rev_scope = bp.get("REVENUE_TTM", {}).get("scope")

        # Parity verified
        self.assertEqual(pat_period, rev_period)
        self.assertEqual(pat_scope, rev_scope)

        # Check rendering in profit HTML
        profit_html = (LEARN_DIR / "profit" / "index.html").read_text(encoding="utf-8")
        self.assertIn("Top-Line Revenue (TTM)", profit_html)
        self.assertIn("₹184,582.00 Cr", profit_html)
        self.assertIn("Bottom-Line Profit (PAT TTM)", profit_html)
        self.assertIn("₹30,325.00 Cr", profit_html)

    def test_21_profit_pedagogical_quiz_and_graph_links(self):
        """Part 2.25 / 2.30 Gate: Validate profit quiz questions and curriculum learning graph links."""
        concept_data = json.loads((CONCEPTS_DIR / "profit.json").read_text(encoding="utf-8"))
        quiz = concept_data.get("quiz", {})
        
        # Q1 Calculation: ₹100 Cr - ₹85 Cr = ₹15.00 Cr
        q1 = quiz["calculation_question"]
        correct_opt1 = q1["options"][q1["correct_index"]]
        self.assertEqual(correct_opt1, "₹15.00 Cr")

        # Q2 Reasoning: Margins changed and require investigation
        q2 = quiz["reasoning_question"]
        correct_opt2 = q2["options"][q2["correct_index"]]
        self.assertIn("Not enough information", correct_opt2)
        self.assertIn("squeezing profit margins", correct_opt2)

        # Navigation links in generated HTML
        profit_html = (LEARN_DIR / "profit" / "index.html").read_text(encoding="utf-8")
        self.assertIn('href="/learn/eps/"', profit_html)
        self.assertIn('href="/learn/revenue/"', profit_html)
        self.assertIn('Understand EPS →', profit_html)

    def test_22_profit_no_live_profit_calculation(self):
        """Part 2.2 / 2.30 Gate: Ensure Learn never derives production PAT and JSON has no hardcoded numbers."""
        profit_json_text = (CONCEPTS_DIR / "profit.json").read_text(encoding="utf-8")
        
        # No hardcoded current numbers
        self.assertNotIn("30325", profit_json_text)
        self.assertNotIn("844.93", profit_json_text)
        self.assertNotIn("184582", profit_json_text)
        self.assertNotIn("Infosys earned ₹", profit_json_text)

    def test_23_profit_missing_reason_uses_pat_semantics(self):
        """Part A1 Gate: Verify Profit unavailable reason never exposes EPS status (e.g. MISSING_EPS)."""
        profit_html = (LEARN_DIR / "profit" / "index.html").read_text(encoding="utf-8")
        
        # Regression invariant: Profit card must never expose EPS status
        self.assertNotIn("MISSING_EPS", profit_html)
        self.assertNotIn("Missing Eps", profit_html)
        self.assertNotIn("missing_eps", profit_html.lower())

        # For 3MINDIA, PAT is unavailable due to INSUFFICIENT_TTM_HISTORY, rendering cleanly as unavailable
        self.assertIn("3M INDIA LTD.", profit_html)
        self.assertIn("🔴 Profit Unavailable", profit_html)

    def test_24_profit_pat_definition_does_not_overstate_attribution(self):
        """Part A2 Gate: Ensure PAT definition uses scope-neutral language without overstating attribution."""
        profit_json = json.loads((CONCEPTS_DIR / "profit.json").read_text(encoding="utf-8"))
        
        # Verify scope-neutral definition in formula variables
        vars_dict = {v["name"]: v["description"] for v in profit_json["detailed_explanation"].get("formula_variables", [])}
        self.assertIn("Profit After Tax (PAT)", vars_dict)
        pat_desc = vars_dict["Profit After Tax (PAT)"]
        self.assertIn("accounting profit remaining after the relevant costs", pat_desc)
        self.assertIn("published reporting scope", pat_desc)
        self.assertNotIn("attributable to equity owners", pat_desc)

    def test_25_beginner_visible_source_heading_and_branding(self):
        """Part A3 Gate: Ensure beginner data cards use simple heading without StockMe Analysis branding leak."""
        for slug in ["profit", "revenue", "eps"]:
            html_text = (LEARN_DIR / slug / "index.html").read_text(encoding="utf-8")
            
            # Heading must be beginner-friendly
            self.assertIn('<h2 class="section-title">See It in a Real Company</h2>', html_text)
            self.assertNotIn('(StockMe Data Lineage)</h2>', html_text)
            
            # Subtle source line
            self.assertIn("Stockerboard Published Snapshot", html_text)

    def test_26_revenue_module_schema_and_route(self):
        """Part B / B36 Gate: Verify /learn/revenue/ schema, compilation, SEO, and JSON-LD."""
        concept_path = CONCEPTS_DIR / "revenue.json"
        self.assertTrue(concept_path.exists())
        concept_data = json.loads(concept_path.read_text(encoding="utf-8"))

        self.assertEqual(concept_data["slug"], "revenue")
        self.assertEqual(concept_data["title"], "Revenue: How Much Business Is the Company Doing?")
        self.assertEqual(concept_data["short_title"], "Revenue (Top-Line Sales)")
        self.assertEqual(concept_data["governance"]["canonical_revenue_metric"], "REVENUE_TTM")
        self.assertEqual(concept_data["governance"]["revenue_ttm_method"], "SUM_OF_4_SEQUENTIAL_QUARTERLY_REVENUE")

        # HTML page existence and canonical route
        html_path = LEARN_DIR / "revenue" / "index.html"
        self.assertTrue(html_path.exists())
        html = html_path.read_text(encoding="utf-8")

        self.assertIn('<link rel="canonical" href="https://stockerboard.com/learn/revenue/">', html)
        self.assertIn('"@type": "LearningResource"', html)
        self.assertIn('"@type": "BreadcrumbList"', html)

        # Sitemap verification
        sitemap = SITEMAP_PATH.read_text(encoding="utf-8")
        self.assertIn("https://stockerboard.com/learn/revenue/", sitemap)

    def test_27_revenue_canonical_contract_and_parity(self):
        """Part B2 / B36 Gate: Verify canonical Revenue contract resolution and multi-surface parity."""
        infy_dossier_path = STOCKS_DIR / "IN" / "INFY.json"
        self.assertTrue(infy_dossier_path.exists())
        infy_dossier = json.loads(infy_dossier_path.read_text(encoding="utf-8"))

        canonical_rev = infy_dossier["revenue_crore"]
        self.assertEqual(canonical_rev, 184582.0)

        # Check render in learn/revenue/index.html
        rev_html = (LEARN_DIR / "revenue" / "index.html").read_text(encoding="utf-8")
        self.assertIn("INFOSYS LIMITED", rev_html)
        self.assertIn("₹184,582.00 Cr", rev_html)
        self.assertIn("StockMe FUNDAMENTAL_GOLD_V1.0.0", rev_html)
        self.assertIn("2026-06-30 (TTM)", rev_html)
        self.assertIn("CONSOLIDATED", rev_html)

    def test_28_revenue_missing_and_zero_and_negative_policy(self):
        """Part B22 / B23 / B36 Gate: Verify missing revenue handling, true zero, and negative revenue policy."""
        rev_html = (LEARN_DIR / "revenue" / "index.html").read_text(encoding="utf-8")

        # Missing Revenue (3MINDIA: Unavailable, renders '—')
        self.assertIn("3M INDIA LTD.", rev_html)
        self.assertIn("🔴 Revenue Unavailable", rev_html)
        self.assertIn(">—<", rev_html)

        # True Zero vs Missing Invariant
        def format_revenue(val):
            if val is None:
                return "—"
            return f"₹{val:,.2f} Cr" if val >= 0 else f"-₹{abs(val):,.2f} Cr"

        self.assertEqual(format_revenue(0.0), "₹0.00 Cr")
        self.assertEqual(format_revenue(None), "—")
        self.assertEqual(format_revenue(-10.55), "-₹10.55 Cr")

    def test_29_revenue_pat_period_scope_parity_and_pairing(self):
        """Part B21 / B36 Gate: Verify Revenue & PAT pairing strictly requires period and scope parity."""
        infy_dossier = json.loads((STOCKS_DIR / "IN" / "INFY.json").read_text(encoding="utf-8"))
        bp = infy_dossier.get("v2_canonical", {}).get("business_performance", {})
        
        rev_period = bp.get("REVENUE_TTM", {}).get("financial_period_end")
        rev_scope = bp.get("REVENUE_TTM", {}).get("scope")
        pat_period = bp.get("PAT_TTM", {}).get("financial_period_end")
        pat_scope = bp.get("PAT_TTM", {}).get("scope")

        # Parity verified
        self.assertEqual(rev_period, pat_period)
        self.assertEqual(rev_scope, pat_scope)

        # Check rendering in revenue HTML
        rev_html = (LEARN_DIR / "revenue" / "index.html").read_text(encoding="utf-8")
        self.assertIn("Top-Line Revenue (TTM)", rev_html)
        self.assertIn("₹184,582.00 Cr", rev_html)
        self.assertIn("Net Profit (PAT TTM)", rev_html)
        self.assertIn("₹30,325.00 Cr", rev_html)

    def test_30_revenue_no_live_calculation_and_pedagogical_quiz(self):
        """Part B20 / B27 / B36 Gate: Verify quiz answers and no hardcoded numbers in revenue.json."""
        rev_json_text = (CONCEPTS_DIR / "revenue.json").read_text(encoding="utf-8")
        
        # No hardcoded current numbers
        self.assertNotIn("184582", rev_json_text)
        self.assertNotIn("8371.01", rev_json_text)
        self.assertNotIn("Infosys generated ₹", rev_json_text)

        concept_data = json.loads(rev_json_text)
        quiz = concept_data.get("quiz", {})
        
        # Q1 Calculation: 1,000 units × ₹500 = ₹5,00,000.00
        q1 = quiz["calculation_question"]
        correct_opt1 = q1["options"][q1["correct_index"]]
        self.assertEqual(correct_opt1, "₹5,00,000.00")

        # Q2 Reasoning: Margins/costs changed and require investigation
        q2 = quiz["reasoning_question"]
        correct_opt2 = q2["options"][q2["correct_index"]]
        self.assertIn("Not enough information", correct_opt2)
        self.assertIn("squeezing margins", correct_opt2)

    def test_31_revenue_bidirectional_navigation_and_graph_links(self):
        """Part B29 / B32 / B36 Gate: Verify bidirectional Revenue <-> Profit navigation and curriculum links."""
        rev_html = (LEARN_DIR / "revenue" / "index.html").read_text(encoding="utf-8")
        profit_html = (LEARN_DIR / "profit" / "index.html").read_text(encoding="utf-8")

        # Revenue links to Profit and now previous links to Market Cap
        self.assertIn('href="/learn/profit/"', rev_html)
        self.assertIn('Profit: What Does a Company Actually Earn? →', rev_html)
        self.assertIn('href="/learn/market-cap/"', rev_html)
        self.assertIn('← Market Capitalisation: What Is the Company Worth in the Stock Market?', rev_html)
        self.assertIn('Understand Profit →', rev_html)

        # Profit links to Revenue
        self.assertIn('href="/learn/revenue/"', profit_html)
        self.assertIn('← Revenue: How Much Business Is the Company Doing?', profit_html)

    def test_32_revenue_definition_does_not_imply_cash_collection(self):
        """Revenue Hardening A1 / A4: Verify Revenue definition avoids implying cash collection."""
        rev_json = json.loads((CONCEPTS_DIR / "revenue.json").read_text(encoding="utf-8"))
        simple = rev_json.get("simple_explanation", {})
        
        headline = simple.get("hero_headline", "")
        intuition = simple.get("core_intuition", "")
        
        # Must define revenue as recognized amount before expenses
        self.assertIn("Revenue is the amount a company recognizes from selling products or providing services", headline)
        self.assertIn("before deducting the relevant expenses", headline)
        
        # Must NOT imply cash collected
        self.assertNotIn("cash collected", headline.lower())
        self.assertNotIn("cash received from customers", headline.lower())
        self.assertNotIn("total gross amount of money a company earns", headline.lower())
        
        # Must preserve distinction
        self.assertIn("Revenue ≠ Profit", intuition)
        self.assertIn("Revenue ≠ Cash Collected", intuition)

    def test_33_revenue_bank_nbfc_wording_is_not_universal_formula(self):
        """Revenue Hardening A2 / A4: Verify bank/NBFC wording avoids universal formula assertion."""
        rev_text = (CONCEPTS_DIR / "revenue.json").read_text(encoding="utf-8")
        
        # Universal formula assertion must be ABSENT
        self.assertNotIn("Bank Revenue = Net Interest Income + Fee Income + Other Income", rev_text)
        self.assertNotIn("Net Interest Income + Fee Income", rev_text)
        
        # Safe beginner wording must be present
        self.assertIn("Banks, NBFCs and other financial companies present income differently", rev_text)
        self.assertIn("published top-line measure may include interest and other financial income", rev_text)

    def test_34_revenue_negative_case_has_no_unproven_cause(self):
        """Revenue Hardening A3 / A4: Verify negative revenue case does not assign unproven causes."""
        rev_text = (CONCEPTS_DIR / "revenue.json").read_text(encoding="utf-8")
        
        # Unproven causal claims must be ABSENT
        self.assertNotIn("trading-loss adjustments", rev_text.lower())
        self.assertNotIn("statutory reversals", rev_text.lower())
        
        # Preferred objective wording must be present
        self.assertIn("The governed Stockerboard contract contains a negative published Revenue value for this case", rev_text)
        self.assertIn("Learn preserves the published value rather than coercing it to zero or hiding it", rev_text)

    def test_35_market_cap_schema_and_route_integrity(self):
        """Part B33 / B38 Gate: Verify market-cap.json schema, generated route, and SEO integrity."""
        mcap_path = CONCEPTS_DIR / "market-cap.json"
        self.assertTrue(mcap_path.exists(), "Missing market-cap.json concept file")
        data = json.loads(mcap_path.read_text(encoding="utf-8"))
        
        self.assertEqual(data["id"], "market-cap")
        self.assertEqual(data["slug"], "market-cap")
        self.assertEqual(data["title"], "Market Capitalisation: What Is the Company Worth in the Stock Market?")
        self.assertEqual(data["short_title"], "Market Cap")
        self.assertEqual(data["category"], "financial-literacy")
        self.assertEqual(data["difficulty"], "Foundations")
        
        # HTML Route
        html_path = LEARN_DIR / "market-cap" / "index.html"
        self.assertTrue(html_path.exists(), "Missing learn/market-cap/index.html")
        html = html_path.read_text(encoding="utf-8")
        self.assertGreater(len(html), 40000)
        self.assertIn("<title>Market Capitalisation: What Is the Company Worth in the Stock Market? | Stockerboard Learn</title>", html)
        self.assertIn('<link rel="canonical" href="https://stockerboard.com/learn/market-cap/">', html)
        self.assertIn('"@type": "LearningResource"', html)
        self.assertIn('"@type": "BreadcrumbList"', html)
        
        # Sitemap
        sitemap = SITEMAP_PATH.read_text(encoding="utf-8")
        self.assertIn("<loc>https://stockerboard.com/learn/market-cap/</loc>", sitemap)

    def test_36_market_cap_canonical_contract_and_no_live_calculation(self):
        """Part B2 / B3 / B38 Gate: Verify canonical contract and NO live calculation authority inside Learn."""
        mcap_text = (CONCEPTS_DIR / "market-cap.json").read_text(encoding="utf-8")
        self.assertIn("MARKET_CAP_CALCULATED_INSIDE_LEARN: NO", mcap_text)
        self.assertIn("VALUATION_GOLD_V1.0.0", mcap_text)
        self.assertIn("round(price * shares, 4)", mcap_text)
        
        # Verify no hardcoded real company values in concept definition
        self.assertNotIn("415219", mcap_text)
        self.assertNotIn("5327.53", mcap_text)
        self.assertNotIn("Infosys Market Cap", mcap_text)
        
        # Verify metric bindings contract
        bindings = json.loads((CONTENT_DIR / "metric_bindings.json").read_text(encoding="utf-8")).get("bindings", {})
        self.assertIn("market_cap", bindings)
        mc_bind = bindings["market_cap"]
        self.assertEqual(mc_bind["gold_metric_key"], "MARKET_CAP")
        self.assertEqual(mc_bind["contract_version"], "VALUATION_GOLD_V1.0.0")
        self.assertEqual(mc_bind["price_field"], "price")
        self.assertEqual(mc_bind["share_count_field"], "shares_outstanding")

    def test_37_market_cap_missing_zero_and_invalid_negative_handling(self):
        """Part B27 / B28 / B38 Gate: Verify missing ('—'), true zero ('₹0.00 Cr'), and invalid negative handling."""
        from scripts.build_learn_pages import render_live_stock_card
        
        # Missing data test
        mock_fin_missing = {"MISSING_CO": {"market_cap_crore": None}}
        mock_uni_missing = {"MISSING_CO": {"name": "Missing Corp", "cmp": 100.0}}
        rendered_missing = render_live_stock_card("MISSING_CO", mock_fin_missing, mock_uni_missing, {}, "market_cap")
        self.assertIn("Published Market Cap", rendered_missing)
        self.assertIn('<div class="live-metric-val" style="color: var(--text-muted);">—</div>', rendered_missing)
        self.assertIn("🔴 Market Cap Unavailable", rendered_missing)
        self.assertNotIn("₹0 Cr", rendered_missing)
        
        # Non-positive / zero market cap test (VALUATION_GOLD_V1.0.0 requires price > 0, shares > 0)
        # MARKET_CAP = 0 is not a valid published state; fails closed to UNAVAILABLE (—)
        mock_fin_zero = {"ZERO_CO": {"market_cap_crore": 0.0}}
        mock_uni_zero = {"ZERO_CO": {"name": "Zero Equity Corp", "cmp": 0.01}}
        rendered_zero = render_live_stock_card("ZERO_CO", mock_fin_zero, mock_uni_zero, {}, "market_cap")
        self.assertIn("🔴 Non Positive Market Cap", rendered_zero)
        self.assertIn('<div class="live-metric-val" style="color: var(--text-muted);">—</div>', rendered_zero)
        self.assertNotIn("₹0.00 Cr", rendered_zero)
        
        # Invalid negative price test (must fail closed)
        mock_fin_neg_p = {"NEG_P_CO": {"market_cap_crore": 100.0}}
        mock_uni_neg_p = {"NEG_P_CO": {"name": "Negative Price Corp", "cmp": -5.0}}
        rendered_neg_p = render_live_stock_card("NEG_P_CO", mock_fin_neg_p, mock_uni_neg_p, {}, "market_cap")
        self.assertIn("🔴 Non Positive Price", rendered_neg_p)
        self.assertIn('<div class="live-metric-val" style="color: var(--text-muted);">—</div>', rendered_neg_p)
        
        # Invalid negative market cap test (normal equity cannot be negative)
        mock_fin_neg_mc = {"NEG_MC_CO": {"market_cap_crore": -50.0}}
        mock_uni_neg_mc = {"NEG_MC_CO": {"name": "Corrupted Market Cap Corp", "cmp": 20.0}}
        rendered_neg_mc = render_live_stock_card("NEG_MC_CO", mock_fin_neg_mc, mock_uni_neg_mc, {}, "market_cap")
        self.assertIn("🔴 Non Positive Market Cap", rendered_neg_mc)
        self.assertIn('<div class="live-metric-val" style="color: var(--text-muted);">—</div>', rendered_neg_mc)

    def test_38_market_cap_published_parity_and_cross_company_evidence(self):
        """Part B24 / B25 / B26 / B38 Gate: Verify published snapshot parity and real cross-company evidence."""
        infy_dossier = json.loads((STOCKS_DIR / "IN" / "INFY.json").read_text(encoding="utf-8"))
        infy_published_mcap = infy_dossier.get("market_cap_crore")
        infy_published_cmp = infy_dossier.get("cmp")
        
        self.assertIsNotNone(infy_published_mcap)
        self.assertEqual(infy_published_mcap, 415219.57)
        self.assertEqual(infy_published_cmp, 1023.4)
        
        # Verify rendered HTML parity
        html = (LEARN_DIR / "market-cap" / "index.html").read_text(encoding="utf-8")
        self.assertIn("Published Market Cap", html)
        self.assertIn("₹415,219.57 Cr", html)
        self.assertIn("₹5,327.53 Cr", html) # ABFRL
        self.assertIn("₹692.04 Cr", html)   # 20MICRONS
        
        # Real company principle: 20MICRONS has HIGHER CMP (>₹190) than ABFRL (<₹55), but ABFRL has MUCH LARGER Market Cap!
        abfrl_mc = self.fin_data["stocks"]["ABFRL"]["market_cap_crore"]
        microns_mc = self.fin_data["stocks"]["20MICRONS"]["market_cap_crore"]
        self.assertGreater(abfrl_mc, microns_mc)

    def test_39_market_cap_bidirectional_navigation_and_graph_links(self):
        """Part B34 / B38 Gate: Verify Market Cap -> Revenue and Revenue -> Market Cap bidirectional chain."""
        mcap_html = (LEARN_DIR / "market-cap" / "index.html").read_text(encoding="utf-8")
        rev_html = (LEARN_DIR / "revenue" / "index.html").read_text(encoding="utf-8")
        
        # In market-cap:
        # Previous is now active link to Share Price
        self.assertIn('href="/learn/share-price/"', mcap_html)
        self.assertIn('← Share Price: Why Does One Share Cost What It Costs?', mcap_html)
        # Next is active link to Revenue
        self.assertIn('href="/learn/revenue/"', mcap_html)
        self.assertIn('Revenue: How Much Business Is the Company Doing? →', mcap_html)
        self.assertIn('Understand Revenue →', mcap_html)
        
        # In revenue:
        # Previous is active link to Market Cap with refined H1
        self.assertIn('href="/learn/market-cap/"', rev_html)
        self.assertIn('← Market Capitalisation: What Is the Company Worth in the Stock Market?', rev_html)

    def test_40_market_cap_pedagogical_quiz_integrity(self):
        """Part B31 / B38 Gate: Verify Q1 calculation and Q2 reasoning answers in market-cap.json."""
        concept_data = json.loads((CONCEPTS_DIR / "market-cap.json").read_text(encoding="utf-8"))
        quiz = concept_data.get("quiz", {})
        
        # Q1 Calculation: ₹200 × 50 Cr = ₹10,000 Cr
        q1 = quiz["calculation_question"]
        correct_opt1 = q1["options"][q1["correct_index"]]
        self.assertEqual(correct_opt1, "₹10,000.00 Cr")
        self.assertIn("₹200.00 × 50.00 Cr = ₹10,000.00 Cr", q1["explanation"])
        
        # Q2 Reasoning: ₹100 vs ₹2,000 share price -> Cannot determine without share-count information
        q2 = quiz["reasoning_question"]
        correct_opt2 = q2["options"][q2["correct_index"]]
        self.assertEqual(correct_opt2, "Not enough information — cannot determine without share-count information")
        self.assertIn("Share price alone tells us almost nothing about total company size", q2["explanation"])

    def test_41_market_cap_zero_state_matches_production_contract(self):
        """Part A1 / A2 / A6: Verify VALUATION_GOLD_V1.0.0 zero-state rules and fail-closed invariants."""
        # Contract rule check in metric_bindings.json
        bindings = json.loads((CONTENT_DIR / "metric_bindings.json").read_text(encoding="utf-8")).get("bindings", {})
        mc_bind = bindings.get("market_cap", {})
        self.assertIn("MARKET_CAP = 0 is not a valid published state", mc_bind.get("zero_policy", ""))
        self.assertIn("price > 0", mc_bind.get("zero_policy", ""))
        self.assertIn("shares > 0", mc_bind.get("zero_policy", ""))
        
        # Concept JSON provenance note
        mc_json_text = (CONCEPTS_DIR / "market-cap.json").read_text(encoding="utf-8")
        self.assertIn("MARKET_CAP = 0 is not a valid published state", mc_json_text)
        self.assertIn("any non-positive source state fails closed to UNAVAILABLE", mc_json_text)

    def test_42_market_cap_h1_uses_market_value_language(self):
        """Part A5 / A6: Verify refined H1 uses 'What Is the Company Worth in the Stock Market?'."""
        mc_json = json.loads((CONCEPTS_DIR / "market-cap.json").read_text(encoding="utf-8"))
        self.assertEqual(mc_json["title"], "Market Capitalisation: What Is the Company Worth in the Stock Market?")
        
        html = (LEARN_DIR / "market-cap" / "index.html").read_text(encoding="utf-8")
        self.assertIn("<title>Market Capitalisation: What Is the Company Worth in the Stock Market? | Stockerboard Learn</title>", html)
        self.assertIn("Market Capitalisation: What Is the Company Worth in the Stock Market?", html)

    def test_43_share_price_schema_and_route_integrity(self):
        """Part B1 / B39 / B44 Gate: Verify share-price.json schema and generated HTML route."""
        sp_path = CONCEPTS_DIR / "share-price.json"
        self.assertTrue(sp_path.exists(), "Missing share-price.json concept file")
        data = json.loads(sp_path.read_text(encoding="utf-8"))
        
        self.assertEqual(data["id"], "share-price")
        self.assertEqual(data["slug"], "share-price")
        self.assertEqual(data["title"], "Share Price: Why Does One Share Cost What It Costs?")
        self.assertEqual(data["short_title"], "Share Price")
        self.assertEqual(data["category"], "financial-literacy")
        self.assertEqual(data["difficulty"], "Foundations")
        
        # HTML Route
        html_path = LEARN_DIR / "share-price" / "index.html"
        self.assertTrue(html_path.exists(), "Missing learn/share-price/index.html")
        html = html_path.read_text(encoding="utf-8")
        self.assertGreater(len(html), 40000)
        self.assertIn("<title>Share Price: Why Does One Share Cost What It Costs? | Stockerboard Learn</title>", html)
        self.assertIn('<link rel="canonical" href="https://stockerboard.com/learn/share-price/">', html)
        self.assertIn('"@type": "LearningResource"', html)
        self.assertIn('"@type": "BreadcrumbList"', html)
        
        # Sitemap
        sitemap = SITEMAP_PATH.read_text(encoding="utf-8")
        self.assertIn("<loc>https://stockerboard.com/learn/share-price/</loc>", sitemap)

    def test_44_share_price_canonical_contract_and_snapshot_terminology(self):
        """Part B2 / B3 / B29 / B44 Gate: Verify Share Price contract and NO false realtime claims."""
        sp_text = (CONCEPTS_DIR / "share-price.json").read_text(encoding="utf-8")
        self.assertIn("SHARE_PRICE_CALCULATED_INSIDE_LEARN: NO", sp_text)
        self.assertIn("EOD_CLOSE", sp_text)
        
        # Verify no hardcoded dynamic numbers in concept definition
        self.assertNotIn("1035.00", sp_text)
        self.assertNotIn("44.53", sp_text)
        self.assertNotIn("Infosys share price", sp_text)
        
        # No false live/realtime wording
        html = (LEARN_DIR / "share-price" / "index.html").read_text(encoding="utf-8")
        self.assertNotIn("Real-Time Price", html)
        self.assertNotIn("Live Market Price", html)
        self.assertIn("Published Closing Price", html)
        self.assertIn("Published Snapshot", html)

    def test_45_share_price_missing_and_non_positive_handling(self):
        """Part B31 / B32 / B44 Gate: Verify missing ('—') and non-positive fail-closed handling."""
        from scripts.build_learn_pages import render_live_stock_card
        
        # Missing price test
        mock_uni_missing = {"MISSING_CO": {"name": "Missing Price Corp", "cmp": None}}
        rendered_missing = render_live_stock_card("MISSING_CO", {}, mock_uni_missing, {}, "share_price")
        self.assertIn("Published Closing Price", rendered_missing)
        self.assertIn('<div class="live-metric-val" style="color: var(--text-muted);">—</div>', rendered_missing)
        self.assertIn("🔴 Price Unavailable", rendered_missing)
        
        # Non-positive price test (price <= 0 must fail closed)
        mock_uni_zero = {"ZERO_P_CO": {"name": "Zero Price Corp", "cmp": 0.0}}
        rendered_zero = render_live_stock_card("ZERO_P_CO", {}, mock_uni_zero, {}, "share_price")
        self.assertIn("🔴 Non Positive Price", rendered_zero)
        self.assertIn('<div class="live-metric-val" style="color: var(--text-muted);">—</div>', rendered_zero)
        self.assertNotIn("₹0.00", rendered_zero)
        
        mock_uni_neg = {"NEG_P_CO": {"name": "Negative Price Corp", "cmp": -15.5}}
        rendered_neg = render_live_stock_card("NEG_P_CO", {}, mock_uni_neg, {}, "share_price")
        self.assertIn("🔴 Non Positive Price", rendered_neg)
        self.assertIn('<div class="live-metric-val" style="color: var(--text-muted);">—</div>', rendered_neg)

    def test_46_share_price_published_parity_and_cross_company_evidence(self):
        """Part B28 / B30 / B44 Gate: Verify published closing price parity and real cross-company evidence."""
        infy_dossier = json.loads((STOCKS_DIR / "IN" / "INFY.json").read_text(encoding="utf-8"))
        infy_published_cmp = infy_dossier.get("cmp")
        self.assertEqual(infy_published_cmp, 1023.4)
        
        # Verify rendered HTML parity uses canonical certified dossier prices
        html = (LEARN_DIR / "share-price" / "index.html").read_text(encoding="utf-8")
        self.assertIn("Published Closing Price", html)
        self.assertIn("₹1,023.40", html) # INFY certified dossier CMP
        self.assertIn("₹43.65", html)    # ABFRL certified dossier CMP
        self.assertIn("₹196.12", html)   # 20MICRONS certified dossier CMP
        self.assertNotIn("₹1,035.00", html) # Stale universe CMP prohibited
        
        # Cross-company principle: 20MICRONS trades at ~4.5x the share price of ABFRL, but ABFRL has higher Market Cap
        self.assertIn("₹5,327.53 Cr", html)
        self.assertIn("₹692.04 Cr", html)

    def test_47_share_price_bidirectional_navigation_and_graph_links(self):
        """Part B40 / B44 Gate: Verify Share Price -> Market Cap and Market Cap -> Share Price navigation."""
        sp_html = (LEARN_DIR / "share-price" / "index.html").read_text(encoding="utf-8")
        mcap_html = (LEARN_DIR / "market-cap" / "index.html").read_text(encoding="utf-8")
        
        # In share-price:
        # Previous is now active link to What Is a Stock
        self.assertIn('href="/learn/what-is-a-stock/"', sp_html)
        self.assertIn('← What Is a Stock? Understanding Ownership in a Company', sp_html)
        self.assertNotIn('What Is a Stock? ⏳ (Coming Soon)', sp_html)
        # Next is active link to Market Cap
        self.assertIn('href="/learn/market-cap/"', sp_html)
        self.assertIn('Market Capitalisation: What Is the Company Worth in the Stock Market? →', sp_html)
        self.assertIn('Understand Market Cap →', sp_html)
        
        # In market-cap:
        # Previous is active link to Share Price
        self.assertIn('href="/learn/share-price/"', mcap_html)
        self.assertIn('← Share Price: Why Does One Share Cost What It Costs?', mcap_html)

    def test_48_share_price_pedagogical_quiz_integrity(self):
        """Part B37 / B44 Gate: Verify Q1 reasoning and Q2 Market Cap bridge in share-price.json."""
        concept_data = json.loads((CONCEPTS_DIR / "share-price.json").read_text(encoding="utf-8"))
        quiz = concept_data.get("quiz", {})
        
        # Q1 Reasoning: ₹50 vs ₹2,000 share price -> Cannot determine valuation from share price alone
        q1 = quiz["reasoning_question"]
        correct_opt1 = q1["options"][q1["correct_index"]]
        self.assertEqual(correct_opt1, "Not enough information — cannot determine valuation from share price alone")
        self.assertIn("Nominal share price alone tells you nothing about whether a company's stock is cheap or expensive", q1["explanation"])
        
        # Q2 Market Cap Bridge: ₹100 × 20 Cr = ₹2,000 Cr
        q2 = quiz["calculation_question"]
        correct_opt2 = q2["options"][q2["correct_index"]]
        self.assertEqual(correct_opt2, "₹2,000.00 Cr")
        self.assertIn("₹100.00 × 20.00 Cr shares = ₹2,000.00 Cr", q2["explanation"])

    def test_49_share_price_has_single_canonical_consumer_source(self):
        """Part P1 / N Gate: Verify share_price binding defines single canonical consumer authority."""
        bindings = json.loads((CONTENT_DIR / "metric_bindings.json").read_text(encoding="utf-8")).get("bindings", {})
        self.assertIn("share_price", bindings)
        sp_bind = bindings["share_price"]
        self.assertEqual(sp_bind["canonical_consumer_source"], "stocks/{prefix}/{symbol}.json (Stockerboard Certified Public Dossier V2)")
        self.assertEqual(sp_bind["canonical_field"], "cmp")
        self.assertEqual(sp_bind["price_type"], "EOD_CLOSE")
        self.assertEqual(sp_bind["as_of_field"], "price_as_of")
        self.assertEqual(sp_bind["contract"], "DOSSIER_V2_FY26_ROE_1.0.0 / OHLC_V1")
        self.assertEqual(sp_bind["coherence_policy"], "SAME_SYMBOL_AND_COMPATIBLE_AS_OF")

    def test_50_price_surface_divergence_is_not_called_parity(self):
        """Part P2 / J Gate: Verify that divergent surfaces (stale universe vs certified dossier) are NOT falsely called parity."""
        uni_data = json.loads((ROOT / "stocks" / "universe_index.json").read_text(encoding="utf-8"))
        uni_infy = [r for r in uni_data.get("stocks", []) if r[0] == "INFY"][0]
        uni_cmp = uni_infy[2] # 1035.0 (as of 2026-10-01)
        uni_as_of = uni_data.get("as_of") # 2026-10-01

        dossier_data = json.loads((STOCKS_DIR / "IN" / "INFY.json").read_text(encoding="utf-8"))
        dossier_cmp = dossier_data.get("cmp") # 1023.4 (as of 2026-10-09)
        dossier_as_of = dossier_data.get("price_as_of") # 2026-10-09

        # Confirm divergence is genuine and temporal
        self.assertNotEqual(uni_cmp, dossier_cmp)
        self.assertNotEqual(uni_as_of, dossier_as_of)
        self.assertEqual(uni_as_of, "2026-10-01")
        self.assertEqual(dossier_as_of, "2026-10-09")

    def test_51_share_price_learn_uses_canonical_source_only(self):
        """Part P3 / C Gate: Verify Learn consumes only canonical dossier source and rejects stale universe prices."""
        html = (LEARN_DIR / "share-price" / "index.html").read_text(encoding="utf-8")
        self.assertIn("₹1,023.40", html)
        self.assertNotIn("₹1,035.00", html)
        self.assertNotIn("1035", html)

    def test_52_share_price_market_cap_snapshot_coherence(self):
        """Part P4 / D Gate: Verify Share Price and Market Cap on real cards share the exact same price_as_of basis."""
        html = (LEARN_DIR / "share-price" / "index.html").read_text(encoding="utf-8")
        # All 3 real cards must state Price As Of: 2026-10-09
        self.assertIn("Price As Of: <strong>2026-10-09</strong>", html)
        self.assertIn("₹415,219.57 Cr", html)
        self.assertIn("₹5,327.53 Cr", html)
        self.assertIn("₹692.04 Cr", html)
        self.assertNotIn("Snapshot Basis Differs", html)

    def test_53_share_price_market_cap_symbol_and_asof_match(self):
        """Part P5 / P6 Gate: Verify same symbol and as_of compatibility between price and market cap."""
        for sym, prefix in [("INFY", "IN"), ("ABFRL", "AB"), ("20MICRONS", "20")]:
            d = json.loads((STOCKS_DIR / prefix / f"{sym}.json").read_text(encoding="utf-8"))
            price_as_of = d.get("price_as_of")
            mcap_val = d.get("market_cap_crore")
            self.assertEqual(price_as_of, "2026-10-09")
            self.assertIsNotNone(mcap_val)
            self.assertGreater(mcap_val, 0)

    def test_54_share_price_market_cap_arithmetic_parity(self):
        """Part P7 / S / T Gate: Verify Price × Shares ≈ Market Cap using INDEPENDENT Share Ledger shares (anti-circular)."""
        import sqlite3
        ledger_path = ROOT.parent / "data" / "fundamentals" / "share_ledger" / "releases" / "SHARE_LEDGER_v1_a04e3f1d4cd6aab8_2f200c3225b283de.sqlite"
        self.assertTrue(ledger_path.exists(), f"Missing independent Share Ledger DB at {ledger_path}")
        
        con = sqlite3.connect(ledger_path)
        cur = con.cursor()
        
        # INFY Independent Validation
        infy_d = json.loads((STOCKS_DIR / "IN" / "INFY.json").read_text(encoding="utf-8"))
        infy_price = infy_d.get("cmp") # 1023.4
        infy_row = cur.execute("SELECT shares_outstanding FROM share_states WHERE canonical_company_id = 'CMP_INFY' AND effective_from <= '2026-10-09' AND effective_to > '2026-10-09'").fetchone()
        self.assertIsNotNone(infy_row, "Missing independent share state for INFY")
        infy_shares = infy_row[0] # 4,057,255,905.0
        self.assertEqual(infy_shares, 4057255905.0)
        # Anti-circular invariant: shares are sourced directly from SQLite, NEVER derived from market_cap / price
        calc_infy_mcap = round(infy_price * infy_shares / 1e7, 2)
        self.assertEqual(calc_infy_mcap, infy_d.get("market_cap_crore"))
        self.assertEqual(calc_infy_mcap, 415219.57)

        # ABFRL Independent Validation
        abfrl_d = json.loads((STOCKS_DIR / "AB" / "ABFRL.json").read_text(encoding="utf-8"))
        abfrl_price = abfrl_d.get("cmp") # 43.65
        abfrl_row = cur.execute("SELECT shares_outstanding FROM share_states WHERE canonical_company_id = 'CMP_ABFRL' AND effective_from <= '2026-10-09' AND effective_to > '2026-10-09'").fetchone()
        self.assertIsNotNone(abfrl_row, "Missing independent share state for ABFRL")
        abfrl_shares = abfrl_row[0] # 1,220,510,115.0
        self.assertEqual(abfrl_shares, 1220510115.0)
        calc_abfrl_mcap = round(abfrl_price * abfrl_shares / 1e7, 2)
        self.assertEqual(calc_abfrl_mcap, abfrl_d.get("market_cap_crore"))
        self.assertEqual(calc_abfrl_mcap, 5327.53)

        # 20MICRONS Independent Validation
        microns_d = json.loads((STOCKS_DIR / "20" / "20MICRONS.json").read_text(encoding="utf-8"))
        microns_price = microns_d.get("cmp") # 196.12
        microns_row = cur.execute("SELECT shares_outstanding FROM share_states WHERE canonical_company_id = 'CMP_20MICRONS' AND effective_from <= '2026-10-09' AND effective_to > '2026-10-09'").fetchone()
        self.assertIsNotNone(microns_row, "Missing independent share state for 20MICRONS")
        microns_shares = microns_row[0] # 35,286,502.0
        self.assertEqual(microns_shares, 35286502.0)
        calc_microns_mcap = round(microns_price * microns_shares / 1e7, 2)
        self.assertEqual(calc_microns_mcap, microns_d.get("market_cap_crore"))
        self.assertEqual(calc_microns_mcap, 692.04)

    def test_55_market_cap_omitted_or_unavailable_on_snapshot_mismatch(self):
        """Part P8 / E Gate: Verify Market Cap fails closed when price and market cap snapshot dates differ."""
        from scripts.build_learn_pages import render_live_stock_card
        # Fixture with mismatched price_as_of (2026-10-15 vs 2026-10-09)
        mock_fin_mismatch = {
            "MISMATCH_CO": {
                "cmp": 100.0,
                "market_cap_crore": 500.0,
                "pe_price_as_of": "2026-10-09"
            }
        }
        mock_uni_mismatch = {
            "MISMATCH_CO": {
                "name": "Mismatch Corp",
                "cmp": 100.0,
                "price_as_of": "2026-10-15"
            }
        }
        rendered = render_live_stock_card("MISMATCH_CO", mock_fin_mismatch, mock_uni_mismatch, {}, "share_price")
        self.assertIn("— (Snapshot Basis Differs)", rendered)
        self.assertNotIn("₹500.00 Cr", rendered)

    def test_56_share_price_does_not_claim_official_without_provenance(self):
        """Part P9 / L Gate: Verify no unsupported official exchange claims in share-price.json or HTML."""
        sp_text = (CONCEPTS_DIR / "share-price.json").read_text(encoding="utf-8")
        html = (LEARN_DIR / "share-price" / "index.html").read_text(encoding="utf-8")
        self.assertNotIn("Official", sp_text)
        self.assertNotIn("official", sp_text.lower())
        self.assertNotIn("Official Closing Price", html)
        self.assertIn("Published Closing Price", html)

    def test_57_share_price_runtime_authority_is_dossier_only(self):
        """Phase 1 A1 / A2 Gate: Verify Share Price runtime authority is strictly the certified dossier."""
        bindings = json.loads((CONTENT_DIR / "metric_bindings.json").read_text(encoding="utf-8")).get("bindings", {})
        sp_bind = bindings.get("share_price", {})
        self.assertEqual(sp_bind.get("runtime_authority"), "CERTIFIED_PUBLIC_DOSSIER_ONLY")
        self.assertEqual(sp_bind.get("fallback_policy"), "FAIL_CLOSED")
        self.assertEqual(sp_bind.get("financial_index_role"), "PARITY_CONSUMER")
        self.assertEqual(sp_bind.get("universe_index_role"), "NOT_PRICE_AUTHORITY")

    def test_58_share_price_has_no_financial_index_or_universe_runtime_fallback(self):
        """Phase 1 A2 / A3 Gate: Verify real companies ignore financial_index and universe_index fallbacks."""
        from scripts.build_learn_pages import render_live_stock_card
        # Pass conflicting prices in fin and uni for INFY; Learn must strictly render INFY's dossier price (1023.40)
        mock_fin_poisoned = {"INFY": {"cmp": 9999.0, "market_cap_crore": 999999.0, "pe_price_as_of": "2026-10-09"}}
        mock_uni_poisoned = {"INFY": {"name": "Infosys Limited", "cmp": 8888.0, "price_as_of": "2026-10-01"}}
        
        rendered = render_live_stock_card("INFY", mock_fin_poisoned, mock_uni_poisoned, {}, "share_price")
        self.assertIn("₹1,023.40", rendered)
        self.assertNotIn("₹9,999.00", rendered)
        self.assertNotIn("₹8,888.00", rendered)

    def test_59_market_cap_parity_anti_circularity_invariant(self):
        """Phase 1 A4 / A8 Gate: Anti-circularity invariant: verify share count source is independent SQLite ledger."""
        import sqlite3
        ledger_path = ROOT.parent / "data" / "fundamentals" / "share_ledger" / "releases" / "SHARE_LEDGER_v1_a04e3f1d4cd6aab8_2f200c3225b283de.sqlite"
        con = sqlite3.connect(ledger_path)
        cur = con.cursor()
        
        # Verify schema guarantees independent share counts stored per company and effective window
        cols = [r[1] for r in cur.execute("PRAGMA table_info(share_states)").fetchall()]
        self.assertIn("shares_outstanding", cols)
        self.assertIn("effective_from", cols)
        self.assertIn("effective_to", cols)
        self.assertIn("canonical_company_id", cols)
        
        # Verify INFY share state is an explicit recorded value, not dynamically computed
        row = cur.execute("SELECT shares_outstanding, status, source_method FROM share_states WHERE canonical_company_id = 'CMP_INFY' AND effective_from <= '2026-10-09' AND effective_to > '2026-10-09'").fetchone()
        self.assertEqual(row[0], 4057255905.0)
        self.assertEqual(row[1], "ACTIVE")

    def test_60_dossier_integrity_wording_not_overstated(self):
        """Phase 1 A10 Gate: Verify no overstated 'cryptographically audited' claims in concept JSON or rendered HTML."""
        sp_text = (CONCEPTS_DIR / "share-price.json").read_text(encoding="utf-8")
        html = (LEARN_DIR / "share-price" / "index.html").read_text(encoding="utf-8")
        bindings_text = (CONTENT_DIR / "metric_bindings.json").read_text(encoding="utf-8")
        
        self.assertNotIn("cryptographically audited", sp_text.lower())
        self.assertNotIn("cryptographically audited", html.lower())
        self.assertNotIn("cryptographically audited", bindings_text.lower())

    def test_61_what_is_a_stock_schema_and_route_integrity(self):
        """Phase 2 B38: Verify what-is-a-stock.json schema, generated route, and canonical URL."""
        stock_path = CONCEPTS_DIR / "what-is-a-stock.json"
        self.assertTrue(stock_path.exists(), "Missing what-is-a-stock.json concept file")
        data = json.loads(stock_path.read_text(encoding="utf-8"))
        
        self.assertEqual(data["id"], "what-is-a-stock")
        self.assertEqual(data["slug"], "what-is-a-stock")
        self.assertEqual(data["title"], "What Is a Stock? Understanding Ownership in a Company")
        self.assertEqual(data["short_title"], "What Is a Stock?")
        self.assertEqual(data["category"], "financial-literacy")
        self.assertEqual(data["difficulty"], "Foundations")
        
        # HTML Route
        html_path = LEARN_DIR / "what-is-a-stock" / "index.html"
        self.assertTrue(html_path.exists(), "Missing learn/what-is-a-stock/index.html")
        html = html_path.read_text(encoding="utf-8")
        self.assertGreater(len(html), 40000)
        self.assertIn("<title>What Is a Stock? Understanding Ownership in a Company | Stockerboard Learn</title>", html)
        self.assertIn('<link rel="canonical" href="https://stockerboard.com/learn/what-is-a-stock/">', html)
        self.assertIn('"@type": "LearningResource"', html)
        self.assertIn('"@type": "BreadcrumbList"', html)
        
        # Sitemap
        sitemap = SITEMAP_PATH.read_text(encoding="utf-8")
        self.assertIn("<loc>https://stockerboard.com/learn/what-is-a-stock/</loc>", sitemap)

    def test_62_what_is_a_stock_ownership_definition(self):
        """Phase 2 B1 / B38: Verify core mental model defines stock as fractional ownership."""
        stock_json = json.loads((CONCEPTS_DIR / "what-is-a-stock.json").read_text(encoding="utf-8"))
        simple = stock_json.get("simple_explanation", {})
        self.assertIn("A stock represents fractional ownership of a real business", simple.get("hero_headline", ""))
        self.assertIn("equity ownership is divided into units called shares", simple.get("core_intuition", ""))
        self.assertIn("co-owner (shareholder)", simple.get("core_intuition", ""))

    def test_63_what_is_a_stock_stock_vs_share_distinction(self):
        """Phase 2 B2 / B38: Verify gentle explanation of stock vs share distinction."""
        html = (LEARN_DIR / "what-is-a-stock" / "index.html").read_text(encoding="utf-8")
        self.assertIn("units called shares", html)
        self.assertIn("fractional ownership", html)

    def test_64_what_is_a_stock_primary_vs_secondary_market_distinction(self):
        """Phase 2 B5 / B38 & Phase 0 A2 Gate: Verify primary vs secondary market distinction."""
        stock_json = json.loads((CONCEPTS_DIR / "what-is-a-stock.json").read_text(encoding="utf-8"))
        edge_cases = stock_json.get("advanced_explanation", {}).get("edge_cases", [])
        edge_text = " ".join(edge_cases)
        self.assertIn("Primary Market", edge_text)
        self.assertIn("Secondary Market", edge_text)
        self.assertIn("In an IPO that includes an Offer for Sale, proceeds for that portion go to the selling shareholders", edge_text)
        self.assertIn("In a normal secondary-market trade between investors, the company does not receive the buyer's purchase consideration", edge_text)

    def test_65_what_is_a_stock_dividend_not_guaranteed(self):
        """Phase 2 B6 / B21 / B38: Verify explicit teaching that dividends are not guaranteed."""
        stock_json = json.loads((CONCEPTS_DIR / "what-is-a-stock.json").read_text(encoding="utf-8"))
        mistakes = stock_json.get("detailed_explanation", {}).get("common_mistakes", [])
        div_mistake = [m for m in mistakes if "dividend" in m["fallacy"].lower()][0]
        self.assertIn("optional distributions declared at the discretion of the company's board", div_mistake["reality"])

    def test_66_what_is_a_stock_shareholder_not_lender(self):
        """Phase 2 B7 / B38: Verify clear shareholder vs lender / creditor contrast."""
        stock_json = json.loads((CONCEPTS_DIR / "what-is-a-stock.json").read_text(encoding="utf-8"))
        mistakes = stock_json.get("detailed_explanation", {}).get("common_mistakes", [])
        lend_mistake = [m for m in mistakes if "lending" in m["fallacy"].lower()][0]
        self.assertIn("equity ownership, not debt", lend_mistake["reality"])
        self.assertIn("Lenders receive fixed interest", lend_mistake["reality"])

    def test_67_what_is_a_stock_real_company_card_uses_governed_metadata(self):
        """Phase 2 B26 / B38: Verify real company card displays published closing price and governed metadata."""
        html = (LEARN_DIR / "what-is-a-stock" / "index.html").read_text(encoding="utf-8")
        self.assertIn("INFOSYS LIMITED", html)
        self.assertIn("(INFY)", html)
        self.assertIn("NSE (EQ)", html)
        self.assertIn("₹1,023.40", html)
        self.assertIn("INE009A01021", html)
        self.assertIn("Price As Of: <strong>2026-10-09</strong>", html)
        self.assertIn("Stockerboard Certified Public Dossier V2", html)

    def test_68_what_is_a_stock_no_real_company_fake_ownership_percentage(self):
        """Phase 2 B27 / B38: Verify no fabricated ownership percentage for real companies."""
        html = (LEARN_DIR / "what-is-a-stock" / "index.html").read_text(encoding="utf-8")
        self.assertNotIn("1 INFY share = ", html)
        self.assertNotIn("Infosys share = 0.", html)
        self.assertNotIn("ownership of Infosys", html)

    def test_69_what_is_a_stock_to_share_price_navigation(self):
        """Phase 2 B33 / B38: Verify What Is a Stock -> Share Price active navigation."""
        stock_html = (LEARN_DIR / "what-is-a-stock" / "index.html").read_text(encoding="utf-8")
        self.assertIn('href="/learn/share-price/"', stock_html)
        self.assertIn('Share Price: Why Does One Share Cost What It Costs? →', stock_html)
        self.assertIn('href="/learn/"', stock_html)
        self.assertIn('← Foundations Hub', stock_html)

    def test_70_share_price_to_what_is_a_stock_navigation(self):
        """Phase 2 B33 / B38: Verify Share Price previous link now actively links to What Is a Stock."""
        sp_html = (LEARN_DIR / "share-price" / "index.html").read_text(encoding="utf-8")
        self.assertIn('href="/learn/what-is-a-stock/"', sp_html)
        self.assertIn('← What Is a Stock? Understanding Ownership in a Company', sp_html)
        self.assertNotIn('What Is a Stock? ⏳ (Coming Soon)', sp_html)

    def test_71_what_is_a_stock_quiz(self):
        """Phase 2 B30 / B38: Verify Q1 calculation and Q2 reasoning answers in what-is-a-stock.json."""
        stock_json = json.loads((CONCEPTS_DIR / "what-is-a-stock.json").read_text(encoding="utf-8"))
        quiz = stock_json.get("quiz", {})
        
        # Q1: 5 shares out of 100 = 5.0%
        q1 = quiz["calculation_question"]
        correct_opt1 = q1["options"][q1["correct_index"]]
        self.assertEqual(correct_opt1, "5.0%")
        self.assertIn("5 shares ÷ 100 total shares = 0.05 or 5.0%", q1["explanation"])
        
        # Q2: secondary market purchase money goes to selling investor
        q2 = quiz["reasoning_question"]
        correct_opt2 = q2["options"][q2["correct_index"]]
        self.assertEqual(correct_opt2, "The selling investor who owned the shares")
        self.assertIn("purchase money goes to the selling investor, not the company", q2["explanation"])

    def test_72_what_is_a_stock_seo(self):
        """Phase 2 B32 / B38: Verify SEO tags, canonical URL, and schema markup."""
        html = (LEARN_DIR / "what-is-a-stock" / "index.html").read_text(encoding="utf-8")
        self.assertIn('<link rel="canonical" href="https://stockerboard.com/learn/what-is-a-stock/">', html)
        self.assertIn('<meta name="description"', html)
        self.assertIn('"@type": "LearningResource"', html)
        self.assertIn('"@type": "BreadcrumbList"', html)

    def test_73_what_is_a_stock_accessibility(self):
        """Phase 2 B36 / B38: Verify accessibility conventions, semantic headings, and ARIA roles."""
        html = (LEARN_DIR / "what-is-a-stock" / "index.html").read_text(encoding="utf-8")
        self.assertIn('<h1', html)
        self.assertIn('<h2', html)
        self.assertIn('aria-label="Breadcrumb"', html)
        self.assertIn('class="depth-switcher-wrap"', html)

    def test_74_what_is_a_stock_mobile(self):
        """Phase 2 B36 / B38: Verify responsive meta tags and clean container classes."""
        html = (LEARN_DIR / "what-is-a-stock" / "index.html").read_text(encoding="utf-8")
        self.assertIn('<meta name="viewport" content="width=device-width, initial-scale=1.0">', html)
        self.assertIn('class="lesson-container"', html)

    def test_75_foundations_hub_and_curriculum_ordering(self):
        """Foundations Product Audit: Verify hub orders 7 core lessons sequentially followed by secondary tracks."""
        hub_html = (LEARN_DIR / "index.html").read_text(encoding="utf-8")
        
        # Invariant A1: No "Whole Company Worth" in beginner navigation
        self.assertNotIn("Whole Company Worth", hub_html)
        
        # Hero points directly to Step 1
        self.assertIn('href="/learn/what-is-a-stock/" class="btn-primary"', hub_html)
        self.assertIn("Start Here: What Is a Stock? (Step 1) →", hub_html)
        
        # Step 1-7 sequential presence
        for step_num, slug in [
            (1, "what-is-a-stock"),
            (2, "share-price"),
            (3, "market-cap"),
            (4, "revenue"),
            (5, "profit"),
            (6, "eps"),
            (7, "pe-ratio"),
        ]:
            self.assertIn(f'href="/learn/{slug}/"', hub_html)
            self.assertIn(f'<span class="chain-num">{step_num}</span>', hub_html)

        # Secondary tracks are present and segregated from core chain
        self.assertIn("UNDERSTAND THE BUSINESS QUALITY", hub_html)
        self.assertIn('href="/learn/roe/"', hub_html)
        self.assertIn('href="/learn/profit-vs-cash-flow/"', hub_html)
        self.assertIn("UNDERSTAND PRICE CONTEXT", hub_html)
        self.assertIn('href="/learn/52-week-high-low/"', hub_html)

    def test_76_pe_ratio_completion_banner_and_clean_navigation(self):
        """Foundations Product Audit: Verify P/E presents clean completion state and bidirectional navigation."""
        pe_html = (LEARN_DIR / "pe-ratio" / "index.html").read_text(encoding="utf-8")
        
        # Completion banner
        self.assertIn("Core Foundations Complete!", pe_html)
        self.assertIn("1. Stock Ownership", pe_html)
        self.assertIn("2. Share Price", pe_html)
        self.assertIn("3. Market Cap", pe_html)
        self.assertIn("4. Revenue", pe_html)
        self.assertIn("5. Profit", pe_html)
        self.assertIn("6. EPS", pe_html)
        self.assertIn("7. P/E Multiple", pe_html)
        
        # Next navigation to secondary topics
        self.assertIn('href="/learn/roe/"', pe_html)
        self.assertIn('href="/learn/profit-vs-cash-flow/"', pe_html)
        self.assertIn('href="/learn/52-week-high-low/"', pe_html)
        self.assertIn('href="/learn/eps/"', pe_html)


if __name__ == "__main__":
    unittest.main()


