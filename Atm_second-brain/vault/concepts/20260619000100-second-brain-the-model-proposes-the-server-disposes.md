---
schema_version: 1
id: "20260619000100-second-brain-the-model-proposes-the-server-disposes"
title: "The model proposes, the server disposes"
type: concept
created: 2026-06-19
updated: 2026-06-19
trust_tier: self-authored
author: human
domain: "knowledge-systems"
tags: [principle, architecture, guardrails]
aliases: ["model proposes server disposes", "guardrails as invariants"]
sources:
  - cite: "PARA method — Tiago Forte, Building a Second Brain"
    url: "https://fortelabs.com/blog/para/"
    accessed: 2026-06-19
---

# The model proposes, the server disposes

> A guardrail that lives only in a prompt is a wish; a guardrail that lives in code
> is an invariant. This brain only trusts invariants.

## Body

Every constraint that actually matters — trust tiers, the immutability of human
notes, the human-information floor, schema conformance, citation integrity — is
enforced by the MCP server and git, not by the agent's good intentions. The agent is
free to *propose* any write or answer; the server *disposes* by accepting,
rejecting, or stamping it.

This is what lets a single vault be safely shared by a human and an agent: the human
doesn't have to trust the model's discipline, only the server's code. It also makes
the convenience layer (Skills, hooks) **removable** — you can delete every skill and
the safety properties still hold, because they were never in the skills.

Practical consequences:

- A new guardrail is a code change + a `selftest` fixture, never a sentence added to
  `CLAUDE.md` and hoped upon.
- If a behavior can be "routed around" by calling bash directly, it wasn't a real
  guardrail — `refines:: [[Vault Conventions]]`.

## Related

- [[Vault Conventions]]
