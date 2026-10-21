(function () {
 'use strict';
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
 window.StockerboardShell={updateNavigation,sectionForLocation};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
