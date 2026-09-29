/* TRACE-X v7 — local dataset manager. All requests stay on this localhost server. */
'use strict';
let v7List=[],v7Active=null,v7Job=null,v7Busy=false,v7Status='',v7Error='',v7Timer=null;
const v7When=s=>String(s||'').slice(0,19).replace('T',' ');
async function v7API(path,options){const r=await fetch(path,{cache:'no-store',...options});const data=await r.json();if(!r.ok)throw Error(data.error||`Request failed (${r.status})`);return data}
async function v7RefreshList(){try{const d=await v7API('/api/datasets');v7List=d.datasets;v7Active=d.active_id;v7Error='';if(state.route==='data')render()}catch(e){v7List=[];v7Active=null;v7Error='Local v7 API unavailable. Stop the old static HTTP server and start python3 backend/v7_server.py --port 8765.';if(state.route==='data')render()}}
function v7DataPage(){const d=state.data?.dataset,active=v7List.find(x=>x.id===v7Active);
 return head('Data Intelligence','Import blockchain transaction evidence, process it completely offline, and activate a dataset-specific investigation.')+
 `<div class="v7-grid"><section class="panel"><div class="panel-head"><h2>Import Bitcoin dataset</h2><span class="badge medium">CSV · JSON · XML</span></div>
 <p class="panel-note">Required: txid, timestamp, input_addresses, output_addresses, output_amounts. Optional: input_amounts, fee, src/dst IP and port, ASN and country, prev_txids and prev_vouts. JSON may use explicit input/output arrays. Up to 30 MB / 100,000 transactions.</p>
 <label class="field" for="v7File">Select local file<input type="file" id="v7File" accept=".csv,.json,.xml,text/csv,application/json,application/xml" class="input" ${v7Busy?'disabled':''}></label>
 <div class="actions section-gap"><button class="btn btn-primary" type="button" data-action="v7-upload" ${v7Busy?'disabled':''}>⬆ Upload & analyze</button><button class="btn" type="button" data-action="v7-refresh">↻ Refresh history</button></div>
 ${v7Busy?`<div class="v7-progress"><b>Processing: ${esc(v7Job?.stage||'Uploading file...')}</b><div class="v7-pulse"></div><p>Do not close this tab during upload. Once accepted, processing continues locally even if you navigate away.</p></div>`:''}
 ${v7Status?`<div class="v6-callout">${esc(v7Status)}</div>`:''}
 ${v7Error?`<div class="v6-callout warning">${esc(v7Error)}</div>`:''}
 </section><section class="panel"><h2>Active investigation</h2>
 ${active?`${detailKV('Filename',esc(active.filename))}${detailKV('Dataset ID',`<span class="mono">${esc(active.id)}</span>`)}${detailKV('Transactions',num(active.transaction_count))}${detailKV('Wallets',num(active.wallet_count))}${detailKV('Entity clusters',num(active.cluster_count))}${detailKV('Ranked alerts',num(active.alert_count))}${detailKV('Network fields',active.network_available?'Observed in input':'Unavailable')}${detailKV('Explicit UTXO links',num(active.utxo_links))}${detailKV('ML status',esc(active.model?.mode||'Unknown'))}${detailKV('File SHA-256',`<span class="mono">${esc(active.sha256)}</span>`)}`:'<p>No uploaded dataset is active; the other pages show the bundled synthetic demonstration until an import succeeds.</p>'}
 <p class="panel-note">Active views are isolated by dataset ID. Imported file bytes remain in the local data/v7_datasets folder. Previous case snapshots stay associated with their original dataset.</p>
 ${active?'<button class="btn btn-primary" data-action="nav" data-id="dashboard">Open active dashboard →</button>':''}</section></div>
 <section class="panel section-gap"><div class="panel-head"><h2>Dataset history</h2><span class="badge medium">${num(v7List.length)} dataset(s)</span></div>
 <div class="table-scroll"><table><thead><tr><th>Dataset</th><th>Transactions</th><th>Uploaded</th><th>Status</th><th>Action</th></tr></thead><tbody>${v7List.map(x=>`<tr><td><b>${esc(x.filename)}</b><br><span class="small mono">${esc(x.id)}</span></td><td>${x.transaction_count==null?'—':num(x.transaction_count)}</td><td>${esc(v7When(x.created_at))}</td><td>${esc(x.status)}${x.error?`<p class="panel-note">${esc(x.error)}</p>`:''}</td><td>${x.id===v7Active?tag('ACTIVE'):x.status==='ready'?`<button class="btn btn-small" data-action="v7-activate" data-id="${attr(x.id)}">Activate →</button>`:'—'}</td></tr>`).join('')}</tbody></table>${v7List.length?'':empty('No imported datasets yet.')}</div></section>
 <div class="note section-gap">Offline evidence integrity: SHA-256 identifies the imported bytes but does not authenticate their origin. Scores use an in-sample unlabeled ML reference, not a validated benign baseline. P2P IP observations do not establish the originator. Wallet graph edges remain inferred until explicit outpoints are supplied.</div>`;
}
async function v7Upload(){
 if(v7Busy)return;
 const file=$('v7File')?.files?.[0];if(!file){toast('Select a CSV, JSON, or XML file first');return}
 if(file.size>30*1024*1024){v7Error='File exceeds the 30 MB limit';render();return}
 v7Busy=true;v7Error='';v7Status='Uploading '+file.name+' to the local server…';render();
 try{const job=await v7API('/api/upload',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(file.name)},body:file});
  v7Job=job;v7Status='Import accepted as '+job.id+'; analyzing locally.';await v7RefreshList();v7Poll(job.id);
 }catch(e){v7Busy=false;v7Error=e.message;v7Status='Previous active dataset remains unchanged.';render()}
}
function v7Poll(id){if(v7Timer)clearInterval(v7Timer);let asking=false;v7Timer=setInterval(async()=>{
 if(asking)return;asking=true;
 try{const status=await v7API('/api/jobs/'+encodeURIComponent(id));v7Job=status;
 if(status.status==='ready'||status.status==='failed'){
  clearInterval(v7Timer);v7Timer=null;v7Busy=false;await v7RefreshList();
  if(status.status==='ready'){
   v7Status='Analysis complete — imported dataset is now active.';v7Error='';await loadData(true);
  }else{v7Status='Previous active dataset remains unchanged.';v7Error=status.error||'Import failed; check source format.';render()}
 }else if(state.route==='data')render();
 }catch(e){v7Error=e.message;if(state.route==='data')render()}
 finally{asking=false}
 },1200)}
async function v7Activate(id){try{await v7API('/api/activate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
 v7Status='Activated '+id;v7Error='';await v7RefreshList();await loadData(true)
 }catch(e){v7Error=e.message;render()}}
function v7Action(action,id){switch(action){
 case 'v7-upload':void v7Upload();return true;
 case 'v7-refresh':void v7RefreshList();return true;
 case 'v7-activate':void v7Activate(id);return true;
 default:return false;
}}
document.addEventListener('click',e=>{const btn=e.target.closest('[data-action="nav"]');if(btn?.dataset.id==='data')void v7RefreshList()});
// v6-ready fired before v7 is loaded; v7-ready is the single startup event.
document.dispatchEvent(new Event('tracex-v7-ready'));
void v7RefreshList();
