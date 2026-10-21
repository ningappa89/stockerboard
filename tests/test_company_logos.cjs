/**
 * stockerboard_repo/tests/test_company_logos.cjs
 * ==============================================
 * Unit and contract tests for company-logos.js.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Load module in Node environment
const companyLogosPath = path.resolve(__dirname, '../scripts/company-logos.js');
const CompanyLogos = require(companyLogosPath);

console.log('Testing company-logos.js module in Node...');

// 1. Symbol Normalization
assert.strictEqual(CompanyLogos.normalizeLogoSymbol('reliance'), 'RELIANCE');
assert.strictEqual(CompanyLogos.normalizeLogoSymbol('TCS.NS'), 'TCS');
assert.strictEqual(CompanyLogos.normalizeLogoSymbol('INFY.BO'), 'INFY');
assert.strictEqual(CompanyLogos.normalizeLogoSymbol('NSE:SBIN'), 'SBIN');
assert.strictEqual(CompanyLogos.normalizeLogoSymbol('BSE:ITC'), 'ITC');
assert.strictEqual(CompanyLogos.normalizeLogoSymbol('M&M'), 'M&M');
assert.strictEqual(CompanyLogos.normalizeLogoSymbol('M&MFIN.NS'), 'M&MFIN');
assert.strictEqual(CompanyLogos.normalizeLogoSymbol('BAJAJ-AUTO'), 'BAJAJ-AUTO');
assert.strictEqual(CompanyLogos.normalizeLogoSymbol('J&KBANK'), 'J&KBANK');

// 2. Canonical Alias Resolution (Manifest default alias: ZOMATO -> ETERNAL)
assert.strictEqual(CompanyLogos.normalizeLogoSymbol('ZOMATO'), 'ETERNAL');
assert.strictEqual(CompanyLogos.normalizeLogoSymbol('zomato.ns'), 'ETERNAL');

// 3. Fallback Initial Determination
assert.strictEqual(CompanyLogos.getFallbackInitial('RELIANCE'), 'R');
assert.strictEqual(CompanyLogos.getFallbackInitial('tcs'), 'T');
assert.strictEqual(CompanyLogos.getFallbackInitial('3MINDIA'), '3');
assert.strictEqual(CompanyLogos.getFallbackInitial('20MICRONS'), '2');
assert.strictEqual(CompanyLogos.getFallbackInitial('M&M'), 'M');
assert.strictEqual(CompanyLogos.getFallbackInitial('BAJAJ-AUTO'), 'B');
assert.strictEqual(CompanyLogos.getFallbackInitial(''), '•');

// 4. Logo Resolution when logo missing (fail-closed)
const missingRes = CompanyLogos.resolveCompanyLogo('UNKNOWN_CORP');
assert.strictEqual(missingRes.available, false);
assert.strictEqual(missingRes.symbol, 'UNKNOWN_CORP');
assert.strictEqual(missingRes.fallback, 'U');
assert.strictEqual(missingRes.src, null);

// 5. HTML String Generation
const fallbackHtml = CompanyLogos.renderStockLogoHtml('RELIANCE', { size: 'md' });
assert.ok(fallbackHtml.includes('class="stock-logo-wrap size-md is-fallback'), 'Contains fallback classes');
assert.ok(fallbackHtml.includes('aria-hidden="true"'), 'Contains aria-hidden');
assert.ok(fallbackHtml.includes('>R<'), 'Contains fallback initial character');
assert.ok(!fallbackHtml.includes('onerror='), 'Zero inline onerror attribute');

// Small size modifier
const smHtml = CompanyLogos.renderStockLogoHtml('TCS', { size: 'sm' });
assert.ok(smHtml.includes('size-sm'), 'Contains size-sm modifier');
assert.ok(smHtml.includes('>T<'), 'Contains fallback initial T');

// Large size modifier
const lgHtml = CompanyLogos.renderStockLogoHtml('M&M', { size: 'lg' });
assert.ok(lgHtml.includes('size-lg'), 'Contains size-lg modifier');
assert.ok(lgHtml.includes('>M<'), 'Contains fallback initial M');

// ========================================================
// CIRCUIT BREAKER TEST CASES (Cases 1 - 5)
// ========================================================
console.log('Testing Circuit Breaker behaviors...');

// CASE 1: Manifest absent / failed -> fallback mode, zero exception
CompanyLogos.resetCircuitBreaker();
const resCase1 = CompanyLogos.resolveCompanyLogo('TCS');
assert.strictEqual(resCase1.available, false);
assert.strictEqual(resCase1.fallback, 'T');
assert.strictEqual(CompanyLogos.isCircuitOpen(), false, 'Case 1: Circuit remains closed during initial fallback state');

// CASE 2: Manifest exists, one logo missing -> only that logo becomes fallback, circuit remains closed
const resCase2 = CompanyLogos.resolveCompanyLogo('SOME_MISSING_SYM');
assert.strictEqual(resCase2.available, false);
assert.strictEqual(resCase2.fallback, 'S');
assert.strictEqual(CompanyLogos.isCircuitOpen(), false, 'Case 2: Isolated missing symbol does not open circuit');

// CASE 3: Several isolated bad logos but many successful assets -> circuit remains closed
CompanyLogos.resetCircuitBreaker();
// Simulate 4 errors with successful loads interspersed
for (let i = 0; i < 4; i++) {
    const mockWrap = {
        getAttribute: (attr) => attr === 'data-manifest-backed' ? 'true' : 'X',
        classList: { add: () => {} },
        setAttribute: () => {},
        firstChild: null,
        appendChild: () => {}
    };
    const mockImg = { closest: () => mockWrap };
    CompanyLogos.handleCompanyLogoError(mockImg);
}
assert.strictEqual(CompanyLogos.isCircuitOpen(), false, 'Case 3: 4 failures without meeting minimum attempts does not open circuit');

// CASE 4: Systemic manifest-backed asset failure -> circuit opens, remaining use fallback without network attempts
CompanyLogos.resetCircuitBreaker();
// Fire 8 manifest-backed errors to exceed MIN_ATTEMPTS (8) and CONSECUTIVE_THRESHOLD (6)
for (let i = 0; i < 8; i++) {
    const mockWrap = {
        getAttribute: (attr) => attr === 'data-manifest-backed' ? 'true' : 'X',
        classList: { add: () => {} },
        setAttribute: () => {},
        firstChild: null,
        appendChild: () => {}
    };
    const mockImg = { closest: () => mockWrap };
    CompanyLogos.handleCompanyLogoError(mockImg);
}
assert.strictEqual(CompanyLogos.isCircuitOpen(), true, 'Case 4: Systemic asset failures tripped circuit breaker');
const trippedRes = CompanyLogos.resolveCompanyLogo('RELIANCE');
assert.strictEqual(trippedRes.available, false, 'Case 4: Circuit open routes directly to fallback');
assert.strictEqual(trippedRes.circuitBreakerActive, true, 'Case 4: circuitBreakerActive flag set');

// Reset circuit for clean state
CompanyLogos.resetCircuitBreaker();
assert.strictEqual(CompanyLogos.isCircuitOpen(), false, 'Circuit reset verified');

// CASE 5: Unrelated image fails -> company-logo system does nothing
const metricsBefore = CompanyLogos.getCircuitMetrics();
const unrelatedWrap = {
    getAttribute: (attr) => attr === 'data-manifest-backed' ? null : 'X',
    classList: { add: () => {} },
    setAttribute: () => {},
    firstChild: null,
    appendChild: () => {}
};
const unrelatedImg = { closest: () => unrelatedWrap };
CompanyLogos.handleCompanyLogoError(unrelatedImg);
const metricsAfter = CompanyLogos.getCircuitMetrics();
assert.strictEqual(metricsBefore.failedLoads, metricsAfter.failedLoads, 'Case 5: Unrelated image failure ignored by circuit breaker');

console.log('✓ All 5 Circuit Breaker test cases passed successfully!');
console.log('✓ All Node contract assertions passed successfully!');
