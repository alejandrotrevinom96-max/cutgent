---
schema_version: 1
id: "20260619101002-about-personal-layer"
title: "About the personal layer"
type: meta
created: 2026-06-19
updated: 2026-06-19
trust_tier: self-authored
author: agent
tags: [personal, meta]
aliases: ["about the personal layer", "personal/about"]
---

# About the personal layer

`vault/personal/` is what turns a *generic* expert into *your* expert. There's one
note per expertise pack (filename = pack name = `domain`), plus
[[personal/identity]] (ambient context every pack also reads).

## How it works

- Each expertise pack, when it runs, recalls its matching `personal/<domain>` note
  (and `personal/identity`). The note's contents **override generic best practice**.
- Notes start as **stubs**: `author: agent`, `trust_tier: self-authored`, tagged
  `personal/stub`. **A stub does not override anything** — overriding with a blank
  would be worse than the pack default.
- When you fill a note in Obsidian, set `author: human` (or `mixed`),
  `trust_tier: human-confirmed`, and drop the `personal/stub` tag. That human
  confirmation is the *only* signal that lets the note outrank generic advice — and
  the agent cannot fake it (the write path can't mint `human` / `human-confirmed`).
- Because retrieval enforces a human-information floor and ranks `human-confirmed`
  highest, your confirmed notes can't be crowded out by generic/agent text.

## Privacy

Notes tagged `privacy/local-only` (currently `personal-finance`, `counsel`,
`negotiation`) hold sensitive context. **Store preferences and policy, not
secrets** — no balances, account numbers, IDs, passwords/seed phrases, diagnoses,
or third-party private detail. If you keep sensitive specifics, keep them local
(don't push that file to a remote you don't control).

## Start here

Open [[personal/identity]] first, then fill the domains you use most. See the full
capability map in [[Expertise Packs]].
