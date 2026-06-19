# Note Schema — v1 (human-readable)

This is the human-readable companion to [`schema.v1.json`](schema.v1.json). The
JSON file is the contract the server enforces; this file explains it.

## Rules of the schema system

1. **Immutable & append-only.** `schema.v1.*` never changes once published. A new
   contract ships as `schema.v2.*` plus a migration in `_migrations/`. Git history
   of the schema files is therefore a clean, linear record.
2. **`_schema/CURRENT` holds one integer** — the version every *new* write must use.
   The server reads it at write time and rejects notes whose `schema_version`
   doesn't match (no silent auto-upgrade).
3. **Migration is the only path** from vN to vN+1: idempotent, dry-run by default,
   one commit per migration, lossy transforms forbidden. `git revert` of that
   commit *is* the rollback.
4. **Plain markdown survives.** Every note must remain a greppable, human-readable
   `.md` file with YAML frontmatter. No binary encoding of note content. This is a
   CI/selftest gate, not a guideline.

## Frontmatter fields (v1)

| Field | Req | Type | Notes |
|---|---|---|---|
| `schema_version` | ✅ | int | Must equal `_schema/CURRENT` (1). |
| `id` | ✅ | string | `YYYYMMDDhhmmss-slug`. Stable, never reused. Links resolve by id/alias, **not filename**. |
| `title` | ✅ | string | Human title; may change freely. |
| `type` | ✅ | enum | `note · concept · moc · project · area · resource · daily · literature · meta · template`. |
| `created` | ✅ | date | `YYYY-MM-DD` UTC. Immutable. |
| `updated` | ✅ | date | `YYYY-MM-DD` UTC. |
| `trust_tier` | ✅ | enum | `self-authored · human-confirmed · externally-ingested`. Fail-closed to the lowest tier. |
| `author` | ✅ | enum | `human · agent · mixed`. `human` atoms are immutable to the agent. |
| `domain` | – | string | Routes expertise packs (e.g. `image-video`, `web-design`). |
| `tags` | – | string[] | Lowercase kebab; `/` for hierarchy. Builds the tag graph. |
| `aliases` | – | string[] | Add an alias instead of renaming, to keep inbound links alive. |
| `sources` | – | object[] | `{cite, url?, locator?, accessed?}`. Verified by `citation_verify`. |
| `provenance` | – | object | Machine-managed: `source`, `ingested_at`, `content_hash` (sha256), append-only `tier_lineage[]`. |

## Why these and not more

The contract is deliberately small: required fields are only what an invariant or a
core MCP op (`recall`, `write_with_provenance`, `citation_verify`, `resolve_tier`,
`reindex`) actually needs to enforce something. Everything else is optional and
`additionalProperties` is allowed, so the human can annotate freely in Obsidian
without tripping the validator.
