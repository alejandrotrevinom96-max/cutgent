# Rubric — Data Analysis (BINARY)

## Question & framing
- [ ] The decision the analysis will inform is stated first, before the data.
- [ ] A success/decision threshold (or what would change the conclusion) is written.
- [ ] The unit of analysis (per user / per session / per row) is defined.

## Data hygiene & provenance
- [ ] Data source and collection method are documented.
- [ ] Each key field's meaning and the time window are defined.
- [ ] Missing values, duplicates, and impossible/outlier values are checked and handled.
- [ ] Selection/survivor bias risk is considered and stated.

## Exploration & method
- [ ] The raw data was plotted (distributions/relationships) before summarizing.
- [ ] The summary statistic fits the data (e.g., median for skew, not just mean).
- [ ] The statistical test/model matches the data type and design.
- [ ] The test's assumptions (independence, distribution, variance) are stated and checked.

## Inference & uncertainty
- [ ] Causal language is used only when the design supports it; else "associated."
- [ ] Confounders / reverse causation / Simpson's paradox are considered for any causal claim.
- [ ] Uncertainty is quantified (confidence interval or SE + n), not a bare point estimate.
- [ ] Practical significance (effect size) is reported, not just a p-value.

## Integrity
- [ ] No p-hacking: the hypothesis/plan predates looking at outcomes, or multiple comparisons are corrected.
- [ ] No HARKing: post-hoc findings are labeled exploratory, not confirmatory.
- [ ] The analysis is reproducible (data version, filters, steps/code recorded).

## Visualization
- [ ] Each chart carries one clear message.
- [ ] Axes are honest (sensible baseline; no truncation/dual-axis trickery).
- [ ] Chart type fits the comparison; labels and units are present.

## Honesty
- [ ] Assumptions are labeled and separated from what the data shows.
- [ ] Limits are stated plainly ("we can't conclude X from this").
- [ ] Tool/library specifics are date-stamped or verified against current docs.
