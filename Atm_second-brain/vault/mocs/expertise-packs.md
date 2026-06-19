---
schema_version: 1
id: "20260619101000-expertise-packs-moc"
title: "Expertise Packs"
type: moc
created: 2026-06-19
updated: 2026-06-19
trust_tier: self-authored
author: agent
tags: [moc, expertise]
aliases: ["capabilities", "what can you help with", "skills index", "agent abilities", "expertise map"]
---

# Expertise Packs

Map of every capability pack the agent carries. Packs are **Agent Skills** (they
live in `.claude/skills/`, referenced by name in `backticks`) — each is bridged to
its matching **personal context** note via a `[[wikilink]]` so you can jump from a
capability to *your* situation, and so the agent's graph connects skill → self.

> Use this note to answer "what can you help with?" Pick a group, scan the "use
> when", then follow the link to your own context. Each personal note starts as an
> empty stub; fill it in to make the agent follow *your* preferences over generic
> best practice. See `source:: .claude/skills/` for the packs themselves.

## Craft / Create  #craft

- `web-design` — building or critiquing a site, UI, or landing page · related:: [[personal/web-design]]
- `copywriting` — writing or sharpening words that must persuade or convert · related:: [[personal/copywriting]]
- `image-video-editing-generation` — making, editing, or generating images/video · related:: [[personal/image-video-editing-generation]]
- `3d-animation` — modeling, rigging, or animating in 3D · related:: [[personal/3d-animation]]

## Business / Money  #business

- `business-strategy` — direction, positioning, or how a venture makes money · related:: [[personal/business-strategy]]
- `negotiation` — preparing for or running any deal or high-stakes bargain · related:: [[personal/negotiation]]
- `personal-finance` — budgeting, investing, or any money decision for yourself · related:: [[personal/personal-finance]]

## People / Self  #people-self

- `communication` — structuring a message, talk, or hard conversation · related:: [[personal/communication]]
- `counsel` — thinking through a personal, ethical, or life decision · related:: [[personal/counsel]]
- `learning` — learning a new skill or designing how to study something · related:: [[personal/learning]]
- `productivity` — planning, prioritizing, or fixing how work gets done · related:: [[personal/productivity]]

## Meta  #meta

System packs (no personal-domain counterpart, so unbridged by design):
- `pack-supervisor` — routes a request to the right pack(s) and composes them.
- `vault-conventions` — how notes, links, and tags are structured.
- `vault-capture` — get a new thought into the vault as a well-formed note.
- `vault-review` — periodic pass to refine, link, and prune.
- `vault-git` — version, commit, and sync the vault.

## See also

- supports:: [[Home]]
- related:: [[personal/identity]]
