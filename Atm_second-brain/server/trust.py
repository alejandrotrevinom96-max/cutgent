"""Trust-tier resolution with the monotonic anti-laundering floor. Stdlib only.

Trust order (higher = more trusted):

    externally-ingested (1)  <  self-authored (2)  <  human-confirmed (3)

The anti-laundering rule: a note's *effective* tier can never exceed what its
append-only `tier_lineage` actually granted. A top-level `trust_tier` claim above
the lineage ceiling is capped down (fail-closed) and flagged as laundering. The
only way a tier legitimately rises is an explicit lineage entry recording the
grant — which, for the top tier, must be a human confirmation.
"""
from __future__ import annotations

import json
import os
from typing import Any

import config

ORDER = {"externally-ingested": 1, "self-authored": 2, "human-confirmed": 3}
NAME = {v: k for k, v in ORDER.items()}
LEAST = "externally-ingested"


def _rank(tier: Any) -> int:
    """Fail-closed: unknown/missing tier ranks as the least-trusted."""
    return ORDER.get(str(tier), ORDER[LEAST])


def effective_tier(frontmatter: dict) -> dict:
    """Compute the effective tier for a note's frontmatter.

    Returns {claimed, effective, lineage_ceiling, laundering_detected, lineage}.
    """
    claimed = str(frontmatter.get("trust_tier") or LEAST)
    if claimed not in ORDER:
        claimed = LEAST

    prov = frontmatter.get("provenance") or {}
    lineage_entries = prov.get("tier_lineage") or []
    lineage = [str(e.get("tier")) for e in lineage_entries if isinstance(e, dict) and e.get("tier")]

    if not lineage:
        # No recorded grants yet: the declared tier stands as its own ceiling.
        # (write_with_provenance stamps the first lineage entry on the way in.)
        ceiling = _rank(claimed)
    else:
        ceiling = max(_rank(t) for t in lineage)

    eff_rank = min(_rank(claimed), ceiling)
    return {
        "claimed": claimed,
        "effective": NAME[eff_rank],
        "lineage_ceiling": NAME[ceiling],
        "laundering_detected": _rank(claimed) > ceiling,
        "lineage": lineage,
    }


def _read_frontmatter_for(path: str) -> dict:
    # Prefer the file on disk (source of truth); parse with the same parser.
    import parser as note_parser

    abs_path = path if os.path.isabs(path) else os.path.join(config.VAULT_ROOT, path)
    note = note_parser.parse_file(abs_path, os.path.relpath(abs_path, config.VAULT_ROOT))
    return note.frontmatter


def resolve_tier_tool(args: dict) -> dict:
    path = args.get("path")
    if not path:
        raise ValueError("resolve_tier requires 'path'")
    fm = _read_frontmatter_for(path)
    result = effective_tier(fm)
    result["path"] = path
    return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}
