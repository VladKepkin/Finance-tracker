import { db, getMonoTokenEnc, getUserByUsername, getAllUsersWithToken, type DB } from "../db";
import { decrypt } from "../crypto";
import { monoFetch, type MonoClientInfo, type MonoStatementItem } from "../monobank";
import type { CurrencyRate } from "../fx";
import { createRateLimiter, type RateLimiter } from "./rateLimiter";
import {
  backfillAccount,
  syncRecent,
  DEFAULT_SYNC_OPTIONS,
  type StatementFetcher,
} from "./statementSync";
import { upsertDaily, hasDate } from "../repo/fxRates";

const SYNC_INTERVAL_MS = 15 * 60_000;

type Global = typeof globalThis & { __moneySync?: SyncState };
const g = globalThis as Global;

interface SyncState {
  started: boolean;
  runningUsers: Set<number>;
  limiters: Map<number, RateLimiter>;
}

function state(): SyncState {
  return (g.__moneySync ??= {
    started: false,
    runningUsers: new Set(),
    limiters: new Map(),
  });
}

function getLimiter(userId: number): RateLimiter {
  const s = state();
  let limiter = s.limiters.get(userId);
  if (!limiter) {
    limiter = createRateLimiter({
      minIntervalMs: 60_000,
      maxIntervalMs: 15 * 60_000,
    });
    s.limiters.set(userId, limiter);
  }
  return limiter;
}

export function isSchedulerStarted(): boolean {
  return state().started;
}

function tokenFor(userId: number): string | null {
  const enc = getMonoTokenEnc(userId);
  return enc ? decrypt(enc) : null;
}

async function limited<T>(userId: number, path: string, token: string): Promise<T> {
  const limiter = getLimiter(userId);
  return limiter.schedule(async () => {
    try {
      const data = await monoFetch<T>(token, path);
      limiter.reset();
      return data;
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 429) limiter.penalize();
      throw e;
    }
  });
}

export async function runOnce(database: DB, userId: number): Promise<void> {
  const s = state();
  if (s.runningUsers.has(userId)) return;
  s.runningUsers.add(userId);
  try {
    const token = tokenFor(userId);
    if (!token) return;

    const today = new Date().toISOString().slice(0, 10);
    if (!hasDate(database, today)) {
      const rates = await limited<CurrencyRate[]>(userId, "/bank/currency", token);
      upsertDaily(database, today, rates);
    }

    const info = await limited<MonoClientInfo>(userId, "/personal/client-info", token);

    const fetcher: StatementFetcher = (accountId, from, to) =>
      limited<MonoStatementItem[]>(userId, `/personal/statement/${accountId}/${from}/${to}`, token);

    const opts = { ...DEFAULT_SYNC_OPTIONS, now: () => Math.floor(Date.now() / 1000) };

    for (const acc of info.accounts) {
      try {
        await syncRecent(database, userId, acc.id, fetcher, opts);
      } catch (e) {
        console.error(`[sync] syncRecent(${acc.id}) — помилка:`, (e as Error).message);
      }
    }
    for (const acc of info.accounts) {
      try {
        await backfillAccount(database, userId, acc.id, fetcher, opts);
      } catch (e) {
        console.error(`[sync] backfillAccount(${acc.id}) — помилка:`, (e as Error).message);
      }
    }
  } finally {
    s.runningUsers.delete(userId);
  }
}

async function tick(): Promise<void> {
  try {
    const users = getAllUsersWithToken(db());
    if (users.length === 0) {
      const user = getUserByUsername(process.env.APP_USERNAME || "admin");
      if (user && user.mono_token) {
        await runOnce(db(), user.id);
      }
      return;
    }
    for (const user of users) {
      try {
        await runOnce(db(), user.id);
      } catch (e) {
        console.error(`[sync] прохід для ${user.username} завершився помилкою:`, (e as Error).message);
      }
    }
  } catch (e) {
    console.error("[sync] прохід завершився помилкою:", (e as Error).message);
  }
}

export function startScheduler(): void {
  const s = state();
  if (s.started) return;
  s.started = true;
  void tick();
  const timer = setInterval(() => void tick(), SYNC_INTERVAL_MS);
  if (typeof timer.unref === "function") timer.unref();
}
