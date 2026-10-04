#!/usr/bin/env python3
"""CLI OmniLang (Python).
Uso:
  python3 omniling/py/cli.py <file.omni> "<testo>"   -> esegue il flow
  python3 omniling/py/cli.py --ast <file.omni>       -> stampa AST JSON
  python3 omniling/py/cli.py --check <file.omni>     -> solo parsing (exit 0/1)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

OMNICORE = Path(__file__).resolve().parent.parent.parent  # omnicore/
sys.path.insert(0, str(OMNICORE))  # rende importabili omniling.py? no: vedi sotto
sys.path.insert(0, str(OMNICORE / "omniling" / "py"))

from omniling.parser import parse  # noqa: E402
from omniling.executor import run  # noqa: E402


def main() -> int:
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    mode = "run"
    if args[0] in ("--ast", "--check"):
        mode = args.pop(0)[2:]
    if not args:
        print("serve file.omni", file=sys.stderr)
        return 2
    src = Path(args[0]).read_text(encoding="utf-8")
    try:
        ast = parse(src)
    except SyntaxError as e:
        print(f"errore sintassi: {e}", file=sys.stderr)
        return 1
    if mode == "check":
        print("OK")
        return 0
    if mode == "ast":
        print(json.dumps(ast, indent=2, ensure_ascii=False))
        return 0
    text = " ".join(args[1:]) or "ciao"
    print(json.dumps(run(ast, text), indent=2, ensure_ascii=False, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
