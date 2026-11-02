const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const path=require('node:path');
const doc={symbol:'TCS',schema_version:'1.0',release_id:'FSV1_abc',identity:{status:'RESOLVED'}};
const raw=Buffer.from(JSON.stringify(doc));
let expected=crypto.createHash('sha256').update(raw).digest('hex');
const context={crypto:crypto.webcrypto,TextDecoder,Uint8Array,Map,Set,window:{},fetch:async url=>url.endsWith('index.json')?{ok:true,json:async()=>({schema_version:'1.0',release_id:'FSV1_abc',companies:{TCS:{identity_status:'RESOLVED',path:'releases/FSV1_abc/TCS.json',sha256:expected}}})}:{ok:true,arrayBuffer:async()=>raw}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../scripts/research-data.js'),'utf8'),context);
(async()=>{
 const api=context.window.StockerboardData;
 assert.equal((await (await api.statements('TCS')).json()).symbol,'TCS');
 raw[0]=91;await assert.rejects(api.statements('TCS'),/integrity/);
 await assert.rejects(api.statements('../TCS'),/Invalid/);
 for(const name of ['company_overview','financials_tab','valuation_tab','peers_tab','filings_tab']){
  const text=fs.readFileSync(path.join(__dirname,'../stockerboard_'+name+'.html'),'utf8');
  assert.ok(text.includes('/scripts/research-data.js'),name+' must load the verified adapter');
  assert.ok(!/fetch\(`\/financial-statements\/releases\//.test(text),name+' must not bypass the adapter');
 }
 console.log('PASS: actual-page verified adapter, tamper rejection and unsafe symbol rejection');
})().catch(e=>{console.error(e);process.exitCode=1;});
