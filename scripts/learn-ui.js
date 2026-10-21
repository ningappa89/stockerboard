(function(){
 'use strict';
 function init(){
  const search=document.getElementById('learnSearch');
  if(search){
   const cards=[...document.querySelectorAll('.chain-step,.secondary-card')];
   let category='all';
   function filter(){
    const query=search.value.trim().toLowerCase().replace(/[^a-z0-9]+/g,'');let count=0;
    cards.forEach(card=>{
     const cardCategory=card.classList.contains('chain-step')?'foundations':card.getAttribute('href').includes('52-week')?'price':'business';
     const text=card.textContent.toLowerCase().replace(/[^a-z0-9]+/g,'');
     const acronymRoutes={pe:'pe-ratio',roe:'roe',eps:'eps'};
     const matches=acronymRoutes[query]?card.getAttribute('href').includes('/'+acronymRoutes[query]+'/'):text.includes(query);
     card.hidden=!(category==='all'||category===cardCategory)||!matches;
     if(!card.hidden)count++;
    });
    document.querySelectorAll('#foundationsSection,.secondary-section').forEach(section=>section.hidden=![...section.querySelectorAll('.chain-step,.secondary-card')].some(card=>!card.hidden));
    document.getElementById('learnSearchStatus').textContent=`${count} of ${cards.length} lessons shown`;
    document.getElementById('learnNoResults').hidden=count!==0;
   }
   search.addEventListener('input',filter);
   document.querySelectorAll('[data-learn-filter]').forEach(button=>button.addEventListener('click',()=>{
    category=button.dataset.learnFilter;
    document.querySelectorAll('[data-learn-filter]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn===button)));filter();
   }));
   document.querySelector('a[href="#foundationsSection"]')?.addEventListener('click',()=>{
    search.value='';document.querySelector('[data-learn-filter="foundations"]').click();
   });
   filter();
  }
  document.querySelectorAll('.depth-btn').forEach(button=>button.setAttribute('aria-pressed',String(button.classList.contains('active'))));
  const depths={btnDepthSimple:'sectionIntuition',btnDepthDeeper:'sectionFormula',btnDepthAdvanced:'sectionAdvanced'};
  for(const [id,section]of Object.entries(depths)){
   const button=document.getElementById(id);if(!button)continue;
   button.setAttribute('aria-controls',section);button.addEventListener('click',()=>{
    document.querySelectorAll('.depth-btn').forEach(btn=>btn.setAttribute('aria-pressed',String(btn===button)));
   });
  }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
