const assert=require('node:assert/strict');
const {cohort,number}=require('../scripts/peer-comparison.js');
const universe=['BANK','SMALLBANK','GOLDLENDER','JEWELLER','UNKNOWN'].map(symbol=>({symbol,sector:'Financial Services'}));
const companies={BANK:{status:'AVAILABLE',group:'BANKING'},SMALLBANK:{status:'AVAILABLE',group:'BANKING'},GOLDLENDER:{status:'AVAILABLE',group:'NBFC:GOLD'},JEWELLER:{status:'AVAILABLE',group:'CORPORATE:JEWELLERY'},UNKNOWN:{status:'UNAVAILABLE',group:null}};
assert.deepEqual(cohort('BANK',universe,{companies}).map(c=>c.symbol),['BANK','SMALLBANK']);
assert.deepEqual(cohort('GOLDLENDER',universe,{companies}).map(c=>c.symbol),['GOLDLENDER']);
assert.deepEqual(cohort('UNKNOWN',universe,{companies}),[]);
assert.equal(number({status:'UNAVAILABLE',value:20}),null);
assert.equal(number({status:'AVAILABLE',value:0}),0);
console.log('PASS: no market fallback, banking/lender/jewellery separation, unknown classifications and metric status');

const duplicateUniverse=['ALIAS','BANK','SMALLBANK','SMALLALIAS'].map(symbol=>({symbol}));
const duplicateGroups={companies:{ALIAS:{status:'AVAILABLE',group:'BANKING',company_id:'C1'},BANK:{status:'AVAILABLE',group:'BANKING',company_id:'C1'},SMALLBANK:{status:'AVAILABLE',group:'BANKING',company_id:'C2'},SMALLALIAS:{status:'AVAILABLE',group:'BANKING',company_id:'C2'}}};
assert.deepEqual(cohort('BANK',duplicateUniverse,duplicateGroups).map(c=>c.symbol),['BANK','SMALLBANK']);
console.log('PASS: selected issuer aliases and duplicate peer issuers are excluded');
const {unavailableMessage}=require('../scripts/peer-comparison.js');
assert.match(unavailableMessage({reason:'CURRENT_EQUITY_IDENTITY_REQUIRED'},0),/identity is unresolved/);
assert.match(unavailableMessage({},1),/Only one eligible company/);
