import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { createSchema, type DB } from "@/lib/db";
import { upsertDaily, rateOn, hasDate, latestRates } from "@/lib/repo/fxRates";
import type { CurrencyRate } from "@/lib/fx";

function testDb(): DB {
  const d = new Database(":memory:");
  createSchema(d);
  return d;
}

const usd: CurrencyRate = {
  currencyCodeA: 840,
  currencyCodeB: 980,
  date: 0,
  rateSell: 41.5,
  rateBuy: 41.0,
};

describe("repo/fxRates", () => {
  it("зберігає курси за дату", () => {
    const d = testDb();
    expect(upsertDaily(d, "2026-07-08", [usd])).toBe(1);
    expect(rateOn(d, "2026-07-08", 840, 980)).toMatchObject({ rate_sell: 41.5, rate_buy: 41.0 });
  });

  it("повторний запис за ту саму дату оновлює, а не дублює", () => {
    const d = testDb();
    upsertDaily(d, "2026-07-08", [usd]);
    upsertDaily(d, "2026-07-08", [{ ...usd, rateSell: 42.0 }]);
    expect(rateOn(d, "2026-07-08", 840, 980)!.rate_sell).toBe(42.0);
  });

  it("невідома дата → undefined", () => {
    const d = testDb();
    expect(rateOn(d, "2000-01-01", 840, 980)).toBeUndefined();
  });

  it("hasDate показує, чи вже є курси за добу", () => {
    const d = testDb();
    expect(hasDate(d, "2026-07-08")).toBe(false);
    upsertDaily(d, "2026-07-08", [usd]);
    expect(hasDate(d, "2026-07-08")).toBe(true);
  });

  it("порожній масив → 0", () => {
    const d = testDb();
    expect(upsertDaily(d, "2026-07-08", [])).toBe(0);
  });
});

describe("latestRates", () => {
  it("порожня таблиця → порожній масив (а не помилка)", () => {
    const d = testDb();
    expect(latestRates(d)).toEqual([]);
  });

  it("віддає курси за НАЙСВІЖІШУ дату", () => {
    const d = testDb();
    upsertDaily(d, "2026-07-01", [{ ...usd, rateSell: 40 }]);
    upsertDaily(d, "2026-07-08", [{ ...usd, rateSell: 42 }]);
    const out = latestRates(d);
    expect(out).toHaveLength(1);
    expect(out[0].rateSell).toBe(42);
  });

  it("віддає всі валюти цієї дати у формі CurrencyRate", () => {
    const d = testDb();
    upsertDaily(d, "2026-07-08", [
      usd,
      { currencyCodeA: 978, currencyCodeB: 980, date: 0, rateSell: 45, rateBuy: 44 },
    ]);
    const out = latestRates(d);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.currencyCodeA).sort()).toEqual([840, 978]);
    expect(out[0]).toHaveProperty("currencyCodeB");
  });
});
