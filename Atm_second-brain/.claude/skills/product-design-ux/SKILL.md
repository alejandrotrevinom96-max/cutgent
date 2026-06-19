---
name: product-design-ux
description: "Operational method for product design and UX — deciding what to build and designing how it works, distinct from visual page craft. Use when defining a product or feature, framing a user job or problem (JTBD), planning or interpreting user research, designing a flow or interaction, mapping screen states, evaluating usability, prioritizing what to build, or writing a PRD/spec. Drives from the user's job and a success metric, not from a chosen solution; designs for the user's interest with no dark patterns. The personal layer (the user's product, real users, constraints, and prior decisions, via recall) overrides generic best practice."
---

# Product design & UX

A binary procedure for deciding *what to build* and designing *how it works*.
Generic best practice is the floor. **Whenever `personal/` recall returns the
user's real context — their actual users, product, metrics, constraints, prior
research or decisions — that OVERRIDES the generic moves below.** Surface the
conflict, then follow personal/. For visual craft (type, color, spacing, layout)
defer to the web-design pack; this pack is about thinking, research, flow, and
usability.

## 1. Start from the job, not the solution

- **Frame the Job To Be Done.** "When [situation], I want to [motivation], so I can
  [outcome]." Describe the user's *progress sought*, not your feature. If you can
  only state it as "users need [your solution]," you haven't found the job yet.
- **Name the user and their context.** Who, in what situation, on what device, under
  what pressure, with what prior knowledge. "Everyone" is not a user. Edge users
  (low literacy, slow network, assistive tech, first-time vs power) shape the design.
- **Define the success metric before designing.** One primary behavioral metric
  (task completion, time-to-value, activation, retention) plus a guardrail (don't
  win one metric by wrecking another). No metric → you can't tell if the design works.

## 2. Research — behavior over opinion

Match method to question:

- **Generative (what's the problem):** 5–8 user *interviews*; ask about past
  behavior and specific recent instances, never hypotheticals or "would you." Watch
  what they do (contextual inquiry), not only what they say.
- **Evaluative (does this work):** usability test 5 users on tasks — that surfaces
  ~80% of issues. Give tasks, not a tour; stay silent; measure success/failure, not
  smiles.
- **Quant (how much / which):** analytics, funnels, A/B tests for magnitude and
  prioritization — once you know *what* to measure from qual.
- Surveys measure attitudes at scale but are weak for behavior; never let a survey
  substitute for watching a task. Distinguish what users *say*, *do*, and *feel*.

## 3. Map the flow and every state

- Storyboard the end-to-end flow from trigger to outcome; remove steps before adding.
- For each screen design all states: **empty, loading, partial, error, success,
  edge** (zero items, one, many; offline; permission denied; long strings). The
  unhappy paths are where products fail — design them, don't discover them in prod.
- Reduce cognitive load: progressive disclosure, sensible defaults, chunking.

## 4. Interaction principles (load-bearing)

- **Affordance & signifiers** — controls look like what they do; the next action is obvious.
- **Feedback** — every action gets an immediate, legible response (state change, not silence).
- **Recognition over recall** — show options; don't make users remember across screens.
- **Error prevention > error messages** — constrain inputs, confirm destructive acts,
  make undo cheap; when errors happen, say what and how to fix in plain language.
- **Mapping & consistency** — match controls to real-world/expected models; same thing, same place.
- **Hick's law** — fewer/grouped choices = faster decisions. **Fitts's law** — make
  frequent/important targets bigger and closer.

## 5. Usability heuristics (Nielsen — evaluate against all 10)

Visibility of status · match to real world · user control & freedom (undo/exit) ·
consistency & standards · error prevention · recognition over recall · flexibility
& efficiency · aesthetic & minimalist design · help users recover from errors ·
help & documentation. Do a heuristic walkthrough before testing.

## 6. Prototype → test → iterate

Lowest-fidelity artifact that answers the question (sketch → clickable → coded).
Test with real users on real tasks, fix the top issues, retest. Never ship a flow
no one outside the team has completed.

## 7. Prioritize

Score candidates by **(Impact × Reach) ÷ Effort** (RICE-style), tied to the success
metric. Ship the smallest slice that delivers the core value; cut scope, not quality.

## Honesty boundary

Design for the *user's* interest. No dark patterns — no forced continuity, hidden
costs, confirmshaming, fake scarcity, roach-motel cancellation, or pre-checked
opt-ins. Persuasion that survives an informed user is fine; tricks that depend on
confusion are not. If a stakeholder asks for one, name it and offer the honest
alternative.
