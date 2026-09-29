import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { createSchema, type DB } from "@/lib/db";
import { backfillAccount, syncRecent, DEFAULT_SYNC_OPTIONS } from "@/lib/sync/statementSync";
import * as state from "@/lib/repo/syncState";
import { timeBounds } from "@/lib/repo/transactions";
import { DAY } from "@/lib/sync/windows";
import type { MonoStatementItem } from "@/lib/monobank";

function testDb(): DB {
  const d = new Database(":memory:");
  createSchema(d);
  return d;
}

const NOW = 1_800_000_000;

function item(id: string, time: number): MonoStatementItem {
  return {
    id,
    time,
    description: "Тест",
    mcc: 5411,
    originalMcc: 5411,
    hold: false,
    amount: -1000,
    operationAmount: -1000,
    currencyCode: 980,
    commissionRate: 0,
    cashbackAmount: 0,
    balance: 0,
  } as MonoStatementItem;
}

const opts = { ...DEFAULT_SYNC_OPTIONS, now: () => NOW };

describe("backfillAccount", () => {
  it("зупиняється після двох поспіль порожніх вікон і позначає бекфіл завершеним", async () => {
    const d = testDb();
    let calls = 0;
    const fetch = async (_a: string, from: number) => {
      calls++;
      return calls <= 2 ? [item(`i${calls}`, from + 10)] : [];
    };
    const saved = await backfillAccount(d, 1, "acc1", fetch, opts);
    expect(saved).toBe(2);
    expect(calls).toBe(4);
    expect(state.get(d, 1, "acc1")!.backfill_done).toBe(1);
  });

  it("не йде глибше за maxDepthDays", async () => {
    const d = testDb();
    let minFrom = Number.POSITIVE_INFINITY;
    const fetch = async (_a: string, from: number) => {
      minFrom = Math.min(minFrom, from);
      return [item(`x${from}`, from + 1)];
    };
    await backfillAccount(d, 1, "acc1", fetch, { ...opts, maxDepthDays: 60 });
    expect(minFrom).toBe(NOW - 60 * DAY);
  });

  it("продовжує з місця зупинки після рестарту", async () => {
    const d = testDb();
    state.ensure(d, 1, "acc1", NOW);
    state.setCoveredFrom(d, 1, "acc1", NOW - 30 * DAY);
    const seen: number[] = [];
    const fetch = async (_a: string, _from: number, to: number) => {
      seen.push(to);
      return [];
    };
    await backfillAccount(d, 1, "acc1", fetch, { ...opts, emptyWindowsToStop: 1 });
    expect(seen[0]).toBe(NOW - 30 * DAY - 1);
  });

  it("повторний виклик після завершення нічого не робить", async () => {
    const d = testDb();
    state.ensure(d, 1, "acc1", NOW);
    state.markBackfillDone(d, 1, "acc1");
    let calls = 0;
    await backfillAccount(d, 1, "acc1", async () => {
      calls++;
      return [];
    }, opts);
    expect(calls).toBe(0);
  });
});

describe("syncRecent", () => {
  it("тягне вікно з перекриттям і зберігає операції", async () => {
    const d = testDb();
    state.ensure(d, 1, "acc1", NOW - 10 * DAY);
    let requestedFrom = 0;
    const fetch = async (_a: string, from: number) => {
      requestedFrom = from;
      return [item("new1", NOW - 100)];
    };
    const n = await syncRecent(d, 1, "acc1", fetch, opts);
    expect(n).toBe(1);
    expect(requestedFrom).toBe(NOW - 10 * DAY - 2 * DAY);
    expect(state.get(d, 1, "acc1")!.covered_to).toBe(NOW);
    expect(timeBounds(d, 1).samples).toBe(1);
  });

  it("розбиває на вікна, якщо сервер довго не працював", async () => {
    const d = testDb();
    state.ensure(d, 1, "acc1", NOW - 70 * DAY);
    let calls = 0;
    await syncRecent(d, 1, "acc1", async () => {
      calls++;
      return [];
    }, opts);
    expect(calls).toBeGreaterThan(1);
  });

  it("повторний синк тих самих операцій не дублює", async () => {
    const d = testDb();
    state.ensure(d, 1, "acc1", NOW - DAY);
    const fetch = async () => [item("same", NOW - 100)];
    await syncRecent(d, 1, "acc1", fetch, opts);
    await syncRecent(d, 1, "acc1", fetch, opts);
    expect(timeBounds(d, 1).samples).toBe(1);
  });
});
