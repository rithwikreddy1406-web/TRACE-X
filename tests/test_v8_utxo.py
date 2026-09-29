"""Offline regression tests for the synthetic v8 UTXO investigation fixture."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'backend'))
from utxo_audit import parse_source, canonicalize, audit
from v7_pipeline import analyze


class UTXOInvestigationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture=ROOT/'tests'/'tracex_utxo_investigation_120.csv'
        cls.evidence=audit(canonicalize(parse_source(cls.fixture)),cls.fixture)

    def test_fixture_counts_and_integrity_reviews(self):
        s=self.evidence['summary']
        self.assertEqual(s['transactions'],120)
        self.assertEqual(s['outpoint_links'],112)
        self.assertEqual(s['integrity_warnings'],3)
        self.assertEqual(s['inputs_without_outpoints'],0)
        self.assertEqual({w['type'] for w in self.evidence['warnings']},
                         {'double_spend','input_amount_mismatch','negative_fee'})

    def test_structural_indicators_are_investigative_only(self):
        found={s['type']:s for s in self.evidence['pattern_indicators']}
        self.assertEqual(set(found),{'fan_out','consolidation','peeling_like_sequence'})
        self.assertEqual(len(found['peeling_like_sequence']['txids']),5)
        self.assertEqual(self.evidence['provenance_mode'],'EXPLICIT_OUTPOINTS')

    def test_v7_pipeline_exposes_same_dataset_scoped_evidence(self):
        with tempfile.TemporaryDirectory() as d:
            out=Path(d)
            info=analyze(self.fixture,out,'ds_'+'9'*32,self.fixture.name,'synthetic-fixture')
            u=json.loads((out/'utxo_evidence.json').read_text())
            dashboard=json.loads((out/'dashboard_data.json').read_text())
            self.assertEqual(info['transaction_count'],120)
            self.assertEqual(info['utxo_links'],112)
            self.assertEqual(u['summary']['integrity_warnings'],3)
            self.assertEqual(dashboard['summary']['total_transactions'],120)
            self.assertEqual(dashboard['dataset']['filename'],self.fixture.name)

    def test_original_wallet_only_data_does_not_gain_fake_links(self):
        old=ROOT/'tests'/'tracex_v7_alternative_test_148.csv'
        if not old.exists():self.skipTest('148-row dataset not installed with patch')
        u=audit(canonicalize(parse_source(old)),old)
        self.assertEqual(u['summary']['transactions'],148)
        self.assertEqual(u['summary']['outpoint_links'],0)
        self.assertEqual(u['summary']['integrity_warnings'],0)


if __name__=='__main__':unittest.main()
