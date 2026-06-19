# Benchmarks — scale behaviour

Measured with `scripts/bench.py`, which builds a synthetic vault of N notes
(seeded, ~50% human-authored, with wikilinks and tags), then times indexing and
retrieval. Standard library only; nothing here depends on the machine having a
model or network. Reproduce:

```bash
python3 scripts/bench.py 1000 10000 50000
```

## Results

Representative run (Python 3.11, SQLite FTS5 available, commodity CI container):

| notes  | full reindex | incremental (no change) | recall p50 | recall p95 | graph_export | human floor |
|-------:|-------------:|------------------------:|-----------:|-----------:|-------------:|:-----------:|
|  1,000 |       0.70 s |                  0.03 s |    ~55 ms  |    ~55 ms  |      0.04 s  |     met     |
|  5,000 |       9.3 s  |                  0.12 s |   ~165 ms  |   ~172 ms  |      0.18 s  |     met     |
| 10,000 |      33.8 s  |                  0.24 s |   ~295 ms  |   ~315 ms  |      0.31 s  |     met     |

(Numbers vary with hardware; the shapes are what matter.)

## What the numbers say

- **Recall is interactive into the tens of thousands of notes** (p50 ~0.3 s at
  10k). The anti-autophagy human-information floor is met on every query at every
  size — ranking changes never quietly disabled it.
- **The incremental fast-path is the load-bearing optimization.** `recall` keeps
  the index honest with disk on every call; a naive incremental reindex re-reads
  and re-hashes every file (O(N) per query — ~1.1 s at 5k). An `mtime` fast-path
  (`index.reindex`) skips untouched files without parsing, cutting that to ~0.12 s
  at 5k and making recall scale. A full rebuild (`--full`) is always the
  authoritative fallback. This property is gated by `test_p16_scale.py`
  (invariant `INV-SCALE-SANE`).
- **Full reindex is linear and is a cold-start / migration cost, not a query
  cost.** ~3.4 ms/note. It runs once; steady state is incremental.

## Known ceiling & next step

- **Retrieval is lexical + TF-IDF + graph (RRF), with an optional embedding
  *reranker*** (`ATM_EMBED_CMD`). The reranker reorders the lexical candidate pool;
  it does not yet do pure *vector candidate generation*, so a paraphrase that
  shares no term with the query must still enter the pool via lexical/PRF/graph.
  The documented next ceiling step is a **persisted embedding column** in the
  index (embed-on-write, cached) so vector search can generate candidates without
  re-embedding per query. That keeps the zero-dependency default (no model ships)
  while removing the last lexical-recall gap when a provider is configured.
- **Full-reindex throughput** could be parallelized (multiprocessing) if cold
  starts on very large vaults (50k+) become a pain; today it's a one-time cost.
