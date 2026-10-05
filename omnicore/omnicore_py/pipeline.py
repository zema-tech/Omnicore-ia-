"""Pipeline di fusione (Python): brain -> hands -> face -> MIND (sintesi).
Mai throw: ogni step ha ok/error; fuse() ritorna sempre anche `answer`."""
from __future__ import annotations

from typing import Any
from .router import route
from .config import load_config
from .adapters import hermes, opencode, openclaw


def _err(e: Exception) -> str:
    return str(e)[:300]


def fuse(text: str, *, directory: str = "") -> dict:
    cfg = load_config()
    r = route(text)
    intent, handler = r["intent"], r["handler"]
    steps: list[dict[str, Any]] = []

    try:
        brain = hermes.recall(text, 5, python=cfg["hermes_python"], hermes_dir=cfg["hermes_dir"])
        steps.append({"step": "brain", "via": "hermes(mcp_serve.py: conversations_list) [python]", "ok": True, "result": brain})
    except Exception as e:
        steps.append({"step": "brain", "via": "hermes(mcp_serve.py) [python]", "ok": False, "error": _err(e)})

    if intent == "code":
        try:
            hands = opencode.prompt_server(text, base_url=cfg["opencode_url"],
                                           password=cfg["opencode_password"], directory=directory)
            steps.append({"step": "hands", "via": "opencode(serve /session) [http]", "ok": True, "result": hands})
        except Exception as e1:
            try:
                cli = opencode.prompt_cli(text, directory=directory)
                steps.append({"step": "hands", "via": "opencode(run --format json) [cli]", "ok": True, "result": cli[:2000]})
            except Exception as e2:
                steps.append({"step": "hands", "via": "opencode [http+cli]", "ok": False,
                              "error": f"{_err(e1)} | cli: {_err(e2)}"})
    else:
        steps.append({"step": "hands", "via": "opencode [skip: intent!=code]", "ok": True, "result": "skipped"})

    try:
        face = openclaw.status(cfg["openclaw_url"], token=cfg["openclaw_token"], rpc_path=cfg["openclaw_rpc_path"])
        steps.append({"step": "face", "via": "openclaw(POST /api/v1/admin/rpc status) [http]", "ok": True, "result": face})
    except Exception as e:
        steps.append({"step": "face", "via": "openclaw(admin-http-rpc) [http]", "ok": False, "error": _err(e)})

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
