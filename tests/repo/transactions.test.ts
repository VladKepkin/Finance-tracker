import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { createSchema, type DB } from "@/lib/db";
import { upsertMany, timeBounds, queryRange, queryPage } from "@/lib/repo/transactions";
import type { MonoStatementItem } from "@/lib/monobank";

function testDb(): DB {
  const d = new Database(":memory:");
  createSchema(d);
  return d;
}

function item(over: Partial<MonoStatementItem> & { id: string; time: number }): MonoStatementItem {
  return {
    description: "Сільпо",
    mcc: 5411,
    originalMcc: 5411,
    hold: false,
    amount: -10_000,
    operationAmount: -10_000,
    currencyCode: 980,
    commissionRate: 0,
    cashbackAmount: 0,
    balance: 100_000,
    ...over,
  } as MonoStatementItem;
}

describe("repo/transactions", () => {
  it("зберігає операції й рахує межі", () => {
    const d = testDb();
    const n = upsertMany(d, 1, "acc1", [item({ id: "a", time: 1000 }), item({ id: "b", time: 2000 })], 999);
    expect(n).toBe(2);
    expect(timeBounds(d, 1)).toEqual({ minTime: 1000, maxTime: 2000, samples: 2 });
  });

  it("той самий id двічі → один рядок (дедуп)", () => {
    const d = testDb();
    upsertMany(d, 1, "acc1", [item({ id: "a", time: 1000 })], 1);
    upsertMany(d, 1, "acc1", [item({ id: "a", time: 1000 })], 2);
    expect(timeBounds(d, 1).samples).toBe(1);
  });

  it("hold-операція оновлюється новою сумою", () => {
    const d = testDb();
    upsertMany(d, 1, "acc1", [item({ id: "a", time: 1000, amount: -10_000, hold: true })], 1);
    upsertMany(d, 1, "acc1", [item({ id: "a", time: 1000, amount: -12_345, hold: false })], 2);
    const rows = queryRange(d, 1, 0, 5000);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(-12_345);
    expect(rows[0].hold).toBe(0);
  });

  it("порожня історія → межі null", () => {
    const d = testDb();
    expect(timeBounds(d, 1)).toEqual({ minTime: null, maxTime: null, samples: 0 });
  });

  it("timeBounds з accountId рахує лише свій рахунок, без нього — усі разом", () => {
    const d = testDb();
    upsertMany(d, 1, "acc1", [item({ id: "a", time: 1000 }), item({ id: "b", time: 2000 })], 1);
    upsertMany(d, 1, "acc2", [item({ id: "c", time: 3000 })], 1);
    expect(timeBounds(d, 1, "acc1")).toEqual({ minTime: 1000, maxTime: 2000, samples: 2 });
    expect(timeBounds(d, 1, "acc2")).toEqual({ minTime: 3000, maxTime: 3000, samples: 1 });
    expect(timeBounds(d, 1).samples).toBe(3);
  });

  it("queryRange віддає лише операції в діапазоні, за зростанням часу", () => {
    const d = testDb();
    upsertMany(
      d,
      1,
      "acc1",
      [item({ id: "b", time: 2000 }), item({ id: "a", time: 1000 }), item({ id: "c", time: 9000 })],
      1
    );
    const rows = queryRange(d, 1, 1000, 2000);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("порожній масив → 0 записів і жодної помилки", () => {
    const d = testDb();
    expect(upsertMany(d, 1, "acc1", [], 1)).toBe(0);
  });
});

describe("queryPage", () => {
  it("віддає сторінку за спаданням часу (найновіші першими)", () => {
    const d = testDb();
    upsertMany(d, 1, "acc1", [item({ id: "a", time: 1000 }), item({ id: "b", time: 2000 }), item({ id: "c", time: 3000 })], 1);
    const page = queryPage(d, 1, { fromTime: 0, toTime: 9999, limit: 2, offset: 0 });
    expect(page.map((r) => r.id)).toEqual(["c", "b"]);
  });

  it("offset гортає далі", () => {
    const d = testDb();
    upsertMany(d, 1, "acc1", [item({ id: "a", time: 1000 }), item({ id: "b", time: 2000 }), item({ id: "c", time: 3000 })], 1);
    const page = queryPage(d, 1, { fromTime: 0, toTime: 9999, limit: 2, offset: 2 });
    expect(page.map((r) => r.id)).toEqual(["a"]);
  });

  it("фільтрує за рахунком", () => {
    const d = testDb();
    upsertMany(d, 1, "acc1", [item({ id: "a", time: 1000 })], 1);
    upsertMany(d, 1, "acc2", [item({ id: "b", time: 2000 })], 1);
    const page = queryPage(d, 1, { accountId: "acc2", fromTime: 0, toTime: 9999, limit: 10, offset: 0 });
    expect(page.map((r) => r.id)).toEqual(["b"]);
  });

  it("без accountId — усі рахунки користувача", () => {
    const d = testDb();
    upsertMany(d, 1, "acc1", [item({ id: "a", time: 1000 })], 1);
    upsertMany(d, 1, "acc2", [item({ id: "b", time: 2000 })], 1);
    const page = queryPage(d, 1, { fromTime: 0, toTime: 9999, limit: 10, offset: 0 });
    expect(page).toHaveLength(2);
  });

  it("поважає межі діапазону", () => {
    const d = testDb();
    upsertMany(d, 1, "acc1", [item({ id: "a", time: 1000 }), item({ id: "b", time: 5000 })], 1);
    const page = queryPage(d, 1, { fromTime: 2000, toTime: 9999, limit: 10, offset: 0 });
    expect(page.map((r) => r.id)).toEqual(["b"]);
  });
});
