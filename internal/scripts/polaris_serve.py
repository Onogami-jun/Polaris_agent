#!/usr/bin/env python3
import sys, json, threading, traceback
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

# Support both dev (project root) and user (~/.polaris/models) paths
MODEL_PATH = Path(os.environ.get('POLARIS_MODEL_DIR', str(Path(__file__).parent.parent.parent / 'polaris-merged')))
HOST = '127.0.0.1'
PORT = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[1] == '--port' else 8080

_model = None; _tokenizer = None; _lock = threading.Lock()

def load_model():
    global _model, _tokenizer
    if _model is not None: return
    with _lock:
        if _model is not None: return
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
        print(f'[serve] loading model from {MODEL_PATH}...')
        _model = AutoModelForCausalLM.from_pretrained(
            str(MODEL_PATH), dtype=torch.float32, device_map='cpu', trust_remote_code=True, local_files_only=True)
        _model.eval()
        _tokenizer = AutoTokenizer.from_pretrained(str(MODEL_PATH), trust_remote_code=True, local_files_only=True)
        if _tokenizer.pad_token is None: _tokenizer.pad_token = _tokenizer.eos_token
        print(f'[serve] ready ({sum(p.numel() for p in _model.parameters())/1e6:.0f}M params)')

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def do_GET(self):
        self.send_response(200); self.send_header('Content-Type','application/json'); self.end_headers()
        self.wfile.write(json.dumps({'status':'ok','model':'polaris-opt-0.5b'}).encode())

    def do_POST(self):
        try:
            cl = int(self.headers.get('Content-Length', 0))
            raw = self.rfile.read(cl) if cl > 0 else b'{}'
            body = json.loads(raw.decode('utf-8', errors='replace'))
        except Exception:
            self._error(400, 'bad json body')
            return

        try:
            if self.path in ('/completion', '/v1/completions'):
                prompt = body.get('prompt', '')
                result = self._gen(prompt, body.get('max_tokens', 200), body.get('temperature', 0.1))
                self._ok({'content': result, 'stop_reason': 'eos'})
            elif self.path == '/chat/completions':
                msgs = body.get('messages', [])
                prompt = ''
                for m in msgs:
                    r = m.get('role','user'); c = m.get('content','')
                    if r == 'system': prompt += f'<|system|>\n{c}\n'
                    elif r == 'user': prompt += f'<|user|>\n{c}\n'
                    elif r == 'assistant': prompt += f'<|assistant|>\n{c}\n'
                prompt += '<|assistant|>\n'
                result = self._gen(prompt, body.get('max_tokens', 200), body.get('temperature', 0.1))
                self._ok({'choices':[{'message':{'content':result}}]})
            else:
                self._error(404, 'not found')
        except Exception as e:
            traceback.print_exc()
            self._error(500, str(e))

    def _gen(self, prompt, max_tok, temp):
        import torch; load_model()
        inp = _tokenizer(prompt, return_tensors='pt', truncation=True, max_length=1024)
        with torch.no_grad():
            out = _model.generate(**inp, max_new_tokens=min(max_tok,512),
                temperature=min(temp,1.0), do_sample=temp>0.05, pad_token_id=_tokenizer.eos_token_id)
        res = _tokenizer.decode(out[0], skip_special_tokens=True)
        if res.startswith(prompt): res = res[len(prompt):]
        return res.strip()

    def _ok(self, data):
        self.send_response(200); self.send_header('Content-Type','application/json'); self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode())

    def _error(self, code, msg):
        self.send_response(code); self.end_headers()
        self.wfile.write(json.dumps({'error':msg}).encode())

if __name__ == '__main__':
    load_model()
    srv = HTTPServer((HOST, PORT), Handler)
    print(f'[serve] http://{HOST}:{PORT}')
    try: srv.serve_forever()
    except KeyboardInterrupt: srv.shutdown()
