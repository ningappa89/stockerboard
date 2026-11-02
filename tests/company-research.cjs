const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {readStatements,latest,format,validSymbol}=require('../scripts/company-research.js');
const hash=async bytes=>crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex');
const doc={symbol:'TCS',schema_version:'1.0',release_id:'FSV1_abc',identity:{status:'RESOLVED'},statements:{ratios:[{scope:'CONSOLIDATED',period_end:'2026-06-30',metrics:{ROE:{status:'UNAVAILABLE',value:null}}},{scope:'CONSOLIDATED',period_end:'2025-06-30',metrics:{ROE:{status:'AVAILABLE',value:12}}}]}};
const raw=new TextEncoder().encode(JSON.stringify(doc));
async function run(){
 const index={schema_version:'1.0',release_id:'FSV1_abc',companies:{TCS:{identity_status:'RESOLVED',path:'releases/FSV1_abc/TCS.json',sha256:await hash(raw)}}};
 const fetcher=async url=>url.endsWith('index.json')?{ok:true,json:async()=>index}:{ok:true,arrayBuffer:async()=>raw.buffer};
 assert.equal((await readStatements('TCS',fetcher,hash)).symbol,'TCS');
 index.companies.TCS.sha256='wrong';await assert.rejects(readStatements('TCS',fetcher,hash),/integrity/);index.companies.TCS.sha256=await hash(raw);
 index.release_id='FSV1_def';await assert.rejects(readStatements('TCS',fetcher,hash),/identity/);index.release_id='FSV1_abc';
 index.companies.TCS.path='../TCS.json';await assert.rejects(readStatements('TCS',fetcher,hash),/path/);
 await assert.rejects(readStatements('UNKNOWN',fetcher,hash),/identity/);
 assert.equal(latest(doc,'ratios','ROE','CONSOLIDATED').status,'UNAVAILABLE','Do not fall back to an older available metric');
 assert.equal(latest(doc,'ratios','ROE','STANDALONE'),null,'Do not mix scopes');
 assert.equal(format({status:'UNAVAILABLE',value:99,unit:'PERCENT'}),'—');
 assert.equal(format({status:'AVAILABLE',value:0,unit:'PERCENT'}),'0%');
 assert.equal(format({status:'AVAILABLE',value:1e7,unit:'INR'}),'₹1 Cr');
 assert.equal(validSymbol('../TCS'),false);assert.equal(validSymbol('M&M'),true);
 console.log('PASS: company identity, release hash, path validation, scope isolation, missing values and zero values');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
