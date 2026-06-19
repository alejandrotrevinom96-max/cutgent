"""P18 gate: persisted embedding cache + vector candidate generation.

This closes the last lexical-recall gap. With an embedder configured AND the cache
built, recall can surface a paraphrase that shares NO term with the query — which
rerank-of-the-lexical-pool alone cannot do.

Proves:
  - embed_index builds the cache, is incremental (re-run embeds 0), tags vectors
    with the model id, and prunes vectors for deleted notes.
  - WITHOUT the cache, recall("dog") cannot surface a note about a "canine
    companion" (it never enters the lexical pool). WITH the cache, vector candidate
    generation surfaces it as a top result.
  - the trace stays honest: such a note is reported under `semantic`, never
    mislabeled as a graph `expanded` node.
  - degrade: no provider => lexical only, no crash; cache is simply unused.

Run:  python3 selftest/cases/test_p18_vectors.py
"""
from __future__ import annotations

import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "server"))

import embeddings  # noqa: E402

ok = True


def check(name: str, cond: bool, detail: str = "") -> None:
    global ok
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    if not cond:
        ok = False


def _isolate(tmp: str):
    import shutil
    import config
    os.makedirs(os.path.join(tmp, "vault", "concepts"), exist_ok=True)
    os.makedirs(os.path.join(tmp, "_schema"), exist_ok=True)
    for f in ("schema.v1.json", "CURRENT"):
        shutil.copy(os.path.join(ROOT, "_schema", f), os.path.join(tmp, "_schema", f))
    config.VAULT_ROOT = tmp
    config.VAULT_DIR = os.path.join(tmp, "vault")
    config.SCHEMA_DIR = os.path.join(tmp, "_schema")
    config.DB_PATH = os.path.join(tmp, ".atm", "index.db")
    import validate
    validate.load_schema.cache_clear()


def _note(tmp, name, nid, title, body):
    with open(os.path.join(tmp, "vault", "concepts", name), "w", encoding="utf-8") as fh:
        fh.write(f"---\nschema_version: 1\nid: \"{nid}\"\ntitle: \"{title}\"\ntype: note\n"
                 f"created: 2026-06-19\nupdated: 2026-06-19\ntrust_tier: human-confirmed\n"
                 f"author: human\n---\n\n# {title}\n\n{body}\n")


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        _isolate(tmp)
        import importlib
        import config
        import index as index_mod
        import recall as recall_mod
        import vectors as vectors_mod
        importlib.reload(index_mod)
        importlib.reload(vectors_mod)
        importlib.reload(recall_mod)
        db = config.DB_PATH

        # A note about a canine that NEVER uses the word "dog".
        _note(tmp, "canine.md", "20260619000401-canine", "Caring for a canine companion",
              "A loyal pet that needs daily walks, training, and affection. Puppies thrive on routine.")
        # Distractor that DOES contain "dog" but is about food.
        _note(tmp, "hotdog.md", "20260619000402-hotdog", "The hot dog",
              "A grilled hot dog in a bun with mustard; festival food at the ballpark.")
        _note(tmp, "filler.md", "20260619000403-ledger", "Ledger",
              "Accounting ledgers track debits and credits.")
        index_mod.reindex(full=True, db_path=db)

        # --- degrade: no provider, recall still works (lexical) ---
        embeddings.reset_provider_cache()
        os.environ.pop("ATM_EMBED_CMD", None)
        r_nocache = recall_mod.recall("dog", k=5, db_path=db)
        titles_nc = [x["title"] for x in r_nocache["results"]]
        check("no provider: recall works lexically (no crash)",
              len(r_nocache["results"]) >= 1 and r_nocache["retrieval"]["vector_candidates"] is False)
        check("no provider: zero-overlap canine note is NOT found lexically",
              not any("canine" in (t or "").lower() for t in titles_nc), str(titles_nc))

        # --- configure the stub embedder ([animal, food] concept vector) ---
        emb = os.path.join(tmp, "emb.py")
        with open(emb, "w", encoding="utf-8") as fh:
            fh.write(
                "import sys, json\n"
                "d = json.load(sys.stdin)\n"
                "ANIMAL = ['dog','canine','pet','puppy','companion','loyal','walks','training','affection']\n"
                "FOOD = ['bun','mustard','grilled','food','festival','ballpark','ledger','debit','credit']\n"
                "def vec(t):\n"
                "    t=t.lower(); a=sum(t.count(w) for w in ANIMAL); f=sum(t.count(w) for w in FOOD)\n"
                "    return [a+0.1, f+0.1]\n"
                "print(json.dumps({'vectors':[vec(t) for t in d['texts']]}))\n"
            )
        os.environ["ATM_EMBED_CMD"] = f"{sys.executable} {emb}"
        embeddings.reset_provider_cache()

        # provider present but cache NOT built yet: rerank-only cannot surface canine
        r_precache = recall_mod.recall("dog", k=5, db_path=db)
        check("provider but empty cache: canine still not surfaced (rerank-only limit)",
              not any("canine" in (x["title"] or "").lower() for x in r_precache["results"]),
              str([x["title"] for x in r_precache["results"]]))

        # --- build the cache ---
        res = vectors_mod.embed_index(db_path=db)
        check("embed_index builds the cache", res.get("ok") and res.get("embedded") == 3, str(res))
        check("embed_index reports model + dim", bool(res.get("model")) and res.get("dim") == 2, str(res))

        res2 = vectors_mod.embed_index(db_path=db)
        check("embed_index is incremental (re-run embeds 0)", res2.get("embedded") == 0, str(res2))

        # --- WITH the cache: vector candidate generation surfaces the paraphrase ---
        r = recall_mod.recall("dog", k=5, with_trace=True, db_path=db)
        titles = [x["title"] for x in r["results"]]
        check("vector candidate generation surfaces the zero-overlap canine note",
              any("canine" in (t or "").lower() for t in titles), str(titles))
        check("recall reports vector_candidates + vector signal",
              r["retrieval"]["vector_candidates"] is True and "vector" in r["retrieval"]["signals"],
              str(r["retrieval"]))

        # --- trace honesty: canine is 'semantic', not a fake graph 'expanded' ---
        tr = r["trace"]
        canine_id = "20260619000401-canine"
        check("trace marks the vector hit as semantic (honest)",
              canine_id in tr.get("semantic", []) and canine_id not in tr.get("expanded", []),
              f"semantic={tr.get('semantic')} expanded={tr.get('expanded')}")
        # no expand step may reference the semantic node (it has no graph edge)
        sem_in_steps = [s for s in tr.get("steps", []) if s.get("node") == canine_id]
        check("semantic node is not animated as a graph expansion", not sem_in_steps, str(sem_in_steps))

        # --- prune: delete a note, re-embed, its vector is gone ---
        os.remove(os.path.join(tmp, "vault", "concepts", "filler.md"))
        index_mod.reindex(full=True, db_path=db)
        vectors_mod.embed_index(db_path=db)
        con = index_mod.connect(db)
        leftover = con.execute(
            "SELECT COUNT(*) c FROM embeddings WHERE id='20260619000403-ledger'"
        ).fetchone()["c"]
        con.close()
        check("embed_index prunes vectors for deleted notes", leftover == 0, f"leftover={leftover}")

    os.environ.pop("ATM_EMBED_CMD", None)
    embeddings.reset_provider_cache()
    print()
    print("P18 GATE:", "ALL PASS ✅" if ok else "FAILURES ❌")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
