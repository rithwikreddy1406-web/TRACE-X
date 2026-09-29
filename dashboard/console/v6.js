/* TRACE-X v6: locally persisted investigation cases + explicit UTXO provenance explorer.
   This code does not infer spend links from wallet/amount metadata. */
'use strict';
let v6Provenance=null, v6ProvSource='';
let v6Tx='',v6CaseId='',v6CaseFilter='All',v6ProvQuery='';
const V6_STORAGE='tracex-v6-cases';
function v6ReadCases(){try{const x=JSON.parse(localStorage.getItem(V6_STORAGE)||'[]');return Array.isArray(x)?x:[]}catch{return []}}
let v6Cases=v6ReadCases();
function v6Persist(){try{localStorage.setItem(V6_STORAGE,JSON.stringify(v6Cases));return true}catch{toast('Cannot save cases locally. Export a case backup.');return false}}
function v6Dataset(){return state.data?.dataset?.id||`${state.source||'unknown'}|${state.data?.summary?.total_transactions||0}|${M()[0]?.txid||'none'}`}
function v6CaseSnapshot(entity){const a=alert(entity),p=profile(entity);return {
  entity_id:entity, snapshot_at:new Date().toISOString(), export_identifier:v6Dataset(),
  composite_score:a?.composite_score??null,
  factors:(a?.score_breakdown||[]).map(f=>({feature:f.feature,contribution:f.contribution,normalized_value:f.normalized_value,weight:f.weight})),
  flagged_txids:caseTxIds(a), sampled_edges:(a?.graph?.tx_edges||[]).slice(0,40).map(e=>({txid:e.txid,source:e.source,target:e.target,amount:e.amount,timestamp:e.timestamp})),
  network_observation:p?.device_ip||null, limitations:[state.data?.dataset?'Uploaded dataset: no ground-truth illicit seeds used.':'Synthetic demonstration may use labelled seeds.','Sampled wallet relationships are not UTXO-exact provenance.']
}}
function v6CreateCase(entity){if(!alert(entity)){toast('Choose a ranked entity first');return}
 const now=new Date().toISOString();const id='CASE-'+Date.now().toString(36).toUpperCase();
 v6Cases.unshift({id,entity_id:entity,status:'Open',created_at:now,updated_at:now,notes:'',evidence:v6CaseSnapshot(entity),history:[{at:now,event:'Created from ranked alert'}]});
 if(v6Persist()){v6CaseId=id;navigate('cases');toast('Case saved in this browser')}
}
function v6ChosenCase(){return v6Cases.find(c=>c.id===v6CaseId)||v6Cases[0]||null}
function v6Date(s){return esc(String(s||'').replace('T',' ').slice(0,19))}
function v6CaseCard(c){return `<button class="v6-case-card ${v6CaseId===c.id?'selected':''}" type="button" data-action="v6-case-select" data-id="${attr(c.id)}"><span class="line"><b>${esc(c.id)}</b><span class="badge ${c.status==='Escalated'?'high':c.status==='Closed'?'safe':'medium'}">${esc(c.status)}</span></span><strong class="mono">${esc(c.entity_id)}</strong><small>${esc(c.status)} · ${v6Date(c.updated_at)}</small></button>`}
function v6CaseDetail(c){if(!c)return empty('Create a case from Alerts to start an investigation.');
 const a=alert(c.entity_id),same=c.evidence?.export_identifier===v6Dataset();const snap=c.evidence||{};
 return `<section class="panel v6-case-detail"><div class="panel-head"><div><h2 class="mono">${esc(c.id)}</h2><p class="panel-note">Investigation record · ${esc(c.entity_id)}</p></div><button class="btn btn-small" data-action="v6-export-case" data-id="${attr(c.id)}">↓ Export evidence</button></div>
 <div class="v6-statgrid"><div><small>SNAPSHOT SCORE</small><strong>${snap.composite_score===null?'—':Number(snap.composite_score).toFixed(4)}</strong></div><div><small>FLAGGED TXIDS</small><strong>${snap.flagged_txids?.length||0}</strong></div><div><small>GRAPH SAMPLES</small><strong>${snap.sampled_edges?.length||0}</strong></div></div>
 ${!same?`<div class="v6-callout warning">This case was created with a different export identifier. The saved snapshot is preserved, but live alert links may refer to other data.</div>`:''}
 <label class="field v6-field">Investigation status<select id="v6Status" class="select">${['Open','Under Review','Escalated','Closed'].map(s=>`<option value="${s}" ${c.status===s?'selected':''}>${s}</option>`).join('')}</select></label>
 <label class="field v6-field">Investigator notes<textarea id="v6Notes" class="v6-notes" placeholder="Record hypotheses, checks, and findings…">${esc(c.notes||'')}</textarea></label>
 <div class="actions"><button class="btn btn-primary" data-action="v6-case-save" data-id="${attr(c.id)}">Save changes</button><button class="btn" data-action="open-alert" data-id="${attr(c.entity_id)}" ${same&&a?'':'disabled'}>Open live alert →</button><button class="btn" data-action="v6-export-case" data-id="${attr(c.id)}">Export JSON</button></div>
 <div class="section-gap"><h3>Captured supporting TXIDs</h3>${snap.flagged_txids?.length?snap.flagged_txids.map(t=>`<div class="v6-sample mono">${esc(t)}</div>`).join(''):empty('No structural TXIDs in the original alert.')}</div>
 <div class="section-gap"><h3>Captured score factors</h3>${(snap.factors||[]).map(f=>`<div class="case-detail-row"><span>${esc(featureNames[f.feature]||f.feature)}</span><b>+${Number(f.contribution).toFixed(4)}</b></div>`).join('')||empty('No factors included in snapshot.')}</div>
 <div class="section-gap"><h3>Case history</h3>${(c.history||[]).slice().reverse().map(h=>`<p class="panel-note">${v6Date(h.at)} · ${esc(h.event)}</p>`).join('')}</div>
 <p class="panel-note">Saved in this browser’s localStorage only. Export a JSON backup; clearing site storage removes local cases. An exported SHA-256 can check file integrity but is not independent proof of evidence authenticity.</p></section>`
}
function casesPage(){const shown=v6Cases.filter(c=>v6CaseFilter==='All'||c.status===v6CaseFilter);
 return head('Case management','Store investigation notes, frozen alert evidence, and case decisions locally. Export records for backup.',`<button class="btn btn-primary" data-action="v6-case-new" data-id="${attr(state.entity)}">+ Case from current alert</button><button class="btn" data-action="v6-export-all">↓ Export all cases</button>`)+
 `<div class="v6-case-layout"><section class="panel"><div class="panel-head"><h2>Investigation queue</h2><b>${v6Cases.length} total</b></div><label class="field">Filter status<select class="select" id="v6Filter">${['All','Open','Under Review','Escalated','Closed'].map(s=>`<option ${v6CaseFilter===s?'selected':''}>${s}</option>`).join('')}</select></label><div class="v6-case-list">${shown.length?shown.map(v6CaseCard).join(''):empty('No cases under this status.')}</div></section>${v6CaseDetail(shown.find(c=>c.id===v6CaseId)||shown[0]||null)}</div>`;
}
async function v6LoadProvenance(){let result=null,origin='';let candidates=state.source.startsWith('v7:')?['/api/utxo']:['demo_utxo_evidence.json'];
 for(const f of candidates){try{const r=await fetch('./'+f+'?t='+Date.now(),{cache:'no-store'});if(!r.ok)continue;const j=await r.json();if(j.schema_version!=='6.0'||!Array.isArray(j.utxo_edges)||!Array.isArray(j.transactions))continue;result=j;origin=f;break}catch{/* show explicit unavailable state */}}
 v6Provenance=result;v6ProvSource=origin;if(v6Provenance&&!v6Provenance.transactions.some(t=>t.txid===v6Tx))v6Tx=v6Provenance.transactions.find(t=>t.linked_inputs>0)?.txid||v6Provenance.transactions[0]?.txid||'';
 if(state.route==='provenance')render();
}
function v6TxSvg(tx){const edges=v6Provenance?.utxo_edges||[];const before=edges.filter(e=>e.to_txid===tx).slice(0,5),after=edges.filter(e=>e.from_txid===tx).slice(0,5);
 if(!before.length&&!after.length)return empty('No explicit prev_txid:vout spend links involving this transaction in the imported dataset. This does not mean it has no real-world connections.');
 const h=Math.max(290,100+Math.max(before.length,after.length)*67);let svg=`<svg class="v6-spend-svg" viewBox="0 0 930 ${h}" role="img" aria-label="Explicit transaction outpoint references before and after ${attr(tx)}"><defs><marker id="v6arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#62bfff"/></marker></defs><text x="120" y="28">PREVIOUS TRANSACTION</text><text x="470" y="28">SELECTED TXID</text><text x="816" y="28">SUBSEQUENT SPENDER</text>`;
 const cy=h/2;
 const node=(id,x,y,col)=>`<g class="v6-svg-node" data-action="v6-tx-pick" data-id="${attr(id)}" role="button" tabindex="0"><rect x="${x-104}" y="${y-23}" width="208" height="46" rx="9" fill="${col}" stroke="#74bffa"/><text x="${x}" y="${y+4}" text-anchor="middle" fill="#ecf7ff" font-size="13">${esc(short(id,23))}</text></g>`;
 svg+=node(tx,470,cy,'#254e7c');
 before.forEach((e,i)=>{const y=(i+1)*h/(before.length+1);svg+=`<path d="M224 ${y} Q350 ${y} 363 ${cy}" fill="none" stroke="#62bfff" stroke-width="2" marker-end="url(#v6arrow)"/><text x="274" y="${(y+cy)/2-11}" font-size="11" fill="#d7e8f4">vout ${e.spent_vout} · ${esc(e.amount)} BTC</text>`+node(e.from_txid,120,y,'#184669')});
 after.forEach((e,i)=>{const y=(i+1)*h/(after.length+1);svg+=`<path d="M574 ${cy} Q680 ${y} 706 ${y}" fill="none" stroke="#62bfff" stroke-width="2" marker-end="url(#v6arrow)"/><text x="633" y="${(y+cy)/2-11}" font-size="11" fill="#d7e8f4">vout ${e.spent_vout} · ${esc(e.amount)} BTC</text>`+node(e.to_txid,816,y,'#184669')});
 return `<div class="v6-svg-wrap">${svg}</svg></div><p class="panel-note">Arrows show observed outpoint spends, not how one specific input funds one specific output. Maximum five relationships per side are visualized.</p>`;
}
function provenancePage(){const p=v6Provenance;
 if(!p)return head('UTXO provenance lab','Verify spend relationships using explicitly provided Bitcoin outpoints.')+panel('No provenance export loaded',`<p>The v6 audit JSON is missing. Run <code>python3 backend/utxo_audit.py --input data/raw/synthetic_transactions.csv --output dashboard/utxo_evidence.json</code> and refresh the data.</p><p>No links will be inferred from wallet addresses or BTC amounts.</p>`);
 const s=p.summary||{},t=p.transactions.find(x=>x.txid===v6Tx)||p.transactions[0];let matches=p.transactions.filter(x=>!v6ProvQuery||x.txid.toLowerCase().includes(v6ProvQuery.toLowerCase())).slice(0,30);
 return head('UTXO provenance lab','Independent outpoint-based evidence from locally imported transaction data.',`<button class="btn" data-action="v6-prov-json">↓ Export audit JSON</button>`)+
 `<div class="v6-provenance-kpis">${card('Transactions audited',num(s.transactions),'Source records')}${card('Explicit spend links',num(s.outpoint_links),'Matched prev_txid:vout')}${card('Inputs without outpoints',num(s.inputs_without_outpoints),'No fabricated links')}${card('Audit warnings',num(s.integrity_warnings),'Review integrity findings')}</div>
 <section class="panel"><div class="panel-head"><h2>Evidence boundary</h2><span class="badge ${p.provenance_mode==='EXPLICIT_OUTPOINTS'?'safe':'medium'}">${p.provenance_mode==='EXPLICIT_OUTPOINTS'?'EXPLICIT LINKS':'NO OUTPOINT LINKS'}</span></div>
 <p><b>Mode:</b> ${esc(p.provenance_mode)} · <b>Source file:</b> <span class="mono">${esc(p.source_file||'Unknown')}</span></p><p class="mono v6-hash">SHA-256: ${esc(p.source_sha256||'Not available')}</p>
 ${p.provenance_mode==='WALLET_OBSERVATIONS_ONLY'?`<div class="v6-callout warning">Your current synthetic dataset contains wallet input/output sets but no previous-output references. TRACE-X correctly reports <b>zero verified spend links</b>. Use the separate linked fixture to demonstrate outpoint tracing.</div>`:'<div class="v6-callout">Explicit outpoint references are present. Missing prior transactions and amount-integrity warnings remain separately reported.</div>'}
 <p class="panel-note">${(p.limitations||[]).map(esc).join(' ')}</p></section>
 <div class="v6-prov-layout"><section class="panel"><h2>Select transaction</h2><input id="v6ProvQuery" class="input" placeholder="Filter TXID…" value="${attr(v6ProvQuery)}"><div class="v6-txlist">${matches.length?matches.map(x=>`<button class="v6-txrow ${t?.txid===x.txid?'selected':''}" data-action="v6-tx-pick" data-id="${attr(x.txid)}"><span class="mono">${esc(short(x.txid,27))}</span><small>${esc(x.status)} · ${num(x.linked_inputs)} linked</small></button>`).join(''):empty('No matching TXIDs.')}</div></section><section class="panel v6-prov-main"><h2>Spend-reference investigation</h2>${t?`${detailKV('Selected TXID',`<span class="mono">${esc(t.txid)}</span>`)}${detailKV('Status',esc(t.status))}${detailKV('Linked inputs',num(t.linked_inputs))}${detailKV('Outputs',num(t.output_count))}${detailKV('Fee (only if completely resolved)',t.fee_btc===null?'Unavailable':`${esc(t.fee_btc)} BTC`)}${v6TxSvg(t.txid)}${t.issues?.length?`<div class="v6-callout warning">${t.issues.map(esc).join(' · ')}</div>`:''}`:empty('No transactions available.')}</section></div>
 ${panel('Integrity and unresolved references',`<p class="panel-note">Unresolved explicit references: ${num(s.unlinked_input_refs)}. Verified-complete transactions: ${num(s.verified_complete_transactions)}.</p>${p.warnings?.length?`<div class="table-scroll"><table><thead><tr><th>Type</th><th>TXID</th><th>Detail</th></tr></thead><tbody>${p.warnings.slice(0,70).map(w=>`<tr><td>${esc(w.type)}</td><td class="mono">${esc(w.txid)}</td><td>${esc(w.detail)}</td></tr>`).join('')}</tbody></table></div>`:empty('No integrity warnings in the imported records. Missing outpoints are counted separately.')}`)}`;
}
function v6Hex(a){return Array.from(new Uint8Array(a),b=>b.toString(16).padStart(2,'0')).join('')}
async function v6ExportCase(id){const items=id?v6Cases.filter(c=>c.id===id):v6Cases;const envelope={format:'TRACE-X v6 case export',exported_at:new Date().toISOString(),cases:items,disclaimer:'Browser-local, investigator-supplied notes and preserved synthetic evidence snapshot; not an authenticated official forensic chain of custody.'};
 const payload=JSON.stringify(envelope,null,2);
 download(id?`tracex_${id}.json`:'tracex_all_cases.json',payload,'application/json');
 if(!globalThis.crypto?.subtle){toast('Case JSON exported; SHA-256 requires a secure browser context');return}
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload));
 download(id?`tracex_${id}.sha256.txt`:'tracex_all_cases.sha256.txt',v6Hex(digest)+'  '+(id?`tracex_${id}.json`:'tracex_all_cases.json')+'\n','text/plain');toast('Exported case JSON and matching SHA-256 checksum');
}
function v6Action(action,id){switch(action){
 case 'v6-case-new':v6CreateCase(id||state.entity);return true;
 case 'v6-case-select':v6CaseId=id;render();return true;
 case 'v6-case-save':{let c=v6Cases.find(x=>x.id===id);if(!c)return true;
    const status=$('v6Status')?.value||c.status,notes=$('v6Notes')?.value||'';
    if(notes.length>50000){toast('Notes exceed 50,000 characters');return true}
    const now=new Date().toISOString();if(status!==c.status)c.history.push({at:now,event:`Status: ${c.status} → ${status}`});
    if(notes!==c.notes)c.history.push({at:now,event:'Investigator notes updated'});
    c.status=status;c.notes=notes;c.updated_at=now;v6Persist();render();toast('Case saved locally');return true}
 case 'v6-export-case':void v6ExportCase(id).catch(()=>toast('Export unavailable in this browser'));return true;
 case 'v6-export-all':void v6ExportCase(null).catch(()=>toast('Export unavailable in this browser'));return true;
 case 'v6-tx-pick':v6Tx=id;render();return true;
 case 'v6-prov-json':if(v6Provenance)download('tracex_utxo_audit.json',JSON.stringify(v6Provenance,null,2),'application/json');return true;
 default:return false}}
document.addEventListener('change',e=>{if(e.target.id==='v6Filter'){v6CaseFilter=e.target.value;render()}});
document.addEventListener('input',e=>{if(e.target.id==='v6ProvQuery'){v6ProvQuery=e.target.value;const el=e.target,pos=el.selectionStart;render();const fresh=$('v6ProvQuery');fresh?.focus();fresh?.setSelectionRange(pos,pos)}});

document.dispatchEvent(new Event('tracex-v6-ready'));
