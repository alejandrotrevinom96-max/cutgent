# Anti-patterns — Data Analysis

- **Analysis with no decision.** A stat nobody acts on. *Fix:* state the decision
  and threshold first.
- **Trusting summaries without plotting.** *Fix:* plot it (Anscombe/Datasaurus);
  look for outliers, multimodality, leverage points.
- **Correlation stated as causation.** *Detect:* causal verb, no experiment/model.
  *Fix:* say "associated"; name confounders and reverse causation.
- **Point estimate with no uncertainty.** *Fix:* add an interval and n; check if it
  spans zero.
- **p-hacking / fishing.** Many cuts/tests, report the winner. *Fix:* pre-specify;
  correct for multiple comparisons; label the rest exploratory.
- **HARKing.** Post-hoc hypothesis presented as predicted. *Fix:* mark exploratory;
  confirm on fresh data.
- **Peeking / optional stopping (A/B).** Stop when significant. *Fix:* fix sample
  size; analyze once at planned n (or a sequential method).
- **Truncated / misleading axes.** *Fix:* honest baseline; small multiples.
- **Significance != importance.** "p<0.001!" for a 0.1% effect. *Fix:* lead with
  effect size and its interval.
- **Ignoring base rates.** *Fix:* compute the posterior; report false-positive load.
- **Survivor / selection bias.** Analyzing only the rows that made it. *Fix:*
  describe who was excluded.
- **Simpson's paradox.** Aggregate trend reverses within subgroups. *Fix:* stratify
  by the obvious confounder.
- **Non-reproducible analysis.** *Fix:* script it; pin the data snapshot; record steps.
