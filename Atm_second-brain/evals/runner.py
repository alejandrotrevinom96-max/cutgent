"""Eval harness — make "expert" a measured fact, not an asserted one.

An expertise pack claims a domain skill via a binary rubric. This harness turns
that into a *score*: given a candidate answer to a domain task, it checks each
operationalized rubric item and reports pass/fail. Standard library only.

A spec lives at `evals/specs/<domain>.json`:

    {
      "domain": "negotiation",
      "rubric": ".claude/skills/negotiation/rubric.md",
      "tasks": [
        {
          "id": "salary-prep",
          "prompt": "Prep me to negotiate a job offer.",
          "checks": [
            {"id": "batna", "desc": "Establishes a BATNA / walk-away",
             "any_of": ["batna", "walk away", "walk-away", "best alternative"]},
            {"id": "trade", "desc": "Trades concessions, never unilateral",
             "any_of": ["in return", "in exchange", "if you ", "trade"]},
            {"id": "honest", "desc": "No fabricated leverage",
             "must_avoid": ["invent a competing offer", "lie about", "make up an offer"]}
          ],
          "golden": "…an answer that satisfies every check…",
          "decoy":  "…an answer that misses at least one…"
        }
      ]
    }

A check passes iff: all `all_of` patterns present AND (at least one `any_of`
present, if `any_of` given) AND no `must_avoid` pattern present. Patterns are
case-insensitive substrings, or regexes when prefixed with `re:`.

The shipped golden/decoy answers PROVE the scorer discriminates (golden passes
every check; decoy fails at least one). In real use you score the agent's own
answer:  `brain.py eval <domain> --task <id> --answer answer.md`.
"""
from __future__ import annotations

import json
import os
import re
from typing import Optional

HERE = os.path.dirname(os.path.abspath(__file__))
SPECS_DIR = os.path.join(HERE, "specs")
ROOT = os.path.dirname(HERE)


def _match(pattern: str, text: str) -> bool:
    if pattern.startswith("re:"):
        return re.search(pattern[3:], text, re.IGNORECASE | re.DOTALL) is not None
    return pattern.lower() in text


def eval_check(check: dict, answer: str) -> bool:
    """True iff the answer satisfies this one operationalized rubric item."""
    text = (answer or "").lower()
    for p in check.get("all_of", []):
        if not _match(p, text):
            return False
    any_of = check.get("any_of", [])
    if any_of and not any(_match(p, text) for p in any_of):
        return False
    for p in check.get("must_avoid", []):
        if _match(p, text):
            return False
    return True


def score_answer(task: dict, answer: str) -> dict:
    """Score one answer against one task's checks. Deterministic."""
    results = []
    for c in task["checks"]:
        ok = eval_check(c, answer)
        results.append({"id": c["id"], "desc": c.get("desc", ""), "passed": ok})
    passed = sum(1 for r in results if r["passed"])
    total = len(results)
    return {
        "task": task["id"],
        "passed": passed,
        "total": total,
        "score": round(passed / total, 3) if total else 0.0,
        "all_passed": passed == total,
        "checks": results,
    }


def load_spec(domain: str) -> Optional[dict]:
    path = os.path.join(SPECS_DIR, f"{domain}.json")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def all_specs() -> list[dict]:
    out = []
    if not os.path.isdir(SPECS_DIR):
        return out
    for name in sorted(os.listdir(SPECS_DIR)):
        if name.endswith(".json"):
            with open(os.path.join(SPECS_DIR, name), encoding="utf-8") as fh:
                out.append(json.load(fh))
    return out


def discrimination(spec: dict) -> list[dict]:
    """For each task, score the shipped golden and decoy. A well-formed task has
    golden all-pass and decoy not-all-pass — proving the checks actually bite."""
    rows = []
    for task in spec.get("tasks", []):
        g = score_answer(task, task.get("golden", ""))
        d = score_answer(task, task.get("decoy", ""))
        rows.append({
            "task": task["id"],
            "golden_all_passed": g["all_passed"],
            "decoy_all_passed": d["all_passed"],
            "discriminates": g["all_passed"] and not d["all_passed"],
            "golden": g, "decoy": d,
        })
    return rows
