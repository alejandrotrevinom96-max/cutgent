---
name: software-engineering
description: "Method for writing, reviewing, debugging, and designing software well: clarify requirements, design for simplicity (deep modules, low complexity), make it work then right then fast, test (TDD where it fits), name things clearly, keep version-control hygiene, review code, and debug systematically (reproduce, isolate, fix, regression-test). Use when writing, reviewing, or refactoring code; debugging a bug; designing an API, module, or architecture; choosing a data structure or algorithm; deciding what to test; or judging whether a change is mergeable. Applies a binary rubric and exemplars rather than a persona, and prefers boring, proven technology. The personal layer (the user's stack, languages, conventions, repo, and prior decisions, via recall) overrides generic best practice."
---

# Software Engineering

Operating method for building software that stays cheap to change. The enemy is
complexity — dependencies and obscurity that compound until every change is risky.
Most of these moves exist to keep complexity from accumulating.

## PRECEDENCE: personal layer wins

The user's `personal/` layer (their actual languages, frameworks, runtime,
existing codebase conventions, style guide, CI setup, and prior decisions) is
pulled via recall and **OVERRIDES the generic best practice here.** Generic
defaults apply only in the absence of specific context. Match the surrounding
code before improving it; state the override when you apply it.

## Method (run in order)

1. **Clarify the problem first.** Restate the requirement, constraints, and the
   definition of done before writing code. Name inputs, outputs, error cases, and
   callers. Unstated requirements are the #1 source of rework; if ambiguous, ask
   or state the assumption.
2. **Design for simplicity.** Prefer **deep modules**: a simple interface hiding
   substantial implementation. Push complexity down and out of callers. Reduce
   dependencies and obscurity. The best design makes the *next* change easy.
   Choose the simplest data structure that fits the access pattern.
3. **Make it work, then right, then fast — in that order.** Correct simple version
   first; refactor for clarity; optimize last and only what you measured.
4. **Test, and use TDD where it fits.** Test behavior, not implementation. Cover
   happy path AND edge cases (empty, boundary, null, error, concurrency). TDD fits
   pure logic, bug fixes, clear specs; it fits exploratory/UI spikes poorly.
5. **Name to reveal intent.** A name should make a comment unnecessary. Small,
   focused functions; one level of abstraction each. Comment the *why*. Delete
   dead code (git remembers).
6. **Version-control hygiene.** Small, atomic, single-purpose commits with
   messages explaining why. Don't mix refactor + behavior change. No secrets or
   generated artifacts.
7. **Review like it'll break at 3 a.m.** Check correctness, edge cases, naming,
   tests, and whether complexity went up or down. Specific and kind.
8. **Debug as a method.** Reproduce reliably → isolate (bisect, read the actual
   error) → fix the root cause → add a regression test that fails before/passes
   after → verify nearby. Change one thing at a time; don't fix symptoms.
9. **Boring technology by default.** Prefer proven tools; spend limited
   "innovation tokens" only where they create real advantage.

## Honesty rules

- Distinguish "I tested this" from "this should work." Say which.
- Flag the risk you're least sure about and what would falsify it.
- Premature optimization/abstraction/speculative generality are failures even
  when they feel professional.
- Date-stamp fast-moving language/framework/tool claims and verify against docs.
