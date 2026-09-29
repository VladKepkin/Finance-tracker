import { describe, expect, it } from "vitest";
import { daysUntilDeadline, goalsReserve } from "../../lib/metrics/goals";

describe("goalsReserve", () => {
  it("дедлайн через 60 днів, дохід через 15 → чверть", () => {
    const r = goalsReserve([{ name: "Ноут", remainingBase: 120_000, deadlineDays: 60 }], 15);
    expect(r.reserved).toBe(30_000);
    expect(r.goalsBeforeIncome).toEqual([{ name: "Ноут", reservedBase: 30_000 }]);
    expect(r.overdueGoals).toEqual([]);
  });

  it("дедлайн раніше за дохід → резервуємо все", () => {
    const r = goalsReserve([{ name: "Квиток", remainingBase: 50_000, deadlineDays: 3 }], 15);
    expect(r.reserved).toBe(50_000);
    expect(r.goalsBeforeIncome).toEqual([{ name: "Квиток", reservedBase: 50_000 }]);
  });

  it("дедлайн рівно в день доходу → share = 1", () => {
    const r = goalsReserve([{ name: "X", remainingBase: 10_000, deadlineDays: 15 }], 15);
    expect(r.reserved).toBe(10_000);
  });

  it("deadlineDays точно дорівнює daysToIncome (межа, не лише рівність значень вище)", () => {
    const r = goalsReserve([{ name: "Y", remainingBase: 999, deadlineDays: 7 }], 7);
    expect(r.reserved).toBe(999);
  });

  it("прострочено (deadlineDays = 0) → не в резерв, а в overdueGoals", () => {
    const r = goalsReserve([{ name: "Старе", remainingBase: 90_000, deadlineDays: 0 }], 15);
    expect(r.reserved).toBe(0);
    expect(r.overdueGoals).toEqual(["Старе"]);
    expect(r.goalsBeforeIncome).toEqual([]);
  });

  it("від'ємний deadlineDays теж прострочено", () => {
    const r = goalsReserve([{ name: "Дуже старе", remainingBase: 90_000, deadlineDays: -5 }], 15);
    expect(r.reserved).toBe(0);
    expect(r.overdueGoals).toEqual(["Дуже старе"]);
  });

  it("без цілей → нулі, без падінь", () => {
    const r = goalsReserve([], 15);
    expect(r).toEqual({ reserved: 0, goalsBeforeIncome: [], overdueGoals: [], invalidGoals: [] });
  });

  it("remainingBase = 0 → резерв 0, ціль не прострочена і не мовчазно відкинута", () => {
    const r = goalsReserve([{ name: "Виконано", remainingBase: 0, deadlineDays: 10 }], 15);
    expect(r.reserved).toBe(0);
    expect(r.goalsBeforeIncome).toEqual([{ name: "Виконано", reservedBase: 0 }]);
    expect(r.overdueGoals).toEqual([]);
  });

  it("декілька цілей сумуються, а прострочені йдуть окремо", () => {
    const r = goalsReserve(
      [
        { name: "Ноут", remainingBase: 120_000, deadlineDays: 60 },
        { name: "Квиток", remainingBase: 50_000, deadlineDays: 3 },
        { name: "Старе", remainingBase: 90_000, deadlineDays: 0 },
      ],
      15
    );
    expect(r.reserved).toBe(80_000);
    expect(r.goalsBeforeIncome).toEqual([
      { name: "Ноут", reservedBase: 30_000 },
      { name: "Квиток", reservedBase: 50_000 },
    ]);
    expect(r.overdueGoals).toEqual(["Старе"]);
  });

  it("округлення вгору ніколи не перевищує remainingBase", () => {
    const r = goalsReserve([{ name: "Дріб", remainingBase: 100_000, deadlineDays: 30 }], 10);
    expect(r.goalsBeforeIncome[0].reservedBase).toBe(33_334);
    expect(r.goalsBeforeIncome[0].reservedBase).toBeLessThanOrEqual(100_000);
  });

  it("NaN deadlineDays → не overdue (NaN <= 0 є false), а invalidGoals", () => {
    const r = goalsReserve([{ name: "Зіпсована", remainingBase: 50_000, deadlineDays: NaN }], 15);
    expect(r.reserved).toBe(0);
    expect(r.overdueGoals).toEqual([]);
    expect(r.goalsBeforeIncome).toEqual([]);
    expect(r.invalidGoals).toEqual(["Зіпсована"]);
  });

  it("Infinity deadlineDays → invalidGoals, не резерв", () => {
    const r = goalsReserve(
      [{ name: "Нескінченна", remainingBase: 50_000, deadlineDays: Infinity }],
      15
    );
    expect(r.reserved).toBe(0);
    expect(r.invalidGoals).toEqual(["Нескінченна"]);
  });

  it("NaN remainingBase → invalidGoals, не резерв", () => {
    const r = goalsReserve([{ name: "БезСуми", remainingBase: NaN, deadlineDays: 10 }], 15);
    expect(r.reserved).toBe(0);
    expect(r.overdueGoals).toEqual([]);
    expect(r.invalidGoals).toEqual(["БезСуми"]);
  });

  it("зіпсована ціль перед валідною не отруює reserved наступної (регрес на NaN-poisoning)", () => {
    const r = goalsReserve(
      [
        { name: "Зіпсована", remainingBase: 50_000, deadlineDays: NaN },
        { name: "Ноут", remainingBase: 120_000, deadlineDays: 60 },
      ],
      15
    );
    expect(r.invalidGoals).toEqual(["Зіпсована"]);
    expect(r.reserved).toBe(30_000);
    expect(r.goalsBeforeIncome).toEqual([{ name: "Ноут", reservedBase: 30_000 }]);
  });
});

describe("daysUntilDeadline", () => {
  const day = 86_400;

  it("сьогодні = 1, не 0 (дзеркалить daysUntilIncome)", () => {
    const now = Date.UTC(2026, 6, 16) / 1000;
    expect(daysUntilDeadline("2026-07-16", now)).toBe(1);
  });

  it("завтра = 2", () => {
    const now = Date.UTC(2026, 6, 16) / 1000;
    expect(daysUntilDeadline("2026-07-17", now)).toBe(2);
  });

  it("довільна година того самого дня не зсуває результат (day-clamp)", () => {
    const now = Date.UTC(2026, 6, 16, 23, 59) / 1000;
    expect(daysUntilDeadline("2026-07-16", now)).toBe(1);
  });

  it("дедлайн у минулому повертає значення <= 0", () => {
    const now = Date.UTC(2026, 6, 16) / 1000;
    expect(daysUntilDeadline("2026-07-15", now)).toBe(0);
    expect(daysUntilDeadline("2026-07-10", now)).toBe(-5);
  });

  it("нерозбірний рядок → null, не NaN", () => {
    const now = Date.UTC(2026, 6, 16) / 1000;
    expect(daysUntilDeadline("вчора", now)).toBeNull();
  });

  it("порожній рядок → null", () => {
    expect(daysUntilDeadline("", 0)).toBeNull();
  });

  it("неможливий місяць → null", () => {
    expect(daysUntilDeadline("2026-13-45", 0)).toBeNull();
  });

  it("неможливий день місяця (2026 не високосний) → null, не тихе перенесення на березень", () => {
    expect(daysUntilDeadline("2026-02-30", 0)).toBeNull();
  });

  it("не-рядок не кидає виняток і не дає NaN", () => {
    expect(daysUntilDeadline(null as unknown as string, 0)).toBeNull();
    expect(daysUntilDeadline(12345 as unknown as string, 0)).toBeNull();
  });
});
