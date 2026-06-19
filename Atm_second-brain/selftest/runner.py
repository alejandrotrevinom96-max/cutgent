"""Fixture runner: execute a write-fixture against an isolated temp vault and
check the expected accept/reject outcome. Standard library only.
"""
from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FIXTURES = os.path.join(HERE, "fixtures")
sys.path.insert(0, os.path.join(ROOT, "server"))


def _isolate(tmp: str) -> None:
    """Point config at a fresh temp vault root with a copy of the real schema."""
    import config
    os.makedirs(os.path.join(tmp, "vault", "concepts"), exist_ok=True)
    os.makedirs(os.path.join(tmp, "_schema"), exist_ok=True)
    for f in ("schema.v1.json", "CURRENT"):
        shutil.copy(os.path.join(ROOT, "_schema", f), os.path.join(tmp, "_schema", f))
    config.VAULT_ROOT = tmp
    config.VAULT_DIR = os.path.join(tmp, "vault")
    config.SCHEMA_DIR = os.path.join(tmp, "_schema")
    config.DB_PATH = os.path.join(tmp, ".atm", "index.db")
    import validate
    validate.load_schema.cache_clear()


def run_fixture(fx: dict) -> tuple[bool, str]:
    from protocol import RpcError
    tmp = tempfile.mkdtemp()
    try:
        _isolate(tmp)
        import writer
        for s in fx.get("setup", []):
            p = os.path.join(tmp, s["path"])
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, "w", encoding="utf-8") as fh:
                fh.write(s["content"])

        args = fx["args"]
        expect = fx["expect"]
        try:
            res = writer.write_with_provenance(
                path=args["path"], frontmatter=args.get("frontmatter") or {},
                body=args.get("body") or "", trust_tier=args.get("trust_tier"),
                expected_hash=args.get("expected_hash"))
            if expect == "accept":
                return True, f"accepted as expected ({res.get('effective_tier')})"
            return False, f"expected reject but accepted: {res}"
        except RpcError as e:
            if expect == "reject":
                want = fx.get("error_contains")
                if want and want.lower() not in e.message.lower():
                    return False, f"rejected but message lacks {want!r}: {e.message}"
                return True, f"rejected as expected: {e.message}"
            return False, f"expected accept but rejected: {e.message}"
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def all_fixtures() -> list[dict]:
    out = []
    for name in sorted(os.listdir(FIXTURES)):
        if name.endswith(".json"):
            with open(os.path.join(FIXTURES, name), encoding="utf-8") as fh:
                fx = json.load(fh)
                fx.setdefault("name", name[:-5])
                out.append(fx)
    return out
