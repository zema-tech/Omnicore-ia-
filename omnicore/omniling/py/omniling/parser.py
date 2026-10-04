"""Parser OmniLang v0.1 — da [Line] ad AST JSON-serializzabile (dict).

AST:
  {"systems": [{"name","kind","via"}],
   "tools": [{"name","system","call","args": {k: Value}}],
   "flows": [{"name","when": Expr|None,"steps": [Step]}]}
  Value = {"t": "var"|"str"|"num"|"bool", "v": ...}
  Expr  = {"l": Operand, "op": "==|!="|None, "r": Operand|None}
  Step  = {"assign": var, "call": tool, "args": {...}} | {"if": Expr, "steps": [...]}
"""
from __future__ import annotations

import re
from .lexer import Line, lex

NAME = r"[A-Za-z_][A-Za-z0-9_]*"
_re_system = re.compile(rf"^system\s+({NAME})\s*:\s*({NAME})\s+via\s+(\"(?:[^\"\\]|\\.)*\")$")
_re_tool = re.compile(rf"^tool\s+({NAME})\s+on\s+({NAME})\s*:$")
_re_flow = re.compile(rf"^flow(?:\s+(\"(?:[^\"\\]|\\.)*\"))?(?:\s+when\s+(.+))?\s*:$")
_re_call = re.compile(r'^call\s+("(?:[^"\\]|\\.)*")$')
_re_args = re.compile(r"^args\s+(.+)$")
_re_assign = re.compile(rf"^({NAME})\s*=\s*(.+)$")
_re_if = re.compile(r"^if\s+(.+)\s*:$")
_re_callref = re.compile(rf"^({NAME})\s*\((.*)\)$")
_re_named = re.compile(rf"^\s*({NAME})\s*[:=]\s*(.+?)\s*$")


def parse(src: str) -> dict:
    return _Parser(lex(src)).program()


class _Parser:
    def __init__(self, lines: list[Line]):
        self.lines = lines
        self.pos = 0

    # --- utilità ---
    def peek(self) -> Line | None:
        return self.lines[self.pos] if self.pos < len(self.lines) else None

    def next(self) -> Line:
        ln = self.peek()
        if ln is None:
            raise SyntaxError("fine input inattesa")
        self.pos += 1
        return ln

    def program(self) -> dict:
        systems, tools, flows = [], [], []
        while self.peek() is not None:
            ln = self.next()
            if ln.level != 0:
                raise SyntaxError(f"riga {ln.lineno}: statement top-level non a livello 0")
            if ln.text.startswith("system"):
                systems.append(self.system(ln))
            elif ln.text.startswith("tool"):
                tools.append(self.tool(ln))
            elif ln.text.startswith("flow"):
                flows.append(self.flow(ln, len(flows)))
            else:
                raise SyntaxError(f"riga {ln.lineno}: atteso system|tool|flow, trovato {ln.text!r}")
        return {"systems": systems, "tools": tools, "flows": flows}

    # --- system / tool / flow ---
    def system(self, ln: Line) -> dict:
        m = _re_system.match(ln.text)
        if not m:
            raise SyntaxError(f"riga {ln.lineno}: sintassi system: system <nome>: <kind> via \"...\"")
        return {"name": m.group(1), "kind": m.group(2), "via": self.string(m.group(3), ln.lineno)}

    def tool(self, ln: Line) -> dict:
        m = _re_tool.match(ln.text)
        if not m:
            raise SyntaxError(f"riga {ln.lineno}: sintassi tool: tool <nome> on <system>:")
        call: str | None = None
        args: dict = {}
        seen = False
        while (nxt := self.peek()) is not None and nxt.level == 1:
            self.next()
            mc = _re_call.match(nxt.text)
            if mc:
                if seen:
                    raise SyntaxError(f"riga {nxt.lineno}: un solo call per tool")
                seen = True
                call = self.string(mc.group(1), nxt.lineno)
                continue
            ma = _re_args.match(nxt.text)
            if ma:
                for k, v in self.named_list(ma.group(1), nxt.lineno, sep=","):
                    args[k] = v
                continue
            raise SyntaxError(f"riga {nxt.lineno}: in tool solo call|args, trovato {nxt.text!r}")
        if call is None:
            raise SyntaxError(f"riga {ln.lineno}: tool senza call")
        return {"name": m.group(1), "system": m.group(2), "call": call, "args": args}

    def flow(self, ln: Line, idx: int) -> dict:
        m = _re_flow.match(ln.text)
        if not m:
            raise SyntaxError(f"riga {ln.lineno}: sintassi flow: flow [\"nome\"] [when expr]:")
        name = self.string(m.group(1), ln.lineno) if m.group(1) else f"flow_{idx}"
        when = self.expr(m.group(2), ln.lineno) if m.group(2) else None
        steps = self.block(1)
        if not steps:
            raise SyntaxError(f"riga {ln.lineno}: flow vuoto")
        return {"name": name, "when": when, "steps": steps}

    def block(self, level: int) -> list:
        steps: list = []
        while (nxt := self.peek()) is not None and nxt.level >= level:
            if nxt.level > level:
                raise SyntaxError(f"riga {nxt.lineno}: indentazione eccessiva")
            self.next()
            mi = _re_if.match(nxt.text)
            if mi:
                steps.append({"if": self.expr(mi.group(1), nxt.lineno), "steps": self.block(level + 1)})
                continue
            ma = _re_assign.match(nxt.text)
            if not ma:
                raise SyntaxError(f"riga {nxt.lineno}: step non valido: {nxt.text!r}")
            var, rhs = ma.group(1), ma.group(2).strip()
            mc = _re_callref.match(rhs)
            if mc:
                args = dict(self.named_list(mc.group(2), nxt.lineno, sep=",") if mc.group(2).strip() else [])
                steps.append({"assign": var, "call": mc.group(1), "args": args})
            else:
                steps.append({"assign": var, "value": self.value(rhs, nxt.lineno)})
        return steps

    # --- valori / espressioni ---
    def string(self, tok: str, lineno: int) -> str:
        try:
            import json

            return json.loads(tok)
        except Exception:
            raise SyntaxError(f"riga {lineno}: stringa non valida: {tok!r}")

    def value(self, tok: str, lineno: int) -> dict:
        tok = tok.strip()
        if tok.startswith("$"):
            self.check_name(tok[1:], lineno)
            return {"t": "var", "v": tok[1:]}
        if tok.startswith('"'):
            return {"t": "str", "v": self.string(tok, lineno)}
        if tok in ("true", "false"):
            return {"t": "bool", "v": tok == "true"}
        try:
            return {"t": "num", "v": float(tok) if "." in tok else int(tok)}
        except ValueError:
            pass
        self.check_name(tok, lineno)
        return {"t": "var", "v": tok}

    def expr(self, src: str, lineno: int) -> dict:
        for op in ("==", "!="):
            if op in src:
                l, r = src.split(op, 1)
                return {"l": self.value(l.strip(), lineno), "op": op, "r": self.value(r.strip(), lineno)}
        return {"l": self.value(src.strip(), lineno), "op": None, "r": None}

    def named_list(self, src: str, lineno: int, sep: str) -> list[tuple[str, dict]]:
        out: list[tuple[str, dict]] = []
        for part in self.split_top(src, sep):
            m = _re_named.match(part)
            if not m:
                raise SyntaxError(f"riga {lineno}: argomento non valido: {part!r} (forma nome: valore)")
            out.append((m.group(1), self.value(m.group(2), lineno)))
        return out

    @staticmethod
    def split_top(src: str, sep: str) -> list[str]:
        parts, depth, cur, in_str = [], 0, "", False
        for ch in src:
            if ch == '"':
                in_str = not in_str
            if not in_str:
                if ch in "([":
                    depth += 1
                elif ch in ")]":
                    depth -= 1
            if ch == sep and not in_str and depth == 0:
                parts.append(cur)
                cur = ""
            else:
                cur += ch
        if cur.strip():
            parts.append(cur)
        return [p for p in (x.strip() for x in parts) if p]

    @staticmethod
    def check_name(tok: str, lineno: int) -> None:
        if not re.fullmatch(NAME, tok):
            raise SyntaxError(f"riga {lineno}: nome non valido: {tok!r}")
