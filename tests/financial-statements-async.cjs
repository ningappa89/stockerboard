// Browser-independent asynchronous race/integrity regression with a minimal DOM.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attributes={};this.textContent='';}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=items;}
 setAttribute(k,v){this.attributes[k]=v;}
}
const host=new Element('section');host.id='dossierFinancialStatements';
const document={readyState:'loading',createElement:t=>new Element(t),addEventListener(){},getElementById:id=>id===host.id?host:null};
const pending=new Map();const release='FSV1_0123456789abcdef01234567';
const makeDoc=symbol=>({schema_version:'1.0',symbol,release_id:release,default_scope:'CONSOLIDATED',statements:{quarterly:[{period_id:symbol,period_end:'2026-06-30',scope:'CONSOLIDATED',duration_kind:'QUARTER',basis:'REPORTED',metrics:{VALUE:{value:symbol==='AAA'?1:2,unit:'INR_PER_SHARE',status:'AVAILABLE'}}}]}});
const bytes=Object.fromEntries(['AAA','BBB'].map(s=>[s,Buffer.from(JSON.stringify(makeDoc(s)))]));
const index={schema_version:'1.0',release_id:release,companies:Object.fromEntries(['AAA','BBB'].map(s=>[s,{path:`releases/${release}/${s}.json`,sha256:crypto.createHash('sha256').update(bytes[s]).digest('hex')}]))};
const context={window:{},document,crypto:crypto.webcrypto,TextDecoder,URL,Blob,location:{hash:''},fetch:url=>url.endsWith('index.json')?Promise.resolve({ok:true,json:async()=>index}):new Promise(resolve=>pending.set(url,resolve))};
vm.runInNewContext(fs.readFileSync(require.resolve('../scripts/financial-statements.js'),'utf8'),context);
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
const text=el=>typeof el==='string'?el:[el.textContent,...el.children.map(text)].join(' ');
(async()=>{
 context.window.loadFinancialStatements('AAA');await tick();
 context.window.loadFinancialStatements('BBB');await tick();
 pending.get('/financial-statements/'+index.companies.BBB.path)({ok:true,arrayBuffer:async()=>bytes.BBB});await tick();
 pending.get('/financial-statements/'+index.companies.AAA.path)({ok:true,arrayBuffer:async()=>bytes.AAA});await tick();
 assert(text(host).includes('BBB · consolidated'));assert(!text(host).includes('AAA · consolidated'));
 context.window.loadFinancialStatements('AAA');await tick();
 pending.get('/financial-statements/'+index.companies.AAA.path)({ok:true,arrayBuffer:async()=>Buffer.from('{}')});await tick();
 assert(text(host).includes('integrity check failed'));
 console.log('PASS: company-switch race and payload-integrity errors');
})().catch(e=>{console.error(e);process.exitCode=1;});
