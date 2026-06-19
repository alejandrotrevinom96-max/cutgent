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

## Vector candidate generation (P18 — done)

The optional embedding layer is no longer rerank-only. `brain.py embed` builds a
**persisted vector cache** in the index (`embeddings` table: model id + content
hash + packed float32), incremental and pruned on delete. When the cache is
present, `recall` does real **vector candidate generation** — cosine over the
cache (one query embedding per call) — so a paraphrase that shares *no* term with
the query can surface. Such hits are reported in the trace under a distinct,
honest `semantic` category (never faked as a graph edge). Absent a provider or
cache, recall degrades to the lexical RRF hybrid. The default still ships **no
model** (zero-dependency); cosine is brute-force pure Python.

- **Cost:** one query embedding + an O(N·dim) cosine scan per query. Fine for
  opt-in vaults; for very large corpora a native vector index (e.g. sqlite-vec)
  can replace the brute-force scan behind the same `vectors.query_similarities`
  contract without touching recall.
- **Remaining options (not gaps):** parallelize full reindex (multiprocessing) for
  50k+ cold starts; swap the brute-force cosine for an ANN index at large scale.
  Both are drop-in behind existing seams; today's defaults are intentionally simple.
