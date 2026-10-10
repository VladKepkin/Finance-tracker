import { describe, it, expect } from "vitest";
import { todayHero } from "@/lib/home/todayHero";
import type { Allowance } from "@/lib/metrics/allowance";

const allowance: Allowance = {
  perDay: 100_000,
  daysToIncome: 12,
  periodEnd: 1_790_000_000,
  liquid: 2_000_000,
  reserved: 0,
  buffer: 0,
  available: 1_200_000,
  shortfall: false,
  dueBeforeIncome: [],
  goalsReserved: 0,
  goalsBeforeIncome: [],
  overdueGoals: [],
  invalidGoals: [],
  paidCommitments: [],
};

const healthy = {
  spentToday: 38_000,
  spentTodayFxUnavailable: null,
  allowance,
  allowanceLoading: false,
  allowanceError: null,
  fxUnavailableCurrency: null,
  spendableReason: null,
};

describe("todayHero", () => {
  it("within: remaining is limit minus spent", () => {
    expect(todayHero(healthy)).toEqual({
      kind: "within",
      spent: 38_000,
      perDay: 100_000,
      remaining: 62_000,
      ratio: 0.38,
      daysToIncome: 12,
      periodEnd: 1_790_000_000,
    });
  });

  it("spent exactly the limit is still within with zero remaining", () => {
    const h = todayHero({ ...healthy, spentToday: 100_000 });
    expect(h.kind).toBe("within");
    expect(h.kind === "within" && h.remaining).toBe(0);
  });

  it("over: reports how much above the limit", () => {
    const h = todayHero({ ...healthy, spentToday: 130_000 });
    expect(h).toMatchObject({ kind: "over", overBy: 30_000, perDay: 100_000 });
  });

  it("unknown spend names the currency without a rate", () => {
    const h = todayHero({ ...healthy, spentToday: null, spentTodayFxUnavailable: 840 });
    expect(h).toEqual({
      kind: "unknown",
      reason: "Немає курсу для USD — витрату сьогодні порахувати не можна.",
    });
  });

  it("loading keeps the known spend instead of a zero limit", () => {
    expect(todayHero({ ...healthy, allowanceLoading: true })).toEqual({ kind: "loading", spent: 38_000 });
  });

  it("commitments error keeps spend and explains, with no setup action", () => {
    const h = todayHero({ ...healthy, allowance: null, allowanceError: "timeout" });
    expect(h).toMatchObject({ kind: "spentOnly", spent: 38_000, action: null });
    expect(h.kind === "spentOnly" && h.reason).toContain("timeout");
  });

  it("missing rate for the limit names the currency", () => {
    const h = todayHero({ ...healthy, fxUnavailableCurrency: 978 });
    expect(h.kind === "spentOnly" && h.reason).toContain("EUR");
  });

  it("salary percentage without salaries asks for a salary, not a schedule", () => {
    const h = todayHero({ ...healthy, allowance: null, spendableReason: "Додай зарплату" });
    expect(h).toEqual({ kind: "spentOnly", spent: 38_000, reason: "Додай зарплату", action: "salary" });
  });

  it("no schedule asks for the income schedule", () => {
    const h = todayHero({ ...healthy, allowance: null });
    expect(h).toMatchObject({ kind: "spentOnly", action: "schedule" });
  });
});
