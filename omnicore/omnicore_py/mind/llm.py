"""LLM provider unificato (stdlib only).

DEPRECATO (Tappa 1): il core e TypeScript (`src/mind/llm.ts`). Vedi header
di `omnicore_py/mind/__init__.py`.

Priorita:
  1. OpenAI-compatible: OMNICORE_LLM_BASE_URL + MODEL (+ API_KEY se serve).
     Esempi: https://openrouter.ai/api/v1 , http://127.0.0.1:1234/v1 (LM Studio),
     http://127.0.0.1:11434/v1 (Ollama OpenAI-compat).
  2. Ollama nativo: OLLAMA_HOST (default http://127.0.0.1:11434) POST /api/generate.
  3. None -> il chiamante usa la sintesi euristica offline (vera risposta,
     non JSON dump, ma senza creativita LLM).

Nessuna dipendenza: solo urllib + json.
"""
from __future__ import annotations

import json
import os
import urllib.request


def llm_config() -> dict:
    return {
        "base_url": os.environ.get("OMNICORE_LLM_BASE_URL", "").rstrip("/"),
        "api_key": os.environ.get("OMNICORE_LLM_API_KEY", ""),
        "model": os.environ.get("OMNICORE_LLM_MODEL", "omnicore-fusion"),
        "timeout": float(os.environ.get("OMNICORE_LLM_TIMEOUT", "30")),
        "ollama": os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/"),
    }


def llm_status() -> dict:
    c = llm_config()
    return {
        "openai_compat": bool(c["base_url"]),
        "model": c["model"] if c["base_url"] else "",
        "ollama_host": c["ollama"],
    }


def _post(url: str, payload: dict, headers: dict | None = None, timeout: float = 30.0) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body,
                                 headers={"Content-Type": "application/json", **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8") or "{}")


def chat(system: str, user: str, *, max_tokens: int = 800) -> str | None:
    """Ritorna il testo risposta, o None se nessun backend raggiungibile."""
    c = llm_config()
    # 1) OpenAI-compatible
    if c["base_url"]:
        try:
            h = {"Authorization": f"Bearer {c['api_key']}"} if c["api_key"] else {}
            res = _post(f"{c['base_url']}/chat/completions",
                        {"model": c["model"],
                         "messages": [{"role": "system", "content": system},
                                      {"role": "user", "content": user}],
                         "max_tokens": max_tokens, "temperature": 0.6},
                        h, c["timeout"])
            txt = (res.get("choices") or [{}])[0].get("message", {}).get("content", "")
            if txt and txt.strip():
                return txt.strip()
        except Exception:
            pass
    # 2) Ollama nativo (modello: OMNICORE_LLM_MODEL o llama3.1)
    try:
        model = os.environ.get("OMNICORE_LLM_MODEL", "llama3.1")
        res = _post(f"{c['ollama']}/api/generate",
                    {"model": model, "prompt": f"{system}\n\nUtente: {user}\nOmnicore:",
                     "stream": False}, None, c["timeout"])
        txt = str(res.get("response", "")).strip()
        if txt:
            return txt
    except Exception:
        pass
    return None
