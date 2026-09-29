import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { createSchema, type DB } from "@/lib/db";
import { toStatusPayload } from "@/lib/syncStatus";
import * as state from "@/lib/repo/syncState";
import { upsertMany } from "@/lib/repo/transactions";
import type { MonoStatementItem } from "@/lib/monobank";

function testDb(): DB {
  const d = new Database(":memory:");
  createSchema(d);
  return d;
}

const T = Date.UTC(2026, 0, 1) / 1000;

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

describe("toStatusPayload", () => {
  it("порожня БД → нульове покриття й порожній список рахунків", () => {
    const d = testDb();
    expect(toStatusPayload(d, 1)).toEqual({
      coverage: { days: 0, samples: 0, from: null, to: null },
      accounts: [],
    });
  });

  it("рахує покриття з sync_state і віддає стан рахунків", () => {
    const d = testDb();
    upsertMany(d, 1, "acc1", [item("a", T), item("b", T + 89 * 86_400)], T);
    state.ensure(d, 1, "acc1", T);
    state.setCoveredFrom(d, 1, "acc1", T);
    state.setCoveredTo(d, 1, "acc1", T + 89 * 86_400);
    state.markBackfillDone(d, 1, "acc1");
    const payload = toStatusPayload(d, 1);
    expect(payload.coverage.days).toBe(90);
    expect(payload.coverage.samples).toBe(2);
    expect(payload.accounts).toHaveLength(1);
    expect(payload.accounts[0]).toMatchObject({ accountId: "acc1", backfillDone: true });
  });
});
