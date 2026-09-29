/* TRACE-X Netlify public preview — switch only between precomputed synthetic exports.
   Deliberately no upload endpoint. Run the v7 Python server on Linux for actual analysis. */
'use strict';
window.TRACEX_STATIC_DATASET='utxo';
function v7DataPage(){const current=state.data?.dataset||{};const is120=window.TRACEX_STATIC_DATASET==='utxo';
return head('Data Intelligence · Public Demo','Select one of two preprocessed synthetic datasets. File upload and AI/ML inference require TRACE-X running locally in WSL.')+
 `<section class="panel"><div class="panel-head"><h2>Choose a demonstration dataset</h2><span class="badge medium">PRECOMPUTED · NO SERVER API</span></div>
 <p class="panel-note">These sample analyses were generated offline and bundled with this static website. Selecting a sample changes Dashboard, Alerts, Entities &amp; Clusters, Transaction Graph, Replay, Search, Reports, and UTXO Provenance together. These data are synthetic and do not establish criminal activity.</p>
 <div class="actions section-gap">
 <button class="btn ${is120?'btn-primary':''}" type="button" data-action="demo-switch" data-id="utxo">${is120?'✓ ':''}120 linked transactions · 112 spend links · 3 intentionally inconsistent records</button>
 <button class="btn ${!is120?'btn-primary':''}" type="button" data-action="demo-switch" data-id="legacy">${!is120?'✓ ':''}2,008 transactions · legacy wallet-only data · 0 explicit spend links</button>
 </div></section>
 <section class="panel section-gap"><div class="panel-head"><h2>Active demonstration</h2><span class="badge medium">SYNTHETIC</span></div>
 ${detailKV('Filename',esc(current.filename||'Loading'))}${detailKV('Dataset ID',esc(current.id||'—'))}
 ${detailKV('Transactions',num(state.data?.summary?.total_transactions))}
 ${detailKV('Wallet addresses',num(state.data?.summary?.total_wallets_involved))}
 ${detailKV('Entity clusters',num(state.data?.summary?.total_entities_scanned))}
 ${detailKV('Model',esc(current.model?.model||'Unavailable'))}
 ${detailKV('Data status','Precomputed, not live')}
 <p class="panel-note">The 120-transaction fixture deliberately includes inconsistent records to exercise the audit. A real CSV file cannot be analyzed on Netlify Drop with this static build.</p>
 <button class="btn btn-primary" type="button" data-action="nav" data-id="dashboard">Open dashboard →</button></section>
 <section class="panel section-gap"><h2>Using TRACE-X with your own dataset</h2>
 <p>Run <code>python backend/v7_server.py --port 8765</code> inside the complete TRACE-X project on Linux/WSL. That Python server provides dataset upload, ingestion, model inference, graph processing, and dataset history. They are intentionally not claimed as features of this public Netlify preview.</p>
 <p class="panel-note">Cases saved here use this browser's local storage; do not enter real case evidence or sensitive details into a public demo.</p></section>`;
}
function v7Action(action,id){if(action==='demo-switch'){
  if(id!=='utxo'&&id!=='legacy'){toast('Unknown sample dataset');return true;}
  if(window.TRACEX_STATIC_DATASET===id){toast('Already showing that sample');return true;}
  window.TRACEX_STATIC_DATASET=id;void loadData(true);return true;
 }return false;}
document.dispatchEvent(new Event('tracex-v7-ready'));
