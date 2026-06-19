---
name: expertise-pack-template
description: Template and authoring guide for building a domain expertise pack. Use this as the starting structure when creating a new expertise pack for an area such as web design, copywriting, business, counsel, or image and video work. Not an expertise pack itself.
---

# Expertise pack template

Copy this directory to `.claude/skills/<domain>/` and fill it in. An expertise
pack makes the brain genuinely good at a domain through encoded rubrics and
exemplars — **not** through a "you are an expert" persona.

## Progressive disclosure (keep the body lean)

1. **Frontmatter** (always loaded): `name` (== folder, kebab, ≤64 chars) and a
   `description` with explicit trigger conditions. No "Claude"/"Anthropic" in
   either field.
2. **Body** (< ~5k chars): the working method for the domain — the decision
   procedure, the few principles that actually move outcomes, and pointers to
   the deeper files below. Load deeper files only when needed.
3. **On-demand files** in this directory:
   - `exemplars.md` — annotated best-in-class examples and why they work.
   - `rubric.md` — **binary** pass/fail checks (not 1–10 vibes) the output must
     satisfy.
   - `anti-patterns.md` — common failure modes and how to detect them.
   - `sources.md` — the canonical sources this domain's knowledge is drawn from.

## What "expert" means here

- Decisions are made against the binary rubric, then checked against
  anti-patterns. Exemplars calibrate taste.
- The user's `personal/` layer (their preferences, brand, past decisions, pulled
  via `recall`) overrides generic best practice — that's what makes it *their*
  expert.
- Cite sources for non-obvious claims; mark uncertainty rather than bluffing.

## Composition

Multi-domain tasks are arbitrated by `pack-supervisor`. Keep each pack focused on
its own domain so it composes cleanly; don't duplicate another pack's rubric.

## Checklist before shipping a pack

- [ ] `name` matches the folder, kebab-case, ≤ 64 chars, no "claude/anthropic".
- [ ] `description` states *when to use* in the third person.
- [ ] Body < ~5k chars; depth pushed to on-demand files.
- [ ] `rubric.md` checks are binary.
- [ ] `anti-patterns.md` lists detectable failure modes.
- [ ] `sources.md` lists canonical sources.
