"""The guardrail invariant registry — the single list of properties the system
promises to enforce, each mapped to where it lives and what proves it.

`coverage_report()` is consumed by the harness as a test: every invariant must be
covered by at least one fixture or case, and every 'fixture:NAME' reference must
resolve to a real fixture file. That makes "100% invariant coverage" a checkable
fact, not a claim.
"""
from __future__ import annotations

import os

FIXTURES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")

# id -> {desc, enforced_in, error_code, covered_by[]}
INVARIANTS: dict[str, dict] = {
    "INV-PATH-SAFE": {
        "desc": "Writes stay inside vault/ and target a .md file.",
        "enforced_in": "writer._safe_abs",
        "error_code": "GUARDRAIL_REJECTED",
        "covered_by": ["fixture:write_path_escape"],
    },
    "INV-SCHEMA-VALID": {
        "desc": "Final frontmatter validates against _schema/CURRENT.",
        "enforced_in": "writer + validate.validate_frontmatter",
        "error_code": "GUARDRAIL_REJECTED",
        "covered_by": ["fixture:write_good", "fixture:write_bad_id"],
    },
    "INV-ID-FORMAT": {
        "desc": "Note id matches ^[0-9]{14}-[a-z0-9-]+$.",
        "enforced_in": "schema.v1.json pattern via validate",
        "error_code": "GUARDRAIL_REJECTED",
        "covered_by": ["fixture:write_bad_id"],
    },
    "INV-SCHEMA-CURRENT": {
        "desc": "A declared schema_version must equal CURRENT (no auto-upgrade).",
        "enforced_in": "writer",
        "error_code": "GUARDRAIL_REJECTED",
        "covered_by": ["fixture:write_stale_schema"],
    },
    "INV-NO-MINT-HUMAN-AUTHOR": {
        "desc": "The agent write path cannot mint author=human.",
        "enforced_in": "writer (ALLOWED_AUTHOR)",
        "error_code": "GUARDRAIL_REJECTED",
        "covered_by": ["fixture:write_mint_human_author"],
    },
    "INV-NO-MINT-HUMAN-CONFIRMED": {
        "desc": "The agent write path cannot grant trust_tier=human-confirmed.",
        "enforced_in": "writer (ALLOWED_GRANT)",
        "error_code": "GUARDRAIL_REJECTED",
        "covered_by": ["fixture:write_mint_human_confirmed"],
    },
    "INV-HUMAN-IMMUTABLE": {
        "desc": "An existing author=human note is immutable to the agent.",
        "enforced_in": "writer",
        "error_code": "GUARDRAIL_REJECTED",
        "covered_by": ["fixture:write_edit_human_atom"],
    },
    "INV-ANTI-LAUNDER": {
        "desc": "An existing note's effective trust tier can never be raised here.",
        "enforced_in": "writer + trust.effective_tier",
        "error_code": "GUARDRAIL_REJECTED",
        "covered_by": ["fixture:write_raise_tier"],
    },
    "INV-OPTIMISTIC-LOCK": {
        "desc": "Edits with a stale expected_hash are rejected.",
        "enforced_in": "writer",
        "error_code": "GUARDRAIL_REJECTED",
        "covered_by": ["fixture:write_stale_hash"],
    },
    "INV-PROVENANCE-STAMP": {
        "desc": "content_hash is stamped and verifies against the body on re-read.",
        "enforced_in": "writer",
        "error_code": "n/a (positive property)",
        "covered_by": ["fixture:write_good", "case:test_p4_write"],
    },
    "INV-TIER-FAILCLOSED": {
        "desc": "Unknown/missing trust_tier resolves to externally-ingested.",
        "enforced_in": "trust.effective_tier",
        "error_code": "n/a (positive property)",
        "covered_by": ["case:test_p3_recall"],
    },
    "INV-CITE-INTEGRITY": {
        "desc": "Broken citations (missing cite / bad url / bad date) are detected.",
        "enforced_in": "citations.verify_citations",
        "error_code": "n/a (report)",
        "covered_by": ["case:test_p3_recall"],
    },
    "INV-HUMAN-FLOOR": {
        "desc": "recall enforces and reports the human-information floor.",
        "enforced_in": "recall.recall",
        "error_code": "n/a (report)",
        "covered_by": ["case:test_p3_recall"],
    },
    "INV-REINDEX-IDEMPOTENT": {
        "desc": "reindex with no source change does no work and is stable.",
        "enforced_in": "index.reindex",
        "error_code": "n/a (positive property)",
        "covered_by": ["case:test_p2_index"],
    },
    "INV-LINK-RESOLVE": {
        "desc": "Wikilinks resolve by id, then alias, then title.",
        "enforced_in": "index._resolve_links",
        "error_code": "n/a (positive property)",
        "covered_by": ["case:test_p2_index"],
    },
    "INV-PLAIN-MARKDOWN": {
        "desc": "Every note is greppable plain markdown; no binaries in the vault.",
        "enforced_in": "repository invariant (CI/selftest)",
        "error_code": "n/a (property)",
        "covered_by": ["case:test_plain_markdown"],
    },
    "INV-SKILL-VALID": {
        "desc": "Every Agent Skill has valid frontmatter (kebab name==folder, "
                "<=64 chars, description <=1024, no claude/anthropic, non-empty body).",
        "enforced_in": "skill authoring + selftest",
        "error_code": "n/a (property)",
        "covered_by": ["case:test_p7_skills"],
    },
    "INV-PACK-TEMPLATE": {
        "desc": "Each expertise pack conforms to the template: SKILL.md + "
                "exemplars/rubric/anti-patterns/sources, with a binary rubric.",
        "enforced_in": "pack authoring + selftest",
        "error_code": "n/a (property)",
        "covered_by": ["case:test_p8_expertise"],
    },
    "INV-RECALL-TRACE-HONEST": {
        "desc": "recall.trace/1 is additive/back-compatible and honest: seeds are "
                "query-text matches, expanded are 1-hop neighbors (disjoint), edges "
                "connect real notes, steps are seed-before-expand ordered.",
        "enforced_in": "recall._build_trace",
        "error_code": "n/a (property)",
        "covered_by": ["case:test_p9_graph_contracts"],
    },
    "INV-GRAPH-EXPORT": {
        "desc": "graph.export/1 emits nodes (id/title/type/tags) and only resolved "
                "edges whose endpoints are both exported nodes.",
        "enforced_in": "index.graph_export",
        "error_code": "n/a (property)",
        "covered_by": ["case:test_p9_graph_contracts"],
    },
    "INV-VAULT-NOTE-SCHEMA": {
        "desc": "Every vault note (excluding templates) has schema-valid frontmatter.",
        "enforced_in": "authoring + validate.validate_frontmatter",
        "error_code": "n/a (property)",
        "covered_by": ["case:test_p10_vault"],
    },
    "INV-PERSONAL-STUB": {
        "desc": "personal/ notes start as honest stubs (author=agent, self-authored, "
                "personal/stub) that do not override generic advice until a human confirms.",
        "enforced_in": "personal-layer authoring",
        "error_code": "n/a (property)",
        "covered_by": ["case:test_p10_vault"],
    },
    "INV-MOC-RESOLVES": {
        "desc": "The expertise MOC links to all 11 personal/<domain> notes and to "
                "identity, and every personal/* link in the vault resolves.",
        "enforced_in": "MOC authoring + index._resolve_links",
        "error_code": "n/a (property)",
        "covered_by": ["case:test_p10_vault"],
    },
    "INV-PARA-TEMPLATES": {
        "desc": "Daily/project/area/resource templates exist with correct types and are "
                "skipped by the index; the first-run note is schema-valid, indexed, and "
                "its links resolve.",
        "enforced_in": "templates + first-run authoring + index skip rule",
        "error_code": "n/a (property)",
        "covered_by": ["case:test_p11_templates"],
    },
    "INV-MIGRATION-SAFE": {
        "desc": "Schema migration is dry-run by default, idempotent, re-validates "
                "against the target schema, and refuses lossy field drops and downgrades.",
        "enforced_in": "migrate.run",
        "error_code": "n/a (property)",
        "covered_by": ["case:test_p12_migrate"],
    },
    "INV-HYBRID-RANK": {
        "desc": "recall fuses lexical (bm25/LIKE) + TF-IDF cosine + graph adjacency "
                "via RRF, with pseudo-relevance-feedback expansion in the recall tail; "
                "fusion never demotes a strong lexical match below the human floor.",
        "enforced_in": "rank.{tfidf_scores,rrf_fuse,expand_query} + recall.recall",
        "error_code": "n/a (property)",
        "covered_by": ["case:test_p14_retrieval", "case:test_p3_recall"],
    },
    "INV-EMBED-PLUGGABLE-DEGRADE": {
        "desc": "An embedding reranker is OPTIONAL (ATM_EMBED_CMD). When configured it "
                "reorders the candidate pool semantically; when absent, crashing, or "
                "malformed, recall degrades to lexical fusion and still returns results "
                "($0/offline floor preserved).",
        "enforced_in": "embeddings.get_provider + recall.recall (retrieve-then-rerank)",
        "error_code": "n/a (property)",
        "covered_by": ["case:test_p14_retrieval"],
    },
    "INV-EVAL-DISCRIMINATES": {
        "desc": "Every eval spec maps to a real pack and its checks bite: each task's "
                "golden answer passes all operationalized rubric checks and its decoy "
                "fails at least one, with a deterministic scorer. 'Expert' is measured, "
                "not asserted.",
        "enforced_in": "evals.runner + eval spec authoring",
        "error_code": "n/a (property)",
        "covered_by": ["case:test_p15_evals"],
    },
    "INV-ONBOARDING-CONFIG": {
        "desc": "Obsidian config parses with vault-relative paths and wikilinks "
                "preserved; daily-notes points at the real template; SETUP.md exists; "
                "brain.py doctor runs healthy.",
        "enforced_in": "vault/.obsidian config + SETUP.md + brain.py doctor",
        "error_code": "n/a (property)",
        "covered_by": ["case:test_p13_onboarding"],
    },
}


def coverage_report() -> dict:
    """Return {ok, uncovered[], missing_fixtures[]} for the harness to assert on."""
    uncovered = [i for i, m in INVARIANTS.items() if not m.get("covered_by")]
    missing_fixtures = []
    for inv, meta in INVARIANTS.items():
        for ref in meta.get("covered_by", []):
            if ref.startswith("fixture:"):
                name = ref.split(":", 1)[1]
                if not os.path.exists(os.path.join(FIXTURES_DIR, name + ".json")):
                    missing_fixtures.append(f"{inv} -> {name}.json")
    return {
        "ok": not uncovered and not missing_fixtures,
        "total": len(INVARIANTS),
        "uncovered": uncovered,
        "missing_fixtures": missing_fixtures,
    }
