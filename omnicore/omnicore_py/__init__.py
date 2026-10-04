"""Omnicore Python mirror — stessa fusione del core TS, stdlib only."""
from .router import classify, route  # noqa: F401
from .pipeline import fuse  # noqa: F401
from . import adapters  # noqa: F401

__version__ = "0.1.0"
