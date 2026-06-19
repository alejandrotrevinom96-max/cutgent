#!/usr/bin/env python3
"""`brain` — a tiny zero-dependency CLI over the second brain.

Usage:
    python3 scripts/brain.py selftest          # run the full guardrail corpus
    python3 scripts/brain.py reindex [--full]  # rebuild the derived index
    python3 scripts/brain.py recall "<query>"  # ranked retrieval (MECH-friendly)
    python3 scripts/brain.py capture "<text>"  # model-free capture into the inbox
    python3 scripts/brain.py migrate [--apply] [--to=N]  # schema migration (dry-run default)
    python3 scripts/brain.py doctor            # health check (runtime, sqlite, vault, schema)

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


def cmd_capture(argv: list[str]) -> int:
    """Model-free capture (Python path; mirrors scripts/capture.sh)."""
    import datetime
    text = " ".join(argv) if argv else sys.stdin.read()
    text = text.strip() or "(empty capture)"
    now = datetime.datetime.now(datetime.timezone.utc)
    ts = now.strftime("%Y%m%d%H%M%S")
    day = now.strftime("%Y-%m-%d")
    title = (text.splitlines()[0][:72] or "Captured note").replace('"', '\\"')
    inbox = os.environ.get("ATM_INBOX", os.path.join(ROOT, "vault", "00-inbox"))
    os.makedirs(inbox, exist_ok=True)
    path = os.path.join(inbox, f"{ts}-capture.md")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(
            f'---\nschema_version: 1\nid: "{ts}-capture"\ntitle: "{title}"\n'
            f"type: note\ncreated: {day}\nupdated: {day}\n"
            f"trust_tier: self-authored\nauthor: human\ntags: [inbox, capture]\n---\n\n{text}\n"
        )
    print(path)
    return 0


def cmd_doctor(_argv: list[str]) -> int:
    """Health check: runtime, SQLite/FTS5, vault structure, schema, index."""
    import json as _json
    checks = []

    def ck(name, ok, detail=""):
        checks.append((name, ok, detail))

    v = sys.version_info
    ck("Python >= 3.11", v >= (3, 11), f"{v.major}.{v.minor}.{v.micro}")
    try:
        import capabilities
        feats = capabilities.sqlite_features()
        ck("SQLite available", True, feats["sqlite_version"])
        ck("FTS5 available (else LIKE fallback)", True, f"fts5={feats['fts5']}")
    except Exception as e:  # noqa: BLE001
        ck("SQLite probe", False, str(e))

    import config
    ck("vault/ present", os.path.isdir(config.VAULT_DIR), config.VAULT_DIR)
    for sub in ["00-inbox", "01-projects", "02-areas", "03-resources", "04-archive",
                "concepts", "mocs", "personal", "templates"]:
        p = os.path.join(config.VAULT_DIR, sub)
        ck(f"vault/{sub}/", os.path.isdir(p))
    try:
        cur = config.current_schema_version()
        import validate
        validate.load_schema(cur)
        ck("schema CURRENT parses + schema.vN.json loads", True, f"v{cur}")
    except Exception as e:  # noqa: BLE001
        ck("schema", False, str(e))
    try:
        import index
        summ = index.reindex(full=False)
        ck("reindex runs", True, f"{summ['notes']} notes, {summ['links_broken']} broken links")
    except Exception as e:  # noqa: BLE001
        ck("reindex", False, str(e))

    all_ok = all(ok for _n, ok, _d in checks)
    for name, ok, detail in checks:
        print(f"[{'OK ' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    print("\nDOCTOR:", "healthy ✅" if all_ok else "issues found ❌")
    print("Next: `python3 scripts/brain.py selftest` to run the full guardrail corpus.")
    return 0 if all_ok else 1


def cmd_migrate(argv: list[str]) -> int:
    """Schema migration. Dry-run by default; pass --apply to write."""
    import migrate
    apply = "--apply" in argv
    target = None
    for a in argv:
        if a.startswith("--to="):
            target = int(a.split("=", 1)[1])
    result = migrate.run(apply=apply, target=target)
    print(json.dumps(result, indent=2))
    return 0 if not result["errors"] else 1


COMMANDS = {"selftest": cmd_selftest, "reindex": cmd_reindex,
            "recall": cmd_recall, "capture": cmd_capture, "migrate": cmd_migrate,
            "doctor": cmd_doctor}


def main(argv: list[str]) -> int:
    if not argv or argv[0] not in COMMANDS:
        print(__doc__)
        return 0 if not argv else 2
    return COMMANDS[argv[0]](argv[1:])


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
