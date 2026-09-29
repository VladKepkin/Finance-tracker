import { describe, it, expect } from "vitest";
import { savingsStillOwed, daysToMonthEnd } from "@/lib/metrics/savingsContribution";

const JAR_TITLES = ["Накопичення"];
const NOW = Date.UTC(2026, 6, 15, 12, 0, 0) / 1000;

function jarTransfer(amount: number, time: number) {
  return { amount, mcc: 4829, description: "Накопичення", time };
}
function ordinaryExpense(amount: number, time: number) {
  return { amount, mcc: 5411, description: "Супермаркет", time };
}

describe("savingsStillOwed", () => {
  it("нічого не переказано в банку цього місяця — лишається весь внесок", () => {
    const r = savingsStillOwed({
      statement: [ordinaryExpense(-50000, NOW)],
      jarTitles: JAR_TITLES,
      monthlyContributionBase: 200000,
      accountCurrency: 980,
      base: 980,
      rates: [],
      nowSeconds: NOW,
    });
    expect(r).toEqual({ ok: true, remainingBase: 200000 });
  });

  it("переказ у банку цього місяця повністю закриває внесок — подвійного віднімання немає", () => {
    const r = savingsStillOwed({
      statement: [jarTransfer(-200000, NOW)],
      jarTitles: JAR_TITLES,
      monthlyContributionBase: 200000,
      accountCurrency: 980,
      base: 980,
      rates: [],
      nowSeconds: NOW,
    });
    expect(r).toEqual({ ok: true, remainingBase: 0 });
  });

  it("частковий переказ — лишається різниця, не менше нуля", () => {
    const r = savingsStillOwed({
      statement: [jarTransfer(-70000, NOW)],
      jarTitles: JAR_TITLES,
      monthlyContributionBase: 200000,
      accountCurrency: 980,
      base: 980,
      rates: [],
      nowSeconds: NOW,
    });
    expect(r).toEqual({ ok: true, remainingBase: 130000 });
  });

  it("переказ у банку МИНУЛОГО місяця не рахується — резерв поточного місяця ним не закритий", () => {
    const lastMonth = Date.UTC(2026, 5, 20, 12, 0, 0) / 1000;
    const r = savingsStillOwed({
      statement: [jarTransfer(-200000, lastMonth)],
      jarTitles: JAR_TITLES,
      monthlyContributionBase: 200000,
      accountCurrency: 980,
      base: 980,
      rates: [],
      nowSeconds: NOW,
    });
    expect(r).toEqual({ ok: true, remainingBase: 200000 });
  });

  it("звичайна витрата (не переказ у банку) не зменшує залишок внеску", () => {
    const r = savingsStillOwed({
      statement: [ordinaryExpense(-200000, NOW)],
      jarTitles: JAR_TITLES,
      monthlyContributionBase: 200000,
      accountCurrency: 980,
      base: 980,
      rates: [],
      nowSeconds: NOW,
    });
    expect(r).toEqual({ ok: true, remainingBase: 200000 });
  });

  it("переплата в банку не йде в мінус — залишок затискається до нуля", () => {
    const r = savingsStillOwed({
      statement: [jarTransfer(-500000, NOW)],
      jarTitles: JAR_TITLES,
      monthlyContributionBase: 200000,
      accountCurrency: 980,
      base: 980,
      rates: [],
      nowSeconds: NOW,
    });
    expect(r).toEqual({ ok: true, remainingBase: 0 });
  });

  it("курс невідомий — чесно кажемо про це, а не рахуємо сирі копійки", () => {
    const r = savingsStillOwed({
      statement: [jarTransfer(-50000, NOW)],
      jarTitles: JAR_TITLES,
      monthlyContributionBase: 200000,
      accountCurrency: 840,
      base: 980,
      rates: [],
      nowSeconds: NOW,
    });
    expect(r).toEqual({ ok: false, currency: 840 });
  });
});

describe("daysToMonthEnd", () => {
  it("сьогодні останній день місяця — 1 день, ніколи 0", () => {
    const lastDay = Date.UTC(2026, 6, 31, 23, 0, 0) / 1000;
    expect(daysToMonthEnd(lastDay)).toBe(1);
  });

  it("сьогодні перший день 31-денного місяця — 31 день лишилось (включно з сьогодні)", () => {
    const firstDay = Date.UTC(2026, 6, 1, 0, 0, 0) / 1000;
    expect(daysToMonthEnd(firstDay)).toBe(31);
  });

  it("сьогодні перший день лютого (не високосний 2026) — 28 днів", () => {
    const firstDay = Date.UTC(2026, 1, 1, 0, 0, 0) / 1000;
    expect(daysToMonthEnd(firstDay)).toBe(28);
  });
});
