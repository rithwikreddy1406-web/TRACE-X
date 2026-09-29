# TRACE-X v8: UTXO Evidence & Review Explorer

An **offline add-on for your existing TRACE-X v7**, including the earlier `/api/utxo` frontend fix. It is **not a standalone installation**. It does not overwrite `data/v7_datasets`, your saved investigations, your ML model artifacts, or your separate teammate dashboard.

## What changes

- `dashboard/console/v8.js`: interactive directed outpoint neighborhood, 1/2/3-hop selection, zoom, clickable transaction nodes, detailed incoming and outgoing evidence, integrity-warning list, structural-pattern review list.
- `dashboard/console/index.html`, `dashboard/console/styles.css`: load and style that page.
- `dashboard/console/v6.js`: retained corrected `/api/utxo` loading.
- `backend/utxo_audit.py`: adds **structural investigation indicators** to its existing schema 6.0 audit, preserving previous fields and zero-link behavior for wallet-only data.
- `backend/v7_pipeline.py`: handles transactions with zero input references in the unlabeled anomaly feature calculation. Previously this caused division by zero.
- `backend/generate_utxo_investigation_demo.py`: deterministic generator for **fictional** linked transaction records.
- `tests/tracex_utxo_investigation_120.csv`: the generated upload fixture.
- `tests/test_v8_utxo.py`: offline regression tests.

## Installation (in WSL)

1. Stop your existing `python backend/v7_server.py --port 8765` terminal with Ctrl+C.
2. Copy `tracex_v8_utxo_investigation_upgrade.zip` into your existing TRACE-X root, which contains `backend` and `dashboard`. You can use `explorer.exe .` from WSL to open that root in Windows Explorer.
3. Back up the code before extracting:

```bash
cp -a dashboard/console "dashboard/console_backup_$(date +%Y%m%d_%H%M%S)"
cp -a backend/utxo_audit.py "backend/utxo_audit_backup_$(date +%Y%m%d_%H%M%S).py"
cp -a backend/v7_pipeline.py "backend/v7_pipeline_backup_$(date +%Y%m%d_%H%M%S).py"
python3 -m zipfile -e tracex_v8_utxo_investigation_upgrade.zip .
```

4. Activate the v7 environment you already installed. The v8 add-on has no new Python dependencies:

```bash
source .venv_v7_fixed/bin/activate
# Or activate whichever environment you used for v7 if named differently.
python3 -m unittest discover -s tests -p 'test_v8_utxo.py' -v
python backend/v7_server.py --port 8765
```

5. Visit `http://localhost:8765/console/` and press Ctrl+Shift+R if the old script remains cached.
6. Open **Data Intelligence** → Choose File → select `tests/tracex_utxo_investigation_120.csv` → **Upload & Analyze**. The v7 local job should activate the new dataset after processing finishes. The CSV is 43.8 KB and is entirely fictional.
7. Open **UTXO Provenance**. Click graph nodes, switch hop depth, zoom, review the warning list, and inspect highlighted pattern TXIDs. You can also open `http://localhost:8765/api/utxo` to inspect the raw evidence for the active dataset.
8. To restore the previous 2,008-transaction dataset, open **Data Intelligence → Dataset History → Activate** that dataset. It retains its original UTXO audit results (zero explicit links if its source lacks outpoints).

If `python3` is your active virtualenv executable rather than `python`, either name works.

## Expected synthetic demonstration counts

- Transactions audited: **120**
- Explicit matched outpoint references: **112**
- Integrity warnings: **3** (deliberately conflicting records: duplicate outpoint spend, mismatched input amount, outputs exceeding resolved input value)
- Structural indicators: **3** (fan-out, consolidation, one five-stage peeling-*like* sequence)
- Inputs without outpoints: **0** (fixture roots have no recorded inputs)

These intentionally inconsistent records test how a forensic analyst reviews **source-data anomalies**. They do not establish that a real Bitcoin double spend occurred or that any activity is criminal. This CSV contains made-up identifiers and reserved sample IPs; it must not be represented as a genuine Bitcoin chain dataset.

## Evidence rules and limitations

The UTXO graph draws only explicit `prev_txid:vout` references to output records in the selected uploaded file. It does not infer outpoints from wallets or amounts. A matched reference is *not* a proof of who controls a wallet, or which of several inputs paid an individual output. This tool is an offline research prototype and does not validate blockchain consensus, signatures, full ancestry, confirmation counts, exchange identities, or real-world criminal attribution. Relative ML outlier scores are not crime probabilities. For a real dataset, the UI must display its actual count, even if that is zero; do not add invented warnings or spend edges.
