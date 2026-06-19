"""P3 gate: recall returns correct hits; resolve_tier applies the anti-laundering
floor; citation_verify detects broken citations.

Run:  python3 selftest/cases/test_p3_recall.py
"""
from __future__ import annotations

import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "server"))

import recall as recall_mod  # noqa: E402
import trust  # noqa: E402
import citations  # noqa: E402

ok = True


def check(name: str, cond: bool, detail: str = "") -> None:
    global ok
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    if not cond:
        ok = False


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        db = os.path.join(tmp, "index.db")

        # --- recall: correct hits ---
        r = recall_mod.recall("model proposes server disposes guardrail", k=5, db_path=db)
        ids = [x["id"] for x in r["results"]]
        check("recall finds the matching concept note as a top hit",
              "20260619000100-second-brain-the-model-proposes-the-server-disposes" in ids[:2],
              str(ids))

        r2 = recall_mod.recall("vault conventions linking tags", k=5, db_path=db)
        ids2 = [x["id"] for x in r2["results"]]
        check("recall finds the conventions note", "20260619000001-vault-conventions" in ids2, str(ids2))

        check("recall reports human_fraction and floor metadata",
              "human_fraction" in r and "floor_met" in r and r["mode"] in ("fts5", "like"),
              str({k: r[k] for k in ("human_fraction", "floor_met", "mode")}))
        check("examples are human-grounded so floor is met", r["floor_met"] is True,
              f"frac={r['human_fraction']}")

        # --- resolve_tier: anti-laundering floor ---
        # legitimate: lineage granted self-authored
        legit = {"trust_tier": "self-authored",
                 "provenance": {"tier_lineage": [{"tier": "self-authored", "at": "2026-06-19"}]}}
        t1 = trust.effective_tier(legit)
        check("legit self-authored stays self-authored",
              t1["effective"] == "self-authored" and not t1["laundering_detected"], str(t1))

        # laundering: claims self-authored but lineage only ever granted external
        launder = {"trust_tier": "self-authored",
                   "provenance": {"tier_lineage": [{"tier": "externally-ingested", "at": "2026-06-19"}]}}
        t2 = trust.effective_tier(launder)
        check("laundering capped to externally-ingested",
              t2["effective"] == "externally-ingested" and t2["laundering_detected"], str(t2))

        # human confirmation legitimately raises ceiling
        confirmed = {"trust_tier": "human-confirmed",
                     "provenance": {"tier_lineage": [
                         {"tier": "externally-ingested", "at": "2026-06-19"},
                         {"tier": "human-confirmed", "at": "2026-06-19", "by": "human"}]}}
        t3 = trust.effective_tier(confirmed)
        check("human-confirmed lineage permits human-confirmed",
              t3["effective"] == "human-confirmed" and not t3["laundering_detected"], str(t3))

        # fail-closed: unknown/missing tier => least trusted
        t4 = trust.effective_tier({})
        check("missing tier fails closed to externally-ingested",
              t4["effective"] == "externally-ingested", str(t4))

        # --- citation_verify: detect broken cites ---
        good = {"sources": [{"cite": "Forte, BASB", "url": "https://fortelabs.com", "accessed": "2026-06-19"}]}
        c1 = citations.verify_citations(good)
        check("valid citation passes", c1["ok"] and not c1["broken"], str(c1))

        bad = {"sources": [
            {"url": "https://x.com"},                       # missing cite
            {"cite": "ok but bad url", "url": "notaurl"},   # malformed url
            {"cite": "bad date", "accessed": "06/19/2026"},  # malformed date
        ]}
        c2 = citations.verify_citations(bad)
        reasons = {b["reason"].split(":")[0] for b in c2["broken"]}
        check("broken citations detected", not c2["ok"] and len(c2["broken"]) == 3, str(c2))
        check("detects missing cite, bad url, bad date",
              any("cite" in b["reason"] for b in c2["broken"])
              and any("url" in b["reason"] for b in c2["broken"])
              and any("date" in b["reason"] for b in c2["broken"]), str(reasons))

    print()
    print("P3 GATE:", "ALL PASS ✅" if ok else "FAILURES ❌")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
