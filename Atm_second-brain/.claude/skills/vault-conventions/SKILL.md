---
name: vault-conventions
description: Read and write notes correctly in this second brain. Use whenever creating, editing, linking, or tagging vault notes, or when unsure about frontmatter, trust tiers, folders (PARA), or how links resolve. Encodes the schema contract and the conventions a validator cannot catch.
---

# Vault conventions

The full prose lives in `vault/meta/conventions.md` and the enforced contract in
`_schema/schema.v1.md`. This skill is the working summary.

## Before writing

- One idea per note (atomic / evergreen). Splitting beats cramming.
- Identity is the `id` (`YYYYMMDDhhmmss-slug`), not the filename. **Never rename
  to reorganize** — add an `aliases` entry so inbound `[[links]]` survive.
- Write through `write_with_provenance`; it validates frontmatter, stamps
  provenance, and enforces the trust rules. Don't hand-edit provenance.

## Frontmatter (required)

`schema_version` (== CURRENT) · `id` · `title` · `type` · `created` · `updated` ·
`trust_tier` · `author`. Optional: `domain`, `tags`, `aliases`, `sources`,
`provenance`. See `_schema/schema.v1.md` for the table.

## Trust tiers (fail-closed)

`self-authored` · `human-confirmed` · `externally-ingested`. Unknown ⇒ least.
The agent write path can mint `self-authored`/`externally-ingested` only; it
cannot mint `author: human` or `human-confirmed`, and it cannot edit a
`author: human` note or raise an existing note's tier (anti-laundering).

## Linking & tags

- `[[Title or Alias]]`; prefer a stable alias. Use typed links when relation
  matters: `supports::`, `contradicts::`, `refines::`, `source::`.
- Tags: lowercase kebab, `/` for hierarchy. The tag graph and link graph are
  separate from full-text search.

## Folders (PARA + Zettelkasten)

`00-inbox` (capture) · `01-projects` · `02-areas` · `03-resources` · `04-archive`
(by actionability) · `concepts` (atomic) · `mocs` (navigation) · `meta`/`agent`.
`attachments/` is for binaries only — never note text.

## Citations

Non-obvious claims carry a `sources[]` entry. Broken citations fail
`citation_verify`. "I'm not certain" beats a fabricated source.
