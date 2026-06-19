#!/usr/bin/env python3
"""`brain` — a tiny zero-dependency CLI over the second brain.

Usage:
    python3 scripts/brain.py selftest          # run the full guardrail corpus
    python3 scripts/brain.py reindex [--full]  # rebuild the derived index
    python3 scripts/brain.py recall "<query>"  # ranked retrieval (MECH-friendly)

Everything here is stdlib-only and works offline. `selftest` is the canonical
gate; CI and humans both run it.
"""
from __future__ import annotations

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "server"))
sys.path.insert(0, os.path.join(ROOT, "selftest"))


def cmd_selftest(_argv: list[str]) -> int:
    import harness
    return harness.main()


def cmd_reindex(argv: list[str]) -> int:
    import index
    summary = index.reindex(full="--full" in argv)
    print(json.dumps(summary, indent=2))
    return 0


def cmd_recall(argv: list[str]) -> int:
    if not argv:
        print("usage: brain.py recall \"<query>\"", file=sys.stderr)
        return 2
    import recall
    print(json.dumps(recall.recall(" ".join(argv), k=8), indent=2))
    return 0


COMMANDS = {"selftest": cmd_selftest, "reindex": cmd_reindex, "recall": cmd_recall}


def main(argv: list[str]) -> int:
    if not argv or argv[0] not in COMMANDS:
        print(__doc__)
        return 0 if not argv else 2
    return COMMANDS[argv[0]](argv[1:])


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
