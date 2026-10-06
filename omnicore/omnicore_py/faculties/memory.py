"""Facolta MEMORIA (Python) — mirror di src/faculties/memory.ts.

Fonde: memoria nativa Omnicore + Hermes + sessioni unificate.
Solo search()/read()/remember() sono l'interfaccia pubblica.
"""
from __future__ import annotations

import re
from typing import Any

from ..config import load_config
from ..adapters import hermes
from ..mind.memory import recall_mem, remember as _store, recent_history


def search(query: str, limit: int = 5) -> dict:
    hits: list[dict[str, Any]] = []
    vias: list[str] = []

    try:
        for f in recall_mem(query, limit):
            hits.append({"source": "omnicore", "text": str(f.get("text", "")), "ts": f.get("ts")})
        vias.append("omnicore")
    except Exception:
        pass

    try:
        cfg = load_config()
        res = hermes.recall(query, limit, python=cfg["hermes_python"], hermes_dir=cfg["hermes_dir"])
        convs = (res or {}).get("conversations") or (res or {}).get("items") or []
        for c in list(convs)[:limit]:
            text = c if isinstance(c, str) else str(c)[:280]
            if text:
                hits.append({"source": "hermes", "text": text})
        vias.append("hermes")
    except Exception:
        pass

    try:
        for m in recent_history(4):
            text = str(m.get("text", ""))
            if text and re.search(r"ricord|chiamo|prefer|nome", query, re.I) and len(text) > 2:
                hits.append({"source": "session", "text": text[:200], "ts": m.get("ts")})
        vias.append("sessions")
    except Exception:
        pass

    return {"hits": hits[: limit * 2], "via": f"memory({'+'.join(vias) or 'empty'})"}


def read(key: str, limit: int = 50) -> Any:
    return hermes.read(key, limit)


def remember(text: str, intent: str = "chat") -> dict:
    try:
        return _store(text, intent)
    except Exception:
        return {"saved": 0, "total": 0}
