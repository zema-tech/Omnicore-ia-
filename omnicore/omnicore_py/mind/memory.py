"""Memoria unificata Omnicore (stdlib only).

DEPRECATO (Tappa 1): il core e TypeScript (`src/mind/memory.ts`). Vedi header
di `omnicore_py/mind/__init__.py`.

Una sola memoria, qualunque backend abbia gestito la richiesta:
  data/memory.json  <- fatti estratti (max 300, con ts + intent)
  data/sessions.json <- storico conversazioni (gia esistente, letto come contesto)

Estrazione fatti euristica: frasi con "ricorda/ricordati/mi chiamo/preferisco/
sono .../lavoro con/il mio ... e ...". Niente embedding: scoring a keyword
overlap, veloce e deterministico su Termux.
"""
from __future__ import annotations

import json
import re
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent.parent  # omnicore/
DATA = HERE / "data"
MEM_FILE = DATA / "memory.json"
MAX_FACTS = 300

_FACT_RE = re.compile(
    r"(ricordati che|ricorda che|ricorda:|mi chiamo|il mio nome e|preferisco|"
    r"lavoro con|uso spesso|il mio .*? e |sono un|sono una|abito a|vivo a)",
    re.IGNORECASE,
)


def _load() -> list:
    try:
        d = json.loads(MEM_FILE.read_text(encoding="utf-8"))
        return d.get("facts", []) if isinstance(d, dict) else []
    except Exception:
        return []


def _save(facts: list) -> None:
    DATA.mkdir(exist_ok=True)
    tmp = MEM_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps({"facts": facts[-MAX_FACTS:]}, ensure_ascii=False, indent=2),
                   encoding="utf-8")
    tmp.replace(MEM_FILE)


def _tokens(s: str) -> set:
    return {w for w in re.findall(r"[a-zà-ÿ0-9]{3,}", s.lower()) if len(w) > 2}


def remember(text: str, intent: str = "chat") -> dict:
    """Estrae e salva fatti dal messaggio. Ritorna {saved: n}."""
    facts = _load()
    saved = 0
    # spezza in frasi, tieni SOLO quelle con marcatori espliciti (niente autosave rumoroso)
    sents = [s.strip() for s in re.split(r"[.\n!?]+", text) if s.strip()]
    # mai salvare domande (finiscono con ?) o frasi troppo corte: solo affermazioni
    is_q = text.strip().endswith("?")
    cands = [s for s in sents if _FACT_RE.search(s) and len(s) > 12][:2]
    if is_q:
        cands = []
    for s in cands:
        if len(s) < 4:
            continue
        if any(s.lower() == f.get("text", "").lower() for f in facts):
            continue
        facts.append({"text": s[:280], "intent": intent, "ts": time.time()})
        saved += 1
    if saved:
        _save(facts)
    return {"saved": saved, "total": len(facts)}


def recall_mem(query: str, limit: int = 5) -> list:
    """Top-N fatti per overlap lessicale. Sempre lista (mai throw)."""
    facts = _load()
    if not facts or not query.strip():
        return []
    q = _tokens(query)
    scored = []
    for f in facts:
        t = _tokens(f.get("text", ""))
        overlap = len(q & t)
        if overlap:
            scored.append((overlap, f.get("ts", 0), f))
    scored.sort(key=lambda x: (x[0], x[1]), reverse=True)
    return [f for _, _, f in scored[:limit]]


def recent_history(limit_msgs: int = 8) -> list:
    """Ultimi messaggi da sessions.json come contesto (best-effort)."""
    try:
        db = json.loads((DATA / "sessions.json").read_text(encoding="utf-8"))
        msgs: list = []
        for s in db.get("sessions", {}).values():
            msgs.extend(s.get("messages", [])[-3:])
        return msgs[-limit_msgs:]
    except Exception:
        return []
