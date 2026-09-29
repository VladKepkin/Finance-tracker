import { describe, it, expect } from "vitest";
import { computeAllowance } from "@/lib/metrics/allowance";
import type { IncomeSchedule } from "@/lib/metrics/schedule";

const at = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 1000;
const NOW = at(2026, 3, 25);
const SCHEDULE: IncomeSchedule = { kind: "monthly", day: 1 };

describe("computeAllowance", () => {
  it("без графіка → null (числа не вигадуємо)", () => {
    expect(
      computeAllowance({
        liquid: 100_000,
        commitments: [],
        goals: [],
        buffer: 0,
        schedule: null,
        nowSeconds: NOW,
      })
    ).toBeNull();
  });

  it("без зобов'язань і буфера: баланс / днів до доходу", () => {
    const a = computeAllowance({
      liquid: 80_000,
      commitments: [],
      goals: [],
      buffer: 0,
      schedule: SCHEDULE,
      nowSeconds: NOW,
    })!;
    expect(a.daysToIncome).toBe(8);
    expect(a.available).toBe(80_000);
    expect(a.perDay).toBe(10_000);
    expect(a.shortfall).toBe(false);
  });

  it("резервує зобов'язання, що настане до доходу", () => {
    const a = computeAllowance({
      liquid: 80_000,
      commitments: [{ name: "Netflix", amountBase: 30_000, cadence: "monthly", anchorDay: 28 }],
      goals: [],
      buffer: 0,
      schedule: SCHEDULE,
      nowSeconds: NOW,
    })!;
    expect(a.reserved).toBe(30_000);
    expect(a.available).toBe(50_000);
    expect(a.perDay).toBe(6_250);
    expect(a.dueBeforeIncome).toEqual([{ name: "Netflix", totalBase: 30_000 }]);
  });

  it("зобов'язання рівно в день доходу теж резервуємо (не відомо, що прийде раніше)", () => {
    const a = computeAllowance({
      liquid: 80_000,
      commitments: [{ name: "Комуналка", amountBase: 15_000, cadence: "monthly", anchorDay: 1 }],
      goals: [],
      buffer: 0,
      schedule: SCHEDULE,
      nowSeconds: NOW,
    })!;
    expect(a.reserved).toBe(15_000);
    expect(a.dueBeforeIncome).toEqual([{ name: "Комуналка", totalBase: 15_000 }]);
  });

  it("НЕ резервує зобов'язання після доходу (його покриє зарплата)", () => {
    const a = computeAllowance({
      liquid: 80_000,
      commitments: [{ name: "Спортзал", amountBase: 30_000, cadence: "monthly", anchorDay: 10 }],
      goals: [],
      buffer: 0,
      schedule: SCHEDULE,
      nowSeconds: NOW,
    })!;
    expect(a.reserved).toBe(0);
    expect(a.available).toBe(80_000);
    expect(a.dueBeforeIncome).toEqual([]);
  });

  it("буфер віднімається", () => {
    const a = computeAllowance({
      liquid: 80_000,
      commitments: [],
      goals: [],
      buffer: 40_000,
      schedule: SCHEDULE,
      nowSeconds: NOW,
    })!;
    expect(a.available).toBe(40_000);
    expect(a.perDay).toBe(5_000);
  });

  it("зобов'язання й буфер перевищують баланс → 0, не від'ємне", () => {
    const a = computeAllowance({
      liquid: 10_000,
      commitments: [{ name: "Оренда", amountBase: 50_000, cadence: "monthly", anchorDay: 28 }],
      goals: [],
      buffer: 20_000,
      schedule: SCHEDULE,
      nowSeconds: NOW,
    })!;
    expect(a.perDay).toBe(0);
    expect(a.shortfall).toBe(true);
    expect(a.available).toBeLessThan(0);
  });

  it("тижневе зобов'язання рахується стільки разів, скільки настане", () => {
    const a = computeAllowance({
      liquid: 100_000,
      commitments: [{ name: "Пральня", amountBase: 5_000, cadence: "weekly", anchorDay: 3 }],
      goals: [],
      buffer: 0,
      schedule: SCHEDULE,
      nowSeconds: NOW,
    })!;
    expect(a.reserved).toBe(10_000);
  });

  it("перевитрата сьогодні зменшує завтрашній ліміт (самокалібрування)", () => {
    const today = computeAllowance({
      liquid: 80_000,
      commitments: [],
      goals: [],
      buffer: 0,
      schedule: SCHEDULE,
      nowSeconds: NOW,
    })!;
    expect(today.perDay).toBe(10_000);
    const tomorrow = computeAllowance({
      liquid: 60_000,
      commitments: [],
      goals: [],
      buffer: 0,
      schedule: SCHEDULE,
      nowSeconds: at(2026, 3, 26),
    })!;
    expect(tomorrow.daysToIncome).toBe(7);
    expect(tomorrow.perDay).toBe(8_571);
  });

  it("ціль із дедлайном резервує й зменшує perDay", () => {
    const a = computeAllowance({
      liquid: 80_000,
      commitments: [],
      goals: [{ name: "Ноут", remainingBase: 40_000, deadlineDays: 8 }],
      buffer: 0,
      schedule: SCHEDULE,
      nowSeconds: NOW,
    })!;
    expect(a.goalsReserved).toBe(40_000);
    expect(a.available).toBe(40_000);
    expect(a.perDay).toBe(5_000);
    expect(a.goalsBeforeIncome).toEqual([{ name: "Ноут", reservedBase: 40_000 }]);
  });

  it("прострочена ціль НЕ зменшує perDay, але названа в overdueGoals", () => {
    const a = computeAllowance({
      liquid: 80_000,
      commitments: [],
      goals: [{ name: "Старе", remainingBase: 40_000, deadlineDays: 0 }],
      buffer: 0,
      schedule: SCHEDULE,
      nowSeconds: NOW,
    })!;
    expect(a.goalsReserved).toBe(0);
    expect(a.perDay).toBe(10_000);
    expect(a.overdueGoals).toEqual(["Старе"]);
  });

  it("цілі + зобов'язання + буфер разом дають shortfall", () => {
    const a = computeAllowance({
      liquid: 80_000,
      commitments: [{ name: "Оренда", amountBase: 30_000, cadence: "monthly", anchorDay: 28 }],
      goals: [{ name: "Ноут", remainingBase: 40_000, deadlineDays: 8 }],
      buffer: 20_000,
      schedule: SCHEDULE,
      nowSeconds: NOW,
    })!;
    expect(a.available).toBe(-10_000);
    expect(a.shortfall).toBe(true);
    expect(a.perDay).toBe(0);
  });

  it("ціль без дедлайну (просто відсутня в масиві) нічого не змінює", () => {
    const withGoal = computeAllowance({
      liquid: 80_000,
      commitments: [],
      goals: [],
      buffer: 0,
      schedule: SCHEDULE,
      nowSeconds: NOW,
    })!;
    expect(withGoal.perDay).toBe(10_000);
    expect(withGoal.goalsReserved).toBe(0);
    expect(withGoal.overdueGoals).toEqual([]);
    expect(withGoal.invalidGoals).toEqual([]);
  });
});
