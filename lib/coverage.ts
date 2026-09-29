export interface Coverage {
  days: number;
  samples: number;
  from: string | null;
  to: string | null;
}

const DAY = 86_400;

function toDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

export function computeCoverage(input: {
  minTime: number | null;
  maxTime: number | null;
  samples: number;
}): Coverage {
  const { minTime, maxTime, samples } = input;
  if (minTime == null || maxTime == null || samples <= 0) {
    return { days: 0, samples: 0, from: null, to: null };
  }
  const days = Math.floor((maxTime - minTime) / DAY) + 1;
  return { days, samples, from: toDate(minTime), to: toDate(maxTime) };
}

export type Confidence = "insufficient" | "low" | "high";

export interface Metric<T> {
  value: T | null;
  coverage: Coverage;
  confidence: Confidence;
}

export interface Thresholds {
  low: number;
  high: number;
}

export function confidenceFor(observations: number, t: Thresholds): Confidence {
  if (observations < t.low) return "insufficient";
  if (observations < t.high) return "low";
  return "high";
}

export function coverageFromSyncState(
  rows: { covered_from: number | null; covered_to: number | null }[],
  samples: number
): Coverage {
  const valid = rows.filter(
    (r): r is { covered_from: number; covered_to: number } =>
      r.covered_from != null && r.covered_to != null
  );
  if (valid.length === 0 || samples <= 0) {
    return { days: 0, samples: 0, from: null, to: null };
  }
  const from = Math.max(...valid.map((r) => r.covered_from));
  const to = Math.min(...valid.map((r) => r.covered_to));
  if (to < from) return { days: 0, samples: 0, from: null, to: null };
  return computeCoverage({ minTime: from, maxTime: to, samples });
}
