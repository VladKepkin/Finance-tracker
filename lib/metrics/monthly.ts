import { quantile } from "./stats";
import type { TxLike } from "./daily";

export interface MonthlyTotal {
  month: string;
  expense: number;
}

const monthKey = (unix: number): string => new Date(unix * 1000).toISOString().slice(0, 7);

const monthStart = (unix: number): number => {
  const d = new Date(unix * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
};

const monthEnd = (unix: number): number => {
  const d = new Date(unix * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000 - 1;
};

export function monthlyTotals(txs: TxLike[], windowFrom: number, windowTo: number): MonthlyTotal[] {
  const sums = new Map<string, number>();
  for (const tx of txs) {
    if (tx.amount >= 0) continue;
    if (monthStart(tx.time) < windowFrom || monthEnd(tx.time) > windowTo) continue;
    const m = monthKey(tx.time);
    sums.set(m, (sums.get(m) ?? 0) + Math.abs(tx.amount));
  }
  return [...sums.entries()]
    .map(([month, expense]) => ({ month, expense }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export interface Percentiles {
  p10: number;
  p50: number;
  p90: number;
}

export function monthlyPercentiles(months: MonthlyTotal[]): Percentiles | null {
  if (months.length === 0) return null;
  const vals = months.map((m) => m.expense);
  return {
    p10: Math.round(quantile(vals, 0.1)!),
    p50: Math.round(quantile(vals, 0.5)!),
    p90: Math.round(quantile(vals, 0.9)!),
  };
}
