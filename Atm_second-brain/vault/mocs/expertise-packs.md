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
> empty stub; fill it in (see [[first run]]) to make the agent follow *your*
> preferences over generic best practice. `source:: .claude/skills/`

## Craft / Create  #craft

- `web-design` — building or critiquing a site, UI, or landing page · related:: [[personal/web-design]]
- `copywriting` — words that must persuade or convert · related:: [[personal/copywriting]]
- `image-video-editing-generation` — making, editing, or generating images/video · related:: [[personal/image-video-editing-generation]]
- `3d-animation` — modeling, rigging, or animating in 3D · related:: [[personal/3d-animation]]
- `writing` — long-form nonfiction: essays, articles, docs, narrative · related:: [[personal/writing]]

## Build / Analyze  #build

- `software-engineering` — writing, reviewing, debugging, or designing software · related:: [[personal/software-engineering]]
- `data-analysis` — turning data into honest decisions · related:: [[personal/data-analysis]]

## Business / Money  #business

- `business-strategy` — direction, positioning, or how a venture makes money · related:: [[personal/business-strategy]]
- `marketing-growth` — positioning, channels, funnel, growth experiments · related:: [[personal/marketing-growth]]
- `sales` — consultative selling, discovery, pipeline, closing · related:: [[personal/sales]]
- `negotiation` — preparing for or running any deal or high-stakes bargain · related:: [[personal/negotiation]]
- `personal-finance` — budgeting, investing, or a money decision for yourself · related:: [[personal/personal-finance]]

## People / Self  #people-self

- `communication` — structuring a message, talk, or hard conversation · related:: [[personal/communication]]
- `counsel` — thinking through a personal, ethical, or life decision · related:: [[personal/counsel]]
- `leadership-management` — leading people, 1:1s, feedback, hiring, delegation · related:: [[personal/leadership-management]]
- `decision-making` — weighing a hard decision under uncertainty · related:: [[personal/decision-making]]
- `learning` — learning a new skill or designing how to study something · related:: [[personal/learning]]
- `productivity` — planning, prioritizing, or fixing how work gets done · related:: [[personal/productivity]]
- `health-fitness` — training, nutrition, and recovery (general education) · related:: [[personal/health-fitness]]
- `psychology` — behavior, cognition, motivation, emotion (evidence-graded, not therapy) · related:: [[personal/psychology]]
- `philosophy` — reasoning, ethics, epistemology, meaning (across traditions) · related:: [[personal/philosophy]]

## Meta  #meta

System packs (no personal-domain counterpart, so unbridged by design):
- `pack-supervisor` — routes a request to the right pack(s) and composes them.
- `vault-conventions` — how notes, links, and tags are structured.
- `vault-capture` — get a new thought into the vault as a well-formed note.
- `vault-review` — periodic pass to refine, link, and prune.
- `vault-git` — version, commit, and sync the vault.

## See also

- supports:: [[Home]]
- related:: [[personal/identity]] · [[first run]]
