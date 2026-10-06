"""Facolta PRESENZA (Python) — mirror di src/faculties/channel.ts."""
from __future__ import annotations

from typing import Any

from ..config import load_config
from ..adapters import openclaw


def _cfg() -> dict:
    c = load_config()
    return {"base_url": c["openclaw_url"], "token": c["openclaw_token"],
            "rpc_path": c["openclaw_rpc_path"]}


def status() -> Any:
    c = _cfg()
    return openclaw.status(c["base_url"], token=c["token"], rpc_path=c["rpc_path"])


def announce(message: str, targets: list[str] | None = None) -> dict:
    c = _cfg()
    text = f"[to:{','.join(targets)}] {message}" if targets else message
    try:
        detail = openclaw.announce(c["base_url"], text, token=c["token"], rpc_path=c["rpc_path"])
        if isinstance(detail, dict) and detail.get("ok") is False:
            return {"ok": False, "detail": detail}
        return {"ok": True, "detail": detail}
    except Exception as e:
        return {"ok": False,
                "detail": f"gateway non raggiungibile ({str(e)[:160]}). "
                          f"Messaggio trattenuto: {message[:200]}"}
