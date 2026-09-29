import type { DB } from "../db";
import type { MonoStatementItem } from "../monobank";
import { backwardWindows, DAY } from "./windows";
import { upsertMany } from "../repo/transactions";
import * as state from "../repo/syncState";

export type StatementFetcher = (
  accountId: string,
  from: number,
  to: number
) => Promise<MonoStatementItem[]>;

export interface SyncOptions {
  maxDepthDays: number;
  windowDays: number;
  emptyWindowsToStop: number;
  overlapDays: number;
  now: () => number;
}

export const DEFAULT_SYNC_OPTIONS: Omit<SyncOptions, "now"> = {
  maxDepthDays: 730,
  windowDays: 30,
  emptyWindowsToStop: 2,
  overlapDays: 2,
};

export async function backfillAccount(
  database: DB,
  userId: number,
  accountId: string,
  fetch: StatementFetcher,
  opts: SyncOptions
): Promise<number> {
  const nowSeconds = opts.now();
  const existing = state.ensure(database, userId, accountId, nowSeconds);
  if (existing.backfill_done === 1) return 0;

  state.setStatus(database, userId, accountId, "backfilling");

  const floor = nowSeconds - opts.maxDepthDays * DAY;
  let cursorTo = existing.covered_from != null ? existing.covered_from - 1 : nowSeconds;
  let emptyStreak = 0;
  let saved = 0;

  try {
    while (cursorTo >= floor) {
      const from = Math.max(floor, cursorTo - opts.windowDays * DAY + 1);
      const items = await fetch(accountId, from, cursorTo);

      if (items.length === 0) {
        emptyStreak++;
      } else {
        emptyStreak = 0;
        saved += upsertMany(database, userId, accountId, items, nowSeconds);
      }

      state.setCoveredFrom(database, userId, accountId, from);

      if (emptyStreak >= opts.emptyWindowsToStop) break;
      if (from === floor) break;
      cursorTo = from - 1;
    }
    state.markBackfillDone(database, userId, accountId);
    state.setStatus(database, userId, accountId, "idle");
  } catch (e) {
    state.setStatus(database, userId, accountId, "error", (e as Error).message);
    throw e;
  }

  return saved;
}

export async function syncRecent(
  database: DB,
  userId: number,
  accountId: string,
  fetch: StatementFetcher,
  opts: SyncOptions
): Promise<number> {
  const nowSeconds = opts.now();
  const existing = state.ensure(database, userId, accountId, nowSeconds);
  const coveredTo = existing.covered_to ?? nowSeconds - opts.overlapDays * DAY;
  const from = coveredTo - opts.overlapDays * DAY;

  state.setStatus(database, userId, accountId, "syncing");
  let saved = 0;
  try {
    for (const w of backwardWindows(from, nowSeconds, opts.windowDays)) {
      const items = await fetch(accountId, w.from, w.to);
      saved += upsertMany(database, userId, accountId, items, nowSeconds);
    }
    state.setCoveredTo(database, userId, accountId, nowSeconds);
    state.setStatus(database, userId, accountId, "idle");
  } catch (e) {
    state.setStatus(database, userId, accountId, "error", (e as Error).message);
    throw e;
  }
  return saved;
}
