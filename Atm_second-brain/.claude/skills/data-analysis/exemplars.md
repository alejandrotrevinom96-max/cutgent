# Exemplars — Data Analysis

## Tukey & EDA (*Exploratory Data Analysis*)
Before any test, look: box plots, residuals, robust summaries (median, IQR).
**Why:** confirmatory stats answer questions you bring; EDA finds the questions
and exposes data problems a model would silently break on.

## Anscombe's quartet & the Datasaurus
Datasets with near-identical mean/variance/correlation/regression yet a line, a
curve, a leverage point, and a dinosaur. **Why:** summary statistics alone can lie.
The rule: **always plot the raw data**.

## Tufte — maximize data-ink
Strip chartjunk, gridlines, 3-D, decorative color; small multiples; Minard's 1812
map shows six variables honestly. **Why:** clarity = removing everything that isn't
the comparison the reader needs.

## A good A/B test design
Decide the metric and minimum effect worth acting on; compute sample size and run
length *before* starting; randomize at the right unit; one primary metric +
guardrails; don't peek-and-stop; analyze once at planned n. **Why:** controls the
false-positive rate; prevents "significant by Tuesday, gone by Thursday."

## Base-rate reasoning
A 99%-accurate test for a 0.1%-prevalence disease yields mostly false positives
among positives (~9% true). **Why:** forces priors into interpretation — always ask
"out of how many, against what base rate?"

## Confidence intervals over point estimates
"Lift was 4.2%" vs "4.2% (95% CI: -0.3% to 8.7%)." The second is honest: the effect
might be zero. **Why:** the interval is the actual decision input.
