"""OpenCode adapter (Python) — hands: `opencode serve` HTTP + fallback `opencode run` CLI."""
from __future__ import annotations

import json
import subprocess
import urllib.request
from typing import Any


def _headers(password: str = "", directory: str = "") -> dict:
    h = {"Content-Type": "application/json"}
    if password:
        h["Authorization"] = f"Bearer {password}"
    if directory:
        h["x-opencode-directory"] = directory
    return h


def prompt_server(prompt: str, *, base_url: str, password: str = "", directory: str = "", model: str = "") -> Any:
    body: dict = {"prompt": prompt}
    if model:
        body["model"] = model
    req = urllib.request.Request(
        base_url.rstrip("/") + "/session/prompt",
        data=json.dumps(body).encode(),
        headers=_headers(password, directory),
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read().decode() or "null")
    except Exception as e:
        raise RuntimeError(f"opencode serve fail: {str(e)[:300]}") from e


def prompt_cli(prompt: str, *, directory: str = "") -> str:
    p = subprocess.run(
        ["opencode", "run", prompt, "--format", "json"],
        capture_output=True, text=True, timeout=120, cwd=directory or None,
    )
    if p.returncode != 0:
        raise RuntimeError(f"opencode run exit {p.returncode}: {p.stderr[:500]}")
    return p.stdout
