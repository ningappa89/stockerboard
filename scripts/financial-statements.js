(function(root){
 'use strict';
 const families={quarterly:'Quarterly results',annual_pnl:'Annual profit & loss',ttm:'Trailing 12 months',balance_sheet:'Balance sheet',cash_flow:'Cash flow',ratios:'Ratios & valuation',banking:'Banking metrics',shareholding:'Shareholding'};
 const metricNames={ROE:'Return on equity (ROE)',ROCE:'Return on capital employed (ROCE)',P_E:'Price / earnings (P/E)',P_B:'Price / book (P/B)',CURRENT_RATIO:'Current ratio',DEBT_TO_EQUITY:'Debt to equity',MARKET_CAP:'Market capitalization',NET_WORTH:'Net worth',NET_DEBT:'Net debt',TOTAL_DEBT:'Total debt',BOOK_VALUE_PER_SHARE:'Book value per share',WORKING_CAPITAL:'Working capital'};
 function labelFor(doc,key){return doc.metric_labels?.[key]||metricNames[key]||key.toLowerCase().replaceAll('_',' ').replace(/^./,s=>s.toUpperCase());}
 function formatCell(cell){
  if(!cell||cell.status!=='AVAILABLE'||typeof cell.value!=='number')return '—';
  const unit=cell.unit.toUpperCase(),value=unit==='INR'?cell.value/10000000:cell.value;
  return value.toLocaleString('en-IN',{maximumFractionDigits:2,minimumFractionDigits:2})+(unit==='PERCENT'?'%':unit==='RATIO'||unit==='MULTIPLE'?'×':'');
 }
 function csvValue(value){let s=String(value??'');if(typeof value!=='number'&&/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
 function csvFor(doc,family,scope){
  const periods=doc.statements[family].filter(p=>p.scope===scope),keys=[...new Set(periods.flatMap(p=>Object.keys(p.metrics)))];
  const rows=[['Company',doc.symbol,'Scope',scope,'Section',families[family]],['Metric','Unit',...periods.map(p=>p.period_end+' '+p.basis)]];
  for(const key of keys)rows.push([labelFor(doc,key),periods.find(p=>p.metrics[key])?.metrics[key].unit,...periods.map(p=>p.metrics[key]?.status==='AVAILABLE'?p.metrics[key].value:p.metrics[key]?.reason||'UNAVAILABLE')]);
  return rows.map(row=>row.map(csvValue).join(',')).join('\r\n');
 }
 if(typeof module!=='undefined')module.exports={formatCell,csvFor,csvValue};
 if(typeof document==='undefined')return;
 const rowOrder=['REVENUE_FROM_OPERATIONS','INTEREST_EARNED','INTEREST_INCOME','OTHER_INCOME','TOTAL_INCOME','TOTAL_EXPENSES','INTEREST_EXPENDED','OPERATING_EXPENSES','PROVISIONS_CONTINGENCIES','OPERATING_PROFIT','PROFIT_BEFORE_TAX','TAX_EXPENSE','PROFIT_AFTER_TAX','EPS_BASIC','EPS_DILUTED','CFO','CFI','CFF','CASH_FX','CASH_NET_CHANGE','CASH_OPEN','CASH_CLOSE'];
 const indexRequests=new Map();
 function node(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
 async function getIndex(){
  if(!indexRequests.has('current'))indexRequests.set('current',fetch('/financial-statements/index.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('Financial statements are not available in this release.');return r.json();}).catch(e=>{indexRequests.delete('current');throw e;}));
  return indexRequests.get('current');
 }
 function render(host,doc){
  host.replaceChildren();const title=node('h2','','Financial statements'),intro=node('p','fs-intro','Reported financials and promoted metrics. Money in ₹ crore; EPS in ₹ per share. Each section retains its own reporting dates.');
  const controls=node('div','fs-controls'),scopeLabel=node('label','','Reporting scope '),scope=node('select');scope.setAttribute('aria-label','Financial statement reporting scope');
  const scopes=[...new Set(Object.values(doc.statements).flat().map(p=>p.scope))];
  for(const value of scopes){const option=node('option','',value==='CONSOLIDATED'?'Consolidated':'Standalone');option.value=value;scope.append(option);}scope.value=doc.default_scope||scopes[0]||'';
  if(!scopes.length){const option=node('option','','No verified reporting scope');option.value='';scope.append(option);scope.disabled=true;}
  scopeLabel.append(scope);const download=node('button','fs-download','Download CSV');download.type='button';controls.append(scopeLabel,download);
  const tabs=node('div','fs-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Financial statement sections');const panel=node('div','fs-panel');panel.setAttribute('role','tabpanel');
  let selected='quarterly';const buttons=[];const growth=node('div','fs-growth');
  function draw(){
   growth.replaceChildren();const summary=(doc.growth_summary||[]).find(p=>p.scope===scope.value);if(summary){const labels={REVENUE_YOY_PCT:'Revenue · year over year',PAT_YOY_PCT:'Profit · year over year',NET_MARGIN_PCT:'Net margin (latest quarter)'};for(const [key,label] of Object.entries(labels)){const card=node('div','fs-growth-card');card.append(node('span','',label),node('strong','',formatCell(summary.metrics[key])),node('small','',summary.period_end+' · '+scope.value.toLowerCase()));growth.append(card);}}
   panel.replaceChildren();for(const [key,button] of buttons){button.setAttribute('aria-selected',String(key===selected));button.tabIndex=key===selected?0:-1;}
   const active=buttons.find(([key])=>key===selected)[1];panel.setAttribute('aria-labelledby',active.id);
   const allPeriods=(doc.statements[selected]||[]).filter(p=>p.scope===scope.value).sort((a,b)=>b.period_end.localeCompare(a.period_end));
   const periods=allPeriods.filter(p=>Object.values(p.metrics).some(c=>c.status==='AVAILABLE'));
   if(periods.length&&periods.length<allPeriods.length)panel.append(node('p','fs-scroll-hint','Periods with no verified values are omitted. Available reporting dates are shown below.'));
   download.disabled=!periods.length;
   if(!periods.length){panel.append(node('p','fs-empty','No verified '+families[selected].toLowerCase()+' are available for this reporting scope. Missing values are not estimated.'));return;}
   if(selected==='cash_flow'){const review=periods.filter(p=>p.reconciliation?.status==='REVIEW_REQUIRED');if(review.length){const note=node('p','fs-empty','Cash-flow reconciliation needs review for '+review.map(p=>p.period_end).join(', ')+'. These are reported figures; totals have not been forced to balance.');note.setAttribute('role','status');panel.append(note);}}
   const wrap=node('div','fs-scroll');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',families[selected]+' table, scroll horizontally for more periods');
   const table=node('table','fs-table'),caption=node('caption','',`${doc.symbol} · ${scope.value.toLowerCase()} · ${families[selected]} · money in ₹ crore`);table.append(caption);
   const head=node('thead'),hr=node('tr');const corner=node('th','','Metric');corner.scope='col';hr.append(corner);
   periods.forEach(p=>{const th=node('th');th.scope='col';th.append(node('span','',p.period_end),node('small','',p.duration_kind.replaceAll('_',' ').toLowerCase()+' · '+p.basis.toLowerCase().replaceAll('_',' ')));if(p.period_start)th.title=p.period_start+' to '+p.period_end;hr.append(th);});head.append(hr);table.append(head);
   const body=node('tbody'),keys=[...new Set(periods.flatMap(p=>Object.keys(p.metrics)))].sort((a,b)=>{const rank=k=>rowOrder.includes(k)?rowOrder.indexOf(k):999;return rank(a)-rank(b)||a.localeCompare(b);});
   for(const key of keys){const tr=node('tr'),label=node('th','',labelFor(doc,key));label.scope='row';const unit=periods.find(p=>p.metrics[key])?.metrics[key].unit;label.append(node('small','',unit==='INR'?'₹ crore':unit==='INR_PER_SHARE'?'₹ / share':unit));tr.append(label);
    for(const p of periods){const cell=p.metrics[key],td=node('td','',formatCell(cell));if(!cell||cell.status!=='AVAILABLE'){td.tabIndex=0;td.setAttribute('aria-label',cell?.reason||'Not reported in this period');}td.title=cell?(cell.status==='AVAILABLE'?cell.owner:cell.reason):'Not reported in this period';tr.append(td);}body.append(tr);}
   table.append(body);wrap.append(table);panel.append(wrap,node('p','fs-scroll-hint','Scroll the table to compare earlier periods. — means unavailable or not applicable; focus a cell for its reason.'));
   const details=node('details','fs-provenance');details.append(node('summary','','Period definitions & filing evidence'));
   for(const p of periods){const line=node('p','',`${p.period_start?p.period_start+' to ':''}${p.period_end} · ${p.scope} · ${p.basis} · audit status ${p.audit_status||'not asserted'}${p.reconciliation?' · cash reconciliation: '+p.reconciliation.status.toLowerCase().replaceAll('_',' '):''}`);if(p.source_url){try{const u=new URL(p.source_url);if(u.protocol==='https:'&&!u.username&&!u.password){const a=node('a','','Open filing');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';line.append(' · ',a);}}catch{}}
    const provenance=p.artifact_sha256?'Filing SHA-256 '+p.artifact_sha256:'Metric owner and record references retained in the downloadable release payload.';line.append(node('small','',provenance));details.append(line);}panel.append(details);
  }
  const visibleFamilies=Object.entries(families).filter(([key])=>key==='shareholding'?(doc.statements[key]||[]).some(p=>Object.values(p.metrics).some(c=>c.status==='AVAILABLE')):key==='banking'?String(doc.financial_domain||'').startsWith('BANK')||(doc.statements[key]||[]).some(p=>Object.values(p.metrics).some(c=>c.status==='AVAILABLE')):true);
  visibleFamilies.forEach(([key,label],i)=>{const b=node('button','',label);b.type='button';b.id=host.id+'-fs-tab-'+i;b.setAttribute('role','tab');b.setAttribute('aria-controls',host.id+'-fs-panel');b.onclick=()=>{selected=key;draw();};b.onkeydown=e=>{let target;if(e.key==='ArrowRight')target=(i+1)%buttons.length;if(e.key==='ArrowLeft')target=(i-1+buttons.length)%buttons.length;if(e.key==='Home')target=0;if(e.key==='End')target=buttons.length-1;if(target!==undefined){e.preventDefault();buttons[target][1].click();buttons[target][1].focus();}};buttons.push([key,b]);tabs.append(b);});
  panel.id=host.id+'-fs-panel';scope.onchange=draw;download.onclick=()=>{const blob=new Blob([csvFor(doc,selected,scope.value)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=doc.symbol+'-'+selected+'-'+scope.value+'.csv';a.click();URL.revokeObjectURL(url);};
  host.append(title,intro,controls,growth,tabs,panel);draw();
 }
 async function load(host,symbol){
  const request=(host._request||0)+1;host._request=request;host.dataset.symbol=symbol;host.replaceChildren(node('p','fs-empty','Loading financial statements…'));
  try{const index=await getIndex();if(index.schema_version!=='1.0')throw Error('This financial statement format is unsupported.');const item=index.companies[symbol];if(!item)throw Error('No verified statements are available for this company.');
   if(!/^releases\/FSV1_[a-f0-9]+\/[A-Z0-9&_.-]+\.json$/.test(item.path))throw Error('Invalid statement path.');
   const response=await fetch('/financial-statements/'+item.path);if(!response.ok)throw Error('The financial statement file could not load.');const raw=await response.arrayBuffer();
   const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(x=>x.toString(16).padStart(2,'0')).join('');if(hash!==item.sha256)throw Error('Financial statement integrity check failed.');
   const doc=JSON.parse(new TextDecoder().decode(raw));if(doc.schema_version!=='1.0')throw Error('This financial statement format is unsupported.');if(doc.symbol!==symbol||doc.release_id!==index.release_id)throw Error('Financial statement identity check failed.');if(host._request!==request)return;render(host,doc);
  }catch(error){if(host._request!==request)return;host.replaceChildren(node('p','fs-empty',error.message));const retry=node('button','fs-download','Retry');retry.onclick=()=>load(host,symbol);host.append(retry);}
 }
 root.loadFinancialStatements=(symbol)=>{const host=document.getElementById('dossierFinancialStatements');if(host)load(host,symbol);};
 function init(){const initial=location.hash.match(/^#stock\/([^/]+)$/);if(initial)root.loadFinancialStatements(decodeURIComponent(initial[1]));document.querySelectorAll('[data-financial-statements]').forEach((host,i)=>{if(!host.id)host.id='companyFinancialStatements'+i;if(host.dataset.symbol)load(host,host.dataset.symbol);});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(typeof window!=='undefined'?window:globalThis);
