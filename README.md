# TRACE-X — Offline Bitcoin Transaction Intelligence Prototype

This repository contains the **v7 dataset-processing backend with the v8 UTXO investigation add-on**, and a **separate precomputed static Netlify demonstration**.

## What is included

- `backend/v7_server.py`: local-only Python web server and API for imported datasets.
- `backend/v7_pipeline.py`: canonicalization, tentative wallet clustering, structural pattern and ML anomaly analysis, dataset-specific evidence exports.
- `backend/utxo_audit.py`: exact `prev_txid:vout` reference review, integrity findings and *investigative* fan-out, consolidation and peeling-like indicators.
- `backend/generate_utxo_investigation_demo.py`: deterministic **synthetic** linked-UTXO dataset generator.
- `dashboard/console/`: browser investigator console with the v8 UTXO review view. This local UI uses the Python server for imports and re-analysis.
- `tests/tracex_utxo_investigation_120.csv`: fictional 120-transaction fixture with 112 matched spend references and three **deliberate synthetic** integrity warnings.
- `tests/test_v7.py`, `tests/test_v8_utxo.py`: regression tests.
- `netlify-demo/`: **static, precomputed** v8 public demonstration, including selectable 120-tx linked UTXO and 2,008-tx wallet-observation synthetic exports.

## Run locally

Install Python 3.10+ and dependencies:

```sh
python -m pip install -r requirements_v7.txt
python -m unittest discover -s tests -p 'test_v*.py' -v
python backend/v7_server.py --port 8765
```

Then open `http://localhost:8765/console/` and upload `tests/tracex_utxo_investigation_120.csv` via **Data Intelligence** to populate the local v8 UTXO experience. The original 2,008-transaction sample and the 120-row fixture are **synthetic**. Local API mode and static mode are separate: do not expect the backend to run on Netlify.

## Deploy static preview to Netlify

Upload the contents of `netlify-demo/` as the site root (the folder itself in Netlify Drop). Its `index.html` sits alongside `app.js`, `v8.js` and the precomputed JSON files. It does not upload arbitrary files to a Python backend or run live ML inference. See `netlify-demo/README_DEPLOY.txt`.

## Data provenance and limitations

This is a research prototype, not a production forensic attribution service. A structural or ML alert is **not proof of wrongdoing**. Address-based cluster membership is inferred, not established identity. On-chain records do not inherently contain an originating IP. UTXO relationships are considered explicitly linked only when previous output references are present. The public demo has no live network intelligence or authoritative real-world transaction feed. The synthetic fixture intentionally contains inconsistent evidence for testing review indicators; do not call it a genuine Bitcoin double-spend event.

The separate **Elliptic benchmark**, a standalone **`risk_scoring.py`** module, and any different team's dataset generator are **not included here**. Do not represent them as integrated or validated without adding their actual source code, data access constraints and evaluation results.

See `README_V7.md` and `README_V8_UTXO.md` for implementation details, import schema and limitations.
