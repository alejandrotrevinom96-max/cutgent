# Sources — Software Engineering

The personal layer (the user's stack and conventions) overrides generic best
practice. Date-stamp fast-moving language/framework/tool docs.

- **John Ousterhout** — *A Philosophy of Software Design* (2nd ed., 2021). The
  spine: complexity, deep vs shallow modules, information hiding.
- **Hunt & Thomas** — *The Pragmatic Programmer* (20th Anniv., 2019). DRY,
  orthogonality, "don't live with broken windows," debugging discipline.
- **Martin Fowler** — *Refactoring* (2nd ed., 2018). Small named steps; code
  smells; "make the change easy, then make the easy change."
- **Kent Beck** — *Test-Driven Development by Example* (2002). Red-green-refactor.
- **Martin Kleppmann** — *Designing Data-Intensive Applications* (2017). Data
  models, storage, replication, consistency trade-offs.
- **Robert C. Martin** — *Clean Code* (2008). Useful on naming/intent; **critique:**
  its function-size/extraction advice taken dogmatically over-fragments code —
  weigh against Ousterhout's deep modules.
- **Eric S. Raymond** — *The Cathedral and the Bazaar* + the Unix philosophy.
- **Dan McKinley** — "Choose Boring Technology" (2015). Innovation tokens.
- **Fred Brooks** — *The Mythical Man-Month* (1975). "No silver bullet."

## How to weigh them
Prefer the simplest design that survives the next change. When sources conflict
(Clean Code's tiny functions vs Ousterhout's deep modules), favor reduced
complexity for the reader. Repo conventions win over all of the above.
