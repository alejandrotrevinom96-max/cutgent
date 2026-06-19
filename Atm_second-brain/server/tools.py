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
            "Ranked retrieval over the vault: grep + link/tag graph (+ FTS when "
            "present). Enforces the anti-autophagy human-information floor on the "
            "returned grounding set."
        ),
        "inputSchema": {
            "type": "object",
            "required": ["query"],
            "properties": {
                "query": {"type": "string", "description": "Natural-language or keyword query."},
                "k": {"type": "integer", "minimum": 1, "default": 12, "description": "Max results."},
                "type": {"type": "string", "description": "Optional note-type filter."},
                "domain": {"type": "string", "description": "Optional domain filter."},
            },
        },
        "handler": _stub("recall"),
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
        "handler": _stub("write_with_provenance"),
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
        "handler": _stub("reindex"),
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
        "handler": _stub("resolve_tier"),
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
        "handler": _stub("citation_verify"),
    },
    "mech_status": {
        "description": (
            "MECH (degraded) mode probe: reports which operations are available "
            "with grep/git only, at $0 and offline. Always succeeds."
        ),
        "inputSchema": {"type": "object", "properties": {}},
        "handler": _stub("mech_status"),
    },
}


def list_tools() -> list[dict]:
    """Shape expected by the MCP `tools/list` result."""
    return [
        {"name": name, "description": spec["description"], "inputSchema": spec["inputSchema"]}
        for name, spec in TOOLS.items()
    ]
