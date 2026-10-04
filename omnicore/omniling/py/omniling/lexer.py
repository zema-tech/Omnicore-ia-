"""Lexer OmniLang — righe significative: (lineno, level, text).

Indentazione 2 spazi/livello, tab vietati. Righe vuote e `#` scartate.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Line:
    lineno: int
    level: int
    text: str


def lex(src: str) -> list[Line]:
    out: list[Line] = []
    for i, raw in enumerate(src.splitlines(), 1):
        if "\t" in raw.split("#")[0] and raw.strip():
            raise SyntaxError(f"riga {i}: tab vietati, usa 2 spazi per livello")
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            continue
        # taglia commenti di riga (fuori dalle stringhe)
        code = _strip_comment(raw)
        if not code.strip():
            continue
        indent = len(code) - len(code.lstrip(" "))
        if indent % 2:
            raise SyntaxError(f"riga {i}: indentazione non multipla di 2")
        out.append(Line(i, indent // 2, code.strip()))
    return out


def _strip_comment(raw: str) -> str:
    in_str = False
    for idx, ch in enumerate(raw):
        if ch == '"':
            in_str = not in_str
        elif ch == "#" and not in_str:
            return raw[:idx]
    return raw
