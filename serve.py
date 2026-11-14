# Game server — run with: python3 serve.py
# Serves the project root at http://localhost:3000
# API endpoints:
#   GET  /api/party       — GM reads all submitted character sheets
#   POST /api/party       — Player pushes their character sheet
#   DELETE /api/party/:id — GM removes a character from the roster
#   GET  /api/store       — Player reads the session store config
#   POST /api/store       — GM writes the session store config
#   GET  /api/pregens            — read GM-curated pregens + hidden list
#   POST /api/pregens            — upsert a pregen
#   DELETE /api/pregens/:id      — delete a GM-created pregen
#   POST /api/pregens/visibility — toggle built-in pregen visibility
#   GET  /api/quickbuild-roles            — read GM-curated QB roles + hidden
#   POST /api/quickbuild-roles            — upsert a QB role
#   DELETE /api/quickbuild-roles/:id      — delete a GM-created role
#   POST /api/quickbuild-roles/visibility — toggle built-in role visibility

import http.server
import os
import socket
import json
import subprocess
import sys
import threading

# R-MSP4: honor a port from argv or $SERVE_PORT instead of silently ignoring it — a fixed port let a stale
# server on :3000 serve the WRONG tree to smokes (a false pass/fail). Precedence: argv[1] > $SERVE_PORT > 3000.
def _resolve_port():
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        return int(sys.argv[1])
    env = os.environ.get('SERVE_PORT')
    return int(env) if env and env.isdigit() else 3000

PORT = _resolve_port()
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# ── File-backed persistence ───────────────────────────────────────────
# GM data (pregens, QB roles) persists to gm_data/*.json so it survives
# server restarts. Party + store are session-ephemeral (in-memory only).
GM_DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gm_data')
os.makedirs(GM_DATA_DIR, exist_ok=True)

def _load_json(filename):
    path = os.path.join(GM_DATA_DIR, filename)
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None

def _save_json(filename, data):
    path = os.path.join(GM_DATA_DIR, filename)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, path)

# ── In-memory state ──────────────────────────────────────────────────
_party_lock = threading.Lock()
_party = {}

_store_lock = threading.Lock()
_store = None

_pregens_lock = threading.Lock()
_pregens_data = _load_json('pregens.json') or {'pregens': [], 'hidden': []}

_qb_lock = threading.Lock()
_qb_data = _load_json('quickbuild_roles.json') or {'roles': [], 'hidden': []}


class Handler(http.server.SimpleHTTPRequestHandler):

    # ── API routes ────────────────────────────────────────────────────
    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/__tree':   # R-MSP4: which git tree this server serves (run_smokes probes this)
            self._json_response(200, {'tree': _served_tree(), 'root': os.getcwd()})
            return
        if path == '/api/party':
            with _party_lock:
                data = list(_party.values())
            self._json_response(200, data)
        elif path == '/api/store':
            with _store_lock:
                self._json_response(200, _store)
        elif path == '/api/pregens':
            with _pregens_lock:
                self._json_response(200, _pregens_data)
        elif path == '/api/quickbuild-roles':
            with _qb_lock:
                self._json_response(200, _qb_data)
        else:
            # SPA fallback (T3b): a deep app route (extensionless, non-API) that maps to no real file
            # serves the app shell by prefix — mirroring the prod _redirects so dev == prod for deep links.
            # Static assets (anything with an extension) and real dirs fall through to the normal handler.
            fs_path = self.translate_path(self.path)
            if (not os.path.exists(fs_path)) and ('.' not in os.path.basename(path)):
                shell = ('player/index.html' if path.startswith('/player/')
                         else 'gm/index.html' if path.startswith('/gm/')
                         else 'dice/index.html' if path.startswith('/dice/')
                         else 'index.html')
                if os.path.isfile(shell):
                    self.path = '/' + shell
            super().do_GET()

    def do_POST(self):
        path = self.path.split('?')[0]
        if path == '/api/party':
            body = self._read_json()
            if body is None:
                return self._json_response(400, {'error': 'Invalid JSON'})
            char_id = body.get('id') or body.get('name') or 'unknown'
            with _party_lock:
                _party[char_id] = body
            print(f"  [party] {char_id} synced ({len(_party)} total)")
            self._json_response(200, {'ok': True, 'count': len(_party)})
        elif path == '/api/store':
            body = self._read_json()
            if body is None:
                return self._json_response(400, {'error': 'Invalid JSON'})
            global _store
            with _store_lock:
                _store = body
            count = len(body.get('curatedItems', [])) if body else 0
            print(f"  [store] updated ({count} items)")
            self._json_response(200, {'ok': True})
        elif path == '/api/pregens':
            body = self._read_json()
            if body is None:
                return self._json_response(400, {'error': 'Invalid JSON'})
            pregen_id = body.get('id')
            if not pregen_id:
                return self._json_response(400, {'error': 'Missing id'})
            with _pregens_lock:
                # Upsert: replace existing or append
                existing = [p for p in _pregens_data['pregens'] if p.get('id') != pregen_id]
                existing.append(body)
                _pregens_data['pregens'] = existing
                _save_json('pregens.json', _pregens_data)
            print(f"  [pregens] {body.get('name', pregen_id)} saved ({len(_pregens_data['pregens'])} total)")
            self._json_response(200, {'ok': True})
        elif path == '/api/pregens/visibility':
            body = self._read_json()
            if body is None or 'id' not in body:
                return self._json_response(400, {'error': 'Invalid JSON or missing id'})
            with _pregens_lock:
                hidden = set(_pregens_data.get('hidden', []))
                if body.get('hidden', False):
                    hidden.add(body['id'])
                else:
                    hidden.discard(body['id'])
                _pregens_data['hidden'] = list(hidden)
                _save_json('pregens.json', _pregens_data)
            print(f"  [pregens] {body['id']} hidden={body.get('hidden')}")
            self._json_response(200, {'ok': True})
        elif path == '/api/quickbuild-roles':
            body = self._read_json()
            if body is None:
                return self._json_response(400, {'error': 'Invalid JSON'})
            role_id = body.get('id')
            if not role_id:
                return self._json_response(400, {'error': 'Missing id'})
            with _qb_lock:
                existing = [r for r in _qb_data['roles'] if r.get('id') != role_id]
                existing.append(body)
                _qb_data['roles'] = existing
                _save_json('quickbuild_roles.json', _qb_data)
            print(f"  [qb-roles] {body.get('label', role_id)} saved ({len(_qb_data['roles'])} total)")
            self._json_response(200, {'ok': True})
        elif path == '/api/quickbuild-roles/visibility':
            body = self._read_json()
            if body is None or 'id' not in body:
                return self._json_response(400, {'error': 'Invalid JSON or missing id'})
            with _qb_lock:
                hidden = set(_qb_data.get('hidden', []))
                if body.get('hidden', False):
                    hidden.add(body['id'])
                else:
                    hidden.discard(body['id'])
                _qb_data['hidden'] = list(hidden)
                _save_json('quickbuild_roles.json', _qb_data)
            print(f"  [qb-roles] {body['id']} hidden={body.get('hidden')}")
            self._json_response(200, {'ok': True})
        else:
            self._json_response(404, {'error': 'Not found'})

    def do_DELETE(self):
        path = self.path.split('?')[0]
        if path.startswith('/api/party/'):
            char_id = path[len('/api/party/'):]
            with _party_lock:
                removed = _party.pop(char_id, None)
            if removed:
                print(f"  [party] {char_id} removed ({len(_party)} total)")
                self._json_response(200, {'ok': True})
            else:
                self._json_response(404, {'error': 'Not found'})
        elif path.startswith('/api/pregens/'):
            pregen_id = path[len('/api/pregens/'):]
            with _pregens_lock:
                before = len(_pregens_data['pregens'])
                _pregens_data['pregens'] = [p for p in _pregens_data['pregens'] if p.get('id') != pregen_id]
                if len(_pregens_data['pregens']) < before:
                    _save_json('pregens.json', _pregens_data)
                    print(f"  [pregens] {pregen_id} deleted ({len(_pregens_data['pregens'])} remaining)")
                    self._json_response(200, {'ok': True})
                else:
                    self._json_response(404, {'error': 'Not found'})
        elif path.startswith('/api/quickbuild-roles/'):
            role_id = path[len('/api/quickbuild-roles/'):]
            with _qb_lock:
                before = len(_qb_data['roles'])
                _qb_data['roles'] = [r for r in _qb_data['roles'] if r.get('id') != role_id]
                if len(_qb_data['roles']) < before:
                    _save_json('quickbuild_roles.json', _qb_data)
                    print(f"  [qb-roles] {role_id} deleted ({len(_qb_data['roles'])} remaining)")
                    self._json_response(200, {'ok': True})
                else:
                    self._json_response(404, {'error': 'Not found'})
        else:
            self._json_response(404, {'error': 'Not found'})

    # ── Helpers ───────────────────────────────────────────────────────
    def _read_json(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            raw = self.rfile.read(length)
            return json.loads(raw)
        except Exception:
            return None

    def _json_response(self, code, data):
        body = json.dumps(data).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def end_headers(self):
        path = self.path.split('?')[0]
        if path.endswith('.gz'):
            self.send_header('Content-Encoding', 'gzip')
            self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        print(f"  {args[0]} {args[1]}")

# ThreadingHTTPServer handles each request in its own thread, so aborted
# mobile requests cannot wedge the whole server with CLOSE_WAIT sockets.
# allow_reuse_address lets us restart without waiting for TIME_WAIT to clear.
class ReusableServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True

def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return None

def _served_tree():
    """R-MSP4/R-Y1-2: which git tree this server serves — so a wrong-tree run is visible, not silent.
    The static server serves the WORKING TREE (files on disk), so it appends `+dirty` when there are
    uncommitted changes: a smoke serving edits-on-top-of-HEAD must not read as a clean commit."""
    try:
        h = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()
        b = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], capture_output=True, text=True).stdout.strip()
        dirty = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True).stdout.strip()
        return f"{b}@{h}" + ("+dirty" if dirty else "")
    except Exception:
        return "unknown"

with ReusableServer(("", PORT), Handler) as httpd:
    print(f"Serving at http://localhost:{PORT}")
    ip = lan_ip()
    if ip:
        print(f"LAN access: http://{ip}:{PORT}")
    print(f"Root: {os.getcwd()}  (tree: {_served_tree()})")
    httpd.serve_forever()
