/* TRACE-X v8: dataset-bound, explicit-outpoint investigator graph.
   Alert context is corroborative only; no wallet relationship is converted to an outpoint.
*/
'use strict';
let v8SelectedDataset='',v8Zoom=1,v8Depth=2,v8OnlyReview=false;
function v8Format(n){return Number(n||0).toLocaleString()}
function v8Signals(p){return Array.isArray(p.pattern_indicators)?p.pattern_indicators:[]}
function v8Flagged(p){const s=new Set();for(const x of p.warnings||[])s.add(x.txid);for(const x of v8Signals(p))for(const id of x.txids||[])s.add(id);return s}
function v8Ensure(p){const key=`${v6Dataset()}|${p.source_sha256||'demo'}`;
 if(key===v8SelectedDataset)return;v8SelectedDataset=key;v8Zoom=1;v8Depth=2;v8OnlyReview=false;
 const fan=v8Signals(p).find(x=>x.type==='fan_out')?.txids?.[0];
 const count=new Map();for(const e of p.utxo_edges||[]){count.set(e.from_txid,(count.get(e.from_txid)||0)+1);count.set(e.to_txid,(count.get(e.to_txid)||0)+1)}
 v6Tx=fan||[...count].sort((a,b)=>b[1]-a[1])[0]?.[0]||p.transactions[0]?.txid||'';
}
function v8Neighbors(p,focus,depth){const edges=p.utxo_edges||[];
 let frontier=new Set([focus]),used=new Set([focus]);const levels=new Map([[focus,0]]);
 for(let d=1;d<=depth;d++){
  const next=new Set();
  for(const e of edges){if(frontier.has(e.to_txid)&&!used.has(e.from_txid)){next.add(e.from_txid);levels.set(e.from_txid,-d)}
   if(frontier.has(e.from_txid)&&!used.has(e.to_txid)){next.add(e.to_txid);levels.set(e.to_txid,d)}}
  if(!next.size)break;
  for(const n of next)used.add(n);
  frontier=next;
 }
 // Level assignment can be ambiguous in a directed DAG; only visible matching edges are drawn.
 const nodes=[...levels.entries()].sort((a,b)=>a[1]-b[1]||a[0].localeCompare(b[0])).slice(0,23);
 const ids=new Set(nodes.map(x=>x[0]));
 return {nodes,edges:edges.filter(e=>ids.has(e.from_txid)&&ids.has(e.to_txid)).slice(0,40)};
}
function v8Graph(p,focus){const {nodes,edges}=v8Neighbors(p,focus,v8Depth);
 if(!edges.length)return `<div class="v8-empty">No explicit spend links in this selected neighborhood. Unlinked inputs are not replaced by guessed connections.</div>`;
 const levels=[...new Set(nodes.map(n=>n[1]))].sort((a,b)=>a-b),columns=new Map(levels.map((v,i)=>[v,100+i*(900/Math.max(1,levels.length-1))]));
 const rows=new Map();for(const [id,level] of nodes){const group=rows.get(level)||[];group.push(id);rows.set(level,group)}
 const height=Math.max(335,...[...rows.values()].map(a=>a.length*90+70));const positions=new Map();
 for(const [level,ids] of rows){const x=columns.get(level);ids.forEach((id,i)=>positions.set(id,[x,(i+1)*height/(ids.length+1)]))}
 const issues=new Set((p.warnings||[]).map(w=>w.txid));const indicated=new Set(v8Signals(p).flatMap(s=>s.txids||[]));
 let svg=`<svg class="v8-svg" viewBox="0 0 1100 ${height}" role="img" aria-label="Explicit observed spend references near ${attr(focus)}"><defs><marker id="v8arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 7 3.5 0 7Z" fill="#7bcfff"/></marker></defs>`;
 for(const e of edges){const a=positions.get(e.from_txid),b=positions.get(e.to_txid);if(!a||!b)continue;
  const [x1,y1]=a,[x2,y2]=b;
  const start=x1<=x2?x1+69:x1-69,end=x1<=x2?x2-69:x2+69;
  const cx=(start+end)/2;
  svg+=`<path d="M${start} ${y1} C${cx} ${y1},${cx} ${y2},${end} ${y2}" fill="none" stroke="#397daf" stroke-width="1.8" marker-end="url(#v8arrow)"><title>${esc(e.from_txid)}:${e.spent_vout} → ${esc(e.to_txid)} · ${esc(e.amount)} BTC</title></path>`;
 }
 for(const [id,level] of nodes){const [x,y]=positions.get(id);const warn=issues.has(id),signal=indicated.has(id),selected=id===focus;
  const color=warn?'#ff697b':selected?'#31d8af':signal?'#ffbf63':'#69bfff';
  svg+=`<g class="v8-node" role="button" tabindex="0" data-action="v6-tx-pick" data-id="${attr(id)}" aria-label="Inspect ${attr(id)}"><title>${esc(id)}${warn?' · Integrity review':''}${signal?' · Structural signal':''}</title><rect x="${x-68}" y="${y-26}" width="136" height="52" rx="11" fill="${selected?'#12473f':'#122d46'}" stroke="${color}" stroke-width="${selected?2.8:1.6}"/><circle cx="${x-53}" cy="${y-11}" r="3.8" fill="${color}"/><text x="${x}" y="${y-1}" text-anchor="middle" fill="#e9f6ff" font-size="11" font-weight="700">${esc(short(id,19))}</text><text x="${x}" y="${y+13}" text-anchor="middle" font-size="9" fill="${color}">${warn?'REVIEW':selected?'SELECTED':signal?'PATTERN SIGNAL':'OBSERVED'}</text></g>`;
 }
 svg+='</svg>';
 return `<div class="v8-graphwrap"><div style="width:${Math.round(v8Zoom*100)}%;min-width:${Math.round(v8Zoom*760)}px">${svg}</div></div>
 <div class="v8-legend"><span>● <b style="color:#31d8af">Selected</b></span><span>● <b style="color:#69bfff">Referenced TX</b></span><span>● <b style="color:#ffbf63">Structural signal</b></span><span>● <b style="color:#ff697b">Integrity review</b></span><span>→ Observed prev_txid:vout</span></div>
 <p class="panel-note">Showing ${nodes.length} transactions / ${edges.length} visible references (max 23 nodes, 40 edges). Edges prove a recorded output reference, not that a particular input funded a particular output. Node colors identify review signals, not proven illicit activity.</p>`;
}
function v8Evidence(p,t){if(!t)return empty('Choose a transaction.');
 const txid=t.txid;const incoming=(p.utxo_edges||[]).filter(e=>e.to_txid===txid),outgoing=(p.utxo_edges||[]).filter(e=>e.from_txid===txid);
 const warnings=(p.warnings||[]).filter(w=>w.txid===txid);const signals=v8Signals(p).filter(s=>(s.txids||[]).includes(txid));
 const ml=state.data?.ml_analysis?.transactions?.find(x=>x.txid===txid);
 return `<section class="panel v8-detail"><div class="panel-head"><div><h2>Selected transaction</h2><strong class="mono v8-long">${esc(txid)}</strong></div><span class="badge ${warnings.length?'high':signals.length?'medium':'safe'}">${warnings.length?'REVIEW':signals.length?'PATTERN':'RECORDED'}</span></div>
 ${detailKV('Status',esc(t.status))}${detailKV('Linked inputs',v8Format(t.linked_inputs))}${detailKV('Outputs',v8Format(t.output_count))}${detailKV('Outgoing references',v8Format(outgoing.length))}${detailKV('Recorded output total',`${esc(t.output_total_btc)} BTC`)}${detailKV('Computed fee',t.fee_btc==null?'Unavailable / not validated':`${esc(t.fee_btc)} BTC`)}
 ${ml?detailKV('ML anomaly (relative)',Number(ml.anomaly_score||0).toFixed(4)):''}
 ${warnings.map(w=>`<div class="v8-finding warning"><b>${esc(w.type.replaceAll('_',' '))}</b><p>${esc(w.detail)}</p></div>`).join('')}
 ${signals.map(s=>`<div class="v8-finding signal"><b>${esc(s.type.replaceAll('_',' '))}</b><p>${esc(s.detail)}</p><small>${(s.txids||[]).length} related TXIDs</small></div>`).join('')}
 <h3>Incoming outpoint references</h3>${incoming.map(e=>`<button class="v8-edge" data-action="v6-tx-pick" data-id="${attr(e.from_txid)}">${esc(short(e.from_txid,24))}:${e.spent_vout} <b>${esc(e.amount)} BTC</b> ↗</button>`).join('')||'<p class="panel-note">No matched input outpoint in this import.</p>'}
 <h3>Outputs spent by other transactions</h3>${outgoing.map(e=>`<button class="v8-edge" data-action="v6-tx-pick" data-id="${attr(e.to_txid)}">vout ${e.spent_vout} → ${esc(short(e.to_txid,22))} <b>${esc(e.amount)} BTC</b></button>`).join('')||'<p class="panel-note">No later spender in this import.</p>'}
 </section>`;
}
function v8ReviewList(p){const warnings=p.warnings||[],signals=v8Signals(p);
 return `<div class="v8-reviewcols"><section class="panel"><div class="panel-head"><h2>Audit integrity findings</h2><span class="badge ${warnings.length?'high':'safe'}">${warnings.length} warnings</span></div>
 ${warnings.map(w=>`<button class="v8-findingbtn" data-action="v6-tx-pick" data-id="${attr(w.txid)}"><b>${esc(w.type.replaceAll('_',' '))}</b><small class="mono">${esc(w.txid)}</small><small>${esc(w.detail)}</small><span>Inspect evidence →</span></button>`).join('')||'<p class="panel-note">No integrity inconsistencies reported by the local audit.</p>'}</section>
 <section class="panel"><div class="panel-head"><h2>Structural review indicators</h2><span class="badge medium">${signals.length} signals</span></div>
 ${signals.map(s=>`<div class="v8-signallist"><b>${esc(s.type.replaceAll('_',' '))}</b><p>${esc(s.detail)}</p>${(s.txids||[]).slice(0,6).map(id=>`<button class="btn btn-small" data-action="v6-tx-pick" data-id="${attr(id)}">${esc(short(id,20))} ↗</button>`).join(' ')}</div>`).join('')||'<p class="panel-note">No structural indicators recorded.</p>'}</section></div>`;
}
provenancePage=function(){const p=v6Provenance;
 if(!p)return head('UTXO Provenance Lab','Verify explicit outpoint spend relationships.')+panel('No audit loaded','<p>Import a dataset through Data Intelligence and check /api/utxo. No spend links can be reconstructed from wallet names alone.</p>');
 v8Ensure(p);const s=p.summary||{},flagged=v8Flagged(p),t=p.transactions.find(x=>x.txid===v6Tx)||p.transactions[0];
 let txs=p.transactions.filter(x=>!v8OnlyReview||flagged.has(x.txid));
 txs=txs.filter(x=>!v6ProvQuery||x.txid.toLowerCase().includes(v6ProvQuery.toLowerCase())).slice(0,45);
 return head('UTXO Provenance Lab','Outpoint-linked fund tracing, integrity findings, and structural investigation.',`<button class="btn" data-action="v6-prov-json">↓ Export audit JSON</button>`)+
 `<div class="v8-banner"><b>ACTIVE SOURCE: ${esc(p.source_file||'Bundled demonstration')}</b> · ${num(s.transactions)} audited records · <span class="mono">SHA-256 ${esc(short(p.source_sha256||'unavailable',19))}</span></div>
 <div class="v8-kpis">${card('Transactions audited',num(s.transactions),'Current imported data')}${card('Explicit spend links',num(s.outpoint_links),'Matched prior outpoints')}${card('Integrity warnings',num(s.integrity_warnings),'Inspect inconsistent records')}${card('Pattern indicators',num(v8Signals(p).length),'Structural review, not crime')}${card('Missing outpoint data',num((s.inputs_without_outpoints||0)+(s.unlinked_input_refs||0)),'Cannot verify these links')}</div>
 ${p.provenance_mode==='WALLET_OBSERVATIONS_ONLY'?`<div class="v6-callout warning">This active dataset has no explicit previous-output references. Its zero spend-link count is correct. Import the separate linked demonstration CSV to explore genuine recorded outpoint links and deliberate example integrity warnings.</div>`:`<div class="v6-callout">This view uses explicit references only. Audit warnings flag inconsistent or conflicting <b>source records</b>; they do not prove a real-world double spend or unlawful activity. Pattern indicators are investigative hypotheses.</div>`}
 <div class="v8-layout"><section class="panel v8-main"><div class="panel-head"><div><h2>Interactive spend relationship graph</h2><p class="panel-note">Choose a TXID, change hop depth, or follow a reference to inspect the transaction.</p></div><div class="actions"><button class="btn btn-small" data-action="v8-minus">−</button><button class="btn btn-small" data-action="v8-plus">＋</button><button class="btn btn-small" data-action="v8-fit">Fit</button></div></div>
 <div class="v8-toolbar"><label>Depth <select class="select" id="v8Depth">${[1,2,3].map(i=>`<option value="${i}" ${v8Depth===i?'selected':''}>${i} hop${i>1?'s':''}</option>`).join('')}</select></label><label class="v8-check"><input type="checkbox" id="v8OnlyReview" ${v8OnlyReview?'checked':''}> Review only in list</label><span class="panel-note">Zoom ${Math.round(v8Zoom*100)}%</span></div>
 ${v8Graph(p,v6Tx)}</section>${v8Evidence(p,t)}</div>
 <div class="v8-txpanel panel"><div class="panel-head"><h2>Find a transaction</h2><span class="panel-note">Click any row to refocus the graph</span></div><input id="v6ProvQuery" class="input" placeholder="Filter TXID…" value="${attr(v6ProvQuery)}"><div class="v8-txgrid">${txs.map(x=>`<button class="v6-txrow ${x.txid===v6Tx?'selected':''}" data-action="v6-tx-pick" data-id="${attr(x.txid)}"><span class="mono">${esc(short(x.txid,32))}</span><small>${x.status==='REVIEW'?'⚠ INTEGRITY REVIEW':flagged.has(x.txid)?'◆ PATTERN INDICATOR':esc(x.status)} · ${num(x.linked_inputs)} linked</small></button>`).join('')||empty('No transactions match these filters.')}</div></div>
 ${v8ReviewList(p)}
 <p class="panel-note">TRACE-X v8 local demonstration. Source file hashes identify uploaded bytes, not external chain authenticity. Transactions with the same wallet may belong to unrelated persons. Scores and structural patterns are not evidence of criminal intent.</p>`;
};
const v8PrevAction=v6Action;
v6Action=function(action,id){if(['v8-minus','v8-plus','v8-fit'].includes(action)){
 v8Zoom=action==='v8-fit'?1:Math.max(.75,Math.min(1.85,Math.round((v8Zoom+(action==='v8-plus'?.15:-.15))*100)/100));render();return true;}
 return v8PrevAction(action,id);
};
document.addEventListener('change',e=>{if(e.target.id==='v8Depth'){v8Depth=Number(e.target.value);render()}
 else if(e.target.id==='v8OnlyReview'){v8OnlyReview=e.target.checked;render()}});
