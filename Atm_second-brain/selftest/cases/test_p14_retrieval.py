"""P14 gate: hybrid retrieval — RRF fusion, TF-IDF cosine, pseudo-relevance-
feedback query expansion, and a PLUGGABLE embedding reranker that degrades to
lexical fusion when no provider is configured.

Proves:
  - rrf_fuse rewards agreement across signals (a doc ranked well by two lists
    beats one ranked well by a single list).
  - tfidf_scores is a real cosine ranker (focused doc on a rare term outranks a
    long doc that merely mentions it once).
  - expand_query mines shared co-occurring terms from the top hits (recall lift).
  - With ATM_EMBED_CMD unset, the provider is Null and recall still returns
    results from lexical+graph fusion (MECH-safe, fail-open to lexical).
  - With a stub embedder plugged in, recall reranks a paraphrase note (no shared
    query term) to the top — the semantic bridge lexical cannot make — while the
    human-information floor metadata is still reported.

Run:  python3 selftest/cases/test_p14_retrieval.py
"""
from __future__ import annotations

import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "server"))

import rank  # noqa: E402
import embeddings  # noqa: E402

ok = True


def check(name: str, cond: bool, detail: str = "") -> None:
    global ok
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    if not cond:
        ok = False


def test_rrf() -> None:
    # 'b' is the only doc present in BOTH lists; 'a' and 'c' each appear in one.
    # Agreement across signals must win.
    fused = rank.rrf_fuse([["a", "b"], ["b", "c"]])
    order = sorted(fused, key=lambda i: fused[i], reverse=True)
    check("rrf_fuse rewards cross-list agreement", order[0] == "b", f"order={order}")
    # symmetric reverse lists tie; weighting the first list up must promote its leader
    fused_w = rank.rrf_fuse([["a", "b", "c"], ["c", "b", "a"]], weights=[3.0, 1.0])
    order_w = sorted(fused_w, key=lambda i: fused_w[i], reverse=True)
    check("rrf weights shift ranking", order_w[0] == "a", f"order={order_w}")


def test_tfidf() -> None:
    docs = {
        "focused": "mitochondria mitochondria cellular respiration",
        "long": ("the cell is a unit of life " * 8) + " mitochondria",
        "off": "negotiation anchoring batna concessions",
    }
    scores = rank.tfidf_scores(["mitochondria", "respiration"], docs)
    ranked = sorted(scores, key=lambda i: scores[i], reverse=True)
    check("tfidf ranks the focused doc first", ranked and ranked[0] == "focused", f"{scores}")
    check("tfidf excludes the unrelated doc", scores.get("off", 0) == 0, f"off={scores.get('off')}")


def test_prf() -> None:
    docs = {
        "d1": "sourdough starter fermentation flour hydration",
        "d2": "fermentation flour bread crumb hydration",
        "d3": "completely unrelated tax accounting ledger",
    }
    expanded = rank.expand_query(["fermentation"], docs, ["d1", "d2"])
    check("expand_query mines shared co-occurring terms",
          "flour" in expanded and "hydration" in expanded, f"expanded={expanded}")
    check("expand_query drops the original query term", "fermentation" not in expanded)


def _make_vault(tmp: str) -> None:
    import config
    import validate
    os.makedirs(os.path.join(tmp, "vault", "concepts"), exist_ok=True)
    os.makedirs(os.path.join(tmp, "_schema"), exist_ok=True)
    import shutil
    for f in ("schema.v1.json", "CURRENT"):
        shutil.copy(os.path.join(ROOT, "_schema", f), os.path.join(tmp, "_schema", f))
    config.VAULT_ROOT = tmp
    config.VAULT_DIR = os.path.join(tmp, "vault")
    config.SCHEMA_DIR = os.path.join(tmp, "_schema")
    config.DB_PATH = os.path.join(tmp, ".atm", "index.db")
    validate.load_schema.cache_clear()

    def note(name, title, author, tier, body):
        p = os.path.join(tmp, "vault", "concepts", name)
        fm = (f"---\nschema_version: 1\nid: \"2026061900{name[:4]}-{name[:-3]}\"\n"
              f"title: \"{title}\"\ntype: note\ncreated: 2026-06-19\nupdated: 2026-06-19\n"
              f"trust_tier: {tier}\nauthor: {author}\n---\n\n# {title}\n\n{body}\n")
        with open(p, "w", encoding="utf-8") as fh:
            fh.write(fm)

    # A human note about caring for an animal. Shares the word "pet" with the
    # query but NOT the word "dog" — so lexically it loses to the distractor.
    note("0001-canine.md", "Caring for a canine companion", "human", "human-confirmed",
         "A loyal pet needs daily walks, fresh water, and steady routine. "
         "Puppies thrive on patient training and affection.")
    # A distractor that repeats the literal query word "dog" but is about food, so
    # it WINS on lexical score and only an embedder can demote it.
    note("0002-hotdog.md", "Street food: the hot dog", "human", "human-confirmed",
         "A grilled hot dog in a bun; festival food. The dog, the dog at the ballpark, "
         "a classic dog with mustard.")
    note("0003-filler.md", "Unrelated ledger note", "agent", "self-authored",
         "Accounting ledgers track debits and credits across accounts.")


def test_embedding_pluggable_and_degrade() -> None:
    import config
    embeddings.reset_provider_cache()
    os.environ.pop("ATM_EMBED_CMD", None)
    with tempfile.TemporaryDirectory() as tmp:
        _make_vault(tmp)
        import importlib
        import index as index_mod
        import recall as recall_mod
        importlib.reload(index_mod)
        importlib.reload(recall_mod)

        def pos(results, needle):
            for i, x in enumerate(results):
                if needle in (x["title"] or "").lower():
                    return i
            return 999

        # Null provider: recall still works from lexical+graph fusion (MECH-safe).
        prov = embeddings.get_provider()
        check("no env => Null provider, unavailable", prov.name == "null" and not prov.available())
        r = recall_mod.recall("dog pet", k=5, db_path=config.DB_PATH)
        check("recall returns results with no embedder (lexical fallback)",
              len(r["results"]) >= 1 and r["retrieval"]["embeddings"] is False,
              str(r["retrieval"]))
        # lexically, the food note (repeats "dog") outranks the animal note
        lexical_food_first = pos(r["results"], "hot dog") < pos(r["results"], "canine")
        check("baseline: lexical ranks the food distractor above the animal note",
              lexical_food_first,
              f"hotdog@{pos(r['results'],'hot dog')} canine@{pos(r['results'],'canine')}")

        # Plug in a stub embedder: maps text -> a 2D concept vector (animal, food).
        emb = os.path.join(tmp, "emb.py")
        with open(emb, "w", encoding="utf-8") as fh:
            fh.write(
                "import sys, json\n"
                "d = json.load(sys.stdin)\n"
                "ANIMAL = ['canine','pet','puppy','companion','loyal','walks','training','affection']\n"
                "FOOD = ['bun','mustard','grilled','food','festival','ballpark','street']\n"
                "def vec(t):\n"
                "    t = t.lower()\n"
                "    a = sum(t.count(w) for w in ANIMAL)\n"
                "    f = sum(t.count(w) for w in FOOD)\n"
                "    return [a + 0.1, f + 0.1]\n"
                "print(json.dumps({'vectors': [vec(t) for t in d['texts']]}))\n"
            )
        os.environ["ATM_EMBED_CMD"] = f"{sys.executable} {emb}"
        embeddings.reset_provider_cache()
        prov2 = embeddings.get_provider()
        check("env set => command provider available", prov2.name == "command" and prov2.available())

        r2 = recall_mod.recall("dog pet", k=5, db_path=config.DB_PATH)
        top_titles = [x["title"] for x in r2["results"]]
        check("embedder rerank promotes the semantically-right (animal) note above the distractor",
              pos(r2["results"], "canine") < pos(r2["results"], "hot dog"),
              f"top={top_titles}")
        check("recall reports embeddings were used", r2["retrieval"]["embeddings"] is True,
              str(r2["retrieval"]))
        check("human-information floor still reported under embeddings",
              "floor_met" in r2 and "human_fraction" in r2, str(r2.get("floor_met")))

        # A malformed embedder must degrade, not crash.
        os.environ["ATM_EMBED_CMD"] = f"{sys.executable} -c \"print('garbage not json')\""
        embeddings.reset_provider_cache()
        r3 = recall_mod.recall("dog", k=3, db_path=config.DB_PATH)
        check("malformed embedder degrades to lexical (no crash)",
              r3["retrieval"]["embeddings"] is False and len(r3["results"]) >= 1,
              str(r3["retrieval"]))

    os.environ.pop("ATM_EMBED_CMD", None)
    embeddings.reset_provider_cache()


def main() -> int:
    test_rrf()
    test_tfidf()
    test_prf()
    test_embedding_pluggable_and_degrade()
    print()
    print("P14 GATE:", "ALL PASS ✅" if ok else "FAILURES ❌")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
