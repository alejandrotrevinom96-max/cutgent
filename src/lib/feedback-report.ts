import type { FeedbackEntry } from "@/lib/feedback-store";

/**
 * Reporte de correlaciones PURO (sin I/O, sin server-only → testeable aislado).
 * Pearson entre cada feature (score por dimensión) y el outcome → ranking de
 * "palancas que mueven la aguja". Con n chico es ruidoso → lowConfidence. El
 * import de FeedbackEntry es solo de tipo (se borra; no arrastra server-only).
 */

export interface FeatureCorrelation {
  feature: string;
  correlation: number | null; // null si n<2 o varianza 0 en x o y
  n: number;
  lowConfidence: boolean;
  meanFeature: number | null;
  meanOutcome: number | null;
}
export interface FeedbackReport {
  n: number;
  features: FeatureCorrelation[]; // ranking: |correlation| desc; null al final
  lowConfidence: boolean;
  meta: { minConfidentN: number };
}

export const MIN_CONFIDENT_N = 8;

/** Pearson r. null si n<2 o si la varianza de x o y es 0. Determinista. */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2 || ys.length !== n) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0,
    sxx = 0,
    syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx < 1e-12 || syy < 1e-12) return null;
  return Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
}

export function computeReport(entries: FeedbackEntry[]): FeedbackReport {
  const valid = entries.filter((e) => Number.isFinite(e.outcome));
  const keys = new Set<string>();
  for (const e of valid) for (const k of Object.keys(e.features ?? {})) keys.add(k);

  const features: FeatureCorrelation[] = [...keys].map((feature) => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const e of valid) {
      const v = e.features?.[feature];
      if (Number.isFinite(v)) {
        xs.push(v as number);
        ys.push(e.outcome);
      }
    }
    const n = xs.length;
    return {
      feature,
      correlation: pearson(xs, ys),
      n,
      lowConfidence: n < MIN_CONFIDENT_N,
      meanFeature: n ? xs.reduce((a, b) => a + b, 0) / n : null,
      meanOutcome: n ? ys.reduce((a, b) => a + b, 0) / n : null,
    };
  });

  features.sort((a, b) => {
    const ra = a.correlation;
    const rb = b.correlation;
    if (ra == null && rb == null) return a.feature.localeCompare(b.feature);
    if (ra == null) return 1;
    if (rb == null) return -1;
    const d = Math.abs(rb) - Math.abs(ra);
    return d !== 0 ? d : a.feature.localeCompare(b.feature);
  });

  return {
    n: valid.length,
    features,
    lowConfidence: valid.length < MIN_CONFIDENT_N,
    meta: { minConfidentN: MIN_CONFIDENT_N },
  };
}
