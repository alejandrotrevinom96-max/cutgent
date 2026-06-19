"""P8 gate: pilot expertise packs validate against the template.

For each pilot pack:
  - SKILL.md exists (frontmatter validity is enforced by test_p7_skills)
  - companion files exist: exemplars.md, rubric.md, anti-patterns.md, sources.md
  - rubric.md contains binary (checkbox) checks
  - the requested 'image-video-editing-generation' pack is present

Run:  python3 selftest/cases/test_p8_expertise.py
"""
from __future__ import annotations

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SKILLS = os.path.join(ROOT, ".claude", "skills")

PILOTS = ["image-video-editing-generation", "web-design", "copywriting",
          "negotiation", "business-strategy", "personal-finance", "counsel",
          "communication", "3d-animation", "learning", "productivity",
          "software-engineering", "data-analysis", "marketing-growth", "sales",
          "leadership-management", "decision-making", "health-fitness", "writing",
          "psychology", "philosophy",
          "cinematography", "content-strategy", "product-design-ux", "legal-literacy",
          "brand-identity", "photography", "business-finance", "sound-audio",
          "relationships", "career"]
COMPANIONS = ["exemplars.md", "rubric.md", "anti-patterns.md", "sources.md"]

ok = True


def check(name: str, cond: bool, detail: str = "") -> None:
    global ok
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    if not cond:
        ok = False


def main() -> int:
    check("requested image-video pack exists",
          os.path.isdir(os.path.join(SKILLS, "image-video-editing-generation")))

    for pack in PILOTS:
        pdir = os.path.join(SKILLS, pack)
        check(f"{pack}: SKILL.md present", os.path.exists(os.path.join(pdir, "SKILL.md")))
        for c in COMPANIONS:
            check(f"{pack}: {c} present", os.path.exists(os.path.join(pdir, c)))
        rubric_path = os.path.join(pdir, "rubric.md")
        if os.path.exists(rubric_path):
            rubric = open(rubric_path, encoding="utf-8").read()
            n_checks = rubric.count("- [ ]")
            check(f"{pack}: rubric is binary (>=8 checkboxes)", n_checks >= 8, f"{n_checks} checks")

    print()
    print("P8 GATE:", "ALL PASS ✅" if ok else "FAILURES ❌")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
