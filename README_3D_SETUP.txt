TRACE-X 3D RELATIONSHIP LAB — OFFLINE UPGRADE
==========================================
This is a SOURCE UPDATE for the existing TRACE-X repository, not a replacement for its Python backend.

WHAT IT ADDS
- 3D perspective orbit visualizer (mouse drag to rotate, mouse wheel to zoom).
- Whole-network and N-hop focus modes, search, selection, camera presets.
- Entity relationships (INFERRED AGGREGATES) from money_graph.edges.
- Wallet > TXID > wallet observations (SAMPLED, not verified spends) from the selected alert's graph evidence.
- Verified UTXO outpoint references using utxo_edges. No made-up links when original data lacks prev_txid:vout.
- Animated flow direction; timestamp SAMPLE replay; directed reachability; PNG and JSON export.
- All graphics are generated locally using the browser's Canvas 2D with 3D camera projection (no WebGL, CDNs, or npm build).

INSTALL FROM WINDOWS POWERSHELL (GitHub project laptop)
1) Download TRACE-X-3D-UPDATE.zip into your Downloads folder.
2) In Windows PowerShell:

cd "$env:USERPROFILE\Downloads\tracex_v7_dynamic_dataset"
Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\TRACE-X-3D-UPDATE.zip" -DestinationPath . -Force
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\install_graph3d.ps1

Alternative if you prefer Python:
py -3 .\tools\install_graph3d.py

3) Verify and publish to your existing GitHub/Vercel pipeline:

git status --short
git add .
git commit -m "Add offline 3D transaction graph explorer"
git push origin main

Vercel's GitHub integration should automatically redeploy the updated netlify-demo root.
After successful deployment, open:
https://trace-x-netlify-demo.vercel.app/#graph3d

INSTALL FROM WSL (offline investigation laptop)
cd "/mnt/c/Users/Ryan Rithwik"   # adjust to the folder containing backend/ and dashboard/
unzip -oq /mnt/c/Users/Ryan\ Rithwik/Downloads/TRACE-X-3D-UPDATE.zip -d .   # adjust ZIP location
python3 tools/install_graph3d.py
source .venv_v7_fixed/bin/activate
python backend/v7_server.py --port 8765
Open http://localhost:8765/console/#graph3d

NOTE: YOUR LOCAL WSL PROJECT LOCATION MAY DIFFER. The installer expects to run inside the repo root.

DASHBOARD VIEW MODES
- Inferred entity flows: topology based on aggregate relationships, NOT proof that the same coins traversed a multi-hop path.
- Sampled wallet graph: address > TXID > address observations; not exact UTXO provenance.
- Explicit UTXO: only matched prev_txid:vout references in the audit; zero edges for wallet-only CSVs is correct.
- Chronological playback uses exported sample times, and may hide edges without timestamps. It is not a complete ledger replay.

CONTROLS: drag to orbit, SHIFT+drag or right drag to pan, wheel to zoom, double-click a node to focus, click to inspect, Full Network/Focused Hops selection, Replay, PNG/JSON export.

SECURITY: This demo frontend must not be uploaded with confidential investigation datasets. It uses existing data exports and contains no third-party requests.

VALIDATION: node --check graph3d.js succeeded. Offline data-shape tests passed for entity, wallet, UTXO, and wallet-only provenance. Browser automation could not run in this sandbox, so test the UI on your own laptop before the jury demo.
