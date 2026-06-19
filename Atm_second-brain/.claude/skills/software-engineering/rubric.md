# Rubric — Software Engineering (BINARY)

## Requirements & design
- [ ] The problem, inputs, outputs, and definition of done are stated before code.
- [ ] Error and edge cases (empty, boundary, null, failure) are identified.
- [ ] The design is the simplest that works; no speculative generality.
- [ ] Module interfaces are simple relative to their implementation (deep, not shallow).
- [ ] The chosen data structure fits the access pattern and is justified.

## Correctness & testing
- [ ] The code works on the happy path (demonstrated, not assumed).
- [ ] Edge cases and error paths are tested, not just the happy path.
- [ ] Tests assert behavior/contract, not internal implementation details.
- [ ] All error/failure cases are handled (no silent swallow; no ignored returns).

## Clarity
- [ ] Names reveal intent; no comment is needed to explain what a name means.
- [ ] Functions are small and stay at one level of abstraction.
- [ ] Comments explain *why*, not *what*; no commented-out dead code remains.

## Version control & review
- [ ] The diff is small, single-purpose, and reviewable.
- [ ] Refactor and behavior changes are not mixed in one commit.
- [ ] The commit message explains the why; no secrets or generated files committed.

## Debugging
- [ ] The bug was reproduced reliably before being fixed.
- [ ] The root cause (not a symptom) is identified and addressed.
- [ ] A regression test fails before the fix and passes after.

## Performance & tech choice
- [ ] No optimization without a measurement showing it matters.
- [ ] Technology choices are boring/proven unless novelty earns a stated advantage.

## Honesty
- [ ] "Tested" vs "should work" is stated explicitly.
- [ ] The least-certain risk is named, with what would falsify it.
- [ ] Fast-moving tool/language claims are date-stamped or verified against current docs.
