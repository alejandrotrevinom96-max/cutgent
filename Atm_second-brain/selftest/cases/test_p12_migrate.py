"""P12 gate: the schema migration runner (durability D1).

In an isolated temp vault: a v1 note + a v1->v2 migration + a v2 schema.
Checks: dry-run writes nothing; apply bumps + validates; re-run is idempotent;
a lossy migration (drops a required field) is refused; ahead-of-target is refused.

Run:  python3 selftest/cases/test_p12_migrate.py
"""
from __future__ import annotations

import os
import shutil
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "server"))

import config  # noqa: E402

ok = True


def check(name, cond, detail=""):
    global ok
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    if not cond:
        ok = False


V1_NOTE = '''---
schema_version: 1
id: "20260619120000-sample"
title: "Sample"
type: note
created: 2026-06-19
updated: 2026-06-19
trust_tier: self-authored
author: human
tags: [legacy]
---

Body stays intact across migration.
'''

# A good v1->v2 migration: rename tag "legacy" -> "archived", bump nothing else.
GOOD_MIG = '''FROM_VERSION = 1
TO_VERSION = 2
def migrate_frontmatter(fm):
    fm["tags"] = ["archived" if t == "legacy" else t for t in fm.get("tags", [])]
    return fm
'''

# A lossy migration: drops a required field without declaring it.
LOSSY_MIG = '''FROM_VERSION = 1
TO_VERSION = 2
def migrate_frontmatter(fm):
    fm.pop("title", None)   # dropping a REQUIRED field, not declared in DROPS
    return fm
'''


def setup_vault(tmp, migration_src):
    os.makedirs(os.path.join(tmp, "vault"), exist_ok=True)
    os.makedirs(os.path.join(tmp, "_schema"), exist_ok=True)
    os.makedirs(os.path.join(tmp, "_migrations"), exist_ok=True)
    # schema v1 (copy real) + v2 (const bumped to 2)
    import json
    v1 = json.load(open(os.path.join(ROOT, "_schema", "schema.v1.json")))
    shutil.copy(os.path.join(ROOT, "_schema", "schema.v1.json"), os.path.join(tmp, "_schema", "schema.v1.json"))
    v2 = json.loads(json.dumps(v1))
    v2["properties"]["schema_version"]["const"] = 2
    json.dump(v2, open(os.path.join(tmp, "_schema", "schema.v2.json"), "w"))
    open(os.path.join(tmp, "_schema", "CURRENT"), "w").write("2\n")
    open(os.path.join(tmp, "vault", "sample.md"), "w").write(V1_NOTE)
    open(os.path.join(tmp, "_migrations", "m0001_v1_to_v2.py"), "w").write(migration_src)
    config.VAULT_ROOT = tmp
    config.VAULT_DIR = os.path.join(tmp, "vault")
    config.SCHEMA_DIR = os.path.join(tmp, "_schema")
    config.DB_PATH = os.path.join(tmp, ".atm", "index.db")
    import validate
    validate.load_schema.cache_clear()


def main() -> int:
    # --- happy path: dry-run, apply, idempotent ---
    tmp = tempfile.mkdtemp()
    try:
        setup_vault(tmp, GOOD_MIG)
        import importlib
        import migrate
        importlib.reload(migrate)

        dry = migrate.run(apply=False, target=2)
        check("dry-run reports 1 change", dry["summary"]["changed"] == 1, str(dry["summary"]))
        on_disk = open(os.path.join(tmp, "vault", "sample.md")).read()
        check("dry-run writes NOTHING to disk", "schema_version: 1" in on_disk and "legacy" in on_disk)

        applied = migrate.run(apply=True, target=2)
        check("apply migrates 1 note, 0 errors", applied["summary"]["changed"] == 1 and not applied["errors"], str(applied["summary"]))
        after = open(os.path.join(tmp, "vault", "sample.md")).read()
        check("note bumped to v2", "schema_version: 2" in after)
        check("migration transform applied (legacy->archived)", "archived" in after and "legacy" not in after)
        check("body preserved", "Body stays intact" in after)

        idem = migrate.run(apply=True, target=2)
        check("re-run is idempotent (0 changed, 1 skipped)",
              idem["summary"]["changed"] == 0 and idem["summary"]["skipped"] == 1, str(idem["summary"]))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    # --- lossy migration is refused ---
    tmp2 = tempfile.mkdtemp()
    try:
        setup_vault(tmp2, LOSSY_MIG)
        import importlib, migrate
        importlib.reload(migrate)
        res = migrate.run(apply=True, target=2)
        before = open(os.path.join(tmp2, "vault", "sample.md")).read()
        check("lossy migration is refused (error, no change)",
              res["summary"]["errors"] == 1 and res["summary"]["changed"] == 0
              and "lossy" in res["errors"][0]["error"], str(res["errors"]))
        check("lossy: note left untouched on disk", "schema_version: 1" in before)
    finally:
        shutil.rmtree(tmp2, ignore_errors=True)

    print()
    print("P12 GATE:", "ALL PASS ✅" if ok else "FAILURES ❌")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
