"""TRACE-X v7: localhost-only offline import/analysis server and dashboard host.

Run: python3 backend/v7_server.py --port 8765
Use this INSTEAD of python -m http.server; this server hosts both the UI and API.
"""
from __future__ import annotations
import argparse
from datetime import datetime,timezone
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
import hashlib
import json
import os
from pathlib import Path
import threading
import traceback
from urllib.parse import urlparse,unquote,quote
import uuid
from v7_pipeline import analyze

ROOT=Path(__file__).resolve().parent.parent
STORE=ROOT/'data'/'v7_datasets'
MAX_BYTES=30*1024*1024
STATE_LOCK=threading.RLock()
JOBS={}
ACTIVE=STORE/'active.json'
ALLOWED={'.csv','.json','.xml'}


def atomic_json(path,obj):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_name(path.name+'.tmp')
    temp.write_text(json.dumps(obj,indent=2),encoding='utf-8');os.replace(temp,path)


def current_id():
    try:return json.loads(ACTIVE.read_text())['id']
    except (FileNotFoundError,KeyError,ValueError):return None


def manifest(id):
    if not isinstance(id,str) or not id.startswith('ds_') or len(id)!=35 or not all(x in '0123456789abcdef' for x in id[3:]):return None
    p=STORE/id/'manifest.json'
    try:return json.loads(p.read_text())
    except (FileNotFoundError,ValueError):return None


def worker(dataset_id):
    with STATE_LOCK:
        j=JOBS[dataset_id];j['status']='processing';j['stage']='Running ingestion, graph, ML and evidence generation'
    d=STORE/dataset_id;meta=manifest(dataset_id)
    try:
        summary=analyze(d/'source'/meta['filename'],d/'results',dataset_id,meta['filename'],meta['sha256'])
        meta.update(summary);meta['status']='ready';meta['completed_at']=datetime.now(timezone.utc).isoformat()
        atomic_json(d/'manifest.json',meta)
        with STATE_LOCK:
            atomic_json(ACTIVE,{'id':dataset_id}) # only promote fully successful results
            j.update({'status':'ready','stage':'Complete — dataset activated','summary':summary})
    except Exception as e:
        meta['status']='failed';meta['error']=str(e)[:600];atomic_json(d/'manifest.json',meta)
        with STATE_LOCK:j.update({'status':'failed','stage':'Analysis failed; previous active dataset retained','error':str(e)[:600]})
        print(f'TRACE-X dataset {dataset_id} failed: {e}',flush=True)
        traceback.print_exc()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT/'dashboard'),**kw)
    def log_message(self,fmt,*args):print('[TRACE-X]',fmt%args)
    def json(self,code,obj):
        raw=json.dumps(obj,ensure_ascii=False).encode('utf-8');self.send_response(code)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(raw)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(raw)
    def send_artifact(self,path):
        if not path.is_file():return self.json(404,{'error':'No results for active dataset'})
        data=path.read_bytes();self.send_response(200);self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(data)
    def do_GET(self):
        route=urlparse(self.path).path
        if route=='/api/status':return self.json(200,{'version':'7.0','offline':True,'active_id':current_id(),'max_upload_bytes':MAX_BYTES})
        if route=='/api/datasets':
            records=[]
            for path in STORE.glob('ds_*/manifest.json'):
                try:records.append(json.loads(path.read_text()))
                except ValueError:continue
            records.sort(key=lambda r:r.get('created_at',''),reverse=True)
            return self.json(200,{'active_id':current_id(),'datasets':records})
        if route.startswith('/api/jobs/'):
            id=route[len('/api/jobs/'):]
            with STATE_LOCK:job=JOBS.get(id)
            if job:return self.json(200,dict(job))
            m=manifest(id)
            if m:return self.json(200,{'id':id,'status':m['status'],'error':m.get('error'),'summary':m if m['status']=='ready' else None})
            return self.json(404,{'error':'Unknown job'})
        if route in ('/api/data','/api/utxo','/api/model'):
            id=current_id()
            if not id:return self.json(404,{'error':'No dataset is active. Import a dataset first.'})
            path={'/api/data':'dashboard_data.json','/api/utxo':'utxo_evidence.json','/api/model':'model_report.json'}[route]
            return self.send_artifact(STORE/id/'results'/path)
        return super().do_GET()
    def do_POST(self):
        route=urlparse(self.path).path
        # The server binds only to loopback. Also check browser origin when supplied.
        origin=self.headers.get('Origin')
        if origin:
            try:
                o=urlparse(origin)
                if o.hostname not in ('localhost','127.0.0.1') or o.port!=self.server.server_port:
                    return self.json(403,{'error':'Cross-origin requests are not allowed'})
            except ValueError:return self.json(403,{'error':'Invalid origin'})
        try:size=int(self.headers.get('Content-Length','-1'))
        except ValueError:size=-1
        if size<0:return self.json(411,{'error':'Content-Length required'})
        if size>MAX_BYTES:return self.json(413,{'error':f'File too large; maximum {MAX_BYTES//1024//1024} MB'})
        if route=='/api/upload':
            raw_name=unquote(self.headers.get('X-File-Name',''))
            name=Path(raw_name.replace('\\','/')).name
            if not name or len(name)>160 or Path(name).suffix.lower() not in ALLOWED:
                return self.json(400,{'error':'Choose a .csv, .json or .xml file'})
            if size==0:return self.json(400,{'error':'Uploaded file is empty'})
            with STATE_LOCK:
                if any(j['status'] in ('queued','processing') for j in JOBS.values()):return self.json(409,{'error':'An import is already running. Wait until it finishes.'})
            raw=self.rfile.read(size)
            if len(raw)!=size:return self.json(400,{'error':'Incomplete upload'})
            id='ds_'+uuid.uuid4().hex;d=STORE/id;source=d/'source';source.mkdir(parents=True,exist_ok=True)
            (source/name).write_bytes(raw)
            meta={'id':id,'filename':name,'sha256':hashlib.sha256(raw).hexdigest(),'size_bytes':size,
                  'created_at':datetime.now(timezone.utc).isoformat(),'status':'processing'}
            atomic_json(d/'manifest.json',meta)
            with STATE_LOCK:JOBS[id]={'id':id,'status':'queued','stage':'Queued for local analysis'}
            threading.Thread(target=worker,args=(id,),daemon=True).start()
            return self.json(202,{'id':id,'status':'queued','message':'Import accepted. Results will activate only after successful analysis.'})
        if route=='/api/activate':
            if size>4096:return self.json(413,{'error':'Request too large'})
            try:payload=json.loads(self.rfile.read(size))
            except (ValueError,UnicodeDecodeError):return self.json(400,{'error':'Invalid JSON request'})
            id=payload.get('id') if isinstance(payload,dict) else None
            m=manifest(id)
            if not m or m.get('status')!='ready' or not (STORE/id/'results'/'dashboard_data.json').exists():
                return self.json(400,{'error':'Dataset is not available for activation'})
            with STATE_LOCK:atomic_json(ACTIVE,{'id':id})
            return self.json(200,{'active_id':id,'filename':m['filename']})
        return self.json(404,{'error':'Unknown local endpoint'})


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--port',type=int,default=8765);args=p.parse_args()
    STORE.mkdir(parents=True,exist_ok=True)
    http=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    print(f'TRACE-X v7 local server: http://localhost:{args.port}/console/ (CTRL+C to stop)',flush=True)
    print('No external API or network datasets. Dependencies must already be installed.',flush=True)
    try:http.serve_forever()
    except KeyboardInterrupt:pass
    finally:http.server_close()

if __name__=='__main__':main()
