import { describe, expect, it } from "vitest";
import {
  getIncomeSchedule,
  setIncomeSchedule,
  getBuffer,
  setBuffer,
  getWishlist,
  setWishlist,
  getSavingsPlan,
  setSavingsPlan,
  getWorkSchedule,
  setWorkSchedule,
  getCashAccounts,
  setCashAccounts,
  getExcludedAccounts,
  setExcludedAccounts,
  getTxOverrides,
  setTxOverrides,
  getPartnerKeywords,
  setPartnerKeywords,
  type WishItem,
} from "@/lib/storage";
import type { IncomeSchedule } from "@/lib/metrics/schedule";
import type { SavingsPlan } from "@/lib/metrics/savings";
import type { WorkSchedule } from "@/lib/metrics/salary";
import type { CashAccount } from "@/lib/cashAccounts";

describe("getIncomeSchedule", () => {
  it("повертає валідний графік як є", () => {
    const s: IncomeSchedule = { kind: "monthly", day: 25 };
    setIncomeSchedule(s);
    expect(getIncomeSchedule()).toEqual(s);
  });

  it("сміття в KV читається як null, а не як зламаний графік", () => {
    setIncomeSchedule({ kind: "monthly", day: 999 } as unknown as IncomeSchedule);
    expect(getIncomeSchedule()).toBeNull();
  });

  it("довільний об'єкт без kind читається як null", () => {
    setIncomeSchedule({ foo: "bar" } as unknown as IncomeSchedule);
    expect(getIncomeSchedule()).toBeNull();
  });
});

describe("getBuffer", () => {
  it("повертає збережене невід'ємне ціле", () => {
    setBuffer(1500);
    expect(getBuffer()).toBe(1500);
  });

  it("від'ємне значення в KV читається як 0", () => {
    setBuffer(-100);
    expect(getBuffer()).toBe(0);
  });

  it("нечисловий сміттєвий запис читається як 0", () => {
    setBuffer("garbage" as unknown as number);
    expect(getBuffer()).toBe(0);
  });

  it("дробове значення в KV читається як 0", () => {
    setBuffer(1.5);
    expect(getBuffer()).toBe(0);
  });
});

describe("getWishlist", () => {
  const base: WishItem = { id: "1", name: "Ноут", price: 120_000, currency: 980 };

  it("валідний ISO-дедлайн лишається як є", () => {
    const wish = { ...base, deadline: "2026-12-31" };
    setWishlist([wish]);
    expect(getWishlist()).toEqual([wish]);
  });

  it.each([
    ["текст замість дати", "вчора"],
    ["порожній рядок", ""],
    ["неіснуючий місяць/день", "2026-13-45"],
    ["переповнення календаря (JS клампить у 2 березня)", "2026-02-30"],
  ])("сміттєвий дедлайн (%s) відкидається, решта запису ціла", (_label, deadline) => {
    setWishlist([{ ...base, deadline } as WishItem]);
    const [got] = getWishlist();
    expect(got).toEqual(base);
    expect(got).not.toHaveProperty("deadline");
  });

  it("нечисловий тип дедлайна (число) відкидається", () => {
    setWishlist([{ ...base, deadline: 20261231 } as unknown as WishItem]);
    const [got] = getWishlist();
    expect(got).toEqual(base);
  });

  it("null-дедлайн відкидається", () => {
    setWishlist([{ ...base, deadline: null } as unknown as WishItem]);
    const [got] = getWishlist();
    expect(got).toEqual(base);
  });

  it("запис без deadline лишається без змін (щасливий шлях)", () => {
    setWishlist([base]);
    expect(getWishlist()).toEqual([base]);
  });
});

describe("getSavingsPlan", () => {
  it("валідний план лишається як є", () => {
    setSavingsPlan({ emergencyMonths: 6, monthlyContribution: 500_000, spendablePct: 70 });
    expect(getSavingsPlan()).toEqual({ emergencyMonths: 6, monthlyContribution: 500_000, spendablePct: 70 });
  });

  it("усі поля null лишаються null (план ще не налаштований)", () => {
    setSavingsPlan({ emergencyMonths: null, monthlyContribution: null, spendablePct: null });
    expect(getSavingsPlan()).toEqual({ emergencyMonths: null, monthlyContribution: null, spendablePct: null });
  });

  it.each([
    ["0 місяців — поза межами 1..24", { emergencyMonths: 0, monthlyContribution: 1000 }],
    ["99 місяців — поза межами 1..24", { emergencyMonths: 99, monthlyContribution: 1000 }],
    ["рядок замість числа", { emergencyMonths: "6", monthlyContribution: 1000 }],
    ["від'ємні місяці", { emergencyMonths: -100, monthlyContribution: 1000 }],
    ["дробові місяці", { emergencyMonths: 3.5, monthlyContribution: 1000 }],
    ["NaN місяців", { emergencyMonths: NaN, monthlyContribution: 1000 }],
    ["Infinity місяців", { emergencyMonths: Infinity, monthlyContribution: 1000 }],
  ])("сміттєвий emergencyMonths (%s) читається як null, решта плану ціла", (_label, plan) => {
    setSavingsPlan(plan as unknown as SavingsPlan);
    expect(getSavingsPlan()).toEqual({ emergencyMonths: null, monthlyContribution: 1000, spendablePct: null });
  });

  it.each([
    ["від'ємний внесок", { emergencyMonths: 6, monthlyContribution: -100 }],
    ["дробовий внесок", { emergencyMonths: 6, monthlyContribution: 3.5 }],
    ["рядок замість числа", { emergencyMonths: 6, monthlyContribution: "500" }],
    ["NaN внеску", { emergencyMonths: 6, monthlyContribution: NaN }],
    ["Infinity внеску", { emergencyMonths: 6, monthlyContribution: Infinity }],
  ])("сміттєвий monthlyContribution (%s) читається як null, решта плану ціла", (_label, plan) => {
    setSavingsPlan(plan as unknown as SavingsPlan);
    expect(getSavingsPlan()).toEqual({ emergencyMonths: 6, monthlyContribution: null, spendablePct: null });
  });

  it.each([
    ["NaN", { emergencyMonths: 6, monthlyContribution: 1000, spendablePct: NaN }],
    ["Infinity", { emergencyMonths: 6, monthlyContribution: 1000, spendablePct: Infinity }],
    ["0 — поза межами 1..100", { emergencyMonths: 6, monthlyContribution: 1000, spendablePct: 0 }],
    ["101 — поза межами 1..100", { emergencyMonths: 6, monthlyContribution: 1000, spendablePct: 101 }],
    ["рядок замість числа", { emergencyMonths: 6, monthlyContribution: 1000, spendablePct: "50" }],
    ["дробове значення", { emergencyMonths: 6, monthlyContribution: 1000, spendablePct: 3.5 }],
  ])("сміттєвий spendablePct (%s) читається як null, решта плану ціла", (_label, plan) => {
    setSavingsPlan(plan as unknown as SavingsPlan);
    expect(getSavingsPlan()).toEqual({ emergencyMonths: 6, monthlyContribution: 1000, spendablePct: null });
  });

  it("spendablePct null — валідний «не налаштовано», решта плану ціла", () => {
    setSavingsPlan({ emergencyMonths: 6, monthlyContribution: 1000, spendablePct: null });
    expect(getSavingsPlan()).toEqual({ emergencyMonths: 6, monthlyContribution: 1000, spendablePct: null });
  });

  it("spendablePct=100 — межове валідне значення", () => {
    setSavingsPlan({ emergencyMonths: 6, monthlyContribution: 1000, spendablePct: 100 });
    expect(getSavingsPlan()).toEqual({ emergencyMonths: 6, monthlyContribution: 1000, spendablePct: 100 });
  });

  it("масив читається як «не налаштовано» повністю", () => {
    setSavingsPlan([1, 2, 3] as unknown as SavingsPlan);
    expect(getSavingsPlan()).toEqual({ emergencyMonths: null, monthlyContribution: null, spendablePct: null });
  });

  it("null повністю читається як «не налаштовано»", () => {
    setSavingsPlan(null as unknown as SavingsPlan);
    expect(getSavingsPlan()).toEqual({ emergencyMonths: null, monthlyContribution: null, spendablePct: null });
  });

  it("не-об'єкт (число) читається як «не налаштовано»", () => {
    setSavingsPlan(42 as unknown as SavingsPlan);
    expect(getSavingsPlan()).toEqual({ emergencyMonths: null, monthlyContribution: null, spendablePct: null });
  });
});

describe("getWorkSchedule", () => {
  it("валідний графік лишається як є", () => {
    const s: WorkSchedule = { hoursPerDay: 8, weekdays: [1, 2, 3, 4, 5] };
    setWorkSchedule(s);
    expect(getWorkSchedule()).toEqual(s);
  });

  it.each([
    ["NaN hoursPerDay", { hoursPerDay: NaN, weekdays: [1] }],
    ["Infinity hoursPerDay", { hoursPerDay: Infinity, weekdays: [1] }],
    ["рядок замість числа", { hoursPerDay: "8", weekdays: [1] }],
    ["дробове hoursPerDay", { hoursPerDay: 3.5, weekdays: [1] }],
    ["0 hoursPerDay — поза межами 1..24", { hoursPerDay: 0, weekdays: [1] }],
    ["25 hoursPerDay — поза межами 1..24", { hoursPerDay: 25, weekdays: [1] }],
    ["від'ємне hoursPerDay", { hoursPerDay: -8, weekdays: [1] }],
    ["порожній weekdays", { hoursPerDay: 8, weekdays: [] }],
    ["weekdays поза межами 0..6", { hoursPerDay: 8, weekdays: [7] }],
    ["weekdays із дублікатом", { hoursPerDay: 8, weekdays: [1, 1] }],
    ["weekdays не масив", { hoursPerDay: 8, weekdays: "1" }],
    ["не-об'єкт (число)", 42],
    ["масив замість об'єкта", [1, 2]],
    ["null", null],
  ])("сміттєвий графік (%s) читається як null, а не як зламаний графік", (_label, garbage) => {
    setWorkSchedule(garbage as unknown as WorkSchedule);
    expect(getWorkSchedule()).toBeNull();
  });
});

describe("getCashAccounts", () => {
  it("дефолтний рахунок \"cash\" завжди присутній, навіть коли в KV лише інші рахунки", () => {
    setCashAccounts([{ id: "envelope", name: "Конверт" }]);
    const accounts = getCashAccounts();
    expect(accounts.find((a) => a.id === "cash")).toEqual({ id: "cash", name: "Готівка" });
    expect(accounts.find((a) => a.id === "envelope")).toEqual({ id: "envelope", name: "Конверт" });
  });

  it("перейменований дефолтний рахунок зберігається як звичайний запис у списку", () => {
    setCashAccounts([{ id: "cash", name: "Кишеня" }]);
    expect(getCashAccounts()).toEqual([{ id: "cash", name: "Кишеня" }]);
  });

  it.each([
    ["не масив", { foo: "bar" }],
    ["елемент без name", [{ id: "x" }]],
    ["елемент без id", [{ name: "Без id" }]],
    ["елемент з порожнім name", [{ id: "x", name: "   " }]],
    ["елемент не об'єкт", ["рядок"]],
    ["null", null],
  ])("сміттєвий список рахунків (%s) читається як [дефолтний]", (_label, garbage) => {
    setCashAccounts(garbage as unknown as CashAccount[]);
    expect(getCashAccounts()).toEqual([{ id: "cash", name: "Готівка" }]);
  });
});

describe("getExcludedAccounts", () => {
  it("повертає збережений масив ідентифікаторів", () => {
    setExcludedAccounts(["fop_123", "card_456"]);
    expect(getExcludedAccounts()).toEqual(["fop_123", "card_456"]);
  });

  it("порожній список за замовчуванням або якщо передано порожній масив", () => {
    setExcludedAccounts([]);
    expect(getExcludedAccounts()).toEqual([]);
  });

  it("фільтрує нестрокові значення та сміття", () => {
    setExcludedAccounts(["valid", 123 as unknown as string, null as unknown as string]);
    expect(getExcludedAccounts()).toEqual(["valid"]);
  });
});

describe("getTxOverrides", () => {
  it("повертає збережені перевизначення статусів транзакцій", () => {
    setTxOverrides({ "tx-1": "internal_transfer", "tx-2": "shared_transit" });
    expect(getTxOverrides()).toEqual({ "tx-1": "internal_transfer", "tx-2": "shared_transit" });
  });

  it("повертає порожній об'єкт за замовчуванням", () => {
    setTxOverrides({});
    expect(getTxOverrides()).toEqual({});
  });
});

describe("getPartnerKeywords", () => {
  it("повертає збережені ключові слова", () => {
    setPartnerKeywords(["кохана", "спільне", "бюджет"]);
    expect(getPartnerKeywords()).toEqual(["кохана", "спільне", "бюджет"]);
  });

  it("фільтрує нестрокові значення", () => {
    setPartnerKeywords(["бюджет", 42 as unknown as string]);
    expect(getPartnerKeywords()).toEqual(["бюджет"]);
  });
});

