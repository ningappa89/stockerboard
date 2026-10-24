(function(root){
 'use strict';
 const normalize=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 function selectRows(rows,filters,featured){
  const q=normalize(filters.query);const compact=q.replace(/ /g,'');
  const selected=rows.filter(row=>{
   if(filters.scope==='featured'&&!featured[row[0]])return false;
   if(filters.sector==='__unknown'&&row[5])return false;
   if(filters.sector&&filters.sector!=='__unknown'&&row[5]!==filters.sector)return false;
   if(!q)return true;
   return [row[0],row[1],...(featured[row[0]]?.aliases||[])].some(value=>{
    const text=normalize(value);return text.includes(q)||text.replace(/ /g,'').includes(compact);
   });
  });
  const collator=new Intl.Collator('en-IN',{sensitivity:'base',numeric:true});
  selected.sort((a,b)=>{
   if(filters.sort==='price-desc'||filters.sort==='price-asc'){
    const av=Number.isFinite(a[2])?a[2]:null,bv=Number.isFinite(b[2])?b[2]:null;
    if(av===null&&bv!==null)return 1;if(bv===null&&av!==null)return -1;
    if(av!==null&&bv!==null&&av!==bv)return filters.sort==='price-desc'?bv-av:av-bv;
   }
   if(q&&filters.sort==='name'){
    const score=row=>normalize(row[0]).replace(/ /g,'')===compact?0:normalize(row[0]).startsWith(q)?1:2;
    if(score(a)!==score(b))return score(a)-score(b);
   }
   return collator.compare(a[1]||a[0],b[1]||b[0])||collator.compare(a[0],b[0]);
  });return selected;
 }
 if(typeof module!=='undefined')module.exports={selectRows,normalize};
 if(typeof document==='undefined')return;
 function init(){
  const config=JSON.parse(document.getElementById('directoryConfig').textContent);
  const featured=config.featured,search=document.getElementById('dirSearchInput'),sector=document.getElementById('dirSector'),sort=document.getElementById('dirSort');
  const browse=document.getElementById('browseList'),more=document.getElementById('dirLoadMore'),empty=document.getElementById('dirEmptyState');
  const params=new URLSearchParams(location.search);let scope=params.get('scope')==='featured'?'featured':'all';
  let rows=[],visible=[],displayed=0,logos={},ready=false;const pageSize=24;
  search.value=params.get('q')||'';sort.value=['name','price-desc','price-asc'].includes(params.get('sort'))?params.get('sort'):'name';
  function el(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
  function enhanceLogos(){
   document.querySelectorAll('.dir-company-logo[data-symbol]').forEach(wrap=>{
    if(wrap.querySelector('img'))return;const file=logos[wrap.dataset.symbol]?.file;
    if(!file||!/^[a-zA-Z0-9._-]+$/.test(file))return;
    const img=el('img');img.src='/assets/company-logos/'+encodeURIComponent(file);img.width=42;img.height=42;img.alt='';img.loading='lazy';
    img.addEventListener('error',()=>img.remove(),{once:true});wrap.append(img);
   });
  }
  function makeCard(row){
   const [symbol,name,price,,,industry,date]=row,profile=featured[symbol];
   const card=el('a','dir-card');card.dataset.symbol=symbol;card.href=profile?'/stocks/'+encodeURIComponent(profile.slug)+'/':'/#stock/'+encodeURIComponent(symbol);
   const top=el('div','dir-company-top'),logo=el('span','dir-company-logo',String(name||symbol).replace(/[^a-zA-Z0-9]/g,'').slice(0,2).toUpperCase());logo.dataset.symbol=symbol;logo.setAttribute('aria-hidden','true');
   const info=el('div','dir-info'),nameRow=el('div','dir-name-row'),title=el('span','dir-name',profile?.name||name||symbol);title.title=title.textContent;
   nameRow.append(title,el('span','dir-symbol',symbol));info.append(nameRow);top.append(logo,info);
   const sectorText=profile?.sector&&profile.sector!=='Sector unavailable'?profile.sector:industry||'Sector unavailable';
   const metrics=el('div','dir-metrics');metrics.append(el('span','dir-price-label','Last close'),el('span','dir-price',Number.isFinite(price)?'₹'+price.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}):'Price unavailable'),el('span','dir-route-note',date||'Price date unavailable'));
   const footer=el('div','dir-card-footer'),arrow=el('span','dir-arrow','↗');arrow.setAttribute('aria-hidden','true');footer.append(el('span','',profile?'Company details':'Research view'),arrow);
   card.append(top,el('div','dir-sector',sectorText),metrics,footer);return card;
  }
  function setView(view){
   const chosen=view==='compact'?'compact':'grid';document.body.dataset.directoryView=chosen;
   document.querySelectorAll('[data-directory-view-button]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.directoryViewButton===chosen)));
   syncUrl();
  }
  function syncUrl(){
   if(!ready)return;const url=new URL(location.href);
   for(const key of ['q','sector','sort','view','scope'])url.searchParams.delete(key);
   if(search.value.trim())url.searchParams.set('q',search.value.trim());if(sector.value)url.searchParams.set('sector',sector.value);
   if(sort.value!=='name')url.searchParams.set('sort',sort.value);if(scope==='featured')url.searchParams.set('scope','featured');
   if(document.body.dataset.directoryView==='compact')url.searchParams.set('view','compact');
   history.replaceState(history.state,'',url.pathname+url.search+url.hash);
  }
  function appendPage(){
   const fragment=document.createDocumentFragment();visible.slice(displayed,displayed+pageSize).forEach(row=>fragment.append(makeCard(row)));browse.append(fragment);
   displayed=Math.min(displayed+pageSize,visible.length);more.hidden=displayed>=visible.length;
   more.textContent=`Load ${Math.min(pageSize,visible.length-displayed)} more companies`;
   document.getElementById('dirResultsStatus').textContent=visible.length?`Showing 1–${displayed.toLocaleString('en-IN')} of ${visible.length.toLocaleString('en-IN')} companies`:'0 companies match these filters';
   enhanceLogos();
  }
  function filterDirectory(){
   if(!ready)return;
   visible=selectRows(rows,{query:search.value,sector:sector.value,sort:sort.value,scope},featured);browse.replaceChildren();displayed=0;
   document.getElementById('featuredSection').hidden=true;document.getElementById('browseSection').hidden=false;
   document.querySelectorAll('[data-directory-scope]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.directoryScope===scope)));
   empty.hidden=visible.length>0;document.getElementById('dirCountBadge').textContent=visible.length.toLocaleString('en-IN');
   document.getElementById('browseHeading').textContent=scope==='featured'?'Featured companies':search.value.trim()||sector.value?'Matching companies':'All companies';
   document.getElementById('browseNote').textContent=scope==='featured'?'A closer look at 20 companies, with reported financials and business context.':'Browse the complete company universe. Prices use each stock’s last available trading session.';
   document.getElementById('dirClearFilters').hidden=!search.value&&!sector.value&&sort.value==='name'&&scope==='all';appendPage();syncUrl();
  }
  search.addEventListener('input',filterDirectory);sector.addEventListener('change',filterDirectory);sort.addEventListener('change',filterDirectory);more.addEventListener('click',appendPage);
  document.querySelectorAll('[data-directory-scope]').forEach(button=>button.addEventListener('click',()=>{scope=button.dataset.directoryScope;filterDirectory();}));
  document.querySelectorAll('[data-directory-view-button]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.directoryViewButton)));
  document.getElementById('dirClearFilters').addEventListener('click',()=>{search.value='';sector.value='';sort.value='name';scope='all';filterDirectory();});
  document.getElementById('dirEmptyClear').addEventListener('click',()=>document.getElementById('dirClearFilters').click());
  setView(params.get('view'));
  fetch('/assets/company-logos/manifest.json',{cache:'no-cache'}).then(response=>response.ok?response.json():null).then(data=>{logos=data?.logos||{};enhanceLogos();}).catch(()=>{});
  fetch('/stocks/market_universe_index_v1.json',{cache:'no-cache'}).then(response=>{if(!response.ok)throw Error('Universe unavailable');return response.json();}).then(data=>{
   if(!Array.isArray(data.stocks)||data.stocks.length!==data.count||data.count!==config.count||new Set(data.stocks.map(row=>row[0])).size!==data.count)throw Error('Universe identity mismatch');
   rows=data.stocks;
   [...new Set(rows.map(row=>row[5]).filter(Boolean))].sort().forEach(name=>{const option=el('option','',name);option.value=name;sector.append(option);});
   if(rows.some(row=>!row[5])){const option=el('option','','Sector unavailable');option.value='__unknown';sector.append(option);}
   if([...sector.options].some(option=>option.value===params.get('sector')))sector.value=params.get('sector');
   ready=true;filterDirectory();
  }).catch(()=>{
   document.getElementById('browseSection').hidden=true;document.getElementById('featuredSection').hidden=false;empty.hidden=true;
   document.getElementById('dirResultsStatus').textContent='The complete list could not load. Featured company pages remain available below.';
   document.querySelectorAll('[data-directory-scope],#dirSector,#dirSort,#dirSearchInput').forEach(control=>control.disabled=true);
   document.querySelectorAll('[data-directory-scope]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.directoryScope==='featured')));
  });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(typeof window!=='undefined'?window:globalThis);
