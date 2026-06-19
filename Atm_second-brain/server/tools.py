"""Canonical tool registry — the server-enforced operations.

These ~6 operations are the non-removable enforcement core: the model proposes,
these dispose. Skills and hooks are a convenience layer on top and can be deleted
without weakening any of these.

In P1 the handlers are stubs that raise NOT_IMPLEMENTED; subsequent pieces fill
them in (P2 reindex, P3 recall/resolve_tier/citation_verify, P4
write_with_provenance). The schemas are real now so `tools/list` is meaningful and
stable.
"""
from __future__ import annotations

from typing import Any, Callable

from protocol import NOT_IMPLEMENTED, RpcError


def _stub(name: str) -> Callable[[dict], Any]:
    def handler(_args: dict) -> Any:
        raise RpcError(
            NOT_IMPLEMENTED,
            f"Tool '{name}' is registered but not yet implemented in this build.",
            data={"tool": name},
        )

    return handler


# Each tool: name, description, JSON-Schema inputSchema, handler(args)->result.
# handler is replaced with the real implementation as later pieces land.
TOOLS: dict[str, dict[str, Any]] = {
    "recall": {
        "description": (
            "Hybrid ranked retrieval over the vault: lexical bm25/FTS + TF-IDF "
            "cosine + link/tag graph fused via RRF, with pseudo-relevance-feedback "
            "expansion and an OPTIONAL embedding reranker (ATM_EMBED_CMD) that "
            "degrades to lexical when absent. Enforces the anti-autophagy "
            "human-information floor on the returned grounding set."
        ),
        "inputSchema": {
            "type": "object",
            "required": ["query"],
            "properties": {
                "query": {"type": "string", "description": "Natural-language or keyword query."},
                "k": {"type": "integer", "minimum": 1, "default": 12, "description": "Max results."},
                "type": {"type": "string", "description": "Optional note-type filter."},
                "domain": {"type": "string", "description": "Optional domain filter."},
                "with_trace": {"type": "boolean", "default": False, "description": "Include the honest seed->1-hop traversal trace (recall.trace/1) for graph animation."},
            },
        },
        "handler": None,  # bound below
    },
    "graph_export": {
        "description": (
            "Export the static whole-vault knowledge graph (graph.export/1): nodes "
            "(id/title/type/tags) + resolved edges. For the map view; clustering and "
            "layout are the client's responsibility."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "minimum": 1, "default": 5000, "description": "Max nodes."},
            },
        },
        "handler": None,  # bound below
    },
    "write_with_provenance": {
        "description": (
            "The only sanctioned write path. Validates frontmatter against "
            "_schema/CURRENT, stamps content_hash/ingested_at, appends to "
            "tier_lineage, and enforces fail-closed trust tiers and human-atom "
            "immutability."
        ),
        "inputSchema": {
            "type": "object",
            "required": ["path", "frontmatter", "body"],
            "properties": {
                "path": {"type": "string", "description": "Vault-relative .md path."},
                "frontmatter": {"type": "object", "description": "Note frontmatter (schema v1)."},
                "body": {"type": "string", "description": "Markdown body."},
                "trust_tier": {"type": "string", "description": "Claimed trust tier (subject to the floor)."},
                "expected_hash": {"type": "string", "description": "For edits: sha256 the caller last saw (optimistic lock)."},
            },
        },
        "handler": None,  # bound below
    },
    "reindex": {
        "description": (
            "Parse the vault (frontmatter, wikilinks, tags) into the derived SQLite "
            "index (notes/links/tags/manifest). Idempotent: re-running with no "
            "source changes is a no-op."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "full": {"type": "boolean", "default": False, "description": "Force full rebuild instead of incremental."},
            },
        },
        "handler": None,  # bound below to the real implementation
    },
    "resolve_tier": {
        "description": (
            "Compute a note's effective trust tier from its append-only "
            "tier_lineage, applying the monotonic anti-laundering floor."
        ),
        "inputSchema": {
            "type": "object",
            "required": ["path"],
            "properties": {"path": {"type": "string", "description": "Vault-relative .md path."}},
        },
        "handler": None,  # bound below
    },
    "citation_verify": {
        "description": (
            "Verify every entry in a note's sources[] resolves (and, where possible, "
            "that cited content is reachable). Reports broken citations."
        ),
        "inputSchema": {
            "type": "object",
            "required": ["path"],
            "properties": {"path": {"type": "string", "description": "Vault-relative .md path."}},
        },
        "handler": None,  # bound below
    },
    "consolidate": {
        "description": (
            "Guarded memory consolidation: recall notes for a topic, REFUSE if the "
            "grounding can't meet the human-information floor (anti-autophagy), then "
            "write a synthesis DRAFT that cites every source (sources[] + "
            "consolidates:: links) via write_with_provenance (author=agent, "
            "self-authored, content-hashed). Never edits or deletes the sources. "
            "Dry-run by default."
        ),
        "inputSchema": {
            "type": "object",
            "required": ["topic"],
            "properties": {
                "topic": {"type": "string", "description": "What to consolidate notes about."},
                "k": {"type": "integer", "minimum": 1, "default": 8, "description": "Max source notes."},
                "domain": {"type": "string", "description": "Optional domain filter."},
                "dry_run": {"type": "boolean", "default": True, "description": "Preview without writing."},
            },
        },
        "handler": None,  # bound below
    },
    "mech_status": {
        "description": (
            "MECH (degraded) mode probe: reports which operations are available "
            "with grep/git only, at $0 and offline. Always succeeds."
        ),
        "inputSchema": {"type": "object", "properties": {}},
        "handler": None,  # bound below
    },
}


# Bind real implementations as pieces land (keeps schemas above, logic in modules).
from index import reindex_tool, graph_export_tool  # noqa: E402
from recall import recall_tool  # noqa: E402
from trust import resolve_tier_tool  # noqa: E402
from citations import citation_verify_tool  # noqa: E402
from writer import write_with_provenance_tool  # noqa: E402
from mech import mech_status_tool  # noqa: E402
from consolidate import consolidate_tool  # noqa: E402

TOOLS["reindex"]["handler"] = reindex_tool
TOOLS["graph_export"]["handler"] = graph_export_tool
TOOLS["recall"]["handler"] = recall_tool
TOOLS["resolve_tier"]["handler"] = resolve_tier_tool
TOOLS["citation_verify"]["handler"] = citation_verify_tool
TOOLS["write_with_provenance"]["handler"] = write_with_provenance_tool
TOOLS["mech_status"]["handler"] = mech_status_tool
TOOLS["consolidate"]["handler"] = consolidate_tool


def list_tools() -> list[dict]:
    """Shape expected by the MCP `tools/list` result."""
    return [
        {"name": name, "description": spec["description"], "inputSchema": spec["inputSchema"]}
        for name, spec in TOOLS.items()
    ]
