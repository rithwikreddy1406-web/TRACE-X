# TRACE-X v7 — Dynamic Dataset Intelligence

This package upgrades the v6 **Investigator Console** to a data-driven, localhost-only upload, analysis, and dataset-switching application. It includes a standalone v7 analysis pipeline; it does not change the original v2 detection scripts. Running `python3 -m http.server` will **not** enable upload or analysis.

## Installation in your existing WSL TRACE-X folder

1. Download `tracex_v7_dynamic_dataset.zip` to Windows, open WSL, and navigate to your project folder. Confirm `dashboard/console/index.html` exists; this is the directory in which you should extract the ZIP.
2. Stop the old static dashboard server with **Ctrl+C** in its terminal (free port 8765). Keep a backup: `cp -a dashboard/console "dashboard/console_backup_$(date +%Y%m%d_%H%M%S)"`.
3. Run `explorer.exe .`, copy the downloaded ZIP from Windows Downloads into the open project folder, and extract it using `python3 -m zipfile -e tracex_v7_dynamic_dataset.zip .`.
4. Activate your existing Python environment if present, or create one: `python3 -m venv .venv && source .venv/bin/activate`. Install the additional dependencies: `python3 -m pip install -r requirements_v7.txt`. Package installation can require Internet; **the running app does not**. For an offline install, provide predownloaded compatible wheels in a wheelhouse and use `pip install --no-index --find-links ./wheelhouse -r requirements_v7.txt`.
5. **Start the new server:** `python3 backend/v7_server.py --port 8765` (from the project root). Keep this terminal open. Open **http://localhost:8765/console/** in your Windows browser, then Ctrl+Shift+R.
6. Open **Data Intelligence → Choose File → Upload & Analyze**. To verify the setup first, upload `tests/sample_synthetic.csv`; to check explicit linked outpoints, upload `tests/utxo_linked_demo.json`. Results become active **only after the entire job completes**. Return to Dashboard or Alerts; they now use the selected dataset. Use Data Intelligence to reactivate a previous dataset.

If the former `python3 -m http.server 8765` is still running, stop it first. Otherwise you will see a port-in-use error and the static server cannot accept file uploads.

## Accepted dataset schema

Legacy CSV / JSON object / XML `<transaction>` rows:

**Required:** `txid`, `timestamp`, `input_addresses`, `output_addresses`, `output_amounts` (for a coinbase transaction, empty input addresses are accepted). `timestamp` accepts ISO-8601 (UTC recommended), 10-digit Unix seconds, or 13-digit milliseconds. In CSV, addresses and BTC amounts within a field are **semicolon-separated**. JSON field values can be arrays. Output amounts must correspond positionally to output addresses, with up to eight decimal places.

**Optional:** `input_amounts`, `fee`, `script_type`, `src_ip`, `dst_ip`, `src_port`, `dst_port`, `geo_country`, `asn`, and paired `prev_txids` + `prev_vouts`. Both previous-reference arrays must match the input count. If no P2P metadata is present, Network Analysis shows no observations. Do not substitute arbitrary peer IPs as origination IPs.

JSON can instead provide `{"transactions":[{"txid":"...","timestamp":"...","inputs":[{"address":"...","amount":"...","prev_txid":"...","vout":0}],"outputs":[{"address":"...","amount":"...","vout":0}]}]}`. Previous outpoint references are necessary for explicit spend-link tracing. Missing references remain unresolved; address co-occurrence is not UTXO provenance.

XML can provide `<transactions><transaction txid="..." timestamp="..."><inputs><input address="..." amount="..." prev_txid="..." vout="0"/></inputs><outputs><output address="..." amount="..." vout="0"/></outputs></transaction></transactions>` or child tags corresponding to the CSV column names. XML DTDs and entities are rejected.

Limits: **30 MB per file, up to 100,000 transactions, 300 inputs and 300 outputs per transaction**. Processing large inputs requires sufficient local RAM. Duplicate TXIDs, malformed amounts, and inconsistent array lengths cause a clear import failure; the previously active dataset remains unchanged. The v7 importer expects a normalized transaction export. A raw Bitcoin Core block dump or an arbitrary third-party CSV might require a column adapter; it cannot be accepted blindly.

## What actually changes on import

Each dataset receives a unique ID and a private source / result folder under `data/v7_datasets/`. Its SHA-256 is recorded. The pipeline re-parses the imported rows; constructs tentative common-input wallet clusters and inferred aggregate entity links; computes structural fan-out, consolidation and simplified peeling-chain matches; runs **a new Isolation Forest + bottleneck reconstruction model** for 100+ rows, Isolation Forest for 50–99 rows, or reports ML unavailable below 50 rows; produces score factors and top feature deviations; produces an independent explicit outpoint audit; and builds dataset-specific dashboard JSON. It **does not** use illicit ground-truth labels or seed-based illicit-wallet propagation for imported datasets; risk and IP fusion contributions are zero/unconfigured. Entity IDs are scoped to each dataset and can change on every import.

The active dataset is switched atomically after the successful export, not on upload. The new data populates all existing pages (Dashboard, Alerts, Graph, Entities, Network, Pattern Detection, Risk, Search, Replay, UTXO, and Reports). Cases retain their original browser-local evidence snapshots and show a mismatch warning when viewing a different dataset. They are **not** merged into another dataset.

## Limitations and evidence safety

- New model scores are **in-sample relative outlier scores**, not externally validated detection accuracy, a criminality probability, or calibrated confidence. The model is fitted on the imported batch, which may contain suspicious records. To measure accuracy, obtain an independent benign baseline and held-out evaluation labels.
- Common-input entity clustering is a hypothesis and can produce false ownership merges (for example CoinJoin). Shared IPs remain **observations**, not identity proof or automatically merged clusters. The network view only appears when source observations exist.
- Inferred wallet and entity flow is not an exact attribution of which Bitcoin input funded which output. UTXO Provenance only links explicit `prev_txid`/`vout` references within the supplied data. An unresolved prior transaction is not invented.
- The simplified structural detectors identify patterns, not verified ransomware, darknet, extortion, or laundering. There is no real blockchain feed or live interception in this package.
- SHA-256 establishes file byte identity, not authenticity or legal chain of custody. Cases persist in the browser's localStorage for the same origin (host and port); export a backup before clearing browser data.
- The application binds only to `127.0.0.1`. Do not expose this development server to other machines or the public Internet.

## Local validation

From the project root, run `python3 -m unittest discover -s tests -p 'test_v7.py' -v`. This checks CSV/JSON/XML normalization, invalid records, missing-network behavior, and linked outpoints. Python 3.10+ is recommended. `node --check dashboard/console/app.js` and `node --check dashboard/console/v7.js` are optional syntax checks if Node is installed.

Output files for each dataset: `results/dashboard_data.json`, `results/utxo_evidence.json`, `results/anomaly_scores.csv`, `results/anomaly_feature_evidence.json`, `results/model_report.json`, and, when trained, `results/anomaly_models.joblib`.
