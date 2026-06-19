---
schema_version: 1
id: "20260619000001-vault-conventions"
title: "Vault Conventions"
type: meta
created: 2026-06-19
updated: 2026-06-19
trust_tier: self-authored
author: human
tags: [meta, conventions]
aliases: ["Conventions", "Vault Conventions"]
---

# Vault Conventions

The shared rules for both the human (in Obsidian) and the agent (via MCP). The
machine-enforced subset lives in [`_schema/schema.v1.json`](../../_schema/schema.v1.json);
this note is the prose layer plus the conventions a validator can't catch.

## Note anatomy

- Every note is a single `.md` file with YAML frontmatter conforming to the
  current schema. **Frontmatter is the structured API; the body is for humans.**
- One idea per note (atomic / evergreen). If a note is doing two jobs, split it
  and link the halves.
- Filenames are for humans; **identity is `id`**. Rename freely — never break a
  link by renaming, because links resolve by `id`/alias.

## Linking

- Use `[[wikilinks]]` by title or alias. Prefer linking to an **alias** that is
  stable over a title that may change.
- **Typed links** in prose when the relation matters, e.g.
  `supports:: [[Note]]`, `contradicts:: [[Note]]`, `refines:: [[Note]]`,
  `source:: [[Note]]`. The graph builder records link type when present.
- A new note with no inbound links is an orphan; wire it into at least one MOC or
  related note.

## Folders (PARA + Zettelkasten)

- `00-inbox/` — raw capture. Unsorted is fine. Nothing here is "done."
- `01-projects/` · `02-areas/` · `03-resources/` · `04-archive/` — PARA, by
  actionability, **not** by topic.
- `concepts/` — atomic evergreen notes (the Zettelkasten layer).
- `mocs/` — Maps of Content: hand-curated navigation hubs.
- `meta/`, `agent/` — vault-about-vault, and the agent's own scratch.
- `attachments/` — binaries only. **Never** put note text here.

## Tags vs. the graph

- Tags are lowercase kebab, `/` for hierarchy (`area/health`, `domain/web-design`).
- The **tag graph** and the **link graph** are separate from any full-text index.
  Don't rely on tags to do a link's job or vice versa.

## Trust & provenance (the part that fails closed)

- Set `trust_tier` honestly. Missing/unknown ⇒ treated as `externally-ingested`.
- External material you paste in goes in an **envelope** (a clearly fenced block
  marked as inert external content), and the note's tier reflects it.
- `author: human` notes are immutable to the agent. The agent summarizes them in
  *new* notes; it never edits them in place.

## Sources

- Any non-obvious factual claim carries an entry in `sources[]`
  (`cite`, optional `url`/`locator`/`accessed`). Broken citations fail
  `citation_verify`. "I'm not sure" in the body beats a fabricated citation.

## Dates

- All dates are UTC `YYYY-MM-DD`. `created` is immutable; bump `updated` on edits.
