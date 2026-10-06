"""Facolta CODICE (Python) — mirror di src/faculties/code.ts."""
from __future__ import annotations

import json

from ..config import load_config
from ..adapters import opencode


def run(prompt: str, *, directory: str = "") -> dict:
    cfg = load_config()
    try:
        data = opencode.prompt_server(prompt, base_url=cfg["opencode_url"],
                                      password=cfg["opencode_password"], directory=directory)
        out = data if isinstance(data, str) else json.dumps(data, ensure_ascii=False, indent=2)
        return {"ok": True, "via": "code(opencode-serve)", "output": out[:4000]}
    except Exception as e1:
        try:
            cli = opencode.prompt_cli(prompt, directory=directory)
            return {"ok": True, "via": "code(opencode-cli)", "output": cli[:4000]}
        except Exception as e2:
            return {"ok": False, "via": "code(opencode)",
                    "output": f"mani non raggiungibili: {str(e1)[:200]} | cli: {str(e2)[:200]}. "
                              f"Avvia 'opencode serve' o installa la CLI, poi riprova."}
