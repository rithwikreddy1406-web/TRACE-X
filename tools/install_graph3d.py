"""Idempotent TRACE-X 3D addon installer.
Run in a TRACE-X repository root: python tools/install_graph3d.py
No network dependencies. Edits ONLY the console JS, HTML, and adds addon files.
"""
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
ADDON = ROOT / "addons"


def update_app(path: Path):
    text = path.read_text(encoding="utf-8")
    if "graph3d:window.traceX3DPage" in text:
        print(f"Already installed: {path.relative_to(ROOT)}")
        return
    needle = "data:v7DataPage}[state.route];$('app').innerHTML=r();save();}"
    patch = "data:v7DataPage,graph3d:window.traceX3DPage}[state.route];$('app').innerHTML=r();save();if(state.route==='graph3d')window.traceX3DMount?.();else window.traceX3DStop?.();}"
    if text.count(needle) != 1:
        raise RuntimeError(f"Cannot find expected TRACE-X v7 route mapping in {path}; leaving existing file unchanged")
    path.write_text(text.replace(needle, patch), encoding="utf-8")
    print(f"Added route: {path.relative_to(ROOT)}")


def update_html(path: Path):
    text=path.read_text(encoding="utf-8")
    marker='<script src="v8.js" defer></script>'
    if marker not in text:
        raise RuntimeError(f"Missing v8 loader in {path}; leaving existing file unchanged")
    if '<script src="graph3d.js" defer></script>' not in text:
        text=text.replace(marker, marker+'<script src="graph3d.js" defer></script>')
    if '<link rel="stylesheet" href="graph3d.css">' not in text:
        style='<link rel="stylesheet" href="styles.css">'
        if style not in text:raise RuntimeError(f"Missing stylesheet in {path}")
        text=text.replace(style,style+'<link rel="stylesheet" href="graph3d.css">')
    path.write_text(text,encoding="utf-8")
    print(f"Updated loader: {path.relative_to(ROOT)}")



def main():
    if not (ADDON/'graph3d.js').exists():
        raise SystemExit("Missing addons/graph3d.js (extract the update ZIP into repo root first).")
    updated=0
    for dirname in ['dashboard/console', 'netlify-demo']:
        target=ROOT/dirname
        if not (target/'app.js').is_file():
            print(f"Skipping missing: {dirname}/app.js");continue
        if not (target/'index.html').is_file():
            print(f"Skipping missing: {dirname}/index.html");continue
        update_app(target/'app.js')
        update_html(target/'index.html')
        v6file=target/'v6.js'
        if v6file.is_file():
            old=v6file.read_text(encoding='utf-8')
            if "if(state.route==='provenance')render();" in old:
                v6file.write_text(old.replace("if(state.route==='provenance')render();","if(state.route==='provenance'||state.route==='graph3d')render();"),encoding='utf-8')
                print(f"Linked provenance loader: {v6file.relative_to(ROOT)}")
        for file in ['graph3d.js','graph3d.css']:
            shutil.copyfile(ADDON/file,target/file)
            print(f"Copied: {dirname}/{file}")
        updated+=1
    if updated==0:raise SystemExit("No TRACE-X frontend found. Run from the original TRACE-X repo, not an empty folder.")
    print(f"SUCCESS: Installed 3D graph in {updated} frontend(s). Open #graph3d on local or Vercel dashboard.")


if __name__=='__main__':main()
