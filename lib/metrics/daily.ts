import { median } from "./stats";

export interface TxLike {
  time: number;
  amount: number;
}

export interface DailyTotal {
  date: string;
  expense: number;
}

const DAY = 86_400;

const toDate = (unix: number): string => new Date(unix * 1000).toISOString().slice(0, 10);

export function dailyTotals(txs: TxLike[], fromTime: number, toTime: number): DailyTotal[] {
  if (toTime < fromTime) return [];

  const fromDayStart = Math.floor(fromTime / DAY) * DAY;
  const toDayEnd = (Math.floor(toTime / DAY) + 1) * DAY - 1;

  const sums = new Map<string, number>();
  for (let t = fromDayStart; t <= toDayEnd; t += DAY) sums.set(toDate(t), 0);

  for (const tx of txs) {
    if (tx.time < fromDayStart || tx.time > toDayEnd) continue;
    if (tx.amount >= 0) continue;
    const d = toDate(tx.time);
    if (!sums.has(d)) continue;
    sums.set(d, sums.get(d)! + Math.abs(tx.amount));
  }

  return [...sums.entries()]
    .map(([date, expense]) => ({ date, expense }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface WeekdayBaseline {
  weekday: number;
  median: number | null;
  samples: number;
}

export function weekdayBaselines(days: DailyTotal[]): WeekdayBaseline[] {
  const buckets: number[][] = [[], [], [], [], [], [], []];
  for (const d of days) {
    const wd = new Date(`${d.date}T00:00:00Z`).getUTCDay();
    buckets[wd].push(d.expense);
  }
  return buckets.map((vals, weekday) => ({
    weekday,
    median: median(vals),
    samples: vals.length,
  }));
}
