"""TRACE-X v6: offline multi-format transaction import and explicit UTXO spend audit.

Does NOT reconstruct Bitcoin outpoints from wallet/amount observations. Amounts are
BTC strings parsed with Decimal, with an integer-satoshi comparison tolerance of 0.
"""
from __future__ import annotations
import argparse
import csv
from decimal import Decimal, InvalidOperation
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

SAT=Decimal('0.00000001')


def amount(value):
    if value is None or str(value).strip() == '':
        return None
    try:
        n=Decimal(str(value))
    except InvalidOperation as exc:
        raise ValueError(f'Invalid BTC amount: {value!r}') from exc
    if not n.is_finite() or n < 0 or n.as_tuple().exponent < -8:
        raise ValueError(f'Invalid BTC precision or sign: {value!r}')
    return n


def as_btc(value):
    return format(value.quantize(SAT),'f') if value is not None else None


def fields_list(row, stem):
    raw=row.get(stem)
    if isinstance(raw,list):
        return raw
    if isinstance(raw,str) and raw.strip():
        v=json.loads(raw)
        if not isinstance(v,list):
            raise ValueError(f'{stem} must be a JSON array')
        return v
    return None


def legacy_rows(row):
    """Legacy semicolon wallet fields are *not* outpoint links."""
    def split(s):
        if s is None or str(s).strip()=='':return []
        return [v.strip() for v in str(s).split(';')]
    ia=split(row.get('input_addresses'));oa=split(row.get('output_addresses'))
    im=split(row.get('input_amounts'));om=split(row.get('output_amounts'))
    if im and len(im)!=len(ia): raise ValueError('input amounts/addresses length mismatch')
    if om and len(om)!=len(oa): raise ValueError('output amounts/addresses length mismatch')
    prev=split(row.get('prev_txids'));vouts=split(row.get('prev_vouts'))
    if bool(prev)!=bool(vouts) or (prev and (len(prev)!=len(ia) or len(vouts)!=len(ia))):
        raise ValueError('prev_txids/prev_vouts must both match input count')
    inputs=[{'address':w,'amount':im[i] if im else None,**({'prev_txid':prev[i],'vout':int(vouts[i])} if prev else {})} for i,w in enumerate(ia)]
    outputs=[{'address':w,'amount':om[i] if om else None,'vout':i} for i,w in enumerate(oa)]
    return inputs,outputs


def parse_source(path):
    path=Path(path)
    if path.suffix.lower()=='.csv':
        with path.open(newline='',encoding='utf-8-sig') as f: return list(csv.DictReader(f))
    if path.suffix.lower()=='.json':
        data=json.loads(path.read_text(encoding='utf-8-sig'))
        rows=data.get('transactions') if isinstance(data,dict) else data
        if not isinstance(rows,list): raise ValueError('JSON must be an array or {"transactions": [...]}')
        return rows
    if path.suffix.lower()=='.xml':
        root=ET.parse(path).getroot(); rows=[]
        for t in root.findall('.//transaction'):
            row=dict(t.attrib)
            for key,sub in [('inputs','input'),('outputs','output')]:
                row[key]=[dict(x.attrib) for x in t.findall(f'{key}/{sub}')]
            rows.append(row)
        if not rows:raise ValueError('XML must have <transaction> elements')
        return rows
    raise ValueError('Unsupported file extension; expected .csv, .json or .xml')


def canonicalize(rows):
    txs=[];seen=set()
    for idx,row in enumerate(rows,1):
        try:
            if not isinstance(row,dict):raise ValueError('transaction must be an object')
            tid=str(row.get('txid') or '').strip()
            if not tid:raise ValueError('missing txid')
            if tid in seen:raise ValueError('duplicate txid')
            seen.add(tid)
            inp=fields_list(row,'inputs');out=fields_list(row,'outputs')
            if inp is None or out is None:
                if inp is not None or out is not None:raise ValueError('inputs and outputs must both be arrays')
                inp,out=legacy_rows(row)
            parsed_in=[];parsed_out=[];vouts=set()
            for i,entry in enumerate(inp):
                if not isinstance(entry,dict):raise ValueError('input must be an object')
                prev=entry.get('prev_txid');vo=entry.get('vout')
                if (prev is None or str(prev)=='') != (vo is None or str(vo)==''):
                    raise ValueError('input prev_txid and vout must both be supplied')
                if vo is not None:
                    if str(vo).strip()!=str(int(vo)) or int(vo)<0:raise ValueError('input vout must be a nonnegative integer')
                a=amount(entry.get('amount'))
                parsed_in.append({'prev_txid':str(prev) if prev not in (None,'') else None,'vout':int(vo) if vo is not None and str(vo)!='' else None,
                                  'address':str(entry.get('address') or ''),'amount':as_btc(a)})
            for i,entry in enumerate(out):
                if not isinstance(entry,dict):raise ValueError('output must be an object')
                vo=entry.get('vout',i)
                if str(vo).strip()!=str(int(vo)) or int(vo)<0 or int(vo) in vouts:raise ValueError('output vout must be unique nonnegative integer')
                vouts.add(int(vo));a=amount(entry.get('amount'))
                if a is None:raise ValueError('output amount is required')
                parsed_out.append({'vout':int(vo),'address':str(entry.get('address') or ''),'amount':as_btc(a)})
            txs.append({'txid':tid,'timestamp':str(row.get('timestamp') or ''),'inputs':parsed_in,'outputs':parsed_out})
        except (ValueError,TypeError,OverflowError) as exc:
            raise ValueError(f'row {idx}: {exc}') from exc
    return txs


def audit(txs,source_path=None, max_edges=20000):
    outpoints={(t['txid'],o['vout']):o for t in txs for o in t['outputs']}
    spends={};edges=[];warnings=[];links=0; missing=0; unspecified=0; invalid=0;complete=0
    tx_results=[]
    for tx in txs:
        linked=0; unlinked=0; sum_inputs=Decimal(0); have_known_amounts=True; issues=[]
        for inp in tx['inputs']:
            prev,vo=inp['prev_txid'],inp['vout']
            if prev is None:
                unspecified+=1;unlinked+=1;have_known_amounts=False;continue
            key=(prev,vo)
            if key in spends:
                issue=f'Outpoint {prev}:{vo} is also spent by {spends[key]}'
                warnings.append({'type':'double_spend','txid':tx['txid'],'detail':issue});issues.append(issue);invalid+=1
                continue
            spends[key]=tx['txid']
            o=outpoints.get(key)
            if o is None:
                missing+=1;unlinked+=1;have_known_amounts=False;continue
            if prev==tx['txid']:
                warnings.append({'type':'self_reference','txid':tx['txid'],'detail':'Transaction references its own output'});invalid+=1;issues.append('Self-referential outpoint');continue
            if inp['amount'] is not None and amount(inp['amount'])!=amount(o['amount']):
                warnings.append({'type':'input_amount_mismatch','txid':tx['txid'],'detail':f'{prev}:{vo} input differs from previous output'});invalid+=1
                issues.append('Input amount mismatch')
            linked+=1;links+=1;sum_inputs+=amount(o['amount'])
            if len(edges)<max_edges:
                edges.append({'from_txid':prev,'to_txid':tx['txid'],'spent_vout':vo,
                              'amount':o['amount'],'receiving_address':o['address']})
        outtotal=sum((amount(x['amount']) for x in tx['outputs']), Decimal(0))
        fee=None
        if tx['inputs'] and linked==len(tx['inputs']) and have_known_amounts and not issues:
            fee=sum_inputs-outtotal
            if fee<0:
                warnings.append({'type':'negative_fee','txid':tx['txid'],'detail':'Linked input total below output total'});invalid+=1;issues.append('Negative fee')
                fee=None
            else:complete+=1
        status='VERIFIED_OUTPOINTS' if linked and linked==len(tx['inputs']) and not issues else ('PARTIAL' if linked else 'UNLINKED')
        if issues:status='REVIEW'
        tx_results.append({'txid':tx['txid'],'timestamp':tx['timestamp'],'status':status,'input_count':len(tx['inputs']),
                           'output_count':len(tx['outputs']),'linked_inputs':linked,'unlinked_inputs':unlinked,
                           'output_total_btc':as_btc(outtotal),'fee_btc':as_btc(fee), 'issues':issues})
    source_hash=None
    if source_path is not None:
        with Path(source_path).open('rb') as f:source_hash=hashlib.file_digest(f,'sha256').hexdigest()
    return {'schema_version':'6.0','source_file':Path(source_path).name if source_path else None,'source_sha256':source_hash,
            'provenance_mode':'EXPLICIT_OUTPOINTS' if links else 'WALLET_OBSERVATIONS_ONLY',
            'summary':{'transactions':len(txs),'outpoint_links':links,'unlinked_input_refs':missing,
                       'inputs_without_outpoints':unspecified,'verified_complete_transactions':complete,
                       'integrity_warnings':len(warnings),'exported_edges':len(edges)},
            'transactions':tx_results,'utxo_edges':edges,'warnings':warnings,
            'limitations':['Explicit links prove reference to a prior output, not which input funds any particular output.',
                           'Missing prior transactions remain unresolved; no outpoint is fabricated from wallet names or amounts.',
                           'Source SHA-256 identifies imported bytes; it does not establish external authenticity or chain of custody.']}


def main(argv=None):
    ap=argparse.ArgumentParser(description='Offline BTC transaction UTXO provenance audit (CSV, JSON, XML)')
    ap.add_argument('--input',default='data/raw/synthetic_transactions.csv')
    ap.add_argument('--output',default='dashboard/utxo_evidence.json')
    args=ap.parse_args(argv)
    src=Path(args.input);out=Path(args.output)
    data=audit(canonicalize(parse_source(src)),src)
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(data,indent=2),encoding='utf-8')
    print(f'TRACE-X v6: {data["summary"]["transactions"]} transactions; {data["summary"]["outpoint_links"]} explicit links; '
          f'{data["summary"]["integrity_warnings"]} warnings; mode={data["provenance_mode"]}')
    print(f'Wrote: {out}')

if __name__=='__main__':main()
