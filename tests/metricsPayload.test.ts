import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { createSchema, type DB } from "@/lib/db";
import { buildMetricsPayload } from "@/lib/metricsPayload";
import { upsertMany } from "@/lib/repo/transactions";
import * as state from "@/lib/repo/syncState";
import type { MonoStatementItem } from "@/lib/monobank";

const DAY = 86_400;
const START = Date.UTC(2024, 0, 1) / 1000;
const NOW = Date.UTC(2024, 6, 16) / 1000;

function testDb(): DB {
  const d = new Database(":memory:");
  createSchema(d);
  return d;
}

function tx(id: string, time: number, amount: number): MonoStatementItem {
  return {
    id, time, description: "Тест", mcc: 5411, originalMcc: 5411, hold: false,
    amount, operationAmount: amount, currencyCode: 980,
    commissionRate: 0, cashbackAmount: 0, balance: 0,
  } as MonoStatementItem;
}

function seed(d: DB) {
  const items: MonoStatementItem[] = [];
  for (let i = 0; i < 180; i++) items.push(tx(`d${i}`, START + i * DAY + 3600, -500));
  items.push(tx("big", START + 90 * DAY + 7200, -40_000));
  upsertMany(d, 1, "acc1", items, NOW);
  state.ensure(d, 1, "acc1", NOW);
  state.setCoveredFrom(d, 1, "acc1", START);
  state.setCoveredTo(d, 1, "acc1", NOW);
}

describe("buildMetricsPayload", () => {
  it("порожня БД → усе insufficient, жодного числа", () => {
    const d = testDb();
    const p = buildMetricsPayload(d, 1, "acc1", NOW);
    expect(p.dailyMedian.confidence).toBe("insufficient");
    expect(p.dailyMedian.value).toBeNull();
    expect(p.monthly.confidence).toBe("insufficient");
    expect(p.monthly.value).toBeNull();
    expect(p.anomalies).toEqual([]);
    expect(p.coverage.days).toBe(0);
  });

  it("медіана типового дня не зіпсована купівлею техніки", () => {
    const d = testDb();
    seed(d);
    const p = buildMetricsPayload(d, 1, "acc1", NOW);
    expect(p.dailyMedian.value).toBe(500);
    expect(p.dailyMedian.confidence).toBe("high");
  });

  it("аномалія знайдена й показана окремо", () => {
    const d = testDb();
    seed(d);
    const p = buildMetricsPayload(d, 1, "acc1", NOW);
    expect(p.anomalies).toHaveLength(1);
    expect(p.anomalies[0].expense).toBe(40_500);
  });

  it("місячні перцентилі: P10 <= P50 <= P90", () => {
    const d = testDb();
    seed(d);
    const p = buildMetricsPayload(d, 1, "acc1", NOW);
    expect(p.monthly.value).not.toBeNull();
    expect(p.monthly.value!.p10).toBeLessThanOrEqual(p.monthly.value!.p50);
    expect(p.monthly.value!.p50).toBeLessThanOrEqual(p.monthly.value!.p90);
  });

  it("покриття береться з sync_state", () => {
    const d = testDb();
    seed(d);
    const p = buildMetricsPayload(d, 1, "acc1", NOW);
    expect(p.coverage.from).toBe("2024-01-01");
    expect(p.coverage.samples).toBe(181);
  });

  it("сьогоднішня неповна доба не потрапляє в денний ряд — велика купівля сьогодні не стає аномалією завчасно", () => {
    const d = testDb();
    const NOON = Date.UTC(2024, 6, 16, 12) / 1000;
    const items: MonoStatementItem[] = [];
    for (let i = 1; i <= 60; i++) items.push(tx(`d${i}`, NOON - i * DAY, -500));
    items.push(tx("today", NOON - 3600, -40_000));
    upsertMany(d, 1, "acc1", items, NOON);
    state.ensure(d, 1, "acc1", NOON);
    state.setCoveredFrom(d, 1, "acc1", NOON - 61 * DAY);
    state.setCoveredTo(d, 1, "acc1", NOON);
    const p = buildMetricsPayload(d, 1, "acc1", NOON);
    expect(p.anomalies).toEqual([]);
    expect(p.dailyMedian.value).toBe(500);
  });

  it("замало даних → low, але число вже є", () => {
    const d = testDb();
    const items = [];
    for (let i = 0; i < 20; i++) items.push(tx(`d${i}`, START + i * DAY + 3600, -500));
    upsertMany(d, 1, "acc1", items, NOW);
    state.ensure(d, 1, "acc1", NOW);
    state.setCoveredFrom(d, 1, "acc1", START);
    state.setCoveredTo(d, 1, "acc1", START + 19 * DAY);
    const p = buildMetricsPayload(d, 1, "acc1", NOW);
    expect(p.dailyMedian.confidence).toBe("low");
    expect(p.dailyMedian.value).toBe(500);
  });

  it("запит за непокритий період (початок раніше covered_from) не видає число", () => {
    const d = testDb();
    const coveredStart = START + 100 * DAY;
    const coveredEnd = START + 110 * DAY;

    const items: MonoStatementItem[] = [];
    for (let i = 100; i < 110; i++) items.push(tx(`d${i}`, START + i * DAY + 3600, -500));
    upsertMany(d, 1, "acc1", items, NOW);
    state.ensure(d, 1, "acc1", NOW);
    state.setCoveredFrom(d, 1, "acc1", coveredStart);
    state.setCoveredTo(d, 1, "acc1", coveredEnd);

    const p = buildMetricsPayload(d, 1, "acc1", NOW);
    expect(p.dailyMedian.confidence).toBe("insufficient");
    expect(p.dailyMedian.value).toBeNull();
  });

  it("на реальній історії (~400 днів) денна медіана й місячні перцентилі досягають high", () => {
    const d = testDb();
    const HIST_START = NOW - 400 * DAY;
    const items: MonoStatementItem[] = [];
    for (let i = 0; i < 400; i++) items.push(tx(`h${i}`, HIST_START + i * DAY + 3600, -500));
    upsertMany(d, 1, "acc1", items, NOW);
    state.ensure(d, 1, "acc1", NOW);
    state.setCoveredFrom(d, 1, "acc1", HIST_START);
    state.setCoveredTo(d, 1, "acc1", NOW);

    const p = buildMetricsPayload(d, 1, "acc1", NOW);
    expect(p.dailyMedian.confidence).toBe("high");
    expect(p.dailyMedian.value).not.toBeNull();
    expect(p.monthly.confidence).toBe("high");
    expect(p.monthly.value).not.toBeNull();
  });

  it("dailySeries — останні 30 днів вікна, {date, spent}, без залежності від UI-періоду", () => {
    const d = testDb();
    const items: MonoStatementItem[] = [];
    for (let i = 0; i < 197; i++) items.push(tx(`d${i}`, START + i * DAY + 3600, -500));
    items.push(tx("big", START + 90 * DAY + 7200, -40_000));
    upsertMany(d, 1, "acc1", items, NOW);
    state.ensure(d, 1, "acc1", NOW);
    state.setCoveredFrom(d, 1, "acc1", START);
    state.setCoveredTo(d, 1, "acc1", NOW);

    const p = buildMetricsPayload(d, 1, "acc1", NOW);
    expect(p.dailySeries).toHaveLength(30);
    expect(p.dailySeries[p.dailySeries.length - 1].date).toBe("2024-07-15");
    expect(p.dailySeries.every((x) => x.spent === 500)).toBe(true);
  });

  it("dailySeries на порожній БД → [], не крах і не вигадані дні", () => {
    const d = testDb();
    const p = buildMetricsPayload(d, 1, "acc1", NOW);
    expect(p.dailySeries).toEqual([]);
  });
});

describe("buildMetricsPayload — перекази у власні банки (jars) виключені з витрат", () => {
  function jarTx(id: string, time: number, amount: number): MonoStatementItem {
    return {
      id, time, description: "Накопичення", mcc: 4829, originalMcc: 4829, hold: false,
      amount, operationAmount: amount, currencyCode: 980,
      commissionRate: 0, cashbackAmount: 0, balance: 0,
    } as MonoStatementItem;
  }

  function seedWithJarTransfers(d: DB) {
    const items: MonoStatementItem[] = [];
    for (let i = 0; i < 180; i++) {
      items.push(tx(`d${i}`, START + i * DAY + 3600, -500));
      items.push(jarTx(`jar${i}`, START + i * DAY + 4000, -12_100));
    }
    upsertMany(d, 1, "acc1", items, NOW);
    state.ensure(d, 1, "acc1", NOW);
    state.setCoveredFrom(d, 1, "acc1", START);
    state.setCoveredTo(d, 1, "acc1", NOW);
  }

  it("без jarTitles: переказ у банку рахується витратою — медіана й місячні перцентили роздуті", () => {
    const d = testDb();
    seedWithJarTransfers(d);
    const p = buildMetricsPayload(d, 1, "acc1", NOW, null);
    expect(p.dailyMedian.value).toBe(500 + 12_100);
  });

  it("з jarTitles: переказ у банку виключений — медіана повертається до реальної витрати", () => {
    const d = testDb();
    seedWithJarTransfers(d);
    const p = buildMetricsPayload(d, 1, "acc1", NOW, ["Накопичення"]);
    expect(p.dailyMedian.value).toBe(500);
  });

  it("порожній перелік jarTitles поводиться так само, як null — нічого не виключає", () => {
    const d = testDb();
    seedWithJarTransfers(d);
    const withEmpty = buildMetricsPayload(d, 1, "acc1", NOW, []);
    const withNull = buildMetricsPayload(d, 1, "acc1", NOW, null);
    expect(withEmpty.dailyMedian.value).toBe(withNull.dailyMedian.value);
  });

  it("переказ ДРУГУ через ту саму mcc 4829, але з іншим описом, лишається витратою (мутаційна перевірка правила)", () => {
    const d = testDb();
    const items: MonoStatementItem[] = [];
    for (let i = 0; i < 20; i++) items.push(tx(`d${i}`, START + i * DAY + 3600, -500));
    items.push({
      id: "friend", time: START + 21 * DAY, description: "Іван Петренко", mcc: 4829, originalMcc: 4829,
      hold: false, amount: -300_00, operationAmount: -300_00, currencyCode: 980,
      commissionRate: 0, cashbackAmount: 0, balance: 0,
    } as MonoStatementItem);
    upsertMany(d, 1, "acc1", items, NOW);
    state.ensure(d, 1, "acc1", NOW);
    state.setCoveredFrom(d, 1, "acc1", START);
    state.setCoveredTo(d, 1, "acc1", START + 21 * DAY);
    const p = buildMetricsPayload(d, 1, "acc1", NOW, ["Накопичення"]);
    expect(p.dailyMedian.value).toBe(500);
    const days = p.anomalies;
    expect(days.some((a) => a.expense >= 300_00)).toBe(true);
  });
});
