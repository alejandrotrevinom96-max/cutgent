"""Pluggable embedding provider — interface + a zero-dependency default.

The brain ships NO embedding model on purpose: bundling one would add a runtime
dependency and break the offline/$0 (MECH) floor. Instead, retrieval is hybrid by
construction (lexical bm25 + TF-IDF cosine + graph fusion in `rank`/`recall`), and
true vector/semantic reranking is an OPTIONAL layer you plug in:

    export ATM_EMBED_CMD='my-embedder'

The command receives one JSON object on stdin -- {"texts": ["...", "..."]} -- and
must print one JSON object on stdout -- {"vectors": [[...], [...]]} -- one vector
per input text, all the same length. Anything else (missing env, crash, timeout,
malformed output) makes the provider report unavailable and recall silently falls
back to lexical fusion. So enabling embeddings can only *add* precision; it can
never break the fail-closed, offline guarantees.

This file is the entire contract. cosine() is stdlib math.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import shutil
import subprocess
from functools import lru_cache
from typing import Optional


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


class EmbeddingProvider:
    """Interface. The null default returns nothing, so recall stays lexical."""

    name = "null"

    def available(self) -> bool:
        return False

    def model_id(self) -> Optional[str]:
        """Stable identity of the embedding space, so a persisted cache built with a
        different embedder is detected and re-embedded rather than mixed."""
        return None

    def embed(self, texts: list[str]) -> Optional[list[list[float]]]:
        return None


class NullProvider(EmbeddingProvider):
    pass


class CommandProvider(EmbeddingProvider):
    """Shells out to a user-configured embedder. Any failure => unavailable.

    Kept deliberately dumb: no batching policy, no caching across calls, no
    network code of our own. The brain never embeds unless you opt in, and a
    broken embedder degrades to lexical rather than erroring the recall.
    """

    name = "command"

    def __init__(self, cmd: str, timeout: float = 20.0) -> None:
        self.cmd = cmd
        self.timeout = timeout

    def available(self) -> bool:
        argv = self.cmd.split()
        return bool(argv) and (shutil.which(argv[0]) is not None or os.path.exists(argv[0]))

    def model_id(self) -> Optional[str]:
        # The command string IS the model identity; allow an explicit override so two
        # different models behind the same launcher don't collide in the cache.
        override = os.environ.get("ATM_EMBED_MODEL", "").strip()
        base = override or self.cmd
        return "cmd:" + hashlib.sha1(base.encode("utf-8")).hexdigest()[:16]

    def embed(self, texts: list[str]) -> Optional[list[list[float]]]:
        if not texts or not self.available():
            return None
        try:
            proc = subprocess.run(
                self.cmd, shell=True, input=json.dumps({"texts": texts}),
                capture_output=True, text=True, timeout=self.timeout,
            )
            if proc.returncode != 0 or not proc.stdout.strip():
                return None
            data = json.loads(proc.stdout)
            vecs = data.get("vectors")
            if (not isinstance(vecs, list) or len(vecs) != len(texts)
                    or not all(isinstance(v, list) and v for v in vecs)):
                return None
            dim = len(vecs[0])
            if any(len(v) != dim for v in vecs):
                return None
            return [[float(x) for x in v] for v in vecs]
        except Exception:
            return None


@lru_cache(maxsize=1)
def get_provider() -> EmbeddingProvider:
    """Resolve the configured provider once. ATM_EMBED_CMD opts in; absent => null."""
    cmd = os.environ.get("ATM_EMBED_CMD", "").strip()
    if cmd:
        return CommandProvider(cmd)
    return NullProvider()


def reset_provider_cache() -> None:
    """For tests that toggle ATM_EMBED_CMD at runtime."""
    get_provider.cache_clear()
