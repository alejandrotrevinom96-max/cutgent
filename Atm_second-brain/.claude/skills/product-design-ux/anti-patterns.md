# Product & UX Anti-Patterns (detectable failure modes + fix)

## 1. Solution-first ("build the thing")
**Tell:** the brief starts with a feature ("add a dashboard"), and the JTBD can only
be stated as "users need our feature." No problem or metric precedes the solution.
**Fix:** back up to the job — situation, motivation, outcome. Define the success
metric. Generate 2–3 ways to serve the job before committing to one.

## 2. Designing for yourself (the team is the user)
**Tell:** decisions justified by "I would..." / "we think users want..."; no recent
user contact; the team's mental model assumed to be the user's.
**Fix:** talk to 5–8 real users about past behavior; usability-test with people
outside the team. Replace opinions with observed behavior.

## 3. Ignoring edge and unhappy states
**Tell:** only the happy path is designed; empty, loading, error, zero/one/many,
offline, and permission-denied states are missing or "TBD."
**Fix:** enumerate states per screen up front and design each. The unhappy paths are
where products actually break and where trust is lost.

## 4. Dark patterns
**Tell:** hidden costs, pre-checked opt-ins, confirmshaming copy, fake countdowns/
scarcity, forced continuity, or a cancellation flow harder than signup.
**Fix:** design for the user's interest. Remove the trick; if a stakeholder pushes,
name the pattern and offer the honest alternative. Measure long-run retention/trust,
not the one juiced funnel step.

## 5. Asking opinions instead of observing behavior
**Tell:** research is "would you use this?", "do you like it?", leading questions, or
a survey standing in for a task. Conclusions rest on what users *say* they'd do.
**Fix:** ask about specific past instances; run task-based usability tests and stay
silent; trust what users *do* over what they *say*.

## 6. Vanity metric / no guardrail
**Tell:** success measured by pageviews, signups, or "engagement" with no tie to the
job; one metric optimized while a worse outcome (churn, support load) is ignored.
**Fix:** pick one primary *behavioral* metric tied to the job plus a guardrail; check
both. Time-to-value and retention beat raw clicks.

## 7. Feature creep / no prioritization
**Tell:** everything is "must-have"; scope grows; shipping the whole thing before any
slice reaches users. No impact/effort reasoning.
**Fix:** score by impact × reach ÷ effort against the metric; ship the smallest
valuable slice; cut scope, not quality. Adding options has a Hick's-law cost.

## 8. Cognitive overload / recall burden
**Tell:** dense screens, every option always visible, jargon, users must remember
data across steps, no defaults, inconsistent placement.
**Fix:** progressive disclosure, sensible defaults, recognition over recall, plain
language, consistent layout. Reduce choices (Hick) and make key targets easy (Fitts).
