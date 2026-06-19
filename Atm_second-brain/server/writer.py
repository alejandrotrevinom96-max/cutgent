"""write_with_provenance — the only sanctioned write path. Standard library only.

This is where "the model proposes, the server disposes" is most literal. Every
write is gated by code invariants:

  1. Path safety: writes stay inside vault/ and end in .md.
  2. Schema conformance: final frontmatter validates against _schema/CURRENT.
  3. No auto-upgrade: a declared schema_version must equal CURRENT.
  4. Human-atom immutability: an existing note with author=human is never edited
     by this tool (humans edit those directly in Obsidian).
  5. Provenance minting limits: this tool (the agent's path) cannot mint
     author=human or trust_tier=human-confirmed — those require an out-of-band
     human action.
  6. Anti-laundering: an existing note's effective trust tier can never be raised
     through this tool.
  7. Optimistic locking: edits may pass expected_hash to detect concurrent change.

On success it stamps content_hash + ingested_at, appends to the append-only
tier_lineage, writes the file, and reindexes.
"""
from __future__ import annotations

import datetime
import json
import os
from typing import Optional

import config
import index
import parser as note_parser
import trust
import validate
from miniyaml import dump
from protocol import GUARDRAIL_REJECTED, RpcError

# Canonical frontmatter field order on write (readability + stable diffs).
FIELD_ORDER = [
    "schema_version", "id", "title", "type", "created", "updated",
    "trust_tier", "author", "domain", "tags", "aliases", "sources", "provenance",
]

ALLOWED_AUTHOR = {"agent", "mixed"}            # 'human' cannot be minted here
ALLOWED_GRANT = {"externally-ingested", "self-authored"}  # not human-confirmed


def _reject(msg: str, **data) -> None:
    raise RpcError(GUARDRAIL_REJECTED, msg, data=data or None)


def _now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _today() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")


def _safe_abs(rel_path: str) -> str:
    rel = rel_path.lstrip("/")
    abs_path = os.path.normpath(os.path.join(config.VAULT_ROOT, rel))
    vault_dir = os.path.normpath(config.VAULT_DIR)
    if not (abs_path == vault_dir or abs_path.startswith(vault_dir + os.sep)):
        _reject(f"path escapes vault/: {rel_path!r}")
    if not abs_path.endswith(".md"):
        _reject(f"path must be a .md note: {rel_path!r}")
    return abs_path


def _ordered(fm: dict) -> dict:
    out = {k: fm[k] for k in FIELD_ORDER if k in fm}
    for k, v in fm.items():  # preserve any extra fields after the canonical block
        if k not in out:
            out[k] = v
    return out


def write_with_provenance(
    path: str,
    frontmatter: dict,
    body: str,
    trust_tier: Optional[str] = None,
    expected_hash: Optional[str] = None,
    db_path: Optional[str] = None,
) -> dict:
    if not isinstance(frontmatter, dict):
        _reject("frontmatter must be an object")
    fm = dict(frontmatter)
    abs_path = _safe_abs(path)
    rel_path = os.path.relpath(abs_path, config.VAULT_ROOT)
    current = config.current_schema_version()

    existing = None
    if os.path.exists(abs_path):
        existing = note_parser.parse_file(abs_path, rel_path)

    # ---- invariant 4: human-atom immutability ----
    if existing and existing.frontmatter.get("author") == "human":
        _reject("human-authored note is immutable to the agent; edit it in Obsidian",
                path=rel_path)

    # ---- invariant 7: optimistic lock ----
    if existing and expected_hash is not None and expected_hash != existing.file_hash:
        _reject("expected_hash mismatch (note changed since last read)",
                expected=expected_hash, actual=existing.file_hash)

    # ---- invariant 5: minting limits ----
    author = fm.get("author") or (existing.frontmatter.get("author") if existing else None) or "agent"
    if author not in ALLOWED_AUTHOR:
        _reject(f"this tool cannot set author={author!r}; allowed {sorted(ALLOWED_AUTHOR)}")
    fm["author"] = author

    claimed_tier = trust_tier or fm.get("trust_tier") or "self-authored"
    if claimed_tier not in ALLOWED_GRANT:
        _reject(f"this tool cannot grant trust_tier={claimed_tier!r}; allowed {sorted(ALLOWED_GRANT)}")

    # ---- invariant 6: anti-laundering (no raising existing effective tier) ----
    if existing:
        prev = trust.effective_tier(existing.frontmatter)["effective"]
        if trust.ORDER[claimed_tier] > trust.ORDER[prev]:
            _reject("cannot raise an existing note's trust tier via this tool "
                    "(anti-laundering); requires out-of-band human confirmation",
                    current=prev, requested=claimed_tier)

    # ---- invariant 3: no auto-upgrade of schema_version ----
    if "schema_version" in fm and fm["schema_version"] != current:
        _reject(f"schema_version {fm['schema_version']} != CURRENT {current}; "
                "migrate instead of writing at a stale version", current=current)
    fm["schema_version"] = current

    # ---- stamp identity/time ----
    if existing and existing.frontmatter.get("created"):
        fm["created"] = existing.frontmatter["created"]
    else:
        fm.setdefault("created", _today())
    fm["updated"] = _today()
    fm["trust_tier"] = claimed_tier

    # ---- stamp provenance (append-only lineage) ----
    prov = dict(existing.frontmatter.get("provenance") or {}) if existing else {}
    lineage = list(prov.get("tier_lineage") or [])
    lineage.append({"tier": claimed_tier, "at": _now_iso(), "by": author})
    prov["tier_lineage"] = lineage
    prov["source"] = prov.get("source") or author
    prov["ingested_at"] = _now_iso()
    prov["content_hash"] = "0" * 64  # placeholder; replaced after we know the canonical body
    fm["provenance"] = prov

    # content_hash must verify on re-read, so hash the body exactly as the parser
    # will extract it. Render once with a placeholder, learn the canonical body
    # (independent of the hash value), then stamp the real hash and re-render.
    stored = body.strip("\n")
    stored = (stored + "\n") if stored else ""
    fm = _ordered(fm)

    def render(front: dict) -> str:
        return "---\n" + dump(front) + "---\n\n" + stored

    _, canonical_body = note_parser.split_frontmatter(render(fm))
    real_hash = note_parser.sha256(canonical_body)
    fm["provenance"]["content_hash"] = real_hash

    # ---- invariant 2: schema conformance ----
    errs = validate.validate_frontmatter(fm, current)
    if errs:
        _reject("frontmatter failed schema validation", errors=errs)

    # ---- write + reindex ----
    os.makedirs(os.path.dirname(abs_path), exist_ok=True)
    with open(abs_path, "w", encoding="utf-8") as fh:
        fh.write(render(fm))
    index.reindex(full=False, db_path=db_path)

    eff = trust.effective_tier(fm)
    return {
        "written": rel_path,
        "created": not bool(existing),
        "schema_version": current,
        "content_hash": fm["provenance"]["content_hash"],
        "trust_tier": claimed_tier,
        "effective_tier": eff["effective"],
        "id": fm.get("id"),
    }


def write_with_provenance_tool(args: dict) -> dict:
    result = write_with_provenance(
        path=args["path"],
        frontmatter=args.get("frontmatter") or {},
        body=args.get("body") or "",
        trust_tier=args.get("trust_tier"),
        expected_hash=args.get("expected_hash"),
    )
    return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}
