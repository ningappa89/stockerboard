(function () {
    'use strict';
    function init() {
        const home = document.getElementById('fresherHome');
        if (home) {
            const hero = home.querySelector('.fresher-hero-studio');
            const browse = document.createElement('button');
            browse.className = 'research-browse';
            browse.type = 'button';
            browse.textContent = 'Browse all companies';
            browse.setAttribute('aria-controls', 'tab-screener');
            browse.setAttribute('aria-expanded', 'false');
            const reveal = () => { document.body.dataset.discovery = 'open'; browse.setAttribute('aria-expanded', 'true'); };
            browse.onclick = () => { reveal(); document.getElementById('tab-screener')?.scrollIntoView({behavior:'smooth',block:'start'}); };
            hero?.append(browse);
            home.querySelectorAll('.fresher-qs-btn').forEach(button => button.addEventListener('click', reveal));
        }
        const main = document.querySelector('main[data-research-company]');
        if (!main) return;
        const tabs = document.createElement('nav');
        tabs.className = 'research-company-tabs';
        tabs.setAttribute('role', 'tablist');
        tabs.setAttribute('aria-label', 'Company research');
        const panels = ['overview','financials','valuation'].map(name => main.querySelector('[data-research-panel="'+name+'"]'));
        if (panels.some(panel => !panel)) return;
        const buttons = panels.map((panel, i) => {
            const button = document.createElement('button');
            button.type = 'button'; button.textContent = ['Overview','Financials','Valuation'][i];
            button.id = 'research-tab-'+i;
            button.setAttribute('role','tab'); button.setAttribute('aria-controls',panel.id);
            panel.setAttribute('role','tabpanel'); panel.setAttribute('aria-labelledby',button.id);
            panel.classList.add('research-company-panel');
            button.onclick = () => activate(i);
            button.onkeydown = event => {
                const next = event.key==='ArrowRight'?(i+1)%3:event.key==='ArrowLeft'?(i+2)%3:event.key==='Home'?0:event.key==='End'?2:-1;
                if(next>=0){event.preventDefault();activate(next);buttons[next].focus();}
            };
            tabs.append(button); return button;
        });
        function activate(index) { panels.forEach((panel,i) => {panel.hidden=i!==index;buttons[i].setAttribute('aria-selected',String(i===index));buttons[i].tabIndex=i===index?0:-1;}); }
        panels[0].before(tabs); activate(0);
    }
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
