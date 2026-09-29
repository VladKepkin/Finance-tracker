import { median, mad } from "./stats";
import type { DailyTotal } from "./daily";

export interface Anomaly {
  date: string;
  expense: number;
  zScore: number | null;
}

const MAD_SCALE = 0.6745;
const FALLBACK_FACTOR = 5;

export function detectAnomalies(days: DailyTotal[], threshold = 3.5): Anomaly[] {
  if (days.length === 0) return [];
  const values = days.map((d) => d.expense);
  const m = median(values);
  const spread = mad(values);
  if (m === null || spread === null) return [];

  if (spread === 0) {
    const limit = m * FALLBACK_FACTOR;
    return days
      .filter((d) => d.expense > limit && d.expense > 0)
      .map((d) => ({ date: d.date, expense: d.expense, zScore: null }));
  }

  return days
    .map((d) => ({
      date: d.date,
      expense: d.expense,
      zScore: (MAD_SCALE * (d.expense - m)) / spread,
    }))
    .filter((a) => a.zScore > threshold);
}

export function withoutAnomalies(days: DailyTotal[], anomalies: Anomaly[]): DailyTotal[] {
  const flagged = new Set(anomalies.map((a) => a.date));
  return days.filter((d) => !flagged.has(d.date));
}
