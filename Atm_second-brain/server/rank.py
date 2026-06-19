"""Hybrid ranking primitives — pure standard library, no dependencies.

Plain bm25 (or LIKE) is a single lexical signal. Production-grade retrieval fuses
several weak signals into one ranking; this module supplies the zero-dependency
pieces of that, so `recall` is hybrid by construction rather than grep-only:

  - `tfidf_scores`  — a TF-IDF cosine ranker computed over the candidate pool,
                      a different lexical lens than bm25 (length/idf weighting).
  - `rrf_fuse`      — Reciprocal Rank Fusion, the standard way to combine ranked
                      lists from heterogeneous signals (bm25 + tfidf + embeddings
                      + graph) without having to calibrate their score scales.
  - `expand_query`  — pseudo-relevance feedback: mine the strongest co-occurring
                      terms from the top hits and add them, lifting recall of
                      related notes that don't repeat the query verbatim.

True synonym/paraphrase bridging needs vectors; that is the OPTIONAL embedding
reranker in `embeddings.py`. Everything here works offline at $0 (MECH-safe).
"""
from __future__ import annotations

import math
import re
from collections import Counter

_TERM = re.compile(r"[a-z0-9]+")
_STOP = {
    "the", "a", "an", "of", "to", "and", "or", "is", "in", "on", "for", "it",
    "this", "that", "with", "as", "at", "by", "be", "are", "was", "from", "but",
    "not", "you", "your", "we", "our", "i", "they", "their", "can", "will", "if",
    "so", "do", "how", "what", "when", "which", "who", "into", "over", "than",
}


def tokenize(text: str) -> list[str]:
    return [t for t in _TERM.findall((text or "").lower()) if t not in _STOP and len(t) > 1]


def _df(docs: dict[str, str]) -> tuple[dict[str, int], int]:
    """Document frequency of each term across the pool."""
    df: Counter = Counter()
    for text in docs.values():
        for t in set(tokenize(text)):
            df[t] += 1
    return df, len(docs)


def tfidf_scores(query_terms: list[str], docs: dict[str, str]) -> dict[str, float]:
    """Cosine similarity between the query and each doc in TF-IDF space.

    IDF is computed over the candidate pool (small, query-time). Returns id->score
    in [0, 1]; docs sharing rarer query terms and being more focused score higher.
    """
    if not docs or not query_terms:
        return {}
    df, n = _df(docs)
    idf = {t: math.log(1.0 + n / (1 + c)) for t, c in df.items()}
    default_idf = math.log(1.0 + n)
    # query vector (idf-weighted term presence)
    qvec = {t: idf.get(t, default_idf) for t in set(query_terms)}
    qnorm = math.sqrt(sum(w * w for w in qvec.values())) or 1.0

    out: dict[str, float] = {}
    for nid, text in docs.items():
        tf = Counter(tokenize(text))
        if not tf:
            continue
        # doc vector restricted to query terms (sparse dot product)
        dot = 0.0
        dnorm_sq = 0.0
        for t, c in tf.items():
            w = (1.0 + math.log(c)) * idf.get(t, default_idf)
            dnorm_sq += w * w
            if t in qvec:
                dot += w * qvec[t]
        dnorm = math.sqrt(dnorm_sq) or 1.0
        score = dot / (qnorm * dnorm)
        if score > 0:
            out[nid] = score
    return out


def rrf_fuse(rank_lists: list[list[str]], k: int = 60, weights: list[float] | None = None) -> dict[str, float]:
    """Reciprocal Rank Fusion. Each ranked list contributes weight/(k + rank).

    A document ranked highly by several signals beats one ranked highly by only
    one — without needing the signals' raw scores to be on the same scale.
    """
    if weights is None:
        weights = [1.0] * len(rank_lists)
    fused: dict[str, float] = {}
    for lst, w in zip(rank_lists, weights):
        for rank, nid in enumerate(lst):
            fused[nid] = fused.get(nid, 0.0) + w / (k + rank + 1)
    return fused


def expand_query(query_terms: list[str], docs: dict[str, str], top_ids: list[str],
                 max_add: int = 4, per_doc: int = 8) -> list[str]:
    """Pseudo-relevance feedback: terms that co-occur in the top hits and aren't
    already in the query. Bounded and deterministic. Empty if no top hits."""
    if not top_ids:
        return []
    qset = set(query_terms)
    counts: Counter = Counter()
    for nid in top_ids:
        text = docs.get(nid)
        if not text:
            continue
        for t, _c in Counter(tokenize(text)).most_common(per_doc):
            if t not in qset:
                counts[t] += 1
    # require the term to appear in at least two top docs when we have several,
    # so we expand on shared themes, not one document's idiosyncratic words
    threshold = 2 if len(top_ids) >= 2 else 1
    ranked = [t for t, c in counts.most_common() if c >= threshold]
    return ranked[:max_add]
