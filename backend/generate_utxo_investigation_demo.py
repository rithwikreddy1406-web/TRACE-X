"""Generate a deterministic 120-row fictional Bitcoin-outpoint investigation fixture.

Not a real chain, real wallet labels, or validated illicit activity. Deliberately
contains three integrity inconsistencies to exercise investigator review.
"""
from __future__ import annotations
import csv
import json
from datetime import datetime,timedelta,timezone
from decimal import Decimal
from pathlib import Path

D=Decimal
COLUMNS=['txid','timestamp','input_addresses','output_addresses','input_amounts','output_amounts','prev_txids','prev_vouts','inputs','outputs','fee','script_type','src_ip','dst_ip','src_port','dst_port','geo_country','asn']
rows=[]
start=datetime(2026,9,20,8,0,tzinfo=timezone.utc)
def money(x):return format(D(str(x)).quantize(D('0.00000001')),'f')
def tx(tid,ins,outs,minutes,ip=''):
    """ins=[(previous_txid,vout,address,recorded_amount)] outs=[(addr,amount)]"""
    iv=[D(money(x[3])) for x in ins];ov=[D(money(x[1])) for x in outs]
    rows.append({'txid':tid,'timestamp':(start+timedelta(minutes=minutes)).isoformat(),
      'input_addresses':';'.join(x[2] for x in ins),'output_addresses':';'.join(x[0] for x in outs),
      'input_amounts':';'.join(money(x) for x in iv),'output_amounts':';'.join(money(x) for x in ov),
      'prev_txids':';'.join(x[0] for x in ins),'prev_vouts':';'.join(str(x[1]) for x in ins),
      'inputs':json.dumps([{'prev_txid':x[0],'vout':x[1],'address':x[2],'amount':money(x[3])} for x in ins]),
      'outputs':json.dumps([{'vout':i,'address':x[0],'amount':money(x[1])} for i,x in enumerate(outs)]),
      'fee':money(max(D(0),sum(iv)-sum(ov))) if ins else '0.00000000',
      'script_type':'P2WPKH','src_ip':ip,'dst_ip':'','src_port':'8333' if ip else '',
      'dst_port':'','geo_country':'','asn':''})
# 10 roots; these are unlinked fixture roots, not claims about actual coinbase transactions.
last={}
for n in range(10):
    tid=f'fixture_root_{n:02d}';addr=f'fixture_addr_{n:02d}_0'
    tx(tid,[],[(addr,'15')],n)
    last[n]=(tid,0,addr,D(15))
# 100 ordinary single-output spend events across eight chains.
for k in range(100):
    branch=k%8
    prev=last[branch]
    val=prev[3]-D('0.00010000')
    tid=f'fixture_regular_{k:03d}'
    addr=f'fixture_addr_{branch:02d}_{k+1:03d}'
    tx(tid,[prev],[(addr,val)],20+k)
    last[branch]=(tid,0,addr,val)
# Fan-out, with an unusually large number of outputs.
fan='fixture_fanout_01';root8=last[8]
fan_outputs=[('fixture_fanout_a','6'),('fixture_fanout_b','4'),('fixture_fanout_c','2'),('fixture_fanout_d','1'),('fixture_fanout_e','1.99990000')]
tx(fan,[root8],fan_outputs,130,'192.0.2.10')
# Five repeated smaller output + change sequences, spending explicit vout0.
prev=(fan,0,'fixture_fanout_a',D(6))
for step in range(1,6):
    small=D('0.20000000'); change=prev[3]-small-D('0.00010000')
    tid=f'fixture_peel_{step:02d}';to=f'fixture_peel_change_{step}'
    tx(tid,[prev],[(to,change),(f'fixture_peel_small_{step}',small)],135+step,'192.0.2.11')
    prev=(tid,0,to,change)
# Consolidates four OTHER independent fanout outputs; this is not connected to the peeling change.
con_in=[(fan,i,fan_outputs[i][0],D(fan_outputs[i][1])) for i in range(1,5)]
tx('fixture_consolidation_01',con_in,[('fixture_consolidated',D('8.99980000'))],143,'192.0.2.12')
# Three deliberately inconsistent recorded transactions: these are evidence quality
# findings, not observed real chain violations or crimes.
tx('fixture_conflict_duplicate',[(fan,1,'fixture_fanout_b','4')],[('fixture_conflict_dest','3.9999')],144)
tx('fixture_conflict_amount',[(last[0][0],0,last[0][2],last[0][3]+D('0.5'))],[('fixture_conflict_dest2',last[0][3]-D('0.0001'))],145)
tx('fixture_conflict_overspend',[last[9]],[('fixture_conflict_dest3','16')],146)
assert len(rows)==120
if __name__=='__main__':
    dest=Path(__file__).resolve().parent.parent/'tests'/'tracex_utxo_investigation_120.csv'
    dest.parent.mkdir(parents=True,exist_ok=True)
    with dest.open('w',newline='',encoding='utf-8') as f:
        writer=csv.DictWriter(f,fieldnames=COLUMNS);writer.writeheader();writer.writerows(rows)
    print(f'Wrote {len(rows)} synthetic transactions: {dest}')
