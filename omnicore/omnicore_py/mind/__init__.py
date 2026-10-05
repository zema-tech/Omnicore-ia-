"""Omnicore mind — la vera IA: identita + memoria + sintesi. Solo stdlib."""
from .synth import synthesize, PERSONA
from .memory import remember, recall_mem
from .llm import chat as llm_chat, llm_status

__all__ = ["synthesize", "PERSONA", "remember", "recall_mem", "llm_chat", "llm_status"]
