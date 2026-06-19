"""P4 gate: write_with_provenance accepts good writes, rejects bad ones, keeps
human atoms immutable, and refuses trust laundering.

Runs against an isolated temp vault so the committed vault is never touched.
Run:  python3 selftest/cases/test_p4_write.py
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


def check(name: str, cond: bool, detail: str = "") -> None:
    global ok
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    if not cond:
        ok = False


def expect_reject(name: str, fn) -> None:
    from protocol import RpcError
    try:
        fn()
        check(name, False, "expected rejection but write succeeded")
    except RpcError as e:
        check(name, True, e.message)


def main() -> int:
    tmp = tempfile.mkdtemp()
    try:
        # Build an isolated vault root with a copy of the real schema.
        os.makedirs(os.path.join(tmp, "vault", "concepts"))
        os.makedirs(os.path.join(tmp, "_schema"))
        for f in ("schema.v1.json", "CURRENT"):
            shutil.copy(os.path.join(ROOT, "_schema", f), os.path.join(tmp, "_schema", f))

        config.VAULT_ROOT = tmp
        config.VAULT_DIR = os.path.join(tmp, "vault")
        config.SCHEMA_DIR = os.path.join(tmp, "_schema")
        config.DB_PATH = os.path.join(tmp, ".atm", "index.db")

        import validate
        validate.load_schema.cache_clear()
        import writer
        import parser as note_parser

        good_fm = {
            "id": "20260619120000-test-note",
            "title": "Test Note",
            "type": "concept",
            "tags": ["test"],
        }

        # 1. good new write accepted
        res = writer.write_with_provenance(
            "vault/concepts/test.md", good_fm, "A body about retrieval and graphs.")
        check("good write accepted", res["created"] and res["effective_tier"] == "self-authored", str(res))
        abs_path = os.path.join(tmp, "vault", "concepts", "test.md")
        check("file written to disk", os.path.exists(abs_path))

        # 2. round-trip: re-parse, validate, provenance stamped
        note = note_parser.parse_file(abs_path, "vault/concepts/test.md")
        check("written frontmatter validates", validate.validate_frontmatter(note.frontmatter, 1) == [],
              str(validate.validate_frontmatter(note.frontmatter, 1)))
        ch = note.frontmatter.get("provenance", {}).get("content_hash")
        check("content_hash matches body", ch == note.body_hash, f"{ch} vs {note.body_hash}")
        check("tier_lineage stamped", len(note.frontmatter["provenance"]["tier_lineage"]) == 1)

        # 3. invalid frontmatter rejected (bad id pattern)
        expect_reject("bad id pattern rejected", lambda: writer.write_with_provenance(
            "vault/concepts/bad.md", {**good_fm, "id": "NOT VALID ID"}, "x"))

        # 4. wrong schema_version rejected (no auto-upgrade)
        expect_reject("stale schema_version rejected", lambda: writer.write_with_provenance(
            "vault/concepts/bad2.md", {**good_fm, "id": "20260619120001-x", "schema_version": 99}, "x"))

        # 5. minting author=human rejected
        expect_reject("author=human cannot be minted", lambda: writer.write_with_provenance(
            "vault/concepts/bad3.md", {**good_fm, "id": "20260619120002-x", "author": "human"}, "x"))

        # 6. minting trust_tier=human-confirmed rejected
        expect_reject("human-confirmed cannot be minted", lambda: writer.write_with_provenance(
            "vault/concepts/bad4.md", {**good_fm, "id": "20260619120003-x"}, "x",
            trust_tier="human-confirmed"))

        # 7. human-atom immutability: a human note on disk cannot be edited here
        human_path = os.path.join(tmp, "vault", "concepts", "human.md")
        with open(human_path, "w") as fh:
            fh.write('---\nschema_version: 1\nid: "20260619120004-human"\ntitle: "H"\n'
                     'type: concept\ncreated: 2026-06-19\nupdated: 2026-06-19\n'
                     'trust_tier: human-confirmed\nauthor: human\n---\n\nHuman wisdom.\n')
        expect_reject("human-authored note is immutable", lambda: writer.write_with_provenance(
            "vault/concepts/human.md", {**good_fm, "id": "20260619120004-human"}, "agent edit"))

        # 8. anti-laundering: cannot raise an existing note's tier
        writer.write_with_provenance(
            "vault/concepts/ext.md", {**good_fm, "id": "20260619120005-ext"}, "ingested",
            trust_tier="externally-ingested")
        expect_reject("cannot raise externally-ingested -> self-authored",
                      lambda: writer.write_with_provenance(
                          "vault/concepts/ext.md", {**good_fm, "id": "20260619120005-ext"},
                          "now mine", trust_tier="self-authored"))

        # 9. optimistic lock
        expect_reject("expected_hash mismatch rejected", lambda: writer.write_with_provenance(
            "vault/concepts/test.md", good_fm, "changed", expected_hash="deadbeef"))

    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print()
    print("P4 GATE:", "ALL PASS ✅" if ok else "FAILURES ❌")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
