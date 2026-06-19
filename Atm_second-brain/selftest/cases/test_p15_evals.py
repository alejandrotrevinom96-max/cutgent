"""P15 gate: the eval harness makes "expert" measurable, and its checks bite.

For every shipped eval spec:
  - it is well-formed (domain, a real rubric path, >=1 task; each task has
    checks, a golden answer, and a decoy answer);
  - its domain corresponds to a real expertise pack;
  - EACH task discriminates: the golden answer passes every check, and the decoy
    answer fails at least one. (A check that can't tell golden from decoy is not a
    real measurement — that's the property under test.)
  - the scorer is deterministic (same answer -> same score).

Also asserts a baseline of flagship domains is covered, so the harness isn't empty.

Run:  python3 selftest/cases/test_p15_evals.py
"""
from __future__ import annotations

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "evals"))

import runner as evals  # noqa: E402

SKILLS = os.path.join(ROOT, ".claude", "skills")
FLAGSHIP = {"negotiation", "decision-making"}  # must always be covered

ok = True


def check(name: str, cond: bool, detail: str = "") -> None:
    global ok
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    if not cond:
        ok = False


def main() -> int:
    specs = evals.all_specs()
    domains = {s.get("domain") for s in specs}
    check(f"eval specs present ({len(specs)})", len(specs) >= 1, str(sorted(domains)))
    check("flagship domains covered", FLAGSHIP <= domains, str(FLAGSHIP - domains))

    for spec in specs:
        d = spec.get("domain", "?")
        check(f"{d}: maps to a real expertise pack",
              os.path.isdir(os.path.join(SKILLS, d)))
        rubric = spec.get("rubric", "")
        check(f"{d}: references its rubric file",
              bool(rubric) and os.path.exists(os.path.join(ROOT, rubric)), rubric)
        tasks = spec.get("tasks", [])
        check(f"{d}: has >=1 task", len(tasks) >= 1)

        for task in tasks:
            tid = task.get("id", "?")
            checks = task.get("checks", [])
            check(f"{d}/{tid}: has checks + golden + decoy",
                  len(checks) >= 3 and "golden" in task and "decoy" in task,
                  f"{len(checks)} checks")
            g = evals.score_answer(task, task.get("golden", ""))
            de = evals.score_answer(task, task.get("decoy", ""))
            check(f"{d}/{tid}: golden passes every check",
                  g["all_passed"], f"{g['passed']}/{g['total']} "
                  f"failed={[c['id'] for c in g['checks'] if not c['passed']]}")
            check(f"{d}/{tid}: decoy fails at least one check (checks discriminate)",
                  not de["all_passed"], f"decoy scored {de['passed']}/{de['total']}")
            # determinism
            g2 = evals.score_answer(task, task.get("golden", ""))
            check(f"{d}/{tid}: scorer is deterministic", g2 == g)

    print()
    print("P15 GATE:", "ALL PASS ✅" if ok else "FAILURES ❌")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
