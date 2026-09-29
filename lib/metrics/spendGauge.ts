import type { DailyTotal } from "./daily";

export interface SpendGauge {
  spent: number;
  limit: number | null;
  ratio: number | null;
  remaining: number | null;
  zone: "within" | "over" | "unknown";
}

export function spendGauge(spent: number, limit: number | null): SpendGauge {
  if (!Number.isFinite(spent)) {
    return { spent, limit, ratio: null, remaining: null, zone: "unknown" };
  }
  if (limit === null) {
    return { spent, limit: null, ratio: null, remaining: null, zone: "unknown" };
  }
  if (!Number.isFinite(limit)) {
    return { spent, limit, ratio: null, remaining: null, zone: "unknown" };
  }

  const remaining = limit - spent;
  const zone = spent <= limit ? "within" : "over";
  const ratio = limit === 0 ? null : spent / limit;

  return { spent, limit, ratio, remaining, zone };
}

export interface DayBar {
  date: string;
  spent: number;
  vsTypical: "light" | "typical" | "heavy" | null;
}

export function dayHistory(days: DailyTotal[], typicalMedian: number | null): DayBar[] {
  const medianKnown = typicalMedian !== null && Number.isFinite(typicalMedian);

  return days.map((d) => {
    const spent = d.expense;
    if (!medianKnown || !Number.isFinite(spent)) {
      return { date: d.date, spent, vsTypical: null };
    }
    const median = typicalMedian as number;
    let vsTypical: DayBar["vsTypical"];
    if (spent > median) vsTypical = "heavy";
    else if (spent < median * 0.5) vsTypical = "light";
    else vsTypical = "typical";
    return { date: d.date, spent, vsTypical };
  });
}
