import { describe, expect, it } from "vitest";
import { evaluate } from "../../lib/metrics/evaluator";
import { computeAllowance, type AllowanceCommitment } from "../../lib/metrics/allowance";
import type { AllowanceGoal } from "../../lib/metrics/goals";
import type { IncomeSchedule } from "../../lib/metrics/schedule";

const schedule: IncomeSchedule = { kind: "monthly", day: 25 };
const nowSeconds = Date.UTC(2026, 6, 16, 12) / 1000;

const commitments: AllowanceCommitment[] = [];
const goals: AllowanceGoal[] = [];

function baseInput(overrides: Partial<Parameters<typeof evaluate>[0]> = {}) {
  return {
    priceBase: 10_000,
    liquid: 50_000,
    commitments,
    goals,
    buffer: 0,
    schedule,
    monthlyNet: 20_000,
    monthlyIncome: 30_000,
    nowSeconds,
    ...overrides,
  };
}

describe("evaluate — schedule === null", () => {
  it("усі три сценарії null з причиною про графік доходу", () => {
    const r = evaluate(baseInput({ schedule: null }));
    expect(r.savings.value).toBeNull();
    expect(r.buyNow.value).toBeNull();
    expect(r.defer.value).toBeNull();
    expect(r.savings.reason).toMatch(/графік/);
    expect(r.buyNow.reason).toMatch(/графік/);
    expect(r.defer.reason).toMatch(/графік/);
  });
});

describe("evaluate — savings", () => {
  it("рахує priceBase / monthlyNet", () => {
    const r = evaluate(baseInput({ priceBase: 10_000, monthlyNet: 20_000 }));
    expect(r.savings.value).toEqual({ monthsToAfford: 0.5 });
    expect(r.savings.reason).toBeNull();
  });

  it("monthlyNet === null → null з причиною, без ∞", () => {
    const r = evaluate(baseInput({ monthlyNet: null }));
    expect(r.savings.value).toBeNull();
    expect(r.savings.reason).not.toBeNull();
    expect(r.savings.reason).toMatch(/накопич/);
  });

  it("monthlyNet <= 0 → null, не ∞ і не від'ємне число місяців", () => {
    const r = evaluate(baseInput({ monthlyNet: 0 }));
    expect(r.savings.value).toBeNull();

    const rNeg = evaluate(baseInput({ monthlyNet: -500 }));
    expect(rNeg.savings.value).toBeNull();
  });
});

describe("evaluate — buyNow: той самий движок, не паралельна формула", () => {
  it("after дорівнює прямому computeAllowance(liquid − priceBase, ...)", () => {
    const input = baseInput({ liquid: 80_000, priceBase: 15_000 });
    const r = evaluate(input);
    const direct = computeAllowance({
      liquid: input.liquid - input.priceBase,
      commitments: input.commitments,
      goals: input.goals,
      buffer: input.buffer,
      schedule: input.schedule,
      nowSeconds: input.nowSeconds,
    })!;
    expect(r.buyNow.value?.after).toBe(direct.perDay);
    expect(r.buyNow.value?.allowance).toEqual(direct);
  });

  it("before дорівнює перDay без покупки", () => {
    const input = baseInput({ liquid: 80_000, priceBase: 15_000 });
    const r = evaluate(input);
    const before = computeAllowance({
      liquid: input.liquid,
      commitments: input.commitments,
      goals: input.goals,
      buffer: input.buffer,
      schedule: input.schedule,
      nowSeconds: input.nowSeconds,
    })!;
    expect(r.buyNow.value?.before).toBe(before.perDay);
  });

  it("покупка на всю суму без резерву показує shortfall чесно, не ховає його", () => {
    const input = baseInput({ liquid: 10_000, priceBase: 10_000, buffer: 500 });
    const r = evaluate(input);
    expect(r.buyNow.value?.allowance.shortfall).toBe(true);
    expect(r.buyNow.value?.after).toBe(0);
  });
});

describe("evaluate — defer", () => {
  it("monthlyIncome === null → null з причиною «дохід невідомий», нуль не підставляється", () => {
    const r = evaluate(baseInput({ monthlyIncome: null }));
    expect(r.defer.value).toBeNull();
    expect(r.defer.reason).toMatch(/дохід невідомий/);
  });

  it("рахує after від дати надходження доходу, а не від сьогоднішнього daysToIncome", () => {
    const input = baseInput({ liquid: 50_000, priceBase: 10_000, monthlyIncome: 30_000 });
    const r = evaluate(input);

    const incomeDay = Date.UTC(2026, 6, 25) / 1000;
    const direct = computeAllowance({
      liquid: input.liquid + input.monthlyIncome! - input.priceBase,
      commitments: input.commitments,
      goals: input.goals,
      buffer: input.buffer,
      schedule: input.schedule,
      nowSeconds: incomeDay,
    })!;

    expect(r.defer.value?.after).toBe(direct.perDay);
    expect(r.defer.value?.assumedIncome).toBe(30_000);

    expect(direct.daysToIncome).toBe(32);
    expect(direct.available).toBe(70_000);
    expect(direct.perDay).toBe(2_187);
  });

  it("assumedIncome — це медіана minus нуль, а не 0 при відомому доході", () => {
    const r = evaluate(baseInput({ monthlyIncome: 12_345 }));
    expect(r.defer.value?.assumedIncome).toBe(12_345);
  });
});

describe("evaluate — фіксовані причини для кожного null-сценарію (не generic 'немає даних')", () => {
  it("немає графіка → причина згадує графік доходу, а не generic текст", () => {
    const r = evaluate(baseInput({ schedule: null }));
    expect(r.savings.reason).not.toBe("немає даних");
    expect(r.buyNow.reason).not.toBe("немає даних");
    expect(r.defer.reason).not.toBe("немає даних");
  });
});
