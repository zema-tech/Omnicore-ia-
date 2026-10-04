"""Hermes adapter (Python) — brain: import DIRETTO di vendors/hermes/mcp_serve.py.

Niente pacchetto `mcp`, niente server persistente: gli handler sono funzioni
pure sul bridge eventi (state.db/sessions). Stessa superficie del server reale.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent.parent  # omnicore_py/
DEFAULT_HERMES = HERE.parent.parent / "vendors" / "hermes"  # repo/vendors/hermes

_HANDLERS = None
_TOOL_NAMES: tuple = ()


def _bridge():
    global _HANDLERS, _TOOL_NAMES
    if _HANDLERS is not None:
        return _HANDLERS
    hermes_dir = Path(os.environ.get("HERMES_DIR", str(DEFAULT_HERMES)))
    if str(hermes_dir) not in sys.path:
        sys.path.insert(0, str(hermes_dir))
    import mcp_serve as m  # type: ignore

    _TOOL_NAMES = tuple(m._TOOL_NAMES)
    _HANDLERS = m._ToolHandlers(m.EventBridge())
    return _HANDLERS


def tools() -> tuple:
    _bridge()
    return _TOOL_NAMES


def _call(tool: str, **kwargs: Any) -> Any:
    import json

    h = _bridge()
    fn = getattr(h, tool, None)
    if not callable(fn):
        raise ValueError(f"unknown hermes tool: {tool} (tools: {list(_TOOL_NAMES)})")
    return json.loads(fn(**kwargs))


def recall(search: str, limit: int = 10, *, python: str = "python3", hermes_dir: str = "") -> Any:
    if hermes_dir:
        os.environ["HERMES_DIR"] = hermes_dir
    return _call("conversations_list", search=search, limit=limit)


def read(session_key: str, limit: int = 50, **kw: Any) -> Any:
    return _call("messages_read", session_key=session_key, limit=limit)


def send(target: str, message: str, **kw: Any) -> Any:
    return _call("messages_send", target=target, message=message)


def channels(platform: str | None = None, **kw: Any) -> Any:
    return _call("channels_list", **({"platform": platform} if platform else {}))


def poll(after_cursor: int = 0, limit: int = 20, **kw: Any) -> Any:
    return _call("events_poll", after_cursor=after_cursor, limit=limit)
