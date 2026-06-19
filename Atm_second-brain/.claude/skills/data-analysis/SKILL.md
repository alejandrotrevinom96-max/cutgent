---
name: data-analysis
description: "Method for turning data into honest decisions: state the decision/question first, check data provenance and quality, explore before modeling, choose the appropriate summary or statistical test, separate correlation from causation, quantify and communicate uncertainty (confidence intervals, not just point estimates), visualize clearly with honest axes, and avoid p-hacking and HARKing. Use when analyzing a dataset, choosing a metric or statistical test, making or critiquing a chart, interpreting a result or model output, designing an experiment or A/B test, or judging whether a finding is trustworthy. Applies a binary rubric and exemplars rather than a persona. The personal layer (the user's data sources, tools, metrics, domain, and prior analyses, via recall) overrides generic best practice."
---

# Data Analysis

Operating method for getting from data to a decision you can defend. The job is
not to produce a number; it's to change a decision honestly, with uncertainty made
visible. Most errors here are framing, provenance, and overclaiming — not arithmetic.

## PRECEDENCE: personal layer wins

The user's `personal/` layer (their data sources, schemas, definitions of key
metrics, tooling, domain knowledge, prior analyses), via recall, **OVERRIDES the
generic best practice here.** State the override when you apply it (e.g. "Your
definition of 'active user' is X, so I'm using that").

## Method (run in order)

1. **Question first — what decision will this change?** Write the decision and the
   threshold before touching data. State what result would change your mind. An
   analysis with no decision attached is trivia.
2. **Data hygiene & provenance.** Where did it come from, how collected, what does
   each row/column mean, what's missing, what's the unit of analysis? Check
   duplicates, nulls, impossible values, survivor/selection bias.
3. **Explore before you model (EDA).** Distributions, ranges, outliers,
   relationships before any summary. **Always plot it** — identical summary stats
   hide wildly different data (Anscombe, Datasaurus).
4. **Choose the right summary/test.** Match method to data type, distribution,
   design: mean vs median for skew; paired vs unpaired; state and check assumptions.
5. **Correlation is not causation.** Default to "associated." Causal claims need a
   design that earns them (RCT, natural experiment, explicit causal model). Watch
   confounders, reverse causation, Simpson's paradox.
6. **Quantify uncertainty.** Intervals, not bare point estimates. Distinguish
   statistical from practical significance (effect size and its interval matter
   more than p<0.05).
7. **Visualize honestly.** One message per chart; sensible baseline (no truncated
   axes); no dual-axis trickery; label directly; encoding fits the comparison.
8. **Avoid p-hacking & HARKing.** Write the hypothesis/plan before looking; correct
   for multiple comparisons; don't invent the hypothesis after seeing the result
   and present it as confirmatory.

## Honesty rules

- State and label assumptions; separate them from what the data shows.
- Report what you actually ran, including what didn't work; make it reproducible
  (data version, filters, steps).
- Say "we can't conclude X from this" when the design doesn't support X.
- Date-stamp tool/library claims and verify against current docs.
