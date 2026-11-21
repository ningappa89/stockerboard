/* Five dated StockMe scans. This view renders evidence; it never detects patterns. */
(() => {
    'use strict';
    const config = document.getElementById('patterns-release');
    if (!config) return;
    const names = {'cup-with-handle':'Cup with Handle', 'flat-base':'Flat Base', 'double-bottom':'Double Bottom (W)', 'ascending-triangle':'Ascending Triangle', vcp:'Volatility Contraction (VCP)'};
    const states = {FORMING:'Forming', READY:'Base ready', NEAR_PIVOT:'Near pivot', EARLY_ENTRY:'Early level crossed', BREAKOUT_PRICE_ONLY:'Price-only breakout', BREAKOUT_CONFIRMED:'Volume-confirmed breakout', HISTORICAL_BREAKOUT:'Historical breakout', INVALIDATED:'Invalidated', EXPIRED:'Expired'};
    const closed = new Set(['INVALIDATED','EXPIRED']);
    const current = row => row.state !== 'HISTORICAL_BREAKOUT' && !closed.has(row.state);
    const num = new Intl.NumberFormat('en-IN', {maximumFractionDigits:2});
    const money = n => '₹'+num.format(n);
    const dateFormat = new Intl.DateTimeFormat('en-IN', {dateStyle:'medium', timeZone:'UTC'});
    const dayLabel = day => dateFormat.format(new Date(day+'T00:00:00Z'));
    const goodDate = day => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0,10) === day;
    const finite = value => typeof value === 'number' && Number.isFinite(value);
    const views = new Map();
    let indexRequest;

    function node(tag, text, className) {
        const el = document.createElement(tag);
        if (text != null) el.textContent = text;
        if (className) el.className = className;
        return el;
    }
    async function checked(path, digest) {
        if (!/^[a-f0-9]{64}$/.test(digest || '')) throw new Error('Missing release checksum');
        const response = await fetch('/'+path, {cache:'no-cache'});
        if (!response.ok) throw new Error('Research data unavailable');
        const bytes = await response.arrayBuffer();
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)), n=>n.toString(16).padStart(2,'0')).join('');
        if (hash !== digest) throw new Error('Research checksum mismatch');
        return JSON.parse(new TextDecoder().decode(bytes));
    }
    function releaseIndex() {
        if (!indexRequest) indexRequest = checked('pro-research/patterns/index.json', config.dataset.indexSha256).then(data => {
            if (data.contract !== 'STOCKME_PATTERNS_RESEARCH_V1' || data.session !== config.dataset.session || data.research_stage !== 'PREVIEW') throw new Error('Wrong pattern release');
            return data;
        }).catch(error => { indexRequest = null; throw error; });
        return indexRequest;
    }
    function validRow(row, slug, session) {
        return row && row.family === slug && row.session === session && row.quality_status === 'CERTIFIED'
            && /^[a-f0-9]{24}$/.test(row.id) && /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(row.isin)
            && typeof row.symbol === 'string' && typeof row.name === 'string' && Object.hasOwn(states,row.state)
            && [row.close,row.pivot,row.floor].every(n=>finite(n)&&n>0) && row.floor<row.pivot
            && finite(row.distance_pct) && goodDate(row.formation_start) && goodDate(row.formation_end)
            && row.formation_start<=row.formation_end && row.formation_end<=session
            && (row.breakout_date==null || goodDate(row.breakout_date)&&row.breakout_date<=session)
            && (row.breakout_volume_multiple==null || finite(row.breakout_volume_multiple)&&row.breakout_volume_multiple>=0)
            && row.data_eligible===true && finite(row.volume_threshold) && row.volume_threshold>0
            && (!['BREAKOUT_PRICE_ONLY','BREAKOUT_CONFIRMED'].includes(row.state)||row.breakout_date===session)
            && (row.state!=='HISTORICAL_BREAKOUT'||goodDate(row.breakout_date)&&row.breakout_date<session);
    }
    function statusBadge(row) { return node('span',states[row.state],'pattern-state pattern-state-'+row.state.toLowerCase()); }

    function makeView(slug) {
        const panel = document.querySelector(`[data-pattern-family="${slug}"] .pattern-panel`);
        const view = {slug,panel,request:null,release:null,selected:null,chart:null,point:null,selection:0};
        panel.innerHTML = `<header class="pattern-heading"><div><p class="pattern-eyebrow">Pro research · Patterns</p><h2></h2></div><p class="pattern-date"></p></header>
            <p class="pattern-preview"><strong>Research preview</strong> Recognition review is in progress. Pattern observations are not investment recommendations.</p>
            <p class="pattern-message" role="status"></p><button type="button" class="pattern-retry" hidden>Retry verified scan</button>
            <dl class="pattern-counts" hidden></dl>
            <details class="pattern-coverage" hidden><summary>Scan coverage and exclusions</summary><div class="pattern-coverage-body"></div></details>
            <form class="pattern-controls" hidden><label>Company<input type="search" class="pattern-search" placeholder="Company name or symbol" autocomplete="off"></label>
            <label>Show<select class="pattern-scope"><option value="current">Current setups</option><option value="history">Historical breakouts</option><option value="closed">Invalidated or expired</option><option value="all">All evaluated records</option></select></label>
            <label>State<select class="pattern-filter"><option value="">All states</option></select></label>
            <label>Sort<select class="pattern-sort"><option value="symbol">Company A–Z</option><option value="distance">Nearest pivot</option><option value="date">Latest breakout</option></select></label></form>
            <div class="pattern-workspace" hidden><section class="pattern-evidence" tabindex="-1" aria-label="Selected pattern evidence" hidden>
            <header class="pattern-security"><div><h3></h3><p class="pattern-company"></p></div><div class="pattern-badge-slot"></div></header>
            <p class="pattern-event-date"></p><dl class="pattern-metrics"></dl>
            <p class="pattern-chart-status" role="status"></p><figure class="pattern-figure" hidden><figcaption class="pattern-legend">Adjusted OHLCV <span>Resistance pivot · Structural floor · Pattern anchors</span></figcaption>
            <p class="pattern-point"></p><canvas tabindex="0" role="img" aria-label="Adjusted candlestick and volume chart"></canvas>
            <p class="pattern-sr-only pattern-instructions">Use left and right arrows to inspect sessions. Home and End jump to the first and last session.</p><p class="pattern-sr-only pattern-announcement" aria-live="polite"></p></figure>
            <details class="pattern-method"><summary>Measurements and methodology</summary><p class="pattern-volume-rule"></p><dl class="pattern-rules"></dl><p class="pattern-lineage"></p></details>
            <a class="pattern-company-link">Open company research ↗</a></section>
            <aside class="pattern-shortlist"><h3>Evaluated companies</h3><p class="pattern-list-count" role="status"></p><ul class="pattern-list"></ul></aside></div>`;
        view.el = selector => panel.querySelector(selector);
        view.el('h2').textContent=names[slug];
        view.el('.pattern-date').textContent='Market close · '+dayLabel(config.dataset.session);
        const uid='patterns-'+slug;
        [['.pattern-search','Company'],['.pattern-scope','Show'],['.pattern-filter','State'],['.pattern-sort','Sort']].forEach(([selector,label])=>view.el(selector).setAttribute('aria-label',label));
        view.el('.pattern-point').id=uid+'-point'; view.el('.pattern-instructions').id=uid+'-instructions';
        view.el('canvas').setAttribute('aria-describedby',uid+'-point '+uid+'-instructions');
        view.el('form').addEventListener('submit',event=>event.preventDefault());
        ['.pattern-search','.pattern-scope','.pattern-filter','.pattern-sort'].forEach(selector=>view.el(selector).addEventListener(selector==='.pattern-search'?'input':'change',()=>renderList(view)));
        view.el('.pattern-retry').addEventListener('click',()=>{ view.request=null; open(slug); });
        const canvas=view.el('canvas');
        const pointAt=event=>{ if(!view.chart)return; const rect=canvas.getBoundingClientRect(); const i=Math.round((event.clientX-rect.left-46)/(rect.width-62)*(view.chart.candles.length-1)); inspect(view,Math.max(0,Math.min(view.chart.candles.length-1,i))); };
        canvas.addEventListener('pointermove',event=>{if(event.pointerType!=='touch')pointAt(event);});
        canvas.addEventListener('pointerdown',pointAt);
        canvas.addEventListener('pointerleave',()=>{ if(view.chart)inspect(view,view.chart.candles.length-1); });
        canvas.addEventListener('keydown',event=>{
            if(!view.chart || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
            event.preventDefault();const last=view.chart.candles.length-1;
            const index=event.key==='Home'?0:event.key==='End'?last:Math.max(0,Math.min(last,(view.point??last)+(event.key==='ArrowLeft'?-1:1)));
            inspect(view,index,true);
        });
        new ResizeObserver(()=>draw(view)).observe(canvas);
        new MutationObserver(()=>draw(view)).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
        views.set(slug,view);return view;
    }
    function metric(list,label,value) {const box=node('div');box.append(node('dt',label),node('dd',value));list.append(box);}
    function renderCoverage(view) {
        const d=view.release,c=d.coverage,list=view.el('.pattern-counts');list.replaceChildren();
        [['Securities scanned',c.scanned],['Current setups',c.current],['Confirmed this session',c.confirmed_today],['Historical breakouts',c.historical]].forEach(([label,value])=>metric(list,label,num.format(value)));
        list.hidden=false;
        const body=view.el('.pattern-coverage-body');body.replaceChildren(node('p',`${num.format(c.cohort)} canonical securities: ${num.format(c.scanned)} scanned; ${num.format(c.no_match)} without a matched record; ${num.format(c.excluded)} excluded. ${num.format(c.closed)} invalidated or expired records.`));
        for(const reason of Object.keys(c.exclusion_reasons||{}).sort()) {
            const details=node('details');details.append(node('summary',reason.toLowerCase().replaceAll('_',' ')+' · '+num.format(c.exclusion_reasons[reason])));
            details.append(node('p',Object.entries(d.exclusions).filter(([,r])=>r===reason).map(([symbol])=>symbol).sort().join(', ')));body.append(details);
        }
        body.append(node('p','Eligibility uses certified comparable price/volume history, a current-session bar, verified security identity and the shared liquidity floor. Excluded securities are not classified as “no pattern.”'));
        view.el('.pattern-coverage').hidden=false;
    }
    function renderList(view) {
        if(!view.release)return;
        const scope=view.el('.pattern-scope').value,state=view.el('.pattern-filter').value,search=view.el('.pattern-search').value.trim().toUpperCase(),sort=view.el('.pattern-sort').value;
        const rows=view.release.rows.filter(row=>(scope==='all'||scope==='current'&&current(row)||scope==='history'&&row.state==='HISTORICAL_BREAKOUT'||scope==='closed'&&closed.has(row.state))
            &&(!state||row.state===state)&&(!search||`${row.symbol} ${row.name}`.toUpperCase().includes(search)));
        rows.sort((a,b)=>(sort==='distance'?Math.abs(a.distance_pct)-Math.abs(b.distance_pct):sort==='date'?(b.breakout_date||'').localeCompare(a.breakout_date||''):a.symbol.localeCompare(b.symbol))||a.id.localeCompare(b.id));
        const list=view.el('.pattern-list');list.replaceChildren();view.el('.pattern-list-count').textContent=num.format(rows.length)+(rows.length===1?' company':' companies')+' in this view';
        if(!rows.length) {
            view.selection++;view.selected=view.chart=null;view.el('.pattern-evidence').hidden=true;
            list.append(node('li',scope==='current'?'No current setups match this view. Historical and closed records remain available in Show.':'No evaluated records match these filters.','pattern-empty'));return;
        }
        for(const row of rows) {
            const li=node('li'),button=node('button');button.type='button';button.dataset.patternId=row.id;
            button.setAttribute('aria-label','View '+row.symbol+' '+names[view.slug]+' chart');
            button.setAttribute('aria-pressed',String(view.selected?.id===row.id));
            button.append(node('strong',row.symbol),statusBadge(row),node('span',`${num.format(Math.abs(row.distance_pct))}% ${row.distance_pct>=0?'above':'below'} pivot`,'pattern-list-summary'));
            button.addEventListener('click',()=>select(view,row,true));li.append(button);list.append(li);
        }
        if(!rows.some(row=>row.id===view.selected?.id)) select(view,rows[0]);
    }
    async function select(view,row,focus=false) {
        const version=++view.selection;view.selected=row;view.chart=null;view.point=null;
        const evidence=view.el('.pattern-evidence');evidence.hidden=false;
        view.el('h3').textContent=row.symbol;view.el('.pattern-company').textContent=row.name;
        view.el('.pattern-badge-slot').replaceChildren(statusBadge(row));
        view.el('.pattern-event-date').textContent=row.state==='HISTORICAL_BREAKOUT'
            ? `Historical breakout · ${dayLabel(row.breakout_date)} · evaluated through ${dayLabel(row.session)}`
            : `Evaluated ${dayLabel(row.session)}${row.breakout_date?' · breakout '+dayLabel(row.breakout_date):''}`;
        const metrics=view.el('.pattern-metrics');metrics.replaceChildren();
        metric(metrics,'Close',money(row.close));metric(metrics,'Resistance pivot',money(row.pivot));metric(metrics,'Structural floor',money(row.floor));
        metric(metrics,'Base duration',num.format(row.duration_sessions)+' sessions');
        metric(metrics,'Base depth',finite(row.depth_pct)?num.format(row.depth_pct)+'%':'Unavailable');
        metric(metrics,'Breakout volume',row.breakout_volume_multiple==null?'Unavailable':num.format(row.breakout_volume_multiple)+'×');
        const extra=row.extensions||{};
        if(extra.handle_sessions!=null)metric(metrics,'Handle duration',num.format(extra.handle_sessions)+' sessions');
        if(extra.handle_depth_pct!=null)metric(metrics,'Handle depth',num.format(extra.handle_depth_pct)+'%');
        if(extra.contraction_count!=null)metric(metrics,'Contractions',num.format(extra.contraction_count));
        if(Array.isArray(extra.contraction_depths))metric(metrics,'Depth sequence',extra.contraction_depths.map(n=>num.format(n)+'%').join(' → '));
        if(extra.w_shape?.variant_type)metric(metrics,'W variant',extra.w_shape.variant_type==='STRICT_UNDERCUT'?'Strict undercut':'Higher second trough');
        if(finite(row.early_entry_level)&&row.early_entry_level>0)metric(metrics,'Early-entry level',money(row.early_entry_level));
        view.el('.pattern-volume-rule').textContent=`Engine volume confirmation: ${num.format(row.volume_threshold)}× the preceding ${row.volume_window}-session average. A historical confirmation is not counted as a new breakout today. Formation: ${dayLabel(row.formation_start)} to ${dayLabel(row.formation_end)}.`;
        const rules=view.el('.pattern-rules');rules.replaceChildren();
        for(const rule of row.rules||[]) {
            const term=node('dt',rule.label),value=node('dd');
            value.append(node('span',rule.status,'pattern-rule-status pattern-rule-'+String(rule.status).toLowerCase()));
            value.append(node('span',Object.entries(rule.measurements||{}).map(([k,v])=>k.replaceAll('_',' ')+': '+(typeof v==='number'?num.format(v):String(v))).join(' · ')));
            rules.append(term,value);
        }
        view.el('.pattern-lineage').textContent=`Verified adjusted price data · ${row.algorithm_version} · policy ${row.policy_sha256.slice(0,12)}… · independent recognition review pending.`;
        const link=view.el('.pattern-company-link');link.href='/stockerboard_company_overview.html?symbol='+encodeURIComponent(row.symbol);
        Promise.resolve(window.StockerboardCompanyRoutes?.companyUrl(row.symbol)).then(href=>{if(version===view.selection&&href)link.href=href;}).catch(()=>{});
        view.el('.pattern-figure').hidden=true;view.el('.pattern-chart-status').textContent='Loading verified chart…';
        view.el('.pattern-list').querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.patternId===row.id)));
        if(focus){evidence.focus({preventScroll:true});evidence.scrollIntoView({block:'start',behavior:'auto'});}
        try {
            if(!/^pro-research\/patterns\/releases\/[a-f0-9]{24}\/[a-f0-9]{24}\.json$/.test(row.chart_path))throw new Error('Invalid chart route');
            const chart=await checked(row.chart_path,row.chart_sha256);
            if(version!==view.selection)return;
            if(chart.id!==row.id||chart.symbol!==row.symbol||chart.isin!==row.isin||chart.family!==view.slug||chart.session!==view.release.session||chart.quality_status!=='CERTIFIED'||chart.price_basis!=='CERTIFIED_ADJUSTED_DAILY_OHLCV'||!Array.isArray(chart.candles)||chart.candles.length<2)throw new Error('Chart identity mismatch');
            if(!chart.candles.every((bar,i,all)=>goodDate(bar.time)&&bar.time<=chart.session&&(!i||bar.time>all[i-1].time)&&['open','high','low','close','volume'].every(k=>finite(bar[k]))&&bar.low>0&&bar.volume>=0&&bar.low<=Math.min(bar.open,bar.close)&&bar.high>=Math.max(bar.open,bar.close)))throw new Error('Invalid chart observations');
            if(chart.candles.at(-1).time!==chart.session)throw new Error('Chart session unavailable');
            view.chart=chart;view.el('.pattern-figure').hidden=false;view.el('.pattern-chart-status').textContent='';inspect(view,chart.candles.length-1);
        } catch(error) {if(version===view.selection)view.el('.pattern-chart-status').textContent='Verified chart unavailable for this record.';}
    }
    function inspect(view,index,announce=false) {
        if(!view.chart)return;view.point=index;const bar=view.chart.candles[index];
        const text=`${dayLabel(bar.time)} · Open ${money(bar.open)} · High ${money(bar.high)} · Low ${money(bar.low)} · Close ${money(bar.close)} · Volume ${num.format(bar.volume)}`;
        view.el('.pattern-point').textContent=text;if(announce)view.el('.pattern-announcement').textContent=text;draw(view);
    }
    function draw(view) {
        const canvas=view.el('canvas');if(!view.chart||!canvas.clientWidth)return;
        const bars=view.chart.candles,row=view.selected,w=canvas.clientWidth,h=canvas.clientHeight,scale=Math.min(devicePixelRatio||1,3);
        canvas.width=w*scale;canvas.height=h*scale;const ctx=canvas.getContext('2d');ctx.scale(scale,scale);
        const dark=document.documentElement.dataset.theme==='dark',ink=dark?'#c5d8cc':'#53685d',grid=dark?'#30483b':'#dce7e0',green=dark?'#8bdeb4':'#126849',red=dark?'#f4a2ae':'#a63850',amber=dark?'#f3c176':'#865413';
        const left=46,right=w-16,top=20,bottom=h-89,step=(right-left)/(bars.length-1),low=Math.min(row.floor,...bars.map(b=>b.low)),high=Math.max(row.pivot,...bars.map(b=>b.high)),pad=(high-low||1)*.1;
        const x=i=>left+step*i,y=price=>bottom-(price-low+pad)/(high-low+2*pad)*(bottom-top);
        const line=(points,color,dash=[])=>{ctx.strokeStyle=color;ctx.setLineDash(dash);ctx.beginPath();points.forEach(([a,b],i)=>i?ctx.lineTo(a,b):ctx.moveTo(a,b));ctx.stroke();ctx.setLineDash([]);};
        ctx.clearRect(0,0,w,h);ctx.font='10px system-ui';
        for(let i=0;i<4;i++){const price=low+(high-low)*i/3;line([[left,y(price)],[right,y(price)]],grid);ctx.fillStyle=ink;ctx.textAlign='right';ctx.fillText(num.format(price),left-6,y(price)+3);}
        const indexByDate=new Map(bars.map((b,i)=>[b.time,i]));
        if(indexByDate.has(row.formation_end)){ctx.fillStyle=dark?'#25483235':'#dceee555';ctx.fillRect(left,top,Math.max(1,x(indexByDate.get(row.formation_end))-left),bottom-top);}
        line([[left,y(row.pivot)],[right,y(row.pivot)]],amber,[5,4]);line([[left,y(row.floor)],[right,y(row.floor)]],ink,[3,4]);
        if(finite(row.early_entry_level)&&row.early_entry_level>row.floor&&row.early_entry_level<row.pivot)line([[left,y(row.early_entry_level)],[right,y(row.early_entry_level)]],green,[2,5]);
        ctx.fillStyle=amber;ctx.textAlign='left';ctx.font='10px system-ui';ctx.fillText('Pivot '+money(row.pivot),left+6,y(row.pivot)-5);
        ctx.fillStyle=ink;ctx.fillText('Floor '+money(row.floor),left+6,y(row.floor)+13);
        const width=Math.max(.6,Math.min(7,step*.65)),maxVolume=Math.max(1,...bars.map(b=>b.volume));
        bars.forEach((bar,i)=>{const color=bar.close>=bar.open?green:red;ctx.fillStyle=color;line([[x(i),y(bar.high)],[x(i),y(bar.low)]],color);ctx.fillRect(x(i)-width/2,Math.min(y(bar.open),y(bar.close)),width,Math.max(1,Math.abs(y(bar.close)-y(bar.open))));ctx.globalAlpha=.35;ctx.fillRect(x(i)-width/2,h-28-bar.volume/maxVolume*40,width,bar.volume/maxVolume*40);ctx.globalAlpha=1;});
        const anchors=Object.entries(row.anchors||{}).slice(0,12);
        const shape=anchors.filter(([,point])=>indexByDate.has(point[0])).sort((a,b)=>a[1][0].localeCompare(b[1][0]));
        if(shape.length>1){ctx.globalAlpha=.55;line(shape.map(([,point])=>[x(indexByDate.get(point[0])),y(point[1])]),green,[3,3]);ctx.globalAlpha=1;}
        for(const [label,[day,price]] of anchors){const i=indexByDate.get(day);if(i===undefined)continue;ctx.beginPath();ctx.fillStyle=green;ctx.arc(x(i),y(price),3,0,Math.PI*2);ctx.fill();if(w>600){ctx.textAlign='center';ctx.font='9px system-ui';ctx.fillText(label.replaceAll('_',' '),Math.max(left+30,Math.min(right-35,x(i))),y(price)-7);}}
        ctx.fillStyle=ink;ctx.font='9px system-ui';[0,Math.floor((bars.length-1)/2),bars.length-1].forEach((i,j)=>{ctx.textAlign=j===0?'left':j===2?'right':'center';ctx.fillText(bars[i].time.slice(2),x(i),h-8);});
        if(view.point!=null){const bar=bars[view.point];line([[x(view.point),top],[x(view.point),h-27]],ink,[2,3]);ctx.beginPath();ctx.fillStyle=green;ctx.arc(x(view.point),y(bar.close),4,0,Math.PI*2);ctx.fill();}
    }
    async function open(slug) {
        if(!Object.hasOwn(names,slug))return;
        const view=views.get(slug)||makeView(slug);if(view.request)return view.request;
        view.el('.pattern-message').textContent='Loading the verified daily scan…';view.el('.pattern-retry').hidden=true;
        view.request=(async()=>{
            try {
                const manifest=await releaseIndex(),meta=manifest.families[slug];
                if(meta?.status!=='AVAILABLE')throw new Error('Family scan unavailable');
                if(!new RegExp('^pro-research/patterns/releases/[a-f0-9]{24}/'+slug+'\\.json$').test(meta.path))throw new Error('Invalid family route');
                const release=await checked(meta.path,meta.sha256);
                if(release.contract!==manifest.contract||release.session!==manifest.session||release.family!==slug||release.quality_status!=='CERTIFIED'||release.research_stage!=='PREVIEW'||!release.rows.every(row=>validRow(row,slug,release.session)))throw new Error('Invalid family contract');
                const c=release.coverage,rows=release.rows;
                if(new Set(rows.map(r=>r.symbol)).size!==rows.length||c.current!==rows.filter(current).length||c.historical!==rows.filter(r=>r.state==='HISTORICAL_BREAKOUT').length||c.closed!==rows.filter(r=>closed.has(r.state)).length||c.confirmed_today!==rows.filter(r=>r.state==='BREAKOUT_CONFIRMED').length||c.matched!==rows.length||c.scanned+c.excluded!==c.cohort||c.no_match+c.matched!==c.scanned||JSON.stringify(c)!==JSON.stringify(meta.coverage))throw new Error('Counter reconciliation failed');
                view.release=release;renderCoverage(view);
                view.el('.pattern-message').textContent=`Verified adjusted price data through ${dayLabel(release.session)}. One representative formation per evaluated company; recognition accuracy remains under review.`;
                Object.entries(states).forEach(([key,label])=>view.el('.pattern-filter').append(new Option(label,key)));
                const symbol=new URLSearchParams(location.search).get('symbol');if(symbol)view.el('.pattern-search').value=symbol;
                view.el('.pattern-controls').hidden=false;view.el('.pattern-workspace').hidden=false;renderList(view);
            } catch(error){view.request=null;view.el('.pattern-message').textContent='Verified scan unavailable. Retry, or refresh the page if a newer market release was published. This is not a “no patterns” result.';view.el('.pattern-retry').hidden=false;}
        })();return view.request;
    }
    window.StockerboardPatterns={open};
    // Preserve the established Cup route and callers in the main application.
    window.StockerboardCup={open:()=>open('cup-with-handle')};
    async function route() {
        const slug=location.hash.replace('#tab-','');if(!Object.hasOwn(names,slug))return;
        await window.loadCanonicalUniverse?.();window.switchUserMode?.('intermediate');
        const button=document.querySelector(`[aria-controls="tab-${slug}"]`);button?.click();
        document.getElementById('tab-'+slug)?.scrollIntoView({block:'start'});
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',route);else route();
    window.addEventListener('hashchange',route);
    // Group selection can arrive via the existing switchTab helper.
    new MutationObserver(()=>{for(const slug of Object.keys(names)){if(document.getElementById('tab-'+slug)?.classList.contains('active'))open(slug);}})
        .observe(document.getElementById('intermediateTerminal')||document.body,{subtree:true,attributes:true,attributeFilter:['class']});
})();
