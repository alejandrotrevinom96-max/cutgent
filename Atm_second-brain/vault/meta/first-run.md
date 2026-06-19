---
schema_version: 1
id: "20260619102000-first-run"
title: "First run — set up your second brain"
type: meta
created: 2026-06-19
updated: 2026-06-19
trust_tier: self-authored
author: agent
tags: [meta, onboarding]
aliases: ["first run", "start here onboarding", "onboarding"]
---

# First run — set up your second brain

Welcome to your second brain. Right now the agent is a generic expert. Filling these notes turns it into **your** expert: a stub sits empty and changes nothing, but a confirmed note quietly overrides generic best practice with how *you* actually work. Ten minutes here pays off on every future task.

## Start here

- [ ] **Fill [[personal/identity]] first.** This is the ambient context every pack reads — who you are, what you're working on, how you like to be talked to. Confirm it and every domain gets smarter at once.
- [ ] **Pick your top 2-3 domains** to fill next. Choose what you'll use soonest: [[personal/web-design]], [[personal/copywriting]], [[personal/business-strategy]], [[personal/productivity]], [[personal/learning]], [[personal/communication]], [[personal/negotiation]], [[personal/3d-animation]], [[personal/image-video-editing-generation]], [[personal/personal-finance]], [[personal/counsel]]. Browse them all from [[Expertise Packs]].
- [ ] **For each note: fill, then run the CONFIRM ritual.** Replace the stub text with real specifics (your tools, constraints, preferences, past decisions). Then in the frontmatter:
  - `author: agent` -> `author: human`
  - `trust_tier: self-authored` -> `trust_tier: human-confirmed`
  - remove the `personal/stub` tag
  - bump `updated:` to today

  Until you do this, the agent ignores the note — its own write path can't mint `human`/`human-confirmed`, so a confirmed note is guaranteed to be *your* words.
- [ ] **Mind privacy on the local-only domains** ([[personal/personal-finance]], [[personal/counsel]], [[personal/negotiation]]). Store *preferences and policy*, never secrets: no balances, account numbers, IDs, passwords/seed phrases, or diagnoses. "I prefer low-cost index funds and want a 6-month emergency fund" — yes. Numbers that could hurt you if leaked — no.
- [ ] **Capture new stuff as it comes up.** Run `scripts/capture.sh` or use the **vault-capture** skill. It lands in **vault/00-inbox/** for you to file later — capture fast, organize never-blocks.
- [ ] **Verify it's working.** Ask the agent something in a domain you just confirmed. It should cite *your* context (your tools, your constraints) instead of generic advice. If it sounds generic, re-check that the stub tag is gone and `trust_tier` is `human-confirmed`.

## What "good" looks like

**Before** (stub — does nothing):

```
- (stub) Describe your design preferences here.
```

**After** (confirmed — steers the agent):

```
- I ship with Tailwind + shadcn/ui; default to system fonts, generous whitespace, one accent color. No carousels, no stock photography. Mobile-first, dark mode by default.
```

The more concrete and opinionated, the better the agent gets.

## Daily flow (optional)

Use the daily-note template (`vault/templates/daily.template.md`) for a date-stamped log in `vault/journal/`, and the project / area / resource templates to populate PARA. New work starts as a **project** (with a definition of done + a next action); ongoing duties are **areas**; reference is **resources**.

Navigate from [[Home]] or [[Expertise Packs]] anytime. You can re-run this onboarding whenever you want a refresher.
