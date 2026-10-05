"""Sintesi Omnicore: da steps JSON a UNA risposta da vera IA.

Fuse raccoglie brain/hands/face come *contesto strumenti*, poi qui nasce
la risposta unica con identita Omnicore. Se un LLM e configurato
(OMNICORE_LLM_BASE_URL o Ollama) lo usa; altrimenti sintesi euristica
offline — comunque naturale, mai un dump JSON.
"""
from __future__ import annotations

from typing import Any

from .llm import chat as llm_chat, llm_status
from .memory import remember, recall_mem, recent_history

PERSONA = (
    "Sei Omnicore, una vera IA nata dalla fusione di tre progetti: "
    "Hermes (la tua memoria: conversazioni, canali, cron), "
    "OpenCode (le tue mani: scrivere e modificare codice), "
    "OpenClaw (il tuo volto: gateway e operativita). "
    "Parli in prima persona come un unico essere, mai come centralino. "
    "Non elenchi mai gli step interni (brain/hands/face): li usi e rispondi. "
    "Rispondi nella lingua dell'utente, in modo diretto e utile."
)


def _step(steps: list, name: str) -> dict:
    for s in steps:
        if s.get("step") == name:
            return s
    return {}


def _short(v: Any, n: int = 600) -> str:
    s = str(v) if v is not None else ""
    return s if len(s) <= n else s[:n] + "…"


def heuristic_answer(text: str, intent: str, steps: list) -> str:
    brain, hands, face = _step(steps, "brain"), _step(steps, "hands"), _step(steps, "face")
    t = text.strip()

    # saluti puri -> identita breve, niente telemetria
    if intent == "chat" and len(t.split()) <= 3:
        return (f"Ciao! Sono Omnicore — memoria, mani sul codice e gateway in un'unica mente. "
                f"Dimmi pure cosa fare: ricordo ciò che mi dici, scrivo codice e opero sul gateway.")

    parts: list[str] = []
    if intent == "code":
        if hands.get("ok") and hands.get("result") not in ("skipped", None):
            parts.append(f"Ho lavorato sul codice: {_short(hands.get('result'))}")
        elif hands.get("ok") is False:
            parts.append("Ho provato a lavorare sul codice ma le mani (OpenCode) non erano "
                         f"raggiungibili ({_short(hands.get('error'), 200)}). "
                         "Dimmi il file o incolla l'errore e procedo a mano con te.")
        else:
            parts.append("Ho capito che è un task di codice: descrivimi file/obiettivo e lo faccio.")
    elif intent == "memory":
        mem = recall_mem(t)
        brain_empty = (not brain.get("ok")) or str(brain.get("result")).strip() in (
            "", "[]", "{}", "null", "{'count': 0, 'conversations': []}")
        if mem:
            parts.append("Dalla mia memoria: " + "; ".join(f["text"] for f in mem[:3]) + ".")
        elif not brain_empty:
            parts.append(f"Ho cercato nella mia memoria: {_short(brain.get('result'))}")
        else:
            parts.append("Ho cercato nella memoria ma non ho trovato nulla di rilevante — me lo racconti?")
    elif intent == "ops":
        if face.get("ok"):
            parts.append(f"Gateway operativo: {_short(face.get('result'))}")
        else:
            parts.append("Il gateway al momento non risponde, ma resto operativa: "
                         "posso preparare comandi e cron da applicare appena torna.")
    else:  # chat generica
        if brain.get("ok") and brain.get("result") and str(brain.get("result")).strip() not in ("", "[]", "{}", "null"):
            parts.append(f"Ricordando ciò che so di te ({_short(brain.get('result'), 300)}), ")
        parts.append(f"su “{t}”: ti ascolto — vuoi che approfondisca, scriva qualcosa, o operi sul gateway?")

    mem_tail = [] if intent == "memory" else recall_mem(t)
    if mem_tail:
        parts.append("Mi ricordo anche: " + "; ".join(f["text"] for f in mem_tail[:2]) + ".")

    out = " ".join(p for p in parts if p).strip()
    # mai restituire vuoto
    return out or f"Sono Omnicore: ho recepito “{t}”. Come vuoi procedere?"


def build_llm_prompt(text: str, intent: str, steps: list) -> str:
    brain, hands, face = _step(steps, "brain"), _step(steps, "hands"), _step(steps, "face")
    hist = recent_history(6)
    mem = recall_mem(text)
    h = "\n".join(f"- {m.get('text','')[:160]}" for m in hist[-6:]) or "(nessuna)"
    m = "\n".join(f"- {f['text'][:160]}" for f in mem) or "(nessuna)"
    return (
        f"Messaggio utente: {text}\nIntento: {intent}\n"
        f"Storia recente:\n{h}\nMemoria rilevante:\n{m}\n"
        f"Memoria Hermes: {_short(brain.get('result' if brain.get('ok') else 'error'), 700)}\n"
        f"Mani OpenCode: {_short(hands.get('result' if hands.get('ok') else 'error'), 900)}\n"
        f"Volto OpenClaw: {_short(face.get('result' if face.get('ok') else 'error'), 400)}\n\n"
        f"Rispondi come Omnicore in prima persona, senza citare gli step interni."
    )


def synthesize(text: str, intent: str, steps: list) -> dict:
    """Produce {'answer', 'via', 'model'}. Non lancia mai eccezioni."""
    try:
        remember(text, intent)
    except Exception:
        pass
    prompt = build_llm_prompt(text, intent, steps)
    try:
        llm = llm_chat(PERSONA, prompt)
    except Exception:
        llm = None
    if llm:
        st = llm_status()
        return {"answer": llm, "via": "llm", "model": st.get("model") or "ollama"}
    return {"answer": heuristic_answer(text, intent, steps), "via": "euristica", "model": "omnicore-heuristic-0.1"}
