"""Config unificata (Python) — env > omnicore.config.json > default."""
from __future__ import annotations

import json
import os
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _json_config() -> dict:
    for p in (HERE.parent / "omnicore.config.json", HERE / "omnicore.config.json"):
        try:
            if p.exists():
                return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def load_config() -> dict:
    j = _json_config()
    vendors_hermes = str(HERE.parent.parent / "vendors" / "hermes")
    return {
        "hermes_python": os.environ.get("HERMES_PYTHON", "python3"),
        "hermes_dir": os.environ.get("HERMES_DIR", vendors_hermes),
        "opencode_url": os.environ.get("OPENCODE_URL", (j.get("opencode") or {}).get("baseUrl", "http://127.0.0.1:4096")),
        "opencode_password": os.environ.get("OPENCODE_SERVER_PASSWORD", ""),
        "openclaw_url": os.environ.get("OPENCLAW_URL", (j.get("openclaw") or {}).get("baseUrl", "http://127.0.0.1:18789")),
        "openclaw_token": os.environ.get("OPENCLAW_TOKEN", ""),
        "openclaw_rpc_path": ((j.get("openclaw") or {}).get("rpcPath", "/api/v1/admin/rpc")),
    }
