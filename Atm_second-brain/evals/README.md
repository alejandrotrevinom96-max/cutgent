# Evals — making "expert" measurable

An expertise pack claims a domain skill through a **binary rubric**. Claiming isn't
proof. This harness turns each rubric into a *score*: given a candidate answer to a
domain task, it checks each operationalized rubric item and reports pass/fail.

Standard library only. Runs offline at $0. It is wired into the guardrail gate
(`selftest/cases/test_p15_evals.py`, invariant `INV-EVAL-DISCRIMINATES`).

## How it works

- `specs/<domain>.json` — one eval spec per expertise pack. Each has tasks; each
  task has `checks` (operationalized rubric items), a `golden` answer that should
  pass them all, and a `decoy` answer that should fail at least one.
- `runner.py` — the deterministic scorer. A check passes iff all its `all_of`
  patterns appear, at least one `any_of` appears (when given), and none of its
  `must_avoid` patterns appear. Patterns are case-insensitive substrings, or
  regexes when prefixed `re:`.

The shipped golden/decoy answers **prove the checks discriminate** — a check that
can't tell a good answer from a bad one isn't a measurement. The gate fails if any
golden doesn't pass all checks or any decoy passes them all.

> Note: the scorer can't read negation. A `must_avoid` phrase counts even inside
> "don't do X", so golden answers never contain the forbidden phrases verbatim.

## Use it

```bash
# list domains with specs
python3 scripts/brain.py eval

# discrimination demo for a domain (golden vs decoy)
python3 scripts/brain.py eval negotiation

# score YOUR (or the agent's) answer against a task's rubric
python3 scripts/brain.py eval negotiation --task=salary-prep --answer=my_answer.md
```

The last form is the real payoff: point it at an answer and get an objective,
rubric-grounded pass/fail per criterion — the same bar the pack promises.

## Extending

Add `specs/<newdomain>.json` for any pack, following an existing spec. Keep checks
grounded in that pack's `rubric.md`, include at least one `must_avoid` for the
domain's honesty/boundary, and verify it discriminates:

```bash
python3 -c "import sys;sys.path.insert(0,'evals');import runner;\
print([r['discriminates'] for r in runner.discrimination(runner.load_spec('newdomain'))])"
```

Multiple tasks per domain are encouraged — more tasks, more coverage of the rubric.
