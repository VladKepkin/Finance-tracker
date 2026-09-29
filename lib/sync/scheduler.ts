import { db, getMonoTokenEnc, getUserByUsername, type DB } from "../db";
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
  running: boolean;
  limiter: RateLimiter;
}

function state(): SyncState {
  return (g.__moneySync ??= {
    started: false,
    running: false,
    limiter: createRateLimiter({
      minIntervalMs: 60_000,
      maxIntervalMs: 15 * 60_000,
    }),
  });
}

export function isSchedulerStarted(): boolean {
  return state().started;
}

function tokenFor(userId: number): string | null {
  const enc = getMonoTokenEnc(userId);
  return enc ? decrypt(enc) : null;
}

async function limited<T>(path: string, token: string): Promise<T> {
  const limiter = state().limiter;
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
  if (s.running) return;
  s.running = true;
  try {
    const token = tokenFor(userId);
    if (!token) return;

    const today = new Date().toISOString().slice(0, 10);
    if (!hasDate(database, today)) {
      const rates = await limited<CurrencyRate[]>("/bank/currency", token);
      upsertDaily(database, today, rates);
    }

    const info = await limited<MonoClientInfo>("/personal/client-info", token);

    const fetcher: StatementFetcher = (accountId, from, to) =>
      limited<MonoStatementItem[]>(`/personal/statement/${accountId}/${from}/${to}`, token);

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
    s.running = false;
  }
}

async function tick(): Promise<void> {
  try {
    const user = getUserByUsername(process.env.APP_USERNAME || "admin");
    if (!user) return;
    await runOnce(db(), user.id);
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
