---
name: vault-capture
description: Capture a thought, link, quote, or idea into the second brain quickly and without losing it. Use when the user shares something worth keeping, says "save this" or "note that", or when offline/degraded and capture must not be blocked. Favors speed of capture over perfect structure.
---

# Vault capture

Capture is never blocked. Get it in; refine later.

## The fast path (always available, $0, offline)

```sh
scripts/capture.sh "the thought to keep"
# or
echo "piped thought" | scripts/capture.sh
```

This writes a schema-valid note to `vault/00-inbox/` with no model and no
network. Use it whenever a richer path is unavailable or speed matters.

## The structured path

When you have context to spare, write through `write_with_provenance` directly
into the right place with proper `type`, `tags`, `sources`, and links. Prefer
this for anything you already understand well enough to file.

## Rules

- Default landing zone is `00-inbox/`; don't agonize over folder choice at
  capture time — `vault-review` triages later.
- Preserve the source. If it's external material, keep it in an envelope and set
  `trust_tier: externally-ingested` (the agent path defaults appropriately).
- A capture with a title and a body beats a perfect note you never wrote.

## After capture

Mention that the note landed and where. If it's clearly a durable concept, offer
to promote it to `concepts/` with links — but only after it exists.
