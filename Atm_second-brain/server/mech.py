"""MECH (mechanical) mode — the cheapest, always-available tier: grep/git/SQLite
only, $0, offline. Standard library only.

This module reports what the brain can still do with no model budget and no
network, so the agent (and a human) can reason about degraded operation. The
governing rule: capture is never blocked, and retrieval always works at this tier.
"""
from __future__ import annotations

import json

from capabilities import sqlite_features

# Operations that need no model and no network.
OFFLINE_OPS = [
    "capture (scripts/capture.sh)",
    "reindex",
    "recall (grep / FTS / LIKE ranking)",
    "resolve_tier",
    "citation_verify (structural)",
    "write_with_provenance (validation + provenance stamping)",
]

# Operations that benefit from or require a model (Surface A / CHEAP / FULL tiers).
MODEL_OPS = [
    "semantic query expansion (improves recall quality)",
    "synthesis / summarization of retrieved notes",
    "expertise-pack reasoning",
]


def status() -> dict:
    feats = sqlite_features()
    return {
        "mode": "MECH",
        "cost": "$0",
        "network_required": False,
        "model_required": False,
        "fts5": feats["fts5"],
        "sqlite_version": feats["sqlite_version"],
        "offline_ops": OFFLINE_OPS,
        "model_ops": MODEL_OPS,
        "note": "Tiers escalate cheapest-correct-first: MECH -> CHEAP -> FULL.",
    }


def mech_status_tool(_args: dict) -> dict:
    return {"content": [{"type": "text", "text": json.dumps(status(), indent=2)}]}
