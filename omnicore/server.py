#!/usr/bin/env python3
"""Omnicore server — guscio HTTP sopra l'UNICO loop agente (TypeScript).

Uso:  python3 server.py [--port 8100]      (da omnicore/)
Poi:  http://127.0.0.1:8100               (dashboard)
       POST /api/chat   {text, session_id?} -> agent loop TS + log in sessione unica
       POST /api/chat/stream {text}  -> SSE live (token/tool_end/loop_end/result)
      POST /api/route  {text}              -> {intent, handler} (solo classifica, non esegue)
      POST /api/fuse   {text}              -> alias legacy di /api/chat (stesso loop TS)
      POST /api/omni   {source, text}      -> esegue OmniLang (DSL separata)
      GET  /api/sessions                   -> elenco sessioni uniche
      GET  /api/session?id=...             -> dettaglio sessione

Questo file NON pensa: ogni turno e delegato a
`node src/index.ts --agent` (core TypeScript, unico loop).
Le sessioni vivono in data/sessions.json: UN solo storico.
Node usato: $OMNICORE_NODE (default "node", richiesto >=22).
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent  # omnicore/
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "omniling" / "py"))

from omnicore_py.router import route  # noqa: E402
from omniling.parser import parse as omni_parse  # noqa: E402
from omniling.executor import run as omni_run  # noqa: E402

NODE = os.environ.get("OMNICORE_NODE", "node")
TS_ENTRY = HERE / "src" / "index.ts"
AGENT_TIMEOUT = float(os.environ.get("OMNICORE_AGENT_TIMEOUT", "120"))

# Tappa 6 — Bearer obbligatorio (fail-closed): senza OMNICORE_API_TOKEN le API
# rispondono 401 (solo /api/health resta aperto). Il token viaggia solo via env.
API_TOKEN = os.environ.get("OMNICORE_API_TOKEN", "")

DATA = HERE / "data"
SESSIONS_FILE = DATA / "sessions.json"
_lock = threading.Lock()


def _load() -> dict:
    try:
        return json.loads(SESSIONS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"sessions": {}}


def _save(db: dict) -> None:
    DATA.mkdir(exist_ok=True)
    tmp = SESSIONS_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(SESSIONS_FILE)


def _log(session_id: str | None, entry: dict) -> str:
    with _lock:
        db = _load()
        sessions = db.setdefault("sessions", {})
        if not session_id or session_id not in sessions:
            session_id = f"s{int(time.time() * 1000)}"
            sessions[session_id] = {"id": session_id, "created": time.time(), "messages": []}
        sessions[session_id]["messages"].append({"ts": time.time(), **entry})
        _save(db)
        return session_id


def _agent_turn(text: str, directory: str = "") -> dict:
    """UNICO percorso di pensiero: un turno dell'agent loop TypeScript.

    Ritorna il dict dell'agent (agent/text/intent/plan/trace/reply/system)
    oppure {"error": ...} se node non parte. MAI fallback su altre pipeline:
    se il core non risponde, l'errore e onesto e visibile.
    """
    cmd = [NODE, "--experimental-strip-types", str(TS_ENTRY), "--agent", text]
    if directory:
        cmd += ["--dir", directory]
    t0 = time.time()
    try:
        p = subprocess.run(cmd, capture_output=True, text=True,
                           timeout=AGENT_TIMEOUT, cwd=str(HERE))
    except FileNotFoundError:
        return {"intent": "chat", "handler": "none", "text": text, "plan": [],
                "trace": [], "reply": "",
                "error": f"node non trovato ({NODE}): imposta OMNICORE_NODE o installa Node >=22."}
    except subprocess.TimeoutExpired:
        return {"intent": "chat", "handler": "none", "text": text, "plan": [],
                "trace": [], "reply": "",
                "error": f"agent loop oltre {AGENT_TIMEOUT:g}s: nessun fallback, riprova."}
    out = (p.stdout or "").strip()
    try:
        res = json.loads(out)
    except Exception:
        res = {"intent": "chat", "handler": "none", "text": text, "plan": [],
               "trace": [], "reply": "",
               "error": f"agent output non-JSON (exit {p.returncode}): {(out or p.stderr or '')[:200]}"}
    res["elapsed_ms"] = int((time.time() - t0) * 1000)
    return res


def _trace_summary(res: dict) -> str:
    parts = []
    for t in res.get("trace", []):
        if t.get("name") == "respond":
            continue
        parts.append(f"{t.get('name')}:{'ok' if t.get('ok') else 'ko'}")
    return " | ".join(parts) or "nessun tool"


class Handler(BaseHTTPRequestHandler):
    server_version = "Omnicore/0.2"

    def _auth(self) -> bool:
        """True se la richiesta passa il Bearer. Fail-closed senza token configurato."""
        import hmac
        if not API_TOKEN:
            return False
        got = self.headers.get("Authorization", "")
        return hmac.compare_digest(got, f"Bearer {API_TOKEN}")

    def _guard(self) -> bool:
        """Rifiuta 401 le API senza auth. Ritorna True se si puo procedere."""
        if self.path == "/api/health" or not self.path.startswith("/api/"):
            return True
        if not self._auth():
            hint = "imposta OMNICORE_API_TOKEN sul server e invia Authorization: Bearer <token>" \
                if not API_TOKEN else "token mancante o errato"
            self._json({"error": f"non autorizzato ({hint})"}, 401)
            return False
        return True

    def _json(self, obj, code: int = 200) -> None:
        body = json.dumps(obj, ensure_ascii=False, default=str).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> dict:
        try:
            n = int(self.headers.get("Content-Length", 0))
        except ValueError:
            n = 0
        if not n:
            return {}
        try:
            return json.loads(self.rfile.read(n).decode("utf-8") or "{}")
        except Exception:
            return {}

    def do_GET(self) -> None:  # noqa: N802
        if not self._guard():
            return
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path in ("/", "/index.html"):
            page = (HERE / "dashboard.html").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(page)))
            self.end_headers()
            self.wfile.write(page)
            return
        if parsed.path == "/api/health":
            self._json({"ok": True, "service": "omnicore"})
            return
        if parsed.path == "/api/sessions":
            with _lock:
                db = _load()
            self._json([{"id": s["id"], "created": s["created"],
                         "count": len(s["messages"]),
                         "last": s["messages"][-1]["text"][:80] if s["messages"] else ""}
                        for s in sorted(db["sessions"].values(), key=lambda x: x["created"])])
            return
        if parsed.path == "/api/session":
            q = urllib.parse.parse_qs(parsed.query)
            with _lock:
                s = _load()["sessions"].get((q.get("id") or [""])[0])
            if s is None:
                self._json({"error": "sessione non trovata"}, 404)
            else:
                self._json(s)
            return
        self._json({"error": "not found"}, 404)

    def do_POST(self) -> None:  # noqa: N802
        if not self._guard():
            return
        body = self._body()
        if self.path == "/api/route":
            text = str(body.get("text", ""))
            # Facciata Omnicore: il router Python è un mirror legacy con nomi
            # vendor — rimappati su facoltà prima di rispondere.
            r = route(text)
            facciata = {"opencode": "code", "hermes": "memory", "openclaw": "presence"}.get(
                r.get("handler", ""), "memory"
            )
            self._json({"intent": r.get("intent"), "handler": facciata, "text": text})
            return
        if self.path == "/api/fuse":
            # Alias legacy: STESSO unico loop agente di /api/chat, nessuna seconda pipeline.
            self._json(_agent_turn(str(body.get("text", ""))))
            return
        if self.path == "/api/omni":
            try:
                ast = omni_parse(str(body.get("source", "")))
                self._json(omni_run(ast, str(body.get("text", "ciao"))))
            except SyntaxError as e:
                self._json({"error": f"sintassi: {e}"}, 400)
            except Exception as e:
                self._json({"error": str(e)[:300]}, 500)
            return
        if self.path == "/api/chat":
            text = str(body.get("text", ""))
            res = _agent_turn(text)
            trace = res.get("trace", [])
            ok = all(t.get("ok", False) for t in trace if t.get("name") != "respond") \
                if trace else False
            sid = _log(body.get("session_id") or None,
                       {"text": text, "intent": res.get("intent", "chat"),
                        "handler": "agent", "ok": ok,
                        "answer": str(res.get("reply", "") or res.get("error", ""))[:2000],
                        "summary": _trace_summary(res)})
            self._json({**res, "session_id": sid})
            return
        if self.path == "/api/chat/stream":
            # SSE live: righe NDJSON di `node --stream` girate come eventi.
            text = str(body.get("text", ""))
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            try:
                p = subprocess.Popen(
                    [NODE, "--experimental-strip-types", str(TS_ENTRY),
                     "--stream", text],
                    stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                    text=True, cwd=str(HERE), bufsize=1)
            except FileNotFoundError:
                self.wfile.write(f"data: {json.dumps({'event': 'error', 'error': 'node non trovato'})}\n\n".encode())
                return
            assert p.stdout is not None
            try:
                for line in p.stdout:
                    line = line.strip()
                    if not line:
                        continue
                    self.wfile.write(f"data: {line}\n\n".encode())
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
            finally:
                try:
                    p.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    p.kill()
            return
        self._json({"error": "not found"}, 404)

    def log_message(self, fmt, *args) -> None:  # silenzioso
        pass


def main() -> None:
    port = int(os.environ.get("OMNICORE_PORT", "8100"))
    host = os.environ.get("OMNICORE_HOST", "127.0.0.1")
    if "--port" in sys.argv:
        port = int(sys.argv[sys.argv.index("--port") + 1])
    if host not in ("127.0.0.1", "localhost", "::1") and not API_TOKEN:
        print("RIFIUTO: bind non-localhost senza OMNICORE_API_TOKEN. "
              "Imposta il token o usa OMNICORE_HOST=127.0.0.1.", flush=True)
        sys.exit(2)
    srv = ThreadingHTTPServer((host, port), Handler)
    if API_TOKEN:
        print(f"omnicore su http://{host}:{port}  (dashboard + API unica, Bearer attivo)", flush=True)
    else:
        print(f"omnicore su http://{host}:{port}  (ATTENZIONE: OMNICORE_API_TOKEN non impostato — API rifiutate 401 fail-closed)", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
