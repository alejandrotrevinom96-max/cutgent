# Exemplars — Software Engineering

## Deep modules (Ousterhout, *A Philosophy of Software Design*)
A great module has a simple interface relative to what it does. Unix file I/O is
~5 calls hiding buffering, allocation, permissions, devices. Counter: Java stream
classes you must assemble — shallow modules pushing complexity onto every caller.
**Why:** interface cost is paid by every caller; implementation cost once. Make
interfaces cheap even as implementations get richer.

## Unix philosophy
Small programs that do one thing well, composed via text: `grep | sort | uniq -c
| sort -rn`. **Why:** sharp single-purpose tools with a uniform interface compose
into solutions the authors never anticipated.

## Refactoring in tiny steps (Fowler, *Refactoring*)
Behavior-preserving changes in named steps (Extract Function, Rename) with green
tests after each. **Why:** separates "change structure" from "change behavior" so
a review/bisect can tell which a commit did. Refactor before a hard feature:
"make the change easy, then make the easy change."

## TDD on a real bug (Beck)
Bug → smallest failing test reproducing it (RED) → minimal fix (GREEN) → clean up
(REFACTOR). **Why:** proves the bug existed, proves the fix works, prevents
regression, and forces you to actually reproduce before "fixing."

## Boring technology
PostgreSQL over a new datastore; a queue table before a new broker; a monolith
before microservices for a small team. **Why:** well-trodden tools have known
failure modes, mature tooling, and answers online. Novelty has an operational tax.

## A great code review comment
Not "this is wrong" but: "If `items` is empty this throws on line 12 — add a test
for the empty case? Otherwise nice; the extracted `validate()` reads well." **Why:**
specific, points at a concrete failure, asks rather than commands, acknowledges
what's good.

## Choose the data structure first
A nested-loop O(n^2) lookup rewritten as a hash map: 30s -> 30ms with less code.
**Why:** "Smart data structures and dumb code work better than the other way
around." Match the structure to the access pattern; the algorithm often falls out.
