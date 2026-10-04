#!/usr/bin/env python3
"""CLI Omnicore (Python).
Uso:
  python3 omnicore_py/cli.py "fix login bug"            -> route singola
  python3 omnicore_py/cli.py --fuse "fix login bug"     -> fusione brain->hands->face
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from omnicore_py.router import route  # noqa: E402
from omnicore_py.pipeline import fuse  # noqa: E402
from omnicore_py.config import load_config  # noqa: E402
from omnicore_py.adapters import hermes, opencode, openclaw  # noqa: E402


def main() -> None:
    raw = sys.argv[1:]
    do_fuse = "--fuse" in raw
    raw = [a for a in raw if a != "--fuse"]
    directory = ""
    if "--dir" in raw:
        i = raw.index("--dir")
        if i + 1 < len(raw):
            directory = raw[i + 1]
        raw = [a for j, a in enumerate(raw) if j not in (i, i + 1)]
    text = " ".join(raw) or "ciao"
    cfg = load_config()

    if do_fuse:
        print(json.dumps(fuse(text, directory=directory), indent=2, default=str))
        return

    r = route(text)
    print(json.dumps({**r, "text": text}))
    if r["handler"] == "hermes":
        try:
            print(json.dumps({"via": "hermes",
                              "res": hermes.recall(text, 10, python=cfg["hermes_python"],
                                                   hermes_dir=cfg["hermes_dir"])}, default=str))
        except Exception as e:
            print(json.dumps({"via": "hermes", "error": str(e)[:300]}))
    elif r["handler"] == "opencode":
        try:
            print(json.dumps({"via": "opencode",
                              "res": opencode.prompt_server(text, base_url=cfg["opencode_url"],
                                                            password=cfg["opencode_password"],
                                                            directory=directory)}, default=str))
        except Exception:
            try:
                print(json.dumps({"via": "opencode-cli",
                                  "res": opencode.prompt_cli(text, directory=directory)[:2000]}))
            except Exception:
                print(json.dumps({"via": "opencode",
                                  "hint": f"avvia 'opencode serve' (OPENCODE_URL={cfg['opencode_url']})"}))
    else:
        try:
            print(json.dumps({"via": "openclaw",
                              "res": openclaw.status(cfg["openclaw_url"], token=cfg["openclaw_token"],
                                                     rpc_path=cfg["openclaw_rpc_path"])}, default=str))
        except Exception:
            print(json.dumps({"via": "openclaw",
                              "hint": f"gateway non raggiungibile. OPENCLAW_URL={cfg['openclaw_url']}"}))


if __name__ == "__main__":
    main()
