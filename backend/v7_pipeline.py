"""TRACE-X v7 dataset-isolated ingestion, ML scoring, and UI evidence export.

Labels are deliberately not read. IPs are optional observations, never ownership.
All generated entity transfers are *inferred co-occurrences*, not UTXO provenance.
"""
from __future__ import annotations
import csv
from collections import Counter, defaultdict
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import json
import math
from pathlib import Path
import re
from statistics import median
import xml.etree.ElementTree as ET

MAX_ROWS = 100_000
REQUIRED = ('txid','timestamp','input_addresses','output_addresses','output_amounts')
NETWORK = ('src_ip','dst_ip','src_port','dst_port','geo_country','asn')


def list_field(value):
    if isinstance(value,list): return [str(v).strip() for v in value if str(v).strip()]
    if value is None: return []
    text=str(value).strip()
    if not text: return []
    if text.startswith('['):
        try:
            a=json.loads(text)
        except json.JSONDecodeError as e: raise ValueError('Malformed JSON list field') from e
        if not isinstance(a,list): raise ValueError('Expected a JSON array')
        return [str(v).strip() for v in a if str(v).strip()]
    return [s.strip() for s in text.split(';') if s.strip()]


def amount(text):
    try: n=Decimal(str(text))
    except (InvalidOperation,ValueError): raise ValueError(f'Invalid BTC amount {str(text)[:50]!r}')
    if not n.is_finite() or n<0 or n.as_tuple().exponent < -8: raise ValueError('Amount must be finite, nonnegative, with at most 8 decimals')
    return float(n)


def timestamp(text):
    if text is None or str(text).strip()=='':raise ValueError('timestamp is required')
    s=str(text).strip()
    try:
        if re.fullmatch(r'\d{10}(?:\.\d+)?',s): dt=datetime.fromtimestamp(float(s),timezone.utc)
        elif re.fullmatch(r'\d{13}',s): dt=datetime.fromtimestamp(int(s)/1000,timezone.utc)
        else: dt=datetime.fromisoformat(s.replace('Z','+00:00'))
        if dt.tzinfo is None:dt=dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat(timespec='seconds')
    except (ValueError,OverflowError) as e: raise ValueError('Invalid ISO-8601/Unix timestamp') from e


def source_rows(path):
    suffix=path.suffix.lower()
    if suffix=='.csv':
        with path.open('r',encoding='utf-8-sig',newline='') as f:
            for row in csv.DictReader(f):yield row
    elif suffix=='.json':
        data=json.loads(path.read_text(encoding='utf-8-sig'))
        if isinstance(data,dict):data=data.get('transactions')
        if not isinstance(data,list):raise ValueError('JSON must be an array or {"transactions": [...]}')
        for row in data:yield row
    elif suffix=='.xml':
        raw=path.read_bytes()
        if b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():raise ValueError('XML DTD and entities are not allowed')
        root=ET.fromstring(raw)
        txs=root.findall('.//transaction')
        if root.tag=='transaction':txs=[root]
        if not txs: raise ValueError('XML must include <transaction> entries')
        for tx in txs:
            row=dict(tx.attrib)
            for child in tx:
                if child.tag in ('inputs','outputs'):
                    row[child.tag]=[dict(n.attrib) for n in child]
                else:row[child.tag]=child.text or ''
            yield row
    else:raise ValueError('Only CSV, JSON and XML are supported')


def canonicalize(path):
    rows=[];audit_rows=[];seen=set();has_network=False
    for index,record in enumerate(source_rows(path),1):
        if index>MAX_ROWS:raise ValueError(f'Maximum {MAX_ROWS:,} transactions per dataset; split larger imports')
        if not isinstance(record,dict):raise ValueError(f'Row {index}: expected an object')
        try:
            tid=str(record.get('txid') or '').strip()
            if not tid or len(tid)>180:raise ValueError('txid missing or too long')
            if tid in seen:raise ValueError(f'duplicate TXID {tid}')
            seen.add(tid)
            ins=record.get('inputs');outs=record.get('outputs')
            if isinstance(ins,str) and ins.strip().startswith('['):ins=json.loads(ins)
            if isinstance(outs,str) and outs.strip().startswith('['):outs=json.loads(outs)
            if isinstance(ins,list) and isinstance(outs,list):
                iw=[str(x.get('address') or '').strip() for x in ins]
                ow=[str(x.get('address') or '').strip() for x in outs]
                iv=[amount(x['amount']) for x in ins] if all(x.get('amount') not in ('',None) for x in ins) else []
                ov=[amount(x.get('amount')) for x in outs]
                audit_record={'txid':tid,'timestamp':record.get('timestamp'),'inputs':ins,'outputs':outs}
            elif ins is None and outs is None:
                missing=[n for n in REQUIRED if record.get(n) in (None,'')]
                if missing:raise ValueError('missing required fields: '+', '.join(missing))
                iw=list_field(record['input_addresses']);ow=list_field(record['output_addresses'])
                iv=[amount(x) for x in list_field(record.get('input_amounts'))]
                ov=[amount(x) for x in list_field(record['output_amounts'])]
                audit_record={key:record.get(key) for key in ('txid','timestamp','input_addresses','output_addresses','input_amounts','output_amounts','prev_txids','prev_vouts')}
            else:raise ValueError('inputs and outputs must both be arrays')
            if any(not a or len(a)>240 for a in iw+ow):raise ValueError('wallet/address missing or too long')
            if not ow: raise ValueError('at least one output required')
            if len(iw)>300 or len(ow)>300:raise ValueError('maximum 300 inputs or outputs per transaction')
            if len(ov)!=len(ow) or (iv and len(iv)!=len(iw)):raise ValueError('amount/address list length mismatch')
            ts=timestamp(record.get('timestamp'))
            src=str(record.get('src_ip') or '').strip();dst=str(record.get('dst_ip') or '').strip()
            if src or dst:has_network=True
            r={'txid':tid,'timestamp':ts,'input_addresses':iw,'output_addresses':ow,'input_amounts':iv,'output_amounts':ov,
               'fee':amount(record['fee']) if record.get('fee') not in ('',None) else None,
               'script_type':str(record.get('script_type') or 'UNKNOWN'),
               'src_ip':src,'dst_ip':dst,'src_port':str(record.get('src_port') or ''),'dst_port':str(record.get('dst_port') or ''),
               'geo_country':str(record.get('geo_country') or ''),'asn':str(record.get('asn') or '')}
            rows.append(r);audit_rows.append(audit_record)
        except (ValueError,TypeError,KeyError,InvalidOperation) as exc:
            raise ValueError(f'Row {index}: {exc}') from exc
    if not rows:raise ValueError('Dataset contains no transactions')
    return rows,audit_rows,has_network


class UnionFind:
    def __init__(self):self.parent={}
    def find(self,x):
        if x not in self.parent:self.parent[x]=x
        if self.parent[x]!=x:self.parent[x]=self.find(self.parent[x])
        return self.parent[x]
    def union(self,x,y):
        a,b=self.find(x),self.find(y)
        if a!=b:self.parent[b]=a


def relative(values,reference):
    import numpy as np
    lo,hi=np.quantile(reference,[.50,.995]);return np.clip((values-lo)/(hi-lo),0,1) if hi>lo else np.zeros(len(values))


def anomalies(rows):
    """Unsupervised in-sample reference; NOT an independent normal baseline."""
    if len(rows)<50:
        return {r['txid']:(0.,0.,0.) for r in rows},{'mode':'unavailable','reason':'At least 50 transactions required for this ML ensemble','training_labels_used':False},None,{}
    import numpy as np
    from sklearn.ensemble import IsolationForest
    from sklearn.neural_network import MLPRegressor
    from sklearn.preprocessing import RobustScaler
    wallet_freq=Counter(w for r in rows for w in r['input_addresses'])
    X=[]
    for r in rows:
        ov=r['output_amounts'];total=sum(ov);mean=total/max(1,len(ov));
        X.append([len(r['input_addresses']),len(ov),math.log1p(sum(r['input_amounts'])),math.log1p(total),
                  max(ov)/total if total else 0,math.sqrt(sum((v-mean)**2 for v in ov)/len(ov))/mean if mean else 0,
                  math.log1p((r['fee'] or 0)*1e6),sum(wallet_freq[w] for w in r['input_addresses'])/max(1,len(r['input_addresses'])),
                  int(bool(set(r['input_addresses'])&set(r['output_addresses']))),int(bool(r['src_ip']))])
    X=np.array(X,float);scaler=RobustScaler(quantile_range=(10,90));Z=np.clip(scaler.fit_transform(X),-25,25)
    forest=IsolationForest(n_estimators=100,max_samples=min(256,len(rows)),random_state=42,n_jobs=1)
    forest.fit(Z);iso=relative(-forest.score_samples(Z),-forest.score_samples(Z))
    if len(rows)>=100:
        ae=MLPRegressor(hidden_layer_sizes=(12,4,12),max_iter=200,early_stopping=True,random_state=42,alpha=.005)
        ae.fit(Z,Z);err=np.mean((ae.predict(Z)-Z)**2,axis=1);reconstruction=relative(err,err)
        model='IsolationForest + bottleneck MLP reconstruction';combined=(iso+reconstruction)/2
    else:ae=None;reconstruction=np.zeros(len(rows));combined=iso;model='IsolationForest (too few rows for reconstruction model)'
    feature_names=['n_inputs','n_outputs','log_input','log_output','max_share','output_cv','log_fee','input_wallet_frequency','self_output','has_src_ip']
    distances=np.abs(ae.predict(Z)-Z) if ae is not None else np.abs(Z)
    feature_evidence={r['txid']:[{'feature':feature_names[j],'value':round(float(distances[i,j]),5),
                   'metric':'reconstruction_error' if ae is not None else 'robust_deviation'} for j in np.argsort(distances[i])[-3:][::-1]]
                   for i,r in enumerate(rows)}
    return {r['txid']:(round(float(i),6),round(float(a),6),round(float(c),6)) for r,i,a,c in zip(rows,iso,reconstruction,combined)},\
        {'mode':'in_sample_unlabeled','model':model,'training_reference':'uploaded batch (in-sample; not validated on independent benign baseline)',
         'training_labels_used':False,'scored_transactions':len(rows),'high_score_count_at_0_8':int((combined>=.8).sum()),
         'score_interpretation':'relative unusualness; not crime probability'}, {'scaler':scaler,'isolation_forest':forest,'reconstruction_net':ae,'features':feature_names},feature_evidence


def patterns(rows):
    hits=defaultdict(lambda:defaultdict(list));in_by_wallet=defaultdict(list)
    for r in rows:
        ins,outs=r['input_addresses'],r['output_addresses']
        if len(ins)<=2 and len(outs)>=6:hits[r['txid']]['fan_out'].append(r['txid'])
        if len(ins)>=6 and len(outs)<=2:hits[r['txid']]['consolidation'].append(r['txid'])
        if len(ins)==1 and len(outs)==2:in_by_wallet[ins[0]].append(r)
    for arr in in_by_wallet.values():arr.sort(key=lambda r:r['timestamp'])
    visited=set()
    for r in sorted(rows,key=lambda r:r['timestamp']):
        if r['txid'] in visited or len(r['input_addresses'])!=1 or len(r['output_addresses'])!=2:continue
        chain=[r];cur=r
        while len(chain)<30:
            bulk=cur['output_addresses'][0]
            options=[x for x in in_by_wallet.get(bulk,[]) if x['timestamp']>cur['timestamp'] and x['txid'] not in visited and x['txid']!=cur['txid']]
            if not options:break
            nex=options[0]
            if (datetime.fromisoformat(nex['timestamp'])-datetime.fromisoformat(cur['timestamp'])).total_seconds()>3600:break
            chain.append(nex);cur=nex
        if len(chain)>=4:
            for c in chain:visited.add(c['txid']);hits[c['txid']]['peeling_chain'].append(c['txid'])
    return hits


def round6(n):return round(float(n),6)


def analyze(path,outdir,dataset_id,display_name,sha256):
    from utxo_audit import canonicalize as audit_canonical, audit as utxo_audit
    outdir=Path(outdir);outdir.mkdir(parents=True,exist_ok=True)
    rows,audit_rows,has_network=canonicalize(Path(path))
    scores,model,model_bundle,feature_evidence=anomalies(rows);hits=patterns(rows)
    uf=UnionFind()
    for r in rows:
        for w in r['input_addresses']+r['output_addresses']:uf.find(w)
        # Common-input only: hypothesis, not proof; CoinJoin can invalidate.
        if len(r['input_addresses'])>1:
            for w in r['input_addresses'][1:]:uf.union(r['input_addresses'][0],w)
    root_to_id={};w2e={}
    for w in sorted(uf.parent):
        root=uf.find(w)
        if root not in root_to_id:root_to_id[root]=f'cluster_{len(root_to_id):04d}'
        w2e[w]=root_to_id[root]
    entity_wallets=defaultdict(set)
    for w,e in w2e.items():entity_wallets[e].add(w)
    entity_txs=defaultdict(list);entity_all_tx=defaultdict(set);entity_patterns=defaultdict(lambda:defaultdict(list));ip_observations=defaultdict(set)
    inlist=defaultdict(list);outlist=defaultdict(list);in_total=defaultdict(float);out_total=defaultdict(float)
    counterparties=defaultdict(set);countries=defaultdict(set);entity_ips=defaultdict(Counter)
    flows=defaultdict(lambda:{'total_amount':0.,'txids':set()});hourly=Counter();daily=Counter();ip_nodes=set();ip_edges=set()
    # Only the co-occurrence inferred aggregate graph uses pairwise input→output; tx records retain full inputs/outputs.
    for r in rows:
        tid=r['txid'];source_entities={w2e[w] for w in r['input_addresses']};hourly[int(r['timestamp'][11:13])]+=1;daily[r['timestamp'][:10]]+=1
        for eid in source_entities:entity_txs[eid].append(r);entity_all_tx[eid].add(tid)
        for addr in r['output_addresses']:entity_all_tx[w2e[addr]].add(tid)
        for p,ids in hits.get(tid,{}).items():
            for eid in source_entities:entity_patterns[eid][p].extend(ids)
        dest_pairs=list(zip(r['output_addresses'],r['output_amounts']))
        if r['src_ip']:
            ip_nodes.add(r['src_ip'])
            if r['dst_ip']:ip_nodes.add(r['dst_ip'])
            for eid in source_entities:
                entity_ips[eid][r['src_ip']]+=1;ip_observations[r['src_ip']].add(eid)
            if r['dst_ip']:ip_edges.add((r['src_ip'],r['dst_ip'],tid,r['geo_country']))
        for eid in source_entities:
            if r['geo_country']:countries[eid].add(r['geo_country'])
            # Avoid multiplying entity outgoing total by number of input wallets
            out_total[eid]+=sum(r['output_amounts'])
            for wallet,amt in dest_pairs:
                dest=w2e[wallet]
                if dest==eid:continue
                entry={'counterparty':dest,'amount':round6(amt),'timestamp':r['timestamp'],'txid':tid}
                outlist[eid].append(entry);counterparties[eid].add(dest)
                edge=flows[(eid,dest)];edge['total_amount']+=amt;edge['txids'].add(tid)
        for wallet,amt in dest_pairs:
            dest=w2e[wallet]
            if dest not in source_entities:
                in_total[dest]+=amt
                # one view record per source entity - the counterparty is inferred, not an attributed funding input
                for eid in source_entities:
                    inlist[dest].append({'counterparty':eid,'amount':round6(amt),'timestamp':r['timestamp'],'txid':tid})
    ranked=[];raw_patterns={e:sum(len(set(ids)) for ids in pp.values()) for e,pp in entity_patterns.items()}
    highest=max(raw_patterns.values(),default=0)
    for eid,wallets in entity_wallets.items():
        txids=entity_all_tx[eid]
        # Top maximum ML signal across observed transaction records
        anomaly=max((scores[tid][2] for tid in txids),default=0.)
        pattern=(raw_patterns.get(eid,0)/highest if highest else 0.)
        contributions=[{'feature':'pattern_hits','weight':.4,'normalized_value':round6(pattern),'contribution':round6(.4*pattern)},
                       {'feature':'risk_score','weight':0,'normalized_value':0,'contribution':0},
                       {'feature':'anomaly_score','weight':.2,'normalized_value':round6(anomaly),'contribution':round6(.2*anomaly)},
                       {'feature':'fusion_evidence','weight':0,'normalized_value':0,'contribution':0}]
        score=round6(sum(x['contribution'] for x in contributions))
        ranked.append({'entity_id':eid,'composite_score':score,'score_breakdown':contributions,'wallets':sorted(wallets),'pattern_hits':{p:sorted(set(ids)) for p,ids in entity_patterns[eid].items()},'fusion':{'n_clusters_merged':1,'linking_ips':sorted(entity_ips[eid])},'ground_truth_illicit':False})
    ranked.sort(key=lambda x:(-x['composite_score'],x['entity_id']))
    all_profiles={}
    for a in ranked:
        eid=a['entity_id'];ips=entity_ips[eid];score=a['composite_score']
        flags=[]
        for p,ids in a['pattern_hits'].items():flags.append(f'{p.replace("_"," ")}: {len(ids)} structural transaction match(es)')
        if a['score_breakdown'][2]['normalized_value']>=.8:flags.append('High relative ML outlier signal in at least one associated transaction')
        if len(countries[eid])>1:flags.append(f'Observed network metadata spans {len(countries[eid])} countries; this does not establish origin')
        if not flags:flags=['No structural match; ranked using available relative anomaly signals']
        all_profiles[eid]={'risk_score_100':round6(score*100),'risk_label':'CRITICAL' if score>=.5 else 'HIGH' if score>=.25 else 'MEDIUM' if score>=.1 else 'LOW',
           'incoming_total':round6(in_total[eid]),'outgoing_total':round6(out_total[eid]),'device_ip':ips.most_common(1)[0][0] if ips else None,
           'countries':sorted(countries[eid]),'n_countries':len(countries[eid]),'n_unique_counterparties':len(counterparties[eid]),'suspicion_flags':flags,
           'incoming_count':len(inlist[eid]),'outgoing_count':len(outlist[eid]),'incoming_list':sorted(inlist[eid],key=lambda x:x['timestamp'],reverse=True)[:10],
           'outgoing_list':sorted(outlist[eid],key=lambda x:x['timestamp'],reverse=True)[:10]}
    # Keep 15 investigator alerts, preserve all inferred clusters for Entities & Clusters.
    top=ranked[:15];alert_records=[]
    for index,a in enumerate(top,1):
        eid=a['entity_id'];wallets=set(a['wallets']);relevant=[];nodes=set(wallets);eids=set()
        for r in rows:
            if not wallets.intersection(r['input_addresses']+r['output_addresses']):continue
            eids.add(r['txid'])
            for sender in r['input_addresses']:
                for receiver,amt in zip(r['output_addresses'],r['output_amounts']):
                    if sender in wallets or receiver in wallets:
                        relevant.append({'source':sender,'target':receiver,'amount':round6(amt),'txid':r['txid'],'timestamp':r['timestamp']})
                        nodes.update((sender,receiver))
        relevant=sorted(relevant,key=lambda x:(x['txid'] not in set(sum(a['pattern_hits'].values(),[])), -x['amount']))[:60]
        tt=Counter(r['timestamp'][:10] for r in rows if r['txid'] in eids)
        note='Relative scores computed from this dataset, without illicit ground-truth seeds. '
        if a['pattern_hits']:note+='Structural pattern TXIDs are listed; activity is not a confirmed crime.'
        else:note+='No structural pattern was detected for this entity.'
        lead_tx=max(eids,key=lambda t:scores[t][2]) if eids else None
        lead_evidence={'txid':lead_tx,'anomaly_score':scores[lead_tx][2],'features':feature_evidence.get(lead_tx,[])} if lead_tx else None
        alert_records.append({**{k:v for k,v in a.items() if k!='wallets'},'ml_feature_evidence':lead_evidence,'rank':index,'n_wallets_total':len(wallets),
             'narrative':f'Entity {eid}: {note}','timeline':[{'date':d,'count':c} for d,c in sorted(tt.items())],
             'risk_profile':all_profiles[eid],
             'graph':{'wallet_nodes':[{'id':w,'is_entity_wallet':w in wallets,'risk_score':0} for w in sorted(nodes)],
                'ip_nodes':[{'id':ip} for ip in sorted(entity_ips[eid])],'ip_edges':[], 'tx_edges':relevant,
                'n_internal_edges_total':sum(1 for x in relevant if x['source'] in wallets and x['target'] in wallets),
                'n_external_edges_total':sum(1 for x in relevant if x['source'] not in wallets or x['target'] not in wallets)}})
    ml=[]
    for r in rows:
        iso,ae,s=scores[r['txid']]
        ml.append({'txid':r['txid'],'timestamp':r['timestamp'],'iso_score':iso,'ae_score':ae,'anomaly_score':s,
            'ground_truth_illicit':False,'from_wallets':r['input_addresses'],'to_wallets':r['output_addresses'],
            'amount':round6(sum(r['output_amounts'])),'entity_id':(w2e[r['input_addresses'][0]] if r['input_addresses'] else None),
            'feature_evidence':feature_evidence.get(r['txid'],[])})
    edge_export=[{'from':u,'to':v,'total_amount':round6(x['total_amount']),'tx_count':len(x['txids']),
                  'sample_txid':sorted(x['txids'])[0]} for (u,v),x in flows.items()]
    edge_export.sort(key=lambda x:-x['total_amount'])
    out={'dataset':{'id':dataset_id,'filename':display_name,'sha256':sha256,'network_metadata_available':has_network,
                    'warning':'Inference only: aggregate wallet-to-wallet edges are not exact UTXO provenance; no illicit labels or seeds used.',
                    'model':model},
         'summary':{'total_entities_scanned':len(entity_wallets),'total_illicit_ground_truth':None,'precision_at_k':None,'k':0,
           'precision_at_3':None,'recall_at_3':None,'total_transactions':len(rows),'total_wallets_involved':len(w2e),'alerts_shown':len(top)},
         'alerts':alert_records,'ml_analysis':{'transactions':ml},
         'temporal':{'hourly':[{'hour':h,'count':hourly[h],'illicit_count':0} for h in range(24)],
                     'daily':[{'date':d,'count':c,'illicit_count':0} for d,c in sorted(daily.items())]},
         'intelligence':{'ip_nodes':sorted(ip_nodes),'entity_ip_edges':[{'entity_id':e,'ip':ip} for e,c in entity_ips.items() for ip in c],
                         'leaderboard':[{'entity_id':a['entity_id'],'composite_score':a['composite_score']} for a in ranked]},
         'money_graph':{'edges':edge_export},'risk_profiles':all_profiles,
         'filters':{'countries':sorted(set(c for group in countries.values() for c in group)), 'ip_addresses':sorted(ip_nodes)}}
    # Independently audit explicit outpoints only. Missing references remain unlinked.
    utxo=utxo_audit(audit_canonical(audit_rows),Path(path))
    (outdir/'dashboard_data.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    (outdir/'utxo_evidence.json').write_text(json.dumps(utxo,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    (outdir/'model_report.json').write_text(json.dumps(model,indent=2),encoding='utf-8')
    (outdir/'anomaly_feature_evidence.json').write_text(json.dumps(feature_evidence,separators=(',',':')),encoding='utf-8')
    if model_bundle is not None:
        import joblib
        joblib.dump(model_bundle,outdir/'anomaly_models.joblib')
    with (outdir/'anomaly_scores.csv').open('w',newline='',encoding='utf-8') as f:
        writer=csv.writer(f);writer.writerow(('txid','iso_score','ae_score','anomaly_score'))
        for r in rows:writer.writerow((r['txid'],*scores[r['txid']]))
    return {'transaction_count':len(rows),'wallet_count':len(w2e),'cluster_count':len(entity_wallets),
            'alert_count':len(top),'network_available':has_network,'utxo_links':utxo['summary']['outpoint_links'],
            'model':model,'sha256':sha256}
