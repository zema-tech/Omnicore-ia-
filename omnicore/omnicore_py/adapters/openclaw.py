"""OpenClaw adapter (Python) — face: POST {base}/api/v1/admin/rpc {id, method, params}.

Allowlist reale: status, commands.list, cron.*, agents.*, channels.status, ...
"""
from __future__ import annotations

import itertools
import json
import urllib.request
from datetime import datetime, timezone
from typing import Any

RPC_PATH = "/api/v1/admin/rpc"
_seq = itertools.count(1)


def rpc(base_url: str, method: str, params: dict | None = None, *, token: str = "", rpc_path: str = RPC_PATH) -> Any:
    body = {"id": f"omnicore-{next(_seq)}", "method": method, "params": params or {}}
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        base_url.rstrip("/") + rpc_path, data=json.dumps(body).encode(),
        headers=headers, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode() or "null")
    except Exception as e:
        raise RuntimeError(f"openclaw rpc {method} fail: {str(e)[:300]}") from e


def status(base_url: str, **kw) -> Any:
    return rpc(base_url, "status", {}, **kw)


def announce(base_url: str, message: str, **kw) -> Any:
    try:
        return rpc(base_url, "cron.add", {"job": {
            "name": "omnicore-announce",
            "schedule": {"kind": "once", "at": datetime.now(timezone.utc).isoformat()},
            "payload": {"kind": "announce", "message": message},
        }}, **kw)
    except Exception as e:
        return {"ok": False,
                "hint": f"announce via cron.add non riuscita ({str(e)[:200]}). Recapito live via gateway WS/canali.",
                "message": message}
