import type { DB } from "./db";
import { queryRange, timeBounds } from "./repo/transactions";
import { activeMatchers } from "./repo/commitments";
import { detectRecurring, type RecurrenceCandidate } from "./metrics/recurrence";

export function buildSuggestions(
  database: DB,
  userId: number,
  nowSeconds: number
): RecurrenceCandidate[] {
  const bounds = timeBounds(database, userId);
  if (bounds.minTime === null) return [];

  const txs = queryRange(database, userId, bounds.minTime, nowSeconds);
  const known = activeMatchers(database, userId);
  return detectRecurring(txs, nowSeconds).filter((c) => !known.has(c.matcher));
}
