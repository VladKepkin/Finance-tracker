import { median, mad } from "./stats";
import { nextDue, type Cadence } from "./cadence";

export interface RecurrenceTx {
  time: number;
  amount: number;
  operation_amount: number | null;
  description: string | null;
  currency_code: number;
}

function pairedAmount(t: RecurrenceTx): number {
  return t.operation_amount ?? t.amount;
}

export interface RecurrenceCandidate {
  name: string;
  matcher: string;
  amount: number;
  currency: number;
  cadence: Cadence;
  anchorDay: number;
  occurrences: number;
  lastSeen: number;
  nextDue: number;
}

const DAY = 86_400;
const MIN_OCCURRENCES = 3;
const INTERVAL_SPREAD_MAX = 0.25;
const AMOUNT_SPREAD_MAX = 0.15;
const STALE_MULTIPLIER = 2;

function normalize(desc: string | null): string {
  return (desc ?? "").trim().toLowerCase();
}

function classify(medianInterval: number): Cadence | null {
  if (Math.abs(medianInterval - 7) <= 2) return "weekly";
  if (Math.abs(medianInterval - 30) <= 5) return "monthly";
  return null;
}

function spread(values: number[]): number | null {
  const m = median(values);
  const d = mad(values);
  if (m === null || d === null || m === 0) return null;
  return d / Math.abs(m);
}

export function detectRecurring(txs: RecurrenceTx[], nowSeconds: number): RecurrenceCandidate[] {
  const groups = new Map<string, RecurrenceTx[]>();
  for (const t of txs) {
    if (pairedAmount(t) >= 0) continue;
    const key = normalize(t.description);
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }

  const out: RecurrenceCandidate[] = [];
  for (const [key, arr] of groups) {
    if (arr.length < MIN_OCCURRENCES) continue;
    arr.sort((a, b) => a.time - b.time);

    const intervals: number[] = [];
    for (let i = 1; i < arr.length; i++) {
      intervals.push((arr[i].time - arr[i - 1].time) / DAY);
    }
    const medInterval = median(intervals);
    if (medInterval === null) continue;

    const cadence = classify(medInterval);
    if (!cadence) continue;

    const intervalSpread = spread(intervals);
    if (intervalSpread === null || intervalSpread > INTERVAL_SPREAD_MAX) continue;

    const amounts = arr.map((t) => Math.abs(pairedAmount(t)));
    const amountSpread = spread(amounts);
    if (amountSpread === null || amountSpread > AMOUNT_SPREAD_MAX) continue;

    const anchors = arr.map((t) =>
      cadence === "weekly"
        ? new Date(t.time * 1000).getUTCDay()
        : new Date(t.time * 1000).getUTCDate()
    );
    const anchorDay = Math.round(median(anchors)!);

    const last = arr[arr.length - 1];
    if (nowSeconds - last.time > medInterval * STALE_MULTIPLIER * DAY) continue;

    out.push({
      name: (last.description ?? key).trim(),
      matcher: key,
      amount: Math.round(median(amounts)!),
      currency: last.currency_code,
      cadence,
      anchorDay,
      occurrences: arr.length,
      lastSeen: last.time,
      nextDue: nextDue(cadence, anchorDay, nowSeconds),
    });
  }

  return out.sort((a, b) => b.amount - a.amount);
}
