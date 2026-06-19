# Anti-patterns — Software Engineering

- **Coding before clarifying.** No written definition of done; requirements found
  in review. *Fix:* restate problem/inputs/outputs/edge cases first.
- **Shallow modules / leaky abstractions.** Interface as complex as the body.
  *Detect:* callers must call methods in a magic order. *Fix:* deepen the module.
- **Premature optimization.** Unreadable code, no benchmark. *Fix:* revert to
  clear; measure; optimize only the proven hot path.
- **Premature abstraction / speculative generality.** Framework-for-one, unused
  config. *Fix:* delete it; add on the second case (rule of three).
- **Tests that mirror the code.** Asserting internal calls/mocks; refactor turns
  them red. *Fix:* assert observable behavior at the boundary.
- **Happy-path-only testing.** No empty/null/boundary/error coverage. *Fix:* add
  edge tests.
- **Symptom fixing.** Patching the observed failure, not the cause. *Fix:*
  reproduce -> isolate root cause -> regression test.
- **Fixing without reproducing.** "I think this is it." *Fix:* reproduce first.
- **Mega-diffs.** Refactor + feature + format in one PR. *Fix:* split into atomic
  commits.
- **Clever over clear.** Dense one-liners, magic numbers. *Fix:* rewrite plainly.
- **Resume-driven / shiny tech.** Novelty with no operational case. *Fix:* default
  to boring.
- **Cargo-culting "Clean Code."** Over-extraction into ten files to follow one
  operation. *Fix:* keep related code together; extract for reuse/clarity, not dogma.
- **Swallowing errors.** Empty catch blocks, unchecked returns. *Fix:* handle or
  propagate with context.
