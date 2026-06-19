"""P17 gate: guarded memory consolidation.

Proves consolidate:
  - PROVENANCE: the synthesis cites every source it consolidated (sources[] has one
    entry per source note) and emits consolidates:: wikilinks that resolve.
  - WRITES THROUGH THE GUARDRAILS: the note is author=agent, self-authored (never
    human/human-confirmed), schema-valid, with a verifying content_hash.
  - ANTI-AUTOPHAGY: when a topic's grounding can't meet the human-information floor,
    consolidate REFUSES rather than synthesizing from the agent's own output.
  - NON-DESTRUCTIVE: source notes are never modified or deleted.

Run:  python3 selftest/cases/test_p17_consolidate.py
"""
from __future__ import annotations

import hashlib
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "server"))

ok = True


def check(name: str, cond: bool, detail: str = "") -> None:
    global ok
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    if not cond:
        ok = False


def _isolate(tmp: str):
    import shutil
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


def _note(tmp, name, nid, title, author, tier, body):
    p = os.path.join(tmp, "vault", "concepts", name)
    fm = (f"---\nschema_version: 1\nid: \"{nid}\"\ntitle: \"{title}\"\ntype: note\n"
          f"created: 2026-06-19\nupdated: 2026-06-19\ntrust_tier: {tier}\nauthor: {author}\n---\n\n"
          f"# {title}\n\n{body}\n")
    with open(p, "w", encoding="utf-8") as fh:
        fh.write(fm)
    return p


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        _isolate(tmp)
        import importlib
        import config
        import index as index_mod
        import recall as recall_mod
        import consolidate as consolidate_mod
        importlib.reload(index_mod)
        importlib.reload(recall_mod)
        importlib.reload(consolidate_mod)
        db = config.DB_PATH

        # --- topic with human-grounded sources: should consolidate ---
        p1 = _note(tmp, "a.md", "20260619000201-photosynthesis-basics", "Photosynthesis basics",
                   "human", "human-confirmed",
                   "Photosynthesis converts light energy, water, and carbon dioxide into glucose and oxygen in chloroplasts.")
        p2 = _note(tmp, "b.md", "20260619000202-light-reactions", "Light reactions",
                   "human", "human-confirmed",
                   "The light reactions of photosynthesis split water and produce ATP and NADPH in the thylakoid.")
        p3 = _note(tmp, "c.md", "20260619000203-calvin-cycle", "Calvin cycle notes",
                   "agent", "self-authored",
                   "The Calvin cycle of photosynthesis fixes carbon dioxide into glucose using ATP and NADPH.")
        before = {p: hashlib.sha256(open(p, "rb").read()).hexdigest() for p in (p1, p2, p3)}

        prev = consolidate_mod.consolidate("photosynthesis light reactions calvin", k=8,
                                           dry_run=True, db_path=db)
        check("dry-run consolidate succeeds with human-grounded topic", prev.get("ok") is True, str(prev)[:200])
        check("dry-run cites multiple sources", prev.get("n_sources", 0) >= 2, str(prev.get("n_sources")))
        check("dry-run writes nothing", not os.path.exists(os.path.join(tmp, prev["path"])))

        res = consolidate_mod.consolidate("photosynthesis light reactions calvin", k=8,
                                          dry_run=False, db_path=db)
        check("apply consolidate succeeds", res.get("ok") and res.get("written"), str(res)[:200])
        written_abs = os.path.join(tmp, res["written"])
        check("synthesis note exists on disk", os.path.exists(written_abs))

        import parser as note_parser
        n = note_parser.parse_file(written_abs, res["written"])
        fm = n.frontmatter
        check("synthesis is author=agent, self-authored",
              fm.get("author") == "agent" and fm.get("trust_tier") == "self-authored",
              f"author={fm.get('author')} tier={fm.get('trust_tier')}")
        check("synthesis cites every source in sources[]",
              isinstance(fm.get("sources"), list) and len(fm["sources"]) == res["n_sources"],
              f"sources={len(fm.get('sources') or [])} n={res['n_sources']}")
        check("every source[].cite is non-empty",
              all((s.get("cite") or "").strip() for s in fm.get("sources") or []))

        # content_hash verifies against the stored body
        real = note_parser.sha256(n.body)
        check("content_hash verifies on re-read",
              (fm.get("provenance") or {}).get("content_hash") == real,
              f"stamped={(fm.get('provenance') or {}).get('content_hash','')[:12]} real={real[:12]}")

        # consolidates:: links resolve to the source notes
        index_mod.reindex(full=True, db_path=db)
        con = index_mod.connect(db)
        syn = con.execute("SELECT id FROM notes WHERE path LIKE '%synthesis%'").fetchone()
        links = con.execute(
            "SELECT target, dst_id FROM links WHERE src_id=?", (syn["id"],)
        ).fetchall()
        resolved = [l for l in links if l["dst_id"]]
        check("consolidates:: wikilinks resolve to real notes", len(resolved) >= 2,
              f"{len(resolved)} resolved of {len(links)}")
        con.close()

        # --- non-destructive: sources unchanged ---
        after = {p: hashlib.sha256(open(p, "rb").read()).hexdigest() for p in (p1, p2, p3)}
        check("source notes are never modified or deleted", before == after)

        # --- anti-autophagy: an all-agent topic must be refused ---
        _note(tmp, "z1.md", "20260619000301-zorptweak-one", "Zorptweak one", "agent", "self-authored",
              "Zorptweak is a synthetic agent-only concept with quibblezorp and frobnicate.")
        _note(tmp, "z2.md", "20260619000302-zorptweak-two", "Zorptweak two", "agent", "self-authored",
              "More zorptweak quibblezorp notes, all agent-authored, no human grounding.")
        index_mod.reindex(full=True, db_path=db)
        refused = consolidate_mod.consolidate("zorptweak quibblezorp", k=8, dry_run=True, db_path=db)
        check("anti-autophagy: all-agent topic is refused",
              refused.get("ok") is False and "autophagy" in (refused.get("reason") or "").lower(),
              str(refused)[:200])

    print()
    print("P17 GATE:", "ALL PASS ✅" if ok else "FAILURES ❌")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
