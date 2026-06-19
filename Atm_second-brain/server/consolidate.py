"""consolidate — guarded memory consolidation. Standard library only.

Memory systems that "reflect" or "summarize" risk two failure modes this brain
refuses by construction:
  - autophagy: synthesizing new memory primarily from the agent's own prior output,
  - laundering: a summary quietly claiming more authority than its sources.

So consolidation is not free-form generation. The server:
  1. recalls the notes related to a topic (recall already enforces the
     human-information floor),
  2. REFUSES if that grounding can't meet the human floor (anti-autophagy),
  3. assembles a synthesis DRAFT that cites every source it consolidated (sources[]
     + `consolidates::` wikilinks) and quotes their snippets, and
  4. writes it through write_with_provenance, so it is author=agent, self-authored
     (never human/human-confirmed), content-hashed, lineage-stamped, schema-valid.

It NEVER edits or deletes the source notes — markdown stays canonical; a synthesis
is a new note that points back at its sources. The prose synthesis itself is then
the agent's job (Surface A) on top of this provenance-correct scaffold: the server
guarantees the structure and the citations, not the wordsmithing.
"""
from __future__ import annotations

import datetime
import json
import re
from typing import Optional

import config
import recall as recall_mod
import writer


def _slug(text: str, n: int = 6) -> str:
    words = re.findall(r"[a-z0-9]+", (text or "").lower())
    return "-".join(words[:n]) or "topic"


def consolidate(topic: str, k: int = 8, domain: Optional[str] = None,
                dry_run: bool = True, db_path: Optional[str] = None) -> dict:
    if not topic or not topic.strip():
        return {"ok": False, "reason": "consolidate requires a non-empty topic"}

    r = recall_mod.recall(topic, k=k, domain=domain, db_path=db_path)
    results = r.get("results", [])
    if not results:
        return {"ok": False, "reason": "no source notes found for this topic", "topic": topic}

    # --- anti-autophagy guard: refuse to synthesize from mostly-agent output ---
    if not r.get("floor_met", False):
        return {
            "ok": False,
            "reason": ("anti-autophagy: the grounding for this topic does not meet the "
                       "human-information floor; narrow the topic or add human-grounded "
                       "notes before consolidating"),
            "human_fraction": r.get("human_fraction"),
            "floor": r.get("floor"),
            "topic": topic,
        }

    now = datetime.datetime.now(datetime.timezone.utc)
    ts = now.strftime("%Y%m%d%H%M%S")
    nid = f"{ts}-synthesis-{_slug(topic)}"
    title = f"Synthesis: {topic.strip()[:72]}"

    # sources[] cites every consolidated note (cite is required by the schema).
    sources = [{"cite": (res["title"] or res["id"]), "locator": res["id"]} for res in results]

    # body: an honest scaffold — what was consolidated, with back-links + snippets.
    lines = [
        f"> [!note] AGENT SYNTHESIS DRAFT — consolidated from {len(results)} notes for "
        f'"{topic.strip()}". Self-authored scaffold with provenance; replace this with '
        "the actual synthesis prose, then a human can confirm it.",
        "",
        "## Grounding",
        f"- human_fraction:: {r.get('human_fraction')} (floor {r.get('floor')}, met)",
        f"- retrieval:: {r.get('provenance')}",
        "",
        "## Sources consolidated",
    ]
    for res in results:
        human = "human" if res.get("human") else "agent"
        lines.append(f"- consolidates:: [[{res['id']}]] — *{res.get('title') or res['id']}* "
                     f"({human}, {res.get('trust_tier')})")
    lines.append("")
    lines.append("## Material")
    for res in results:
        snip = (res.get("snippet") or "").strip()
        lines.append(f"### [[{res['id']}]]")
        lines.append(f"> {snip}" if snip else "> (no snippet)")
        lines.append("")
    lines.append("## Synthesis")
    lines.append("_(to be written by the agent on top of the cited material above)_")
    body = "\n".join(lines)

    fm = {
        "id": nid,
        "title": title,
        "type": "note",
        "trust_tier": "self-authored",
        "author": "agent",
        "tags": ["synthesis", "synthesis/draft", "needs-synthesis"],
        "sources": sources,
    }
    if domain:
        fm["domain"] = domain

    rel_path = f"vault/concepts/{nid}.md"
    preview = {
        "ok": True,
        "dry_run": dry_run,
        "topic": topic,
        "path": rel_path,
        "id": nid,
        "n_sources": len(sources),
        "human_fraction": r.get("human_fraction"),
        "source_ids": [res["id"] for res in results],
    }
    if dry_run:
        preview["note_preview"] = "---\n(frontmatter)\n---\n\n" + body[:600]
        return preview

    res = writer.write_with_provenance(
        path=rel_path, frontmatter=fm, body=body,
        trust_tier="self-authored", db_path=db_path,
    )
    preview["written"] = res["written"]
    preview["content_hash"] = res["content_hash"]
    preview["effective_tier"] = res["effective_tier"]
    return preview


def consolidate_tool(args: dict) -> dict:
    result = consolidate(
        topic=str(args.get("topic", "")),
        k=int(args.get("k", 8)),
        domain=args.get("domain"),
        dry_run=bool(args.get("dry_run", True)),
    )
    return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}
