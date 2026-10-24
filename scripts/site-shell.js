(function () {
 'use strict';
 function publicationState(contract, now = new Date()) {
  if (!contract || contract.version !== 1) return {status:'unverified'};
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  const day=`${p.year}-${p.month}-${p.day}`;
  if(!contract.years?.includes(Number(p.year)) || contract.unverifiedDates?.includes(day))return {status:'unverified'};
  let cursor=new Date(day+'T00:00:00Z');
  const trading=d=>![0,6].includes(d.getUTCDay()) && !contract.holidays.includes(d.toISOString().slice(0,10));
  if(`${p.hour}:${p.minute}`<contract.cutoff || !trading(cursor))cursor.setUTCDate(cursor.getUTCDate()-1);
  while(!trading(cursor))cursor.setUTCDate(cursor.getUTCDate()-1);
  const expected=cursor.toISOString().slice(0,10);
  if(!contract.years.includes(cursor.getUTCFullYear()) || contract.unverifiedDates?.some(d=>d<=day && d>=expected))return {status:'unverified'};
  return {status:contract.session===expected?'current':contract.session<expected?'delayed':'unverified',expected};
 }
 function updateDatedContent() {
  const contract=document.getElementById('publicationHealth');
  if(contract){
   let state;let data;
   try{data=JSON.parse(contract.textContent);state=publicationState(data);}catch(_){state={status:'unverified'};}
   let banner=document.getElementById('publicationStatus');
   if(!banner){banner=document.createElement('div');banner.id='publicationStatus';banner.setAttribute('role','status');banner.style.cssText='padding:12px 24px;background:#17212b;color:#f1f5f9;border-bottom:1px solid #b08b42;font-size:14px';document.body.prepend(banner);}
   banner.textContent=state.status==='current'?`EOD market snapshot: ${data.session}. Individual quotes and financial reporting dates may differ.`:state.status==='delayed'?`Data delayed — market snapshot ${data.session}; expected session ${state.expected}. Prices and screens are historical.`:'Market freshness unverified — check the displayed quote dates before using these figures.';
  }
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const table=document.getElementById('actionsTable');
  if(table){
   let count=0;
   table.querySelectorAll('tbody tr').forEach(row=>{const date=row.cells[3]?.textContent.trim();const valid=/^\d{4}-\d{2}-\d{2}$/.test(date||'')&&date>=today;row.hidden=!valid;if(valid)count++;});
   let note=document.getElementById('actionsCoverageNotice');
   if(!note){note=document.createElement('p');note.id='actionsCoverageNotice';table.before(note);}
   note.textContent=`${count} upcoming equity events in this publication. Source coverage may be delayed.`;
  }
 }
 function sectionForLocation(path,search) {
  if (path.startsWith('/stocks/')) return 'stocks';
  if (path.startsWith('/learn/')) return 'learn';
  if(path==='/'||path==='/index.html')return new URLSearchParams(search).get('mode')==='pro'?'pro':'home';
  return null;
 }
 function updateNavigation() {
  const selected = sectionForLocation(location.pathname,location.search);
  document.querySelectorAll('[data-nav-section]').forEach(link=>{
   if(link.dataset.navSection===selected) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
  });
 }
 function syncRoute() {
  if((location.pathname==='/'||location.pathname==='/index.html')&&!location.hash.startsWith('#stock/')&&typeof switchUserMode==='function'){
   const pro=new URLSearchParams(location.search).get('mode')==='pro';
   if(document.body.classList.contains('screen-fresher')===pro) switchUserMode(pro?'intermediate':'fresher');
  }
  updateNavigation();
 }
 function syncTheme() {
  const dark=document.documentElement.dataset.theme==='dark';
  document.querySelectorAll('[data-site-theme]').forEach(button=>{
   button.setAttribute('aria-label',dark?'Switch to light theme':'Switch to dark theme');
   button.querySelector('[data-site-theme-icon]').textContent=dark?'☀':'◐';
   button.querySelector('[data-site-theme-text]').textContent=dark?'Light':'Dark';
  });
 }
 function init() {
  updateNavigation();syncTheme();
  updateDatedContent();
  setInterval(updateDatedContent,60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateDatedContent();});
  document.querySelectorAll('[data-site-theme]').forEach(button=>button.addEventListener('click',()=>{
   const next=document.documentElement.dataset.theme==='dark'?'light':'dark';
   document.documentElement.dataset.theme=next;
   try{localStorage.setItem('stockerboard_theme',next);}catch(_){}
   syncTheme();
  }));
  new MutationObserver(syncTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  window.addEventListener('popstate',syncRoute);
  window.addEventListener('pageshow',()=>{syncRoute();try{const theme=localStorage.getItem('stockerboard_theme');if(['light','dark'].includes(theme))document.documentElement.dataset.theme=theme;}catch(_){}syncTheme();});
  window.addEventListener('storage',event=>{if(event.key==='stockerboard_theme' && ['light','dark'].includes(event.newValue)) document.documentElement.dataset.theme=event.newValue;});
 }
 window.StockerboardShell={updateNavigation,sectionForLocation,publicationState};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
