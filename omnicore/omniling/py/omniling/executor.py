"""Executor OmniLang (Python) — AST -> azioni reali via omnicore_py.adapters.

Contesto iniziale: {text, intent}. Ritorna {"flow", "vars", "steps"} dove ogni
step ha {assign|if, ok, result|error}. Mai throw fuori da run().
"""
from __future__ import annotations

from typing import Any


def _resolve(val: dict, ctx: dict) -> Any:
    t, v = val["t"], val["v"]
    if t == "var":
        return ctx.get(v)
    return v


def _truthy(x: Any) -> bool:
    if x is None or x is False:
        return False
    if isinstance(x, (int, float)) and x == 0:
        return False
    if isinstance(x, (str, list, dict)) and len(x) == 0:
        return False
    return True


def _eval_expr(e: dict, ctx: dict) -> bool:
    l = _resolve(e["l"], ctx)
    if not e["op"]:
        return _truthy(l)
    r = _resolve(e["r"], ctx)
    return (l == r) if e["op"] == "==" else (l != r)


def _dispatch(system: dict, tool: dict, args: dict, ctx: dict, cfg: dict) -> Any:
    kind, call = system["kind"], tool["call"]
    if kind == "memory":
        from omnicore_py.adapters import hermes

        return hermes._call(call, **args)
    if kind == "hands":
        from omnicore_py.adapters import opencode

        if call == "session/prompt":
            prompt = args.get("prompt", ctx.get("text", ""))
            try:
                return opencode.prompt_server(str(prompt), base_url=cfg["opencode_url"],
                                              password=cfg["opencode_password"],
                                              directory=str(args.get("directory", "")))
            except Exception:
                return {"fallback": "cli", "out": opencode.prompt_cli(str(prompt))[:2000]}
        raise RuntimeError(f"hands: call non supportata: {call!r} (v0.1: solo session/prompt)")
    if kind == "face":
        from omnicore_py.adapters import openclaw

        if call == "announce":
            return openclaw.announce(cfg["openclaw_url"], str(args.get("result", args.get("message", ""))),
                                     token=cfg["openclaw_token"], rpc_path=cfg["openclaw_rpc_path"])
        return openclaw.rpc(cfg["openclaw_url"], call, {}, token=cfg["openclaw_token"],
                            rpc_path=cfg["openclaw_rpc_path"])
    raise RuntimeError(f"kind non supportato in v0.1: {kind!r} (memory|hands|face)")


def run(ast: dict, text: str, *, cfg: dict | None = None) -> dict:
    from omnicore_py.config import load_config
    from omnicore_py.router import route

    cfg = cfg or load_config()
    ctx: dict[str, Any] = {"text": text, "intent": route(text)["intent"]}
    systems = {s["name"]: s for s in ast["systems"]}
    tools = {t["name"]: t for t in ast["tools"]}
    ran: list[dict] = []
    out_steps: list[dict] = []

    for flow in ast["flows"]:
        if flow["when"] and not _eval_expr(flow["when"], ctx):
            continue
        ran.append(flow["name"])
        _run_steps(flow["steps"], ctx, systems, tools, cfg, out_steps)
    return {"flows": ran, "vars": {k: v for k, v in ctx.items() if k not in ("text", "intent")},
            "steps": out_steps}


def _run_steps(steps: list, ctx: dict, systems: dict, tools: dict, cfg: dict, log: list) -> None:
    for st in steps:
        if "if" in st:
            ok = _eval_expr(st["if"], ctx)
            log.append({"if": st["if"], "taken": ok})
            if ok:
                _run_steps(st["steps"], ctx, systems, tools, cfg, log)
            continue
        var, tool_name = st["assign"], st.get("call")
        if tool_name is None:  # assegnazione di valore
            ctx[var] = _resolve(st["value"], ctx)
            log.append({"assign": var, "ok": True})
            continue
        try:
            tool = tools[tool_name]
        except KeyError:
            log.append({"assign": var, "call": tool_name, "ok": False, "error": f"tool sconosciuto: {tool_name}"})
            continue
        try:
            system = systems[tool["system"]]
        except KeyError:
            log.append({"assign": var, "call": tool_name, "ok": False,
                        "error": f"system sconosciuto: {tool['system']}"})
            continue
        merged = {k: _resolve(v, ctx) for k, v in tool["args"].items()}
        merged.update({k: _resolve(v, ctx) for k, v in st["args"].items()})
        try:
            res = _dispatch(system, tool, merged, ctx, cfg)
            ctx[var] = res
            log.append({"assign": var, "call": tool_name, "ok": True})
        except Exception as e:
            log.append({"assign": var, "call": tool_name, "ok": False, "error": str(e)[:300]})
