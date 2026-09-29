"""Offline minimal importer and evidence integrity tests: python3 -m unittest discover -s tests -p 'test_v7.py'"""
import csv
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from v7_pipeline import canonicalize,analyze


class DatasetTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.base=Path(self.tmp.name)
        self.data=[{'txid':'real_tx_1','timestamp':'2026-09-18T10:00:00Z','input_addresses':'addr_A',
                    'output_addresses':'addr_B;addr_C','input_amounts':'3.0','output_amounts':'2.0;0.9999','fee':'0.0001'},
                   {'txid':'real_tx_2','timestamp':'2026-09-18T10:10:00Z','input_addresses':'addr_B',
                    'output_addresses':'addr_D','input_amounts':'2.0','output_amounts':'1.9999','fee':'0.0001'}]
    def tearDown(self):self.tmp.cleanup()
    def write(self,ext):
        p=self.base/('sample.'+ext)
        if ext=='csv':
            with p.open('w',newline='') as f:
                w=csv.DictWriter(f,self.data[0].keys());w.writeheader();w.writerows(self.data)
        elif ext=='json':p.write_text(json.dumps({'transactions':self.data}))
        else:
            p.write_text('<transactions>'+''.join('<transaction>'+''.join('<'+k+'>'+v+'</'+k+'>' for k,v in row.items())+'</transaction>' for row in self.data)+'</transactions>')
        return p
    def test_csv_json_xml(self):
        for ext in ('csv','json','xml'):
            with self.subTest(ext=ext):
                rows,_,network=canonicalize(self.write(ext))
                self.assertEqual(len(rows),2)
                self.assertEqual(rows[0]['output_amounts'],[2.0,0.9999])
                self.assertFalse(network)
    def test_upload_generates_new_alert_graph_without_fake_ip(self):
        p=self.write('csv');res=analyze(p,self.base/'results','ds_'+'d'*32,p.name,hashlib.sha256(p.read_bytes()).hexdigest())
        out=json.loads((self.base/'results'/'dashboard_data.json').read_text())
        self.assertEqual(out['summary']['total_transactions'],2)
        self.assertEqual(res['wallet_count'],4)
        self.assertEqual(out['intelligence']['ip_nodes'],[])
        self.assertEqual(out['dataset']['model']['mode'],'unavailable')
        self.assertEqual(len(out['ml_analysis']['transactions']),2)
        self.assertEqual(json.loads((self.base/'results'/'utxo_evidence.json').read_text())['summary']['outpoint_links'],0)
    def test_does_not_accept_duplicate_or_bad_amounts(self):
        p=self.write('csv')
        self.data[1]['txid']='real_tx_1';p=self.write('csv')
        with self.assertRaisesRegex(ValueError,'duplicate TXID'):canonicalize(p)
        self.data[1]['txid']='real_tx_2';self.data[1]['output_amounts']='not-a-number';p=self.write('csv')
        with self.assertRaisesRegex(ValueError,'Invalid BTC amount'):canonicalize(p)
    def test_xml_doctype_rejected(self):
        p=self.base/'evil.xml';p.write_text('<!DOCTYPE x [<!ENTITY y "hello">]><transactions/>')
        with self.assertRaisesRegex(ValueError,'DTD'):canonicalize(p)
    def test_explicit_utxo_fixture(self):
        p=ROOT/'tests'/'utxo_linked_demo.json'
        summary=analyze(p,self.base/'results','ds_'+'c'*32,p.name,hashlib.sha256(p.read_bytes()).hexdigest())
        self.assertEqual(summary['utxo_links'],3)
        self.assertFalse(summary['network_available'])

if __name__=='__main__':unittest.main()
