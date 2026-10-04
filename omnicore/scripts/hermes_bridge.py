#!/usr/bin/env python3
"""hermes_bridge.py — one-shot bridge verso vendors/hermes/mcp_serve.py (stdlib only).

Importa DIRETTAMENTE gli handler MCP (niente pacchetto `mcp`, niente server
persistente): ogni invocazione esce subito, quindi TS/Rust/Bash possono
chiamarlo via subprocess senza hang.

Uso:
  python3 hermes_bridge.py conversations_list '{"search":"ciao","limit":5}'
  python3 hermes_bridge.py messages_read '{"session_key":"...","limit":50}'
  HERMES_DIR=/path/to/vendors/hermes python3 hermes_bridge.py channels_list '{}'

Stampa su stdout la stringa JSON dell'handler. Exit != 0 + stderr in caso di errore.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_HERMES = HERE.parent.parent / "vendors" / "hermes"


def main() -> int:
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(__doc__)
        return 0 if len(sys.argv) >= 2 else 1
    tool = sys.argv[1]
    try:
        args = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
    except json.JSONDecodeError as e:
        print(f"bad JSON args: {e}", file=sys.stderr)
        return 2

    hermes_dir = Path(os.environ.get("HERMES_DIR", str(DEFAULT_HERMES)))
    sys.path.insert(0, str(hermes_dir))
    try:
        import mcp_serve as m  # type: ignore
    except ImportError as e:
        print(f"cannot import mcp_serve from {hermes_dir}: {e}", file=sys.stderr)
        return 3

    handlers = m._ToolHandlers(m.EventBridge())
    fn = getattr(handlers, tool, None)
    if not callable(fn):
        print(f"unknown tool: {tool}. tools: {list(m._TOOL_NAMES)}", file=sys.stderr)
        return 4
    try:
        print(fn(**args) if isinstance(args, dict) else fn())
    except TypeError as e:
        print(f"bad args for {tool}: {e}", file=sys.stderr)
        return 5
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
