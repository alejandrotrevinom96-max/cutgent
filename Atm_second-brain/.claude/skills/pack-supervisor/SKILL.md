---
name: pack-supervisor
description: Compose and arbitrate between domain expertise packs when a task spans more than one area (for example design plus copywriting plus business). Use to decide which expertise packs apply, in what order, and how to resolve conflicts between their guidance. Provides the composition logic that the runtime does not give for free.
---

# Pack supervisor

There is no native runtime priority between skills, so composition is explicit.
This meta-skill decides which domain packs to load and how to combine them.

## When a task spans domains

1. **Identify domains.** Map the task to `domain` values (e.g. `web-design`,
   `copywriting`, `business`, `image-video`, `counsel`). Pick the 1–3 that
   genuinely matter; resist loading everything.
2. **Order by leverage.** Lead with the pack that owns the primary deliverable;
   bring others in as constraints. Example: a landing page = web-design leads,
   copywriting shapes the message, business supplies the goal/metric.
3. **Resolve conflicts explicitly.** When packs disagree (e.g. "more whitespace"
   vs "more above the fold"), state the trade-off and decide by the task's
   success metric — don't silently average them.
4. **Ground in the vault.** Pull the user's own `personal/` layer and prior
   notes via `recall`; the personal layer outranks generic best practice because
   it's what makes the brain *theirs*.

## Output discipline

- Name which packs you used and why, so the reasoning is auditable.
- Apply each pack's binary rubric (pass/fail checks), not vibes.
- If no pack fits, say so and work from first principles rather than forcing a
  mismatched pack.

## Adding packs

New expertise packs follow `.claude/skills/expertise-pack-template/SKILL.md`:
metadata + a <5k body + on-demand exemplars, binary rubrics, and anti-patterns.
No "you are an expert" persona — capability comes from the encoded rubrics and
exemplars, not a role prompt.
