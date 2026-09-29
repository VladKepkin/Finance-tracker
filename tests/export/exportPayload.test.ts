import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { createSchema, setKV, type DB } from "@/lib/db";
import { buildExportPayload, generateMonthlyReport, type ExportParams } from "@/lib/export/exportPayload";
import { insert as insertCommitment } from "@/lib/repo/commitments";
import { insert as insertSalary } from "@/lib/repo/salaries";
import { upsertDaily } from "@/lib/repo/fxRates";
import { upsertMany } from "@/lib/repo/transactions";
import * as syncState from "@/lib/repo/syncState";
import type { MonoStatementItem } from "@/lib/monobank";

const DAY = 86_400;
const NOW = Date.UTC(2026, 7, 28, 12, 0, 0) / 1000;
const SECRET_TOKEN = "enc:MONO_SECRET_TOKEN_ABC123XYZ";
const SECRET_PASSWORD_HASH = "deadbeef:cafef00dsecrethash";

function testDb(): DB {
  const d = new Database(":memory:");
  createSchema(d);
  return d;
}

function seedUserWithSecrets(d: DB): number {
  const info = d
    .prepare("INSERT INTO users (username, password_hash, mono_token, created_at) VALUES (?, ?, ?, ?)")
    .run("owner", SECRET_PASSWORD_HASH, SECRET_TOKEN, Date.now());
  return Number(info.lastInsertRowid);
}

function tx(
  id: string,
  time: number,
  amount: number,
  opts: { mcc?: number; description?: string } = {}
): MonoStatementItem {
  return {
    id,
    time,
    description: opts.description ?? "АТБ",
    mcc: opts.mcc ?? 5411,
    originalMcc: opts.mcc ?? 5411,
    hold: false,
    amount,
    operationAmount: amount,
    currencyCode: 980,
    commissionRate: 0,
    cashbackAmount: 0,
    balance: 0,
  };
}

function baseParams(userId: number, overrides: Partial<ExportParams> = {}): ExportParams {
  return {
    userId,
    accountId: "acc1",
    accountCurrency: 980,
    jarTitles: null,
    month: "2026-08",
    nowSeconds: NOW,
    ...overrides,
  };
}

describe("buildExportPayload / generateMonthlyReport", () => {
  it("порожня БД → звіт генерується без падіння", () => {
    const d = testDb();
    const userId = seedUserWithSecrets(d);
    expect(() => generateMonthlyReport(d, baseParams(userId))).not.toThrow();
    const md = generateMonthlyReport(d, baseParams(userId));
    expect(typeof md).toBe("string");
    expect(md.length).toBeGreaterThan(100);
    expect(md).toContain("Медіана доходу: невідома");
    expect(md).toContain("Жодного не підтверджено.");
    expect(md).toContain("Оцінок радості немає жодної");
  });

  it("не містить токена Monobank чи хеша пароля навіть у повному звіті", () => {
    const d = testDb();
    const userId = seedUserWithSecrets(d);

    insertCommitment(
      d,
      userId,
      { name: "Claude", amount: 10_000, currency: 840, cadence: "monthly", anchorDay: 11 },
      NOW
    );
    insertSalary(d, userId, { paidOn: "2026-07-15", amount: 50_000, currency: 840 }, NOW);
    insertSalary(d, userId, { paidOn: "2026-08-15", amount: 50_000, currency: 840 }, NOW);
    upsertDaily(d, "2026-08-20", [
      { currencyCodeA: 840, currencyCodeB: 980, date: Date.UTC(2026, 7, 20) / 1000, rateSell: 41.5, rateBuy: 41 },
    ]);

    const items = [tx("t1", Date.UTC(2026, 7, 5) / 1000, -50_00, { description: "АТБ" })];
    upsertMany(d, userId, "acc1", items, NOW);
    syncState.ensure(d, userId, "acc1", NOW);
    syncState.setCoveredFrom(d, userId, "acc1", Date.UTC(2025, 7, 1) / 1000);
    syncState.setCoveredTo(d, userId, "acc1", NOW);

    const md = generateMonthlyReport(d, baseParams(userId));
    expect(md).not.toContain(SECRET_TOKEN);
    expect(md).not.toContain(SECRET_PASSWORD_HASH);
    expect(md).not.toContain("enc:MONO_SECRET_TOKEN");
    expect(md).not.toContain("cafef00d");
  });

  it("перекази у власну банку виключені з витрат — так само, як усюди в застосунку", () => {
    const d = testDb();
    const userId = seedUserWithSecrets(d);
    const from = Date.UTC(2026, 7, 1) / 1000;
    const to = Date.UTC(2026, 7, 31, 23, 59, 59) / 1000;
    const items = [
      tx("real", from + DAY, -50_00, { description: "АТБ" }),
      tx("jar", from + 2 * DAY, -1_000_00, { mcc: 4829, description: "«Накопичення»" }),
    ];
    upsertMany(d, userId, "acc1", items, NOW);
    syncState.ensure(d, userId, "acc1", NOW);
    syncState.setCoveredFrom(d, userId, "acc1", from);
    syncState.setCoveredTo(d, userId, "acc1", to);

    const withoutJarKnowledge = buildExportPayload(d, baseParams(userId, { jarTitles: null }));
    const withJarKnowledge = buildExportPayload(d, baseParams(userId, { jarTitles: ["Накопичення"] }));

    expect(withoutJarKnowledge.spend.totalExpenseBase).toBe(50_00 + 1_000_00);
    expect(withJarKnowledge.spend.totalExpenseBase).toBe(50_00);
  });

  it("2 зарплати → впевненість доходу 'low', не голе число", () => {
    const d = testDb();
    const userId = seedUserWithSecrets(d);
    insertSalary(d, userId, { paidOn: "2026-06-15", amount: 50_000, currency: 980 }, NOW);
    insertSalary(d, userId, { paidOn: "2026-07-15", amount: 50_000, currency: 980 }, NOW);

    const payload = buildExportPayload(d, baseParams(userId));
    expect(payload.income.confidence).toBe("low");
    expect(payload.income.medianBase).toBe(50_000);
    expect(payload.income.salaryCount).toBe(2);
  });

  it("6 зарплат → впевненість доходу 'high'", () => {
    const d = testDb();
    const userId = seedUserWithSecrets(d);
    for (let i = 1; i <= 6; i++) {
      insertSalary(d, userId, { paidOn: `2026-0${i}-15`, amount: 50_000, currency: 980 }, NOW);
    }
    const payload = buildExportPayload(d, baseParams(userId));
    expect(payload.income.confidence).toBe("high");
  });

  it("немає жодної оцінки радості → секція каже про це чесно, не мовчить", () => {
    const d = testDb();
    const userId = seedUserWithSecrets(d);
    const payload = buildExportPayload(d, baseParams(userId));
    expect(payload.joy.ratingsCount).toBe(0);
    expect(payload.joy.categories).toEqual([]);
  });

  it("невідома валюта курсу рахунку → грошові факти явно позначені невідомими", () => {
    const d = testDb();
    const userId = seedUserWithSecrets(d);
    const payload = buildExportPayload(d, baseParams(userId, { accountCurrency: 840 }));
    expect(payload.facts.fxUnavailableCurrency).toBe(840);
    expect(payload.facts.dailyMedianBase).toBeNull();
  });
});
