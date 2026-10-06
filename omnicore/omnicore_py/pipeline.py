"""Pipeline di fusione (Python): memoria -> codice -> presenza -> MENTE (sintesi).
Mai throw: ogni step ha ok/error; fuse() ritorna sempre anche `answer`."""
from __future__ import annotations

from typing import Any
from .router import route
from .faculties import memory, code, channel


def _err(e: Exception) -> str:
    return str(e)[:300]


def fuse(text: str, *, directory: str = "") -> dict:
    r = route(text)
    intent, handler = r["intent"], r["handler"]
    steps: list[dict[str, Any]] = []

    try:
        brain = memory.search(text, 5)
        steps.append({"step": "brain", "via": brain["via"], "ok": True, "result": brain["hits"]})
    except Exception as e:
        steps.append({"step": "brain", "via": "memory(facolta)", "ok": False, "error": _err(e)})

    if intent == "code":
        hands = code.run(text, directory=directory)
        steps.append({"step": "hands", "via": hands["via"], "ok": hands["ok"],
                      **({"result": hands["output"][:2000]} if hands["ok"]
                         else {"error": hands["output"][:300]})})
    else:
        steps.append({"step": "hands", "via": "code [skip: intent!=code]", "ok": True, "result": "skipped"})

    try:
        face = channel.status()
        steps.append({"step": "face", "via": "channel(openclaw status)", "ok": True, "result": face})
    except Exception as e:
        steps.append({"step": "face", "via": "channel(openclaw)", "ok": False, "error": _err(e)})

    # 4) MIND — sintesi a vera IA (LLM se configurato, altrimenti euristica offline)
    try:
        from .mind.synth import synthesize
        mind = synthesize(text, intent, steps)
    except Exception as e:
        mind = {"answer": f"Sono Omnicore: ho recepito “{text}”. ({str(e)[:120]})",
                "via": "fallback", "model": "none"}
    return {"intent": intent, "handler": handler, "text": text, "steps": steps,
            "answer": mind.get("answer"), "mind": {"via": mind.get("via"), "model": mind.get("model")},
            "identity": "omnicore"}
