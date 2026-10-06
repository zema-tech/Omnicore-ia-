"""Omnicore mind (Python).

DEPRECATO (Tappa 1): il core e TypeScript (`src/mind/`). Questo package resta
solo per riferimento; non usarlo in nuovo codice. Rimozione fisica prevista
in tappa dedicata.
"""
from .synth import synthesize, PERSONA
from .memory import remember, recall_mem, recent_history
from .llm import chat as llm_chat, llm_status

__all__ = ["synthesize", "PERSONA", "remember", "recall_mem", "llm_chat", "llm_status"]
