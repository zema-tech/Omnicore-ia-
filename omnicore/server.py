#!/usr/bin/env python3
"""Omnicore server — UNICA API + sessioni uniche + dashboard. Solo stdlib.

Uso:  python3 server.py [--port 8100]      (da omnicore/)
Poi:  http://127.0.0.1:8100               (dashboard)
      POST /api/chat   {text, session_id?} -> fuse + log in sessione unica
      POST /api/route  {text}              -> {intent, handler}
      POST /api/fuse   {text}              -> pipeline brain->hands->face
      POST /api/omni   {source, text}      -> esegue OmniLang
      GET  /api/sessions                   -> elenco sessioni uniche
      GET  /api/session?id=...             -> dettaglio sessione

Le sessioni vivono in data/sessions.json: UN solo storico, qualunque
backend (hermes/opencode/openclaw) abbia gestito la richiesta.
"""
from __future__ import annotations

import json
import os
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
from omnicore_py.pipeline import fuse  # noqa: E402
from omniling.parser import parse as omni_parse  # noqa: E402
from omniling.executor import run as omni_run  # noqa: E402

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


class Handler(BaseHTTPRequestHandler):
    server_version = "Omnicore/0.2"

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
        body = self._body()
        if self.path == "/api/route":
            text = str(body.get("text", ""))
            self._json({**route(text), "text": text})
            return
        if self.path == "/api/fuse":
            try:
                self._json(fuse(str(body.get("text", ""))))
            except Exception as e:
                self._json({"error": str(e)[:300]}, 500)
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
            try:
                res = fuse(text)
            except Exception as e:
                res = {"intent": "chat", "handler": "none", "text": text,
                       "steps": [], "error": str(e)[:300]}
            ok = all(s.get("ok", False) for s in res.get("steps", []) if s.get("step") != "face") \
                if res.get("steps") else False
            sid = _log(body.get("session_id") or None,
                       {"text": text, "intent": res.get("intent"),
                        "handler": res.get("handler"), "ok": ok,
                        "summary": "; ".join(
                            f"{s.get('step')}:{'ok' if s.get('ok') else 'ko'}"
                            for s in res.get("steps", []))})
            self._json({**res, "session_id": sid})
            return
        self._json({"error": "not found"}, 404)

    def log_message(self, fmt, *args) -> None:  # silenzioso
        pass


def main() -> None:
    port = int(os.environ.get("OMNICORE_PORT", "8100"))
    if "--port" in sys.argv:
        port = int(sys.argv[sys.argv.index("--port") + 1])
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"omnicore su http://127.0.0.1:{port}  (dashboard + API unica)", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
