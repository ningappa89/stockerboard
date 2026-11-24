/* Shared analytics stays disabled until configured and explicitly consented. */
(function(root){
 'use strict';
 if(root.StockerboardAnalytics)return;
 const events=new Set(['search_submitted','search_no_results','company_opened','financial_section_viewed','pattern_viewed','pattern_explanation_opened','company_saved','research_returned']);
 const fields=new Set(['route','result_count_bucket','resolved_symbol','query_length_bucket','symbol','entry_route','section','period_basis','family','scope','market_session','status','expansion_source','cohort']);
 let config={enabled:false,measurement_id:null,consent_granted:false},configured=false;
 const recent=new Map();
 const doc=root.document;
 const configHash=doc?.currentScript?.dataset.configSha256;
 const routes=new Set(['home','stocks','company','learn','pro']);
 function sanitizePayload(payload){
  const clean={};
  if(!payload||typeof payload!=='object')return clean;
  for(const key of Object.keys(payload).sort()){
   if(!fields.has(key))continue;
   const value=payload[key];
   if(['symbol','resolved_symbol'].includes(key)){if(typeof value==='string'&&/^[A-Z0-9&_.-]{1,40}$/.test(value))clean[key]=value;}
   else if(['route','entry_route'].includes(key)){if(routes.has(value))clean[key]=value;}
   else if(key==='market_session'){if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value)clean[key]=value;}
   else if(['result_count_bucket','query_length_bucket'].includes(key)){if(typeof value==='string'&&/^[0-9+-]{1,12}$/.test(value))clean[key]=value;}
   else if(typeof value==='string'&&/^[A-Za-z0-9_-]{1,50}$/.test(value))clean[key]=value;
  }
  return clean;
 }
 function isEnabled(){
  return config.enabled===true&&config.consent_granted===true
   &&typeof config.measurement_id==='string'&&/^G-[A-Z0-9]{6,20}$/.test(config.measurement_id)
   &&!/(STOCKERBOARD|PLACEHOLDER|EXAMPLE)/.test(config.measurement_id);
 }
 function tag(){return typeof root.gtag==='function'?root.gtag:typeof gtag==='function'?gtag:null;}
 function configure(){
  if(!isEnabled()||configured)return;
  let fn=tag();
  if(!fn&&doc){
   root.dataLayer=root.dataLayer||[];
   root.gtag=function(){root.dataLayer.push(arguments);};fn=root.gtag;
   const script=doc.createElement('script');script.async=true;
   script.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(config.measurement_id);
   doc.head.append(script);
  }
  if(fn){
   fn('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
   fn('js',new Date());
   fn('config',config.measurement_id,{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false});
   configured=true;
  }
 }
 function init(cfg){
  try{
   if(!cfg||typeof cfg!=='object')return false;
   if(configured&&cfg.measurement_id&&cfg.measurement_id!==config.measurement_id)return false;
   config={enabled:cfg.enabled===true,measurement_id:cfg.measurement_id||null,consent_granted:cfg.consent_granted===true};
   configure();return isEnabled();
  }catch(_){config.enabled=false;return false;}
 }
 function setConsent(granted){
  config.consent_granted=granted===true;
  try{
   if(configured)tag()?.('consent','update',{analytics_storage:granted===true?'granted':'denied'});
   else configure();
  }catch(_){return false;}
  return isEnabled();
 }
 function track(name,payload){
  try{
   if(!events.has(name)||!isEnabled())return false;
   configure();const fn=tag();if(!fn)return false;
   const clean=sanitizePayload(payload),key=name+':'+JSON.stringify(clean),now=Date.now();
   if(recent.has(key)&&now-recent.get(key)<2000)return false;
   fn('event',name,{...clean,send_to:config.measurement_id});
   recent.set(key,now);
   while(recent.size>100)recent.delete(recent.keys().next().value);
   return true;
  }catch(_){return false;}
 }
 async function bootstrap(){
  try{
   const response=await root.fetch('/config/analytics.json'+(configHash?'?v='+configHash.slice(0,12):''),{cache:'no-cache'});
   if(!response.ok)return false;
   const bytes=await response.arrayBuffer();
   if(configHash){
    const hash=[...new Uint8Array(await root.crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
    if(hash!==configHash)return false;
   }
   const cfg=JSON.parse(new TextDecoder().decode(bytes));
   if(cfg.version!==1)return false;
   return init(cfg);
  }catch(_){return false;}
 }
 const api={init,setConsent,track,isEnabled,sanitizePayload,bootstrap,
  ALLOWED_EVENTS:Object.freeze([...events]),ALLOWED_FIELDS:Object.freeze([...fields])};
 root.StockerboardAnalytics=api;
 if(doc&&typeof root.fetch==='function')bootstrap();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
