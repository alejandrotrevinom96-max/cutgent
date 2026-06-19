"""P7 gate: every Agent Skill has valid frontmatter.

Rules checked (INV-SKILL-VALID):
  - SKILL.md present with a YAML frontmatter block
  - name present, == folder name, kebab-case, <= 64 chars
  - description present, <= 1024 chars
  - neither name nor description contains 'claude' or 'anthropic'
  - a non-empty body after the frontmatter

Run:  python3 selftest/cases/test_p7_skills.py
"""
from __future__ import annotations

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "server"))
SKILLS = os.path.join(ROOT, ".claude", "skills")

import miniyaml  # noqa: E402

ok = True
NAME_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
FM_RE = re.compile(r"^---\n(.*?)\n---\n?(.*)\Z", re.S)


def check(name: str, cond: bool, detail: str = "") -> None:
    global ok
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    if not cond:
        ok = False


def main() -> int:
    dirs = [d for d in sorted(os.listdir(SKILLS))
            if os.path.isdir(os.path.join(SKILLS, d)) and not d.startswith(".")]
    check("at least the base skills + supervisor + template exist", len(dirs) >= 6, str(dirs))

    expected = {"vault-conventions", "vault-capture", "vault-review", "vault-git",
                "pack-supervisor", "expertise-pack-template"}
    check("expected base skills present", expected.issubset(set(dirs)),
          f"missing={expected - set(dirs)}")

    for d in dirs:
        skill_md = os.path.join(SKILLS, d, "SKILL.md")
        if not os.path.exists(skill_md):
            check(f"{d}: SKILL.md present", False)
            continue
        text = open(skill_md, encoding="utf-8").read()
        m = FM_RE.match(text)
        if not m:
            check(f"{d}: has frontmatter", False)
            continue
        fm = miniyaml.load(m.group(1))
        body = m.group(2).strip()

        name = str(fm.get("name", ""))
        desc = str(fm.get("description", ""))
        blob = (name + " " + desc).lower()

        check(f"{d}: name == folder", name == d, name)
        check(f"{d}: name kebab-case & <=64", bool(NAME_RE.match(name)) and len(name) <= 64, name)
        check(f"{d}: description present & <=1024", 1 <= len(desc) <= 1024, f"len={len(desc)}")
        check(f"{d}: no 'claude'/'anthropic' in metadata",
              "claude" not in blob and "anthropic" not in blob)
        check(f"{d}: non-empty body", len(body) > 0)

    print()
    print("P7 GATE:", "ALL PASS ✅" if ok else "FAILURES ❌")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
