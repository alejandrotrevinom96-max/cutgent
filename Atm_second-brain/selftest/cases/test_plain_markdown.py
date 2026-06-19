"""INV-PLAIN-MARKDOWN: every note is greppable plain markdown; no binaries live
in the vault; the schema files parse. The durability property, as a test.

Run:  python3 selftest/cases/test_plain_markdown.py
"""
from __future__ import annotations

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VAULT = os.path.join(ROOT, "vault")
SCHEMA = os.path.join(ROOT, "_schema")

ok = True


def check(name: str, cond: bool, detail: str = "") -> None:
    global ok
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    if not cond:
        ok = False


def main() -> int:
    # All vault files outside attachments/ must be UTF-8 text.
    non_text = []
    for r, _d, files in os.walk(VAULT):
        if os.path.relpath(r, VAULT).startswith("attachments"):
            continue
        for f in files:
            if f == ".gitkeep":
                continue
            p = os.path.join(r, f)
            try:
                open(p, encoding="utf-8").read()
            except UnicodeDecodeError:
                non_text.append(os.path.relpath(p, ROOT))
    check("no binary/non-UTF8 files in vault (outside attachments/)", not non_text, str(non_text))

    # Every note is a .md file.
    bad_ext = []
    for r, _d, files in os.walk(VAULT):
        if os.path.relpath(r, VAULT).startswith("attachments"):
            continue
        for f in files:
            if f != ".gitkeep" and not f.endswith(".md"):
                bad_ext.append(os.path.relpath(os.path.join(r, f), ROOT))
    check("all vault notes are .md", not bad_ext, str(bad_ext))

    # Schema JSON parses and CURRENT is an int.
    schema_ok = True
    try:
        json.load(open(os.path.join(SCHEMA, "schema.v1.json")))
        int(open(os.path.join(SCHEMA, "CURRENT")).read().strip())
    except Exception as e:  # noqa: BLE001
        schema_ok = False
        print("   schema error:", e)
    check("schema files parse (json + CURRENT int)", schema_ok)

    print()
    print("PLAIN-MARKDOWN:", "ALL PASS ✅" if ok else "FAILURES ❌")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
