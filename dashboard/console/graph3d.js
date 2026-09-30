/* TRACE-X 3D Relationship Lab · offline perspective renderer · no CDN.
   Entity edges = inferred aggregates; UTXO edges = recorded prev_txid:vout;
   wallet sample edges = observations, NOT verified provenance. */
'use strict';
(() => {
  const accent = {entity:'#57beff',tx:'#a6a1ff',wallet:'#6ce1db',critical:'#ff6584',review:'#ff6e87',signal:'#ffc26e',focus:'#80ffc5'};
  const D = {mode:'entities',scope:'global',depth:3,focus:'',selected:'',target:'',labels:true,motion:true,play:false,percent:100,minimum:0,showRisk:false,visible:[],all:[],edges:[],path:[],mouse:null,hover:'',cam:{yaw:-0.52,pitch:.30,dist:650,panX:0,panY:0},drag:null,raf:0,last:0,frame:0,tooltip:null,canvas:null,context:null,graph:null,progress:0,projection:[],lastDataset:''};
  const safe = s => esc(String(s ?? ''));
  const hash = s => {let h=2166136261;for(const ch of String(s)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0};
  const rand = (s,k=0) => ((hash(s+'|'+k)%100000)/100000);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const date = x => {const a=Date.parse(String(x||''));return Number.isFinite(a)?a:null};
  const short3 = s => short(String(s||''),24);
  const count=(x)=>Number(x||0).toLocaleString('en-US');
  const score=id => {const a=alert(id);return a?Number(a.composite_score)||0:null};
  const hasId=(nodes,id)=>nodes.find(n=>n.id===id);
  const panelLabel = (a,b) => `<div class="t3-kv"><span>${safe(a)}</span><b>${safe(b)}</b></div>`;
  const allDatasetEdges=()=>Array.isArray(state.data?.money_graph?.edges)?state.data.money_graph.edges:[];
  function makeData(){
    const nodes=new Map(), edges=[], mtx=new Map(M().map(t=>[t.txid,t])), p=v6Provenance;
    const add=(id,type,data={})=>{if(!id)return;id=String(id);if(!nodes.has(id))nodes.set(id,{id,type, ...data});else Object.assign(nodes.get(id),data)};
    if(D.mode==='entities'){
      for(const e of allDatasetEdges()){
        if(!e.from||!e.to||e.from===e.to)continue;
        const val=Number(e.total_amount)||0;
        add(e.from,'entity',{risk:score(e.from)});add(e.to,'entity',{risk:score(e.to)});
        edges.push({from:e.from,to:e.to,amount:val,n:e.tx_count||1,txid:e.sample_txid||'',time:date(mtx.get(e.sample_txid)?.timestamp),kind:'INFERRED AGGREGATE'});
      }
      // Include ranked entities with no observed aggregate edges as isolated candidates.
      for(const a of A())add(a.entity_id,'entity',{risk:Number(a.composite_score)});
    } else if (D.mode==='wallets'){
      const found=alert(state.entity)||A()[0];
      if(found){
        for(const e of (found.graph?.tx_edges||[]).slice(0,200)){
          if(!e.source||!e.target||!e.txid)continue;
          add(e.source,'wallet',{risk:null});add(e.target,'wallet',{risk:null});add(e.txid,'tx',{risk:null});
          const t=date(e.timestamp);edges.push({from:e.source,to:e.txid,amount:Number(e.amount),txid:e.txid,time:t,kind:'SAMPLED INPUT OBSERVATION'});
          edges.push({from:e.txid,to:e.target,amount:Number(e.amount),txid:e.txid,time:t,kind:'SAMPLED OUTPUT OBSERVATION'});
        }
      }
    } else if(D.mode==='utxo'){
      if(p){
        const warns=new Set((p.warnings||[]).map(x=>x.txid));
        const patterns=new Set((p.pattern_indicators||[]).flatMap(x=>x.txids||[]));
        for(const t of (p.transactions||[]))add(t.txid,'tx',{risk:null,time:date(t.timestamp),review:warns.has(t.txid),signal:patterns.has(t.txid),details:t});
        for(const e of (p.utxo_edges||[])){
          if(!e.from_txid||!e.to_txid)continue;
          add(e.from_txid,'tx');add(e.to_txid,'tx');
          edges.push({from:e.from_txid,to:e.to_txid,amount:Number(e.amount),txid:e.to_txid,time:nodes.get(e.to_txid)?.time??null,vout:e.spent_vout,kind:'EXPLICIT OUTPOINT REFERENCE'});
        }
      }
    }
    D.all=[...nodes.values()];D.edges=edges;
    const ids=new Set(D.all.map(n=>n.id));
    if(!ids.has(D.focus)) D.focus=(D.mode==='wallets' ? state.entity : D.mode==='utxo' ? (p?.transactions?.find(t=>t.linked_inputs>0)?.txid||D.all[0]?.id) : (ids.has(state.entity)?state.entity:A()[0]?.entity_id))||D.all[0]?.id||'';
    if(D.mode==='wallets'&&!ids.has(D.focus))D.focus=D.all.find(n=>n.type==='tx')?.id||D.all[0]?.id||'';
    if(!ids.has(D.selected))D.selected=D.focus;
  }
  function subgraph(){
    const full=D.edges,by=new Map(),hop=new Map(),origin=D.focus;
    for(const e of full){if(!by.has(e.from))by.set(e.from,[]);if(!by.has(e.to))by.set(e.to,[]);by.get(e.from).push(e.to);by.get(e.to).push(e.from)}
    if(origin){hop.set(origin,0);const queue=[origin];for(let i=0;i<queue.length;i++){const a=queue[i],depth=hop.get(a);if(depth>=D.depth)continue;for(const b of by.get(a)||[]){if(!hop.has(b)){hop.set(b,depth+1);queue.push(b)}}}}
    const global=D.scope==='global';
    let edges=full.filter(e=>global||hop.has(e.from)&&hop.has(e.to));
    // Bounded rendering for forensic datasets with very large clusters.
    edges.sort((a,b)=>(Number(b.amount)||0)-(Number(a.amount)||0)||String(a.txid).localeCompare(String(b.txid)));
    edges=edges.slice(0,900);
    let keep;
    if(global){
      const degree=new Map();for(const e of edges){degree.set(e.from,(degree.get(e.from)||0)+1);degree.set(e.to,(degree.get(e.to)||0)+1)}
      const ranked=D.all.slice().sort((a,b)=>Number(b.id===D.focus)-Number(a.id===D.focus)||Number(b.id===D.selected)-Number(a.id===D.selected)||(Number(b.risk)||0)-(Number(a.risk)||0)||(degree.get(b.id)||0)-(degree.get(a.id)||0)||a.id.localeCompare(b.id));
      keep=new Set(ranked.slice(0,460).map(n=>n.id));
    }else{
      const idSet=new Set(edges.flatMap(e=>[e.from,e.to]));if(origin)idSet.add(origin);
      keep=new Set(D.all.filter(n=>idSet.has(n.id)).slice(0,460).map(n=>n.id));
    }
    const nodes=D.all.filter(n=>keep.has(n.id));edges=edges.filter(e=>keep.has(e.from)&&keep.has(e.to));
    const times=edges.map(e=>e.time).filter(Number.isFinite).sort((a,b)=>a-b);
    const maxTime=times.length?times[Math.min(times.length-1,Math.floor((D.percent/100)*(times.length-1)))]:Infinity;
    const shown=edges.filter(e=>D.percent===100||(Number.isFinite(e.time)&&e.time<=maxTime));
    const show=new Set(shown.flatMap(e=>[e.from,e.to]));if(origin)show.add(origin);
    const visible=nodes.filter(n=>D.percent===100||show.has(n.id));
    return {nodes:visible,edges:shown,times,hop,budget:full.length>900,hiddenUndated:D.percent<100&&edges.some(e=>!Number.isFinite(e.time))};
  }
  function layout(g){
    const arr=g.nodes, byId=new Map(arr.map((n,i)=>[n.id,i]));
    // Stable, seeded 3-dimensional orbital rings (not a fabricated geographic position).
    for(const n of arr){
      const depth=g.hop.has(n.id)?g.hop.get(n.id):(2+Math.floor(rand(n.id,9)*2)),theta=rand(n.id,1)*6.2831853,phi=Math.acos(2*rand(n.id,2)-1);
      const radius=depth*124+(rand(n.id,3)-.5)*26;
      n.x=radius*Math.sin(phi)*Math.cos(theta);n.y=radius*Math.sin(phi)*Math.sin(theta);n.z=radius*Math.cos(phi);
      if(n.id===D.focus){n.x=n.y=n.z=0}
    }
    // Modest force relaxation for overlap reduction while preserving hop rings.
    if(arr.length<=240){
      for(let k=0;k<32;k++){
        const fx=new Float64Array(arr.length),fy=new Float64Array(arr.length),fz=new Float64Array(arr.length);
        for(let i=0;i<arr.length;i++)for(let j=i+1;j<arr.length;j++){
          const a=arr[i],b=arr[j],dx=a.x-b.x,dy=a.y-b.y,dz=a.z-b.z,d2=dx*dx+dy*dy+dz*dz+500;
          const f=1900/d2;fx[i]+=dx*f;fy[i]+=dy*f;fz[i]+=dz*f;fx[j]-=dx*f;fy[j]-=dy*f;fz[j]-=dz*f;
        }
        for(const e of g.edges){const i=byId.get(e.from),j=byId.get(e.to);if(i==null||j==null)continue;
          const a=arr[i],b=arr[j],dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,dist=Math.sqrt(dx*dx+dy*dy+dz*dz)||1;
          const f=(dist-135)*.003;fx[i]+=dx*f;fy[i]+=dy*f;fz[i]+=dz*f;fx[j]-=dx*f;fy[j]-=dy*f;fz[j]-=dz*f;
        }
        for(let i=0;i<arr.length;i++){if(arr[i].id===D.focus)continue;arr[i].x+=clamp(fx[i],-14,14);arr[i].y+=clamp(fy[i],-14,14);arr[i].z+=clamp(fz[i],-14,14)}
      }
    }
  }
  function pathfind(g,from,to){
    if(!from||!to||from===to)return [];
    const adj=new Map();for(const e of g.edges){if(!adj.has(e.from))adj.set(e.from,[]);adj.get(e.from).push(e.to)}
    const pred=new Map([[from,null]]),q=[from];for(let i=0;i<q.length;i++){if(q[i]===to)break;for(const n of adj.get(q[i])||[])if(!pred.has(n)){pred.set(n,q[i]);q.push(n)}}
    if(!pred.has(to))return [];
    const p=[];for(let x=to;x!=null;x=pred.get(x))p.unshift(x);return p;
  }
  function html(){
    const name={entities:'Inferred entity transfers',wallets:'Sampled address → TXID → address',utxo:'Explicit UTXO spend references'}[D.mode];
    return `<div class="t3-root">
       <div class="t3-head"><div><span class="t3-overline">TRACE-X / VISUAL FORENSICS / 3D</span><h1>3D Relationship Lab <span class="t3-live">● OFFLINE READY</span></h1><p>Rotate and investigate evidence-backed relationships across three dimensions. ${safe(name)}.</p></div><div class="t3-head-actions"><button id="t3-png" class="btn">↓ Export PNG</button><button id="t3-json" class="btn">↓ Export graph JSON</button></div></div>
       <div class="t3-stats"><div><small>DISPLAYED NODES</small><strong id="t3-node-count">—</strong></div><div><small>DISPLAYED LINKS</small><strong id="t3-edge-count">—</strong></div><div><small>FOCUSED ENTITY / TXID</small><strong id="t3-focus-count">—</strong></div><div><small>CONNECTION TYPE</small><strong id="t3-type-count">—</strong></div></div>
       <div class="t3-work"><section class="t3-main">
       <div class="t3-controls"><label>GRAPH LAYER<select id="t3-mode"><option value="entities" ${D.mode==='entities'?'selected':''}>Entity flows (inferred)</option><option value="wallets" ${D.mode==='wallets'?'selected':''}>Wallet transaction samples</option><option value="utxo" ${D.mode==='utxo'?'selected':''}>UTXO (explicit)</option></select></label>
       <label>VIEW<select id="t3-scope"><option value="global" ${D.scope==='global'?'selected':''}>Whole observed network</option><option value="focus" ${D.scope==='focus'?'selected':''}>Focused neighborhood</option></select></label>
       <label>HOPS<select id="t3-depth">${[1,2,3,4].map(v=>`<option value="${v}" ${D.depth===v?'selected':''}>${v} hop${v===1?'':'s'}</option>`).join('')}</select></label>
       <label class="t3-grow">FOCUS ID<input id="t3-focus" type="text" spellcheck="false" placeholder="Entity, address or TXID..." value="${safe(D.focus)}"></label><button id="t3-go" class="t3-button">Focus ↗</button></div>
       <div class="t3-viewport" id="t3-viewport"><canvas id="t3-canvas" tabindex="0" aria-label="3D transaction evidence graph. Drag to rotate, scroll to zoom, click nodes to inspect."></canvas><div class="t3-grid"></div><div class="t3-topmark">ORBITAL GRAPH EXPLORER<span id="t3-live-dataset"></span></div><div class="t3-legend"><span><i style="background:${accent.focus}"></i>Selected</span><span><i style="background:${accent.entity}"></i>Entities</span><span><i style="background:${accent.tx}"></i>Transactions</span><span><i style="background:${accent.critical}"></i>Risk / review</span></div><div class="t3-hint">DRAG TO ORBIT · SCROLL TO ZOOM · CLICK TO INSPECT · DOUBLE-CLICK TO FOCUS</div><div id="t3-tooltip" class="t3-tooltip" hidden></div></div>
       <div class="t3-bottom"><label>OBSERVED EVENT WINDOW <input id="t3-time" type="range" min="0" max="100" step="1" value="${D.percent}"></label><output id="t3-time-text">All sampled time-stamped links</output><button id="t3-play" class="t3-button" title="Replay samples in timestamp order">▶ Replay</button><button id="t3-reset" class="btn">Reset view</button></div>
       <div class="t3-caveat" id="t3-caveat"></div></section>
       <aside class="t3-side"><div class="t3-side-heading">INVESTIGATION CONTROLS</div><label class="t3-check"><input id="t3-labels" type="checkbox" ${D.labels?'checked':''}> Show identifiers</label><label class="t3-check"><input id="t3-motion" type="checkbox" ${D.motion?'checked':''}> Animate transfer direction</label><label class="t3-side-label">CAMERA</label><div class="t3-triple"><button id="t3-front" class="btn">Front</button><button id="t3-top" class="btn">Top</button><button id="t3-home" class="btn">Orbit</button></div>
       <div class="t3-section"><div class="t3-side-heading">SELECTED RECORD</div><div id="t3-inspector">Click a node to inspect recorded evidence.</div></div>
       <div class="t3-section"><div class="t3-side-heading">DIRECTED PATH FINDER</div><label class="t3-side-label">Destination ID</label><input id="t3-target" type="text" spellcheck="false" placeholder="Destination in displayed graph" value="${safe(D.target)}"><button id="t3-path" class="t3-button" style="width:100%;margin-top:9px">Find path →</button><div id="t3-path-note">Trace directed paths within the displayed graph.</div></div>
       <div class="t3-note"><b>Evidence boundary</b><p>Entity and wallet-sample lines are investigative relationships; only UTXO lines explicitly reference a recorded <code>prev_txid:vout</code>. No graph identifies an owner or proves illegal activity.</p></div></aside>
       </div></div>`;
  }
  function color(n){if(n.id===D.selected)return accent.focus;if(n.review)return accent.review;if(n.signal)return accent.signal;if(n.type==='entity'&&n.risk!=null&&n.risk>=settings.critical)return accent.critical;if(n.type==='tx')return accent.tx;if(n.type==='wallet')return accent.wallet;return accent.entity}
  function project(n,w,h){
    const {yaw,pitch,dist,panX,panY}=D.cam,cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
    const x=n.x*cy-n.z*sy,z=n.x*sy+n.z*cy,y=n.y*cp-z*sp,depth=n.y*sp+z*cp;
    const scale=clamp(dist/(dist-depth),.15,5),base=Math.min(w,h)*.00265;
    return {x:w/2+panX+x*scale*base,y:h/2+panY+y*scale*base,z:depth,s:scale,rad:clamp((n.id===D.selected?8:6.1)*Math.sqrt(scale),2.4,13.8),id:n.id,n};
  }
  function draw(){
    const c=D.canvas,ctx=D.context,g=D.graph;if(!c||!ctx||!g)return;
    const w=c.width,h=c.height,ratio=window.devicePixelRatio||1;
    ctx.clearRect(0,0,w,h);
    // Deep space vignette and subtle vanishing-point tracks.
    const bg=ctx.createRadialGradient(w*.5,h*.45,15,w*.5,h*.5,Math.max(w,h)*.78);bg.addColorStop(0,'#122b49');bg.addColorStop(.60,'#0b1c32');bg.addColorStop(1,'#040d1a');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
    ctx.save();ctx.globalAlpha=.1;ctx.strokeStyle='#67b9ec';ctx.lineWidth=.65*ratio;
    for(let i=-7;i<=7;i++){ctx.beginPath();ctx.moveTo(w/2+i*48*ratio,0);ctx.lineTo(w/2+i*110*ratio,h);ctx.stroke()}
    for(let i=0;i<13;i++){let v=Math.pow(i/12,1.4);ctx.beginPath();ctx.moveTo(0,h*.32+v*h*.65);ctx.lineTo(w,h*.32+v*h*.65);ctx.stroke()}ctx.restore();
    const pp=new Map(g.nodes.map(n=>[n.id,project(n,w,h)]));D.projection=[...pp.values()].sort((a,b)=>a.z-b.z);
    const highlighted=new Set(D.path),pathEdges=new Set(D.path.slice(1).map((v,i)=>D.path[i]+'|'+v));
    for(const e of g.edges){const a=pp.get(e.from),b=pp.get(e.to);if(!a||!b)continue;const strong=pathEdges.has(e.from+'|'+e.to),pointed=D.selected===e.from||D.selected===e.to;
      const highlightedWeak=highlighted.has(e.from)&&highlighted.has(e.to), alpha=D.path.length&&!highlightedWeak?.13:pointed?.9:.25;
      ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=strong?accent.focus:pointed?'#62d7ff':D.mode==='utxo'?'#9895ff':'#5ca8cc';ctx.lineWidth=(strong?2.5:pointed?1.8:1)*ratio;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.restore();
      const length=Math.hypot(b.x-a.x,b.y-a.y);
      if(length>16){const t=.79,xx=a.x+(b.x-a.x)*t,yy=a.y+(b.y-a.y)*t,angle=Math.atan2(b.y-a.y,b.x-a.x);
        ctx.save();ctx.translate(xx,yy);ctx.rotate(angle);ctx.globalAlpha=strong?1:pointed?.76:.45;ctx.fillStyle=strong?accent.focus:'#69cbff';ctx.beginPath();ctx.moveTo(5*ratio,0);ctx.lineTo(-3*ratio,-2.9*ratio);ctx.lineTo(-3*ratio,2.9*ratio);ctx.closePath();ctx.fill();ctx.restore()}
      if(D.motion&&length>23){const t=((D.frame*.00028+rand(e.from+e.to))%1),x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
        ctx.save();ctx.globalAlpha=pointed?.95:.47;ctx.fillStyle=strong?accent.focus:'#5cdfff';ctx.shadowBlur=11*ratio;ctx.shadowColor=ctx.fillStyle;ctx.beginPath();ctx.arc(x,y,1.9*ratio,0,Math.PI*2);ctx.fill();ctx.restore()}
    }
    for(const p of D.projection){const n=p.n,selected=n.id===D.selected,hov=n.id===D.hover,onPath=highlighted.has(n.id),base=color(n),rad=p.rad*ratio;
      ctx.save();ctx.globalAlpha=D.path.length&&!onPath?.32:1;
      const glow=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,rad*3.7);glow.addColorStop(0,base+'77');glow.addColorStop(.38,base+'22');glow.addColorStop(1,'#00000000');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(p.x,p.y,rad*3.7,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=base;ctx.shadowBlur=selected?28*ratio:hov?19*ratio:8*ratio;ctx.shadowColor=base;ctx.beginPath();ctx.arc(p.x,p.y,rad,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
      ctx.fillStyle='#0a1c31';ctx.beginPath();ctx.arc(p.x,p.y,rad*.48,0,Math.PI*2);ctx.fill();
      if(selected||hov){ctx.strokeStyle='#e8fdff';ctx.lineWidth=1.4*ratio;ctx.beginPath();ctx.arc(p.x,p.y,rad+5*ratio,0,Math.PI*2);ctx.stroke()}
      if(D.labels&&(selected||hov||n.risk>=settings.critical||D.projection.length<=70)){
        ctx.font=`${selected?'bold ':''}${(selected?12:10)*ratio}px ui-monospace, SFMono-Regular, Consolas, monospace`;
        ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=3.8*ratio;ctx.strokeStyle='#081528';ctx.strokeText(short3(n.id),p.x,p.y+rad+14*ratio);ctx.fillStyle=selected?'#ccffeb':'#cfebf7';ctx.fillText(short3(n.id),p.x,p.y+rad+14*ratio);
      }
      ctx.restore();
    }
    // Evidence stamp is part of any downloaded screenshot.
    ctx.save();ctx.font=`${10*ratio}px ui-monospace, monospace`;ctx.fillStyle='#a0b2c8';ctx.textAlign='right';ctx.fillText('TRACE-X 3D  •  '+(D.mode==='utxo'?'RECORDED OUTPOINT LINKS':D.mode==='wallets'?'SAMPLED WALLET EDGES':'INFERRED ENTITY RELATIONSHIPS')+'  •  DEMONSTRATION DATA',w-15*ratio,h-43*ratio);ctx.restore();
  }
  function pick(x,y){const rect=D.canvas.getBoundingClientRect(),ratio=D.canvas.width/Math.max(rect.width,1),px=(x-rect.left)*ratio,py=(y-rect.top)*ratio;
    for(let i=D.projection.length-1;i>=0;i--){const p=D.projection[i];if(Math.hypot(p.x-px,p.y-py)<Math.max(p.rad*ratio+7*ratio,13*ratio))return p.id}return '';
  }
  function inspector(){
    const n=hasId(D.all,D.selected),el=document.getElementById('t3-inspector');if(!el)return;
    if(!n){el.innerHTML='<p>No selected record in the current graph.</p>';return}
    const degreeIn=D.edges.filter(e=>e.to===n.id),degreeOut=D.edges.filter(e=>e.from===n.id);
    const fact=n.type==='entity'?'Inferred cluster (not an identified person)':n.type==='wallet'?'Address observed in a sampled transaction':'Transaction identifier';
    const modeEvidence=D.mode==='utxo'?'Outpoint-linked record':D.mode==='wallets'?'Sampled relationship':'Inferred entity edge';
    let details='';if(n.type==='entity')details=panelLabel('Composite relative score',n.risk==null?'Not top-ranked':n.risk.toFixed(4))+panelLabel('Severity bucket',n.risk==null?'Not ranked':thresholdTag(n.risk));
    if(n.type==='tx'&&D.mode==='utxo')details=panelLabel('Recorded status',n.details?.status||'Unknown')+panelLabel('Outpoint-linked inputs',n.details?.linked_inputs??'—')+panelLabel('Integrity review',n.review?'Review underlying record':'None in export');
    const linked=[...new Set([...degreeIn,...degreeOut].map(e=>e.txid).filter(Boolean))].slice(0,4);
    el.innerHTML=`<div class="t3-selected-name">${safe(n.id)}</div><div class="t3-pill">${safe(fact)}</div>${panelLabel('Incoming edges',count(degreeIn.length))}${panelLabel('Outgoing edges',count(degreeOut.length))}${panelLabel('Evidence',modeEvidence)}${details}
      <div class="t3-mono-evidence">${linked.length?'Supporting example TXIDs: '+linked.map(x=>`<span title="${safe(x)}">${safe(short3(x))}</span>`).join(' · '):'No TXID exported for these links.'}</div>
      <div class="t3-side-actions">${n.type==='entity'?`<button class="t3-button" id="t3-open-alert">Open investigation →</button>`:''}${n.type==='tx'?`<button class="t3-button" id="t3-open-utxo">Open UTXO lab →</button>`:''}<button class="btn" id="t3-as-focus">Set as focus</button></div>`;
    document.getElementById('t3-open-alert')?.addEventListener('click',()=>{state.entity=n.id;navigate('alerts')});
    document.getElementById('t3-open-utxo')?.addEventListener('click',()=>{v6Tx=n.id;navigate('provenance')});
    document.getElementById('t3-as-focus')?.addEventListener('click',()=>{D.focus=n.id;D.selected=n.id;D.scope='focus';document.getElementById('t3-scope').value='focus';refreshGraph()});
  }
  function renderMetrics(){const g=D.graph;if(!g)return;
    document.getElementById('t3-node-count').textContent=count(g.nodes.length)+' / '+count(D.all.length);
    document.getElementById('t3-edge-count').textContent=count(g.edges.length)+' / '+count(D.edges.length);
    document.getElementById('t3-focus-count').textContent=short3(D.focus)||'—';
    document.getElementById('t3-type-count').textContent=D.mode==='utxo'?'EXPLICIT':D.mode==='entities'?'INFERRED':'SAMPLED';
    document.getElementById('t3-live-dataset').textContent=state.data?.dataset?.filename?' · '+state.data.dataset.filename:'';
    let warnings='';
    if(D.mode==='utxo'&&!D.edges.length)warnings='This dataset has no matched prev_txid:vout inputs. TRACE-X cannot draw verified spend links from wallet names or matching amounts. Only isolated recorded TXIDs are shown.';
    else if(D.mode==='utxo')warnings='Directed edges represent matching outpoint references in the supplied records, NOT confirmed external-chain authenticity or which input funded a particular output.';
    else if(D.mode==='wallets')warnings='Only sampled wallet → transaction → wallet observations from the currently selected ranked entity. This is not verified UTXO continuity.';
    else warnings='Arrows are aggregated inferred entity relationships. Amount labels refer to aggregate exports, not a proven path followed by the same Bitcoin. Time replay uses available sample TXID times, not the entire aggregation history.';
    document.getElementById('t3-caveat').textContent=warnings;
    document.getElementById('t3-time-text').textContent=D.percent===100?'All recorded / undated links':g.times.length?`Sampled links through ${new Date(g.times[Math.min(g.times.length-1,Math.floor((D.percent/100)*(g.times.length-1)))]).toLocaleString()}`:'No available timestamps';
    const ptxt=document.getElementById('t3-path-note');if(ptxt)ptxt.innerHTML=D.path.length?`<b>Directed path (${D.path.length-1} hops):</b><br>${D.path.map(safe).join(' → ')}<br><small>${D.mode==='utxo'?'Recorded outpoint references; not a proof of coin-to-coin continuity.':'Graph reachability only; not proof of continuous coins or common ownership.'}</small>`:'Trace directed paths in the visible graph. Increase hops if no route is found.';
  }
  function refreshGraph(resetCamera=false){
    makeData();D.graph=subgraph();layout(D.graph);if(resetCamera)D.cam={yaw:-.52,pitch:.3,dist:650,panX:0,panY:0};D.path=[];inspector();renderMetrics();draw();
  }
  function resize(){if(!D.canvas)return;const box=D.canvas.getBoundingClientRect(),ratio=clamp(window.devicePixelRatio||1,1,2);D.canvas.width=Math.max(1,Math.round(box.width*ratio));D.canvas.height=Math.max(1,Math.round(box.height*ratio));draw()}
  function stop(){if(D.raf)cancelAnimationFrame(D.raf);D.raf=0;D.canvas=null;D.context=null;D.graph=null;D.play=false}
  function loop(t){if(!D.canvas||!D.canvas.isConnected){stop();return}D.frame=t;
    if(D.play){D.progress+=(t-D.last)/450;const next=clamp(Math.round(D.progress),0,100);if(next!==D.percent){D.percent=next;document.getElementById('t3-time').value=String(next);D.graph=subgraph();layout(D.graph);renderMetrics()}if(D.percent>=100){D.play=false;const b=document.getElementById('t3-play');if(b)b.textContent='▶ Replay'}}
    D.last=t;if(D.motion||D.play||D.drag)draw();D.raf=requestAnimationFrame(loop);
  }
  function events(){
    const c=D.canvas;
    const change=(id,fn,ev='change')=>document.getElementById(id)?.addEventListener(ev,fn);
    change('t3-mode',e=>{D.mode=e.target.value;D.focus='';D.selected='';D.percent=100;D.target='';refreshGraph(true);const f=document.getElementById('t3-focus');if(f)f.value=D.focus;document.getElementById('t3-time').value='100'});
    change('t3-scope',e=>{D.scope=e.target.value;refreshGraph()});
    change('t3-depth',e=>{D.depth=clamp(Number(e.target.value)||2,1,4);refreshGraph()});
    const focus=()=>{const val=document.getElementById('t3-focus').value.trim();if(hasId(D.all,val)){D.focus=val;D.selected=val;D.scope='focus';document.getElementById('t3-scope').value='focus';refreshGraph(true)}else toast('That ID is not present in the active graph layer.')};
    change('t3-go',focus,'click');change('t3-focus',e=>{if(e.key==='Enter')focus()},'keydown');
    change('t3-target',e=>{D.target=e.target.value},'input');change('t3-path',()=>{D.target=document.getElementById('t3-target').value.trim();D.path=pathfind(D.graph,D.selected,D.target);renderMetrics();draw();if(!D.path.length)toast('No directed path in the displayed network (or invalid destination).')},'click');
    change('t3-time',e=>{D.percent=Number(e.target.value)||0;D.play=false;D.graph=subgraph();layout(D.graph);renderMetrics();draw()},'input');
    change('t3-play',()=>{D.play=!D.play;if(D.play&&D.percent>=100)D.percent=0;D.progress=D.percent;document.getElementById('t3-play').textContent=D.play?'Ⅱ Pause':'▶ Replay'},'click');
    change('t3-reset',()=>{D.percent=100;D.play=false;document.getElementById('t3-time').value='100';refreshGraph(true)},'click');
    change('t3-front',()=>{D.cam.yaw=0;D.cam.pitch=0;D.cam.panX=D.cam.panY=0;draw()},'click');
    change('t3-top',()=>{D.cam.pitch=-Math.PI/2+.02;D.cam.panX=D.cam.panY=0;draw()},'click');
    change('t3-home',()=>{D.cam.yaw=-.52;D.cam.pitch=.3;D.cam.dist=650;D.cam.panX=D.cam.panY=0;draw()},'click');
    change('t3-labels',e=>{D.labels=e.target.checked;draw()});change('t3-motion',e=>{D.motion=e.target.checked;draw()});
    change('t3-png',()=>{draw();try{const link=document.createElement('a');link.href=c.toDataURL('image/png');link.download='TRACE-X_3D_'+D.mode+'.png';link.click()}catch(e){toast('PNG export unavailable: '+e.message)}},'click');
    change('t3-json',()=>{const g=D.graph;const out={version:'TRACE-X 3D export 1.0',dataset:state.data?.dataset?.filename,mode:D.mode,evidence_boundary:D.mode==='utxo'?'source-record outpoint reference':D.mode==='wallets'?'sampled observations':'inferred aggregate',selected:D.selected,focus:D.focus,nodes:g.nodes.map(n=>({id:n.id,type:n.type,risk:n.risk??null,review:!!n.review,signal:!!n.signal})),edges:g.edges.map(e=>({from:e.from,to:e.to,amount:e.amount,txid:e.txid,time:e.time,kind:e.kind,vout:e.vout}))};download('tracex_3d_'+D.mode+'.json',JSON.stringify(out,null,2),'application/json')},'click');
    c.addEventListener('pointerdown',e=>{c.setPointerCapture(e.pointerId);D.drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,button:e.button,yaw:D.cam.yaw,pitch:D.cam.pitch,panX:D.cam.panX,panY:D.cam.panY}});
    c.addEventListener('pointermove',e=>{
      if(D.drag){const d=D.drag;if(e.shiftKey||d.button===2){D.cam.panX=d.panX+(e.clientX-d.startX)*(window.devicePixelRatio||1);D.cam.panY=d.panY+(e.clientY-d.startY)*(window.devicePixelRatio||1)}else{D.cam.yaw=d.yaw+(e.clientX-d.startX)*.006;D.cam.pitch=clamp(d.pitch+(e.clientY-d.startY)*.005,-1.53,1.53)}draw()}
      else{const id=pick(e.clientX,e.clientY);if(id!==D.hover){D.hover=id;c.style.cursor=id?'pointer':'grab';const tip=document.getElementById('t3-tooltip');if(tip){tip.hidden=!id;tip.textContent=id?short3(id):'';}draw()}const tip=document.getElementById('t3-tooltip');if(tip&&!tip.hidden){const r=c.getBoundingClientRect();tip.style.left=clamp(e.clientX-r.left+12,8,r.width-240)+'px';tip.style.top=clamp(e.clientY-r.top+13,8,r.height-80)+'px'}}
    });
    c.addEventListener('pointerup',e=>{const d=D.drag;D.drag=null;if(d&&Math.hypot(e.clientX-d.startX,e.clientY-d.startY)<6){const id=pick(e.clientX,e.clientY);if(id){D.selected=id;D.path=[];inspector();renderMetrics();draw()}}});
    c.addEventListener('dblclick',e=>{const id=pick(e.clientX,e.clientY);if(id){D.focus=D.selected=id;D.scope='focus';document.getElementById('t3-scope').value='focus';D.percent=100;document.getElementById('t3-time').value='100';document.getElementById('t3-focus').value=id;refreshGraph()}});
    c.addEventListener('wheel',e=>{e.preventDefault();D.cam.dist=clamp(D.cam.dist*Math.exp(e.deltaY*.0013),280,1600);draw()},{passive:false});
    c.addEventListener('contextmenu',e=>e.preventDefault());
    c.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){D.cam.yaw+=(e.key==='ArrowLeft'?-.15:.15);draw();e.preventDefault()}else if(e.key==='+'||e.key==='-'){D.cam.dist*=e.key==='+'?.85:1.15;draw();e.preventDefault()}});
    if('ResizeObserver' in window){const obs=new ResizeObserver(resize);obs.observe(document.getElementById('t3-viewport'));D.resizeObserver?.disconnect();D.resizeObserver=obs}else window.addEventListener('resize',resize,{once:true});
  }
  function mount(){stop();const root=document.getElementById('t3-canvas');if(!root)return;D.canvas=root;D.context=root.getContext('2d');if(!D.context){toast('Canvas support is required');return}
    const thisData=state.source;if(thisData!==D.lastDataset){D.mode='entities';D.focus='';D.selected='';D.percent=100;D.scope='global';D.target='';D.lastDataset=thisData}
    makeData();D.graph=subgraph();layout(D.graph);events();resize();inspector();renderMetrics();D.last=0;D.raf=requestAnimationFrame(loop);
  }
  // Add a native route to the existing console, retaining the old 2D graph.
  if(!NAV.some(n=>n[0]==='graph3d')) NAV.splice(NAV.findIndex(n=>n[0]==='graph')+1,0,['graph3d','◉','3D Relationship Lab']);
  window.traceX3DPage=html;
  window.traceX3DMount=mount;
  window.traceX3DStop=stop;
})();
