import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { createSchema, type DB } from "@/lib/db";
import { buildSuggestions } from "@/lib/commitmentSuggestions";
import { upsertMany } from "@/lib/repo/transactions";
import * as commitments from "@/lib/repo/commitments";
import type { MonoStatementItem } from "@/lib/monobank";

const DAY = 86_400;
const NOW = Date.UTC(2026, 6, 16) / 1000;

function testDb(): DB {
  const d = new Database(":memory:");
  createSchema(d);
  return d;
}

function tx(id: string, time: number, amount: number, description: string): MonoStatementItem {
  return {
    id, time, description, mcc: 5411, originalMcc: 5411, hold: false,
    amount, operationAmount: amount, currencyCode: 980,
    commissionRate: 0, cashbackAmount: 0, balance: 0,
  } as MonoStatementItem;
}

function seedMonthly(d: DB, name: string, amount: number) {
  const items: MonoStatementItem[] = [];
  for (let i = 1; i <= 12; i++) items.push(tx(`${name}${i}`, NOW - i * 30 * DAY, amount, name));
  upsertMany(d, 1, "acc1", items, NOW);
}

describe("buildSuggestions", () => {
  it("порожня БД → порожньо", () => {
    expect(buildSuggestions(testDb(), 1, NOW)).toEqual([]);
  });

  it("знаходить регулярний платіж у історії", () => {
    const d = testDb();
    seedMonthly(d, "NETFLIX.COM", -29_900);
    const out = buildSuggestions(d, 1, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("NETFLIX.COM");
    expect(out[0].cadence).toBe("monthly");
  });

  it("уже підтверджене не пропонується вдруге", () => {
    const d = testDb();
    seedMonthly(d, "NETFLIX.COM", -29_900);
    const before = buildSuggestions(d, 1, NOW);
    expect(before).toHaveLength(1);
    commitments.insert(
      d, 1,
      { name: "Netflix", amount: 29_900, currency: 980, cadence: "monthly", anchorDay: 14, matcher: before[0].matcher },
      NOW
    );
    expect(buildSuggestions(d, 1, NOW)).toEqual([]);
  });

  it("вимкнене зобов'язання пропонується знову", () => {
    const d = testDb();
    seedMonthly(d, "NETFLIX.COM", -29_900);
    const m = buildSuggestions(d, 1, NOW)[0].matcher;
    const id = commitments.insert(
      d, 1,
      { name: "Netflix", amount: 29_900, currency: 980, cadence: "monthly", anchorDay: 14, matcher: m },
      NOW
    );
    commitments.deactivate(d, 1, id);
    expect(buildSuggestions(d, 1, NOW)).toHaveLength(1);
  });

  it("чужі транзакції не потрапляють", () => {
    const d = testDb();
    seedMonthly(d, "NETFLIX.COM", -29_900);
    upsertMany(d, 2, "acc2", [tx("u2-1", NOW - DAY, -500, "COFFEE")], NOW);
    expect(buildSuggestions(d, 2, NOW)).toEqual([]);
  });
});
