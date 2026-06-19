"""P10 gate: the personal/ layer + MOCs.

- every vault note (excluding templates) has schema-valid frontmatter
- the 12 personal notes exist as honest stubs (author=agent, self-authored, personal/stub)
- the Expertise Packs MOC links to all 11 personal/<domain> notes AND they resolve
- the Home MOC links resolve (Expertise Packs, personal/identity)

Run:  python3 selftest/cases/test_p10_vault.py
"""
from __future__ import annotations

import glob
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "server"))

import config  # noqa: E402
import index as index_mod  # noqa: E402
import parser as note_parser  # noqa: E402
import validate  # noqa: E402

ok = True
DOMAINS = ["web-design", "copywriting", "image-video-editing-generation", "negotiation",
           "business-strategy", "personal-finance", "counsel", "communication",
           "3d-animation", "learning", "productivity",
           "software-engineering", "data-analysis", "marketing-growth", "sales",
           "leadership-management", "decision-making", "health-fitness", "writing",
           "psychology", "philosophy"]


def check(name, cond, detail=""):
    global ok
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    if not cond:
        ok = False


def main() -> int:
    cur = config.current_schema_version()

    # 1. every vault note (non-template) is schema-valid
    notes = [p for p in glob.glob(os.path.join(config.VAULT_DIR, "**", "*.md"), recursive=True)
             if "/templates/" not in p and not p.endswith(".template.md")]
    bad = []
    for p in notes:
        n = note_parser.parse_file(p, os.path.relpath(p, config.VAULT_ROOT))
        errs = validate.validate_frontmatter(n.frontmatter, cur)
        if errs:
            bad.append((os.path.basename(p), errs[:2]))
    check(f"all {len(notes)} vault notes are schema-valid", not bad, str(bad[:3]))

    # 2. personal stubs exist & are honest
    pdir = os.path.join(config.VAULT_DIR, "personal")
    for d in ["identity"] + DOMAINS:
        fp = os.path.join(pdir, f"{d}.md")
        if not os.path.exists(fp):
            check(f"personal/{d}.md exists", False)
            continue
        n = note_parser.parse_file(fp, d)
        fm = n.frontmatter
        good = (fm.get("author") == "agent" and fm.get("trust_tier") == "self-authored"
                and "personal/stub" in (fm.get("tags") or [])
                and f"personal/{d}" in (fm.get("aliases") or []))
        check(f"personal/{d} is an honest stub with alias", good,
              f"author={fm.get('author')} tier={fm.get('trust_tier')}")

    # 3. reindex and verify MOC links resolve
    with tempfile.TemporaryDirectory() as tmp:
        db = os.path.join(tmp, "index.db")
        index_mod.reindex(full=True, db_path=db)
        con = index_mod.connect(db)

        moc = con.execute("SELECT id FROM notes WHERE path LIKE '%mocs/expertise-packs.md'").fetchone()
        check("expertise-packs MOC indexed", moc is not None)
        if moc:
            mid = moc["id"]
            for d in DOMAINS:
                row = con.execute(
                    "SELECT dst_id FROM links WHERE src_id=? AND target=?",
                    (mid, f"personal/{d}"),
                ).fetchone()
                check(f"MOC link [[personal/{d}]] resolves", row is not None and row["dst_id"],
                      "missing" if not row else f"dst={row['dst_id']}")
            ident = con.execute(
                "SELECT dst_id FROM links WHERE src_id=? AND target=?", (mid, "personal/identity")
            ).fetchone()
            check("MOC links to personal/identity and it resolves", ident is not None and ident["dst_id"])

        home = con.execute("SELECT id FROM notes WHERE path LIKE '%mocs/home.md'").fetchone()
        check("home MOC indexed", home is not None)
        if home:
            hl = con.execute(
                "SELECT dst_id FROM links WHERE src_id=? AND target=?", (home["id"], "Expertise Packs")
            ).fetchone()
            check("home -> [[Expertise Packs]] resolves", hl is not None and hl["dst_id"])

        broken = con.execute(
            "SELECT COUNT(*) c FROM links WHERE target LIKE 'personal/%' AND dst_id IS NULL"
        ).fetchone()["c"]
        check("no broken personal/* links anywhere", broken == 0, f"{broken} broken")
        con.close()

    print()
    print("P10 GATE:", "ALL PASS ✅" if ok else "FAILURES ❌")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
