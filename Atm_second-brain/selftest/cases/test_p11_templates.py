"""P11 gate: PARA templates + the first-run onboarding note.

- the daily/project/area/resource templates exist with the right `type`
- templates are SKIPPED by the index (never pollute the graph / never indexed)
- the first-run note exists, is schema-valid, IS indexed, and its links resolve

Run:  python3 selftest/cases/test_p11_templates.py
"""
from __future__ import annotations

import os
import re
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "server"))

import config  # noqa: E402
import index as index_mod  # noqa: E402
import miniyaml  # noqa: E402
import parser as note_parser  # noqa: E402
import validate  # noqa: E402

ok = True
TEMPLATES = {
    "daily.template.md": "daily",
    "project.template.md": "project",
    "area.template.md": "area",
    "resource.template.md": "resource",
}
FM = re.compile(r"^---\n(.*?)\n---", re.S)


def check(name, cond, detail=""):
    global ok
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    if not cond:
        ok = False


def main() -> int:
    tdir = os.path.join(config.VAULT_DIR, "templates")
    for fname, exp_type in TEMPLATES.items():
        fp = os.path.join(tdir, fname)
        if not os.path.exists(fp):
            check(f"template {fname} exists", False)
            continue
        fm = miniyaml.load(FM.match(open(fp).read()).group(1))
        check(f"template {fname} has type={exp_type}", fm.get("type") == exp_type, str(fm.get("type")))

    # first-run note: schema-valid
    fr = os.path.join(config.VAULT_DIR, "meta", "first-run.md")
    check("first-run.md exists", os.path.exists(fr))
    if os.path.exists(fr):
        n = note_parser.parse_file(fr, "meta/first-run.md")
        errs = validate.validate_frontmatter(n.frontmatter, config.current_schema_version())
        check("first-run.md is schema-valid", errs == [], str(errs))

    # reindex: templates skipped, first-run indexed, its links resolve
    with tempfile.TemporaryDirectory() as tmp:
        db = os.path.join(tmp, "index.db")
        index_mod.reindex(full=True, db_path=db)
        con = index_mod.connect(db)

        tcount = con.execute(
            "SELECT COUNT(*) c FROM notes WHERE path LIKE '%/templates/%'"
        ).fetchone()["c"]
        check("templates are NOT indexed (skipped)", tcount == 0, f"{tcount} indexed")

        frow = con.execute("SELECT id FROM notes WHERE path LIKE '%meta/first-run.md'").fetchone()
        check("first-run note is indexed", frow is not None)
        if frow:
            broken = con.execute(
                "SELECT COUNT(*) c FROM links WHERE src_id=? AND dst_id IS NULL", (frow["id"],)
            ).fetchone()["c"]
            total = con.execute(
                "SELECT COUNT(*) c FROM links WHERE src_id=?", (frow["id"],)
            ).fetchone()["c"]
            check("first-run note's links all resolve", broken == 0, f"{broken}/{total} broken")
            check("first-run links to many personal notes", total >= 11, f"{total} links")
        con.close()

    print()
    print("P11 GATE:", "ALL PASS ✅" if ok else "FAILURES ❌")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
