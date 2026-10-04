"""Router Omnicore (Python) — mirror di src/router.ts. Stesse keyword, stesso ordine."""
from __future__ import annotations

CODE_HINTS = (
    "fix", "bug", "refactor", "implementa", "implement", "commit", "test",
    "build", "codice", "code", "file", "repo", "pr ", "diff",
)
MEMORY_HINTS = (
    "ricordi", "remember", "skill", "cron", " eri ", "avevi detto",
    "riepiloga", "summar", "past", "ieri",
)


def classify(text: str) -> str:
    t = f" {text.lower()} "
    if any(k in t for k in CODE_HINTS):
        return "code"
    if any(k in t for k in MEMORY_HINTS):
        return "memory"
    s = t.strip()
    if s.startswith("/") or "deploy" in t or "gateway" in t:
        return "ops"
    return "chat"


def route(text: str) -> dict:
    intent = classify(text)
    handler = {"code": "opencode", "memory": "hermes", "ops": "openclaw"}.get(intent, "hermes")
    return {"intent": intent, "handler": handler}
