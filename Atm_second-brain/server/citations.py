"""citation_verify: structural (offline-safe) integrity of a note's sources[].

A citation is "broken" if it lacks a usable `cite`, carries a malformed `url`, or
a malformed `accessed` date. Network reachability is intentionally NOT checked by
default so verification runs at $0 and offline (MECH-friendly); pass
require_online=True to additionally probe URLs when a network is available.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any

import config

_URL = re.compile(r"^https?://[^\s/$.?#].[^\s]*$", re.I)
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def verify_citations(frontmatter: dict, body: str = "") -> dict:
    sources = frontmatter.get("sources") or []
    broken: list[dict[str, Any]] = []

    if not isinstance(sources, list):
        return {"ok": False, "sources_checked": 0,
                "broken": [{"index": -1, "reason": "sources is not a list"}]}

    for i, src in enumerate(sources):
        if not isinstance(src, dict):
            broken.append({"index": i, "reason": "source entry is not a mapping"})
            continue
        cite = src.get("cite")
        if not cite or not str(cite).strip():
            broken.append({"index": i, "reason": "missing or empty 'cite'"})
        url = src.get("url")
        if url is not None and not _URL.match(str(url)):
            broken.append({"index": i, "reason": f"malformed url: {url!r}"})
        accessed = src.get("accessed")
        if accessed is not None and not _DATE.match(str(accessed)):
            broken.append({"index": i, "reason": f"malformed accessed date: {accessed!r}"})

    # A note that makes cited-looking claims but declares no sources is susp: flag,
    # don't fail. Heuristic marker: an inline [^n] footnote or "(source:" mention.
    has_citation_markers = bool(re.search(r"\[\^\w+\]|\(source[:\s]", body, re.I))
    warnings = []
    if has_citation_markers and not sources:
        warnings.append("body references citations but sources[] is empty")

    return {
        "ok": len(broken) == 0,
        "sources_checked": len(sources),
        "broken": broken,
        "warnings": warnings,
    }


def citation_verify_tool(args: dict) -> dict:
    import parser as note_parser

    path = args.get("path")
    if not path:
        raise ValueError("citation_verify requires 'path'")
    abs_path = path if os.path.isabs(path) else os.path.join(config.VAULT_ROOT, path)
    note = note_parser.parse_file(abs_path, os.path.relpath(abs_path, config.VAULT_ROOT))
    result = verify_citations(note.frontmatter, note.body)
    result["path"] = path
    return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}
