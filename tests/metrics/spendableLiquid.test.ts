import { describe, it, expect } from "vitest";
import { spendableLiquid, tomorrowForecast } from "@/lib/metrics/spendableLiquid";

describe("spendableLiquid", () => {
  it("pct не задано — ліміт від залишку, як і раніше, без причини-помилки", () => {
    const r = spendableLiquid({ actualLiquid: 500_000, monthlyIncome: null, spendablePct: null });
    expect(r).toEqual({ value: 500_000, limitedBy: "balance", salaryBudget: null, reason: null });
  });

  it("pct задано, зарплат немає — чесна відмова, не мовчазний фолбек на залишок", () => {
    const r = spendableLiquid({ actualLiquid: 500_000, monthlyIncome: null, spendablePct: 50 });
    expect(r.value).toBeNull();
    expect(r.limitedBy).toBeNull();
    expect(r.salaryBudget).toBeNull();
    expect(r.reason).toMatch(/зарплату/);
  });

  it("бюджет менший за залишок — обмежує бюджет", () => {
    const r = spendableLiquid({ actualLiquid: 500_000, monthlyIncome: 200_000, spendablePct: 50 });
    expect(r).toEqual({ value: 100_000, limitedBy: "budget", salaryBudget: 100_000, reason: null });
  });

  it("залишок менший за бюджет — обмежує залишок", () => {
    const r = spendableLiquid({ actualLiquid: 50_000, monthlyIncome: 200_000, spendablePct: 50 });
    expect(r).toEqual({ value: 50_000, limitedBy: "balance", salaryBudget: 100_000, reason: null });
  });

  it("залишок і бюджет рівні — обираємо balance (значення бюджет не звужує)", () => {
    const r = spendableLiquid({ actualLiquid: 100_000, monthlyIncome: 200_000, spendablePct: 50 });
    expect(r).toEqual({ value: 100_000, limitedBy: "balance", salaryBudget: 100_000, reason: null });
  });

  it("pct=100 — весь дохід є бюджетом", () => {
    const r = spendableLiquid({ actualLiquid: 500_000, monthlyIncome: 300_000, spendablePct: 100 });
    expect(r).toEqual({ value: 300_000, limitedBy: "budget", salaryBudget: 300_000, reason: null });
  });

  it("NaN залишок — не проходить крізь порівняння мовчки, явна причина", () => {
    const r = spendableLiquid({ actualLiquid: NaN, monthlyIncome: 200_000, spendablePct: 50 });
    expect(r.value).toBeNull();
    expect(r.reason).not.toBeNull();
  });

  it("Infinity дохід — гейт ловить, не пропускає в порівняння", () => {
    const r = spendableLiquid({ actualLiquid: 500_000, monthlyIncome: Infinity, spendablePct: 50 });
    expect(r.value).toBeNull();
    expect(r.reason).not.toBeNull();
  });

  it("NaN pct — гейт ловить окремо від pct===null", () => {
    const r = spendableLiquid({ actualLiquid: 500_000, monthlyIncome: 200_000, spendablePct: NaN });
    expect(r.value).toBeNull();
    expect(r.reason).not.toBeNull();
  });

  it("мутація-перевірка: обирає МЕНШЕ з двох, не більше", () => {
    const r = spendableLiquid({ actualLiquid: 500_000, monthlyIncome: 200_000, spendablePct: 50 });
    expect(r.value).toBe(Math.min(500_000, 100_000));
    expect(r.value).not.toBe(Math.max(500_000, 100_000));
  });
});

describe("tomorrowForecast", () => {
  it("звичайний випадок — ділить available як є, без spentToday", () => {
    const r = tomorrowForecast({ available: 300_000, daysToIncome: 6 });
    expect(r).toEqual({ perDay: 60_000, reason: null });
  });

  it("C1: приклад із рев'ю — те саме available/daysToIncome, що покаже сам застосунок завтра", () => {
    const r = tomorrowForecast({ available: 10_000, daysToIncome: 10 });
    expect(r.perDay).toBe(Math.floor(10_000 / 9));
  });

  it("daysToIncome===1 — дохід завтра, прогнозу немає (не 0, не Infinity)", () => {
    const r = tomorrowForecast({ available: 300_000, daysToIncome: 1 });
    expect(r.perDay).toBeNull();
    expect(r.reason).toMatch(/завтра/);
  });

  it("daysToIncome===0 — зіпсовані дані, окрема причина від daysToIncome===1", () => {
    const r0 = tomorrowForecast({ available: 300_000, daysToIncome: 0 });
    const r1 = tomorrowForecast({ available: 300_000, daysToIncome: 1 });
    expect(r0.perDay).toBeNull();
    expect(r0.reason).not.toBeNull();
    expect(r0.reason).not.toBe(r1.reason);
  });

  it("available<0 — той самий сигнал, що computeAllowance.shortfall — завтра 0, не від'ємне", () => {
    const r = tomorrowForecast({ available: -50_000, daysToIncome: 5 });
    expect(r).toEqual({ perDay: 0, reason: "Зобов'язання й буфер перевищують залишок — завтра ліміт 0." });
  });

  it("NaN на будь-якому вході — не проходить крізь порівняння", () => {
    expect(tomorrowForecast({ available: NaN, daysToIncome: 5 }).perDay).toBeNull();
    expect(tomorrowForecast({ available: 100, daysToIncome: NaN }).perDay).toBeNull();
  });

  it("Infinity на будь-якому вході — не проходить крізь порівняння", () => {
    expect(tomorrowForecast({ available: Infinity, daysToIncome: 5 }).perDay).toBeNull();
    expect(tomorrowForecast({ available: 100, daysToIncome: Infinity }).perDay).toBeNull();
  });

  it("ділить саме на (daysToIncome - 1), не на daysToIncome", () => {
    const r = tomorrowForecast({ available: 200_000, daysToIncome: 3 });
    expect(r.perDay).toBe(100_000);
  });

  it("мутація-перевірка: результат НЕ такий, як був би при відніманні spentToday вдруге", () => {
    const r = tomorrowForecast({ available: 300_000, daysToIncome: 6 });
    const buggyWithDoubleCountedSpend = Math.floor((300_000 - 50_000) / (6 - 1));
    expect(r.perDay).not.toBe(buggyWithDoubleCountedSpend);
    expect(r.perDay).toBe(60_000);
  });
});
