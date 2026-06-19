---
schema_version: 1
id: "YYYYMMDDhhmmss-slug"
title: ""
type: project
created: YYYY-MM-DD
updated: YYYY-MM-DD
trust_tier: self-authored
author: human
status: active
target: ""
domain: ""
tags: [project]
aliases: []
sources: []
---

<!-- Save in vault/01-projects/. Human starts a project => author: human, self-authored.
     If the AGENT drafts it: author: agent, trust_tier: externally-ingested until you confirm. -->

# {{title}}

> One sentence: what state of the world makes this project DONE.

## Definition of done  ✅
<!-- Outcome, not activity. Concrete + verifiable. If you can't write this, it's an Area, not a Project. -->
- [ ] {{the observable end state}}

## NEXT ACTION  ➡️
<!-- The single, physical, do-it-now step. A project with no next action is stalled by definition. -->
- [ ] {{the very next concrete action}}

## Milestones / tasks
- [ ] {{milestone 1}}
- [ ] {{milestone 2}}

## Expertise & self-context
- Pack: `{{expertise-pack}}`
- related:: [[personal/{{domain}}]]   <!-- your situation overrides generic pack advice -->

## Related (PARA graph)
- supports:: [[{{Area this project advances}}]]
- source:: [[{{Resource}}]]
- related:: [[{{related project or concept}}]]

## Log & decisions
<!-- Append-only. Date each entry. -->
- {{YYYY-MM-DD}} — {{what happened / what was decided & why}}
