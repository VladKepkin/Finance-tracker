import { describe, it, expect } from "vitest";
import { spendGauge, dayHistory } from "@/lib/metrics/spendGauge";
import type { DailyTotal } from "@/lib/metrics/daily";

describe("spendGauge", () => {
  it("limit null → unknown, ratio/remaining null, spent лишається числом", () => {
    const g = spendGauge(500, null);
    expect(g).toEqual({ spent: 500, limit: null, ratio: null, remaining: null, zone: "unknown" });
  });

  it("spent < limit → within, remaining додатній", () => {
    const g = spendGauge(300, 1000);
    expect(g.zone).toBe("within");
    expect(g.remaining).toBe(700);
    expect(g.ratio).toBe(0.3);
  });

  it("spent === limit → within, remaining 0 (пінимо межу)", () => {
    const g = spendGauge(1000, 1000);
    expect(g.zone).toBe("within");
    expect(g.remaining).toBe(0);
  });

  it("spent > limit → over, remaining від'ємний (не клампити до 0)", () => {
    const g = spendGauge(1200, 1000);
    expect(g.zone).toBe("over");
    expect(g.remaining).toBe(-200);
    expect(g.ratio).toBe(1.2);
  });

  it("limit === 0, spent === 0 → within, ratio null (не NaN)", () => {
    const g = spendGauge(0, 0);
    expect(g.zone).toBe("within");
    expect(g.remaining).toBe(0);
    expect(g.ratio).toBeNull();
  });

  it("limit === 0, spent > 0 → over, ratio null (не Infinity)", () => {
    const g = spendGauge(500, 0);
    expect(g.zone).toBe("over");
    expect(g.remaining).toBe(-500);
    expect(g.ratio).toBeNull();
  });

  it("NaN spent → unknown, не within/over", () => {
    const g = spendGauge(NaN, 1000);
    expect(g.zone).toBe("unknown");
    expect(g.ratio).toBeNull();
    expect(g.remaining).toBeNull();
  });

  it("Infinity spent → unknown, не within/over", () => {
    const g = spendGauge(Infinity, 1000);
    expect(g.zone).toBe("unknown");
    expect(g.ratio).toBeNull();
    expect(g.remaining).toBeNull();
  });

  it("NaN limit → unknown, не «в межах» через отруєне порівняння", () => {
    const g = spendGauge(500, NaN);
    expect(g.zone).toBe("unknown");
    expect(g.ratio).toBeNull();
    expect(g.remaining).toBeNull();
  });

  it("Infinity limit → unknown (пошкоджені дані, не порожня дуга)", () => {
    const g = spendGauge(500, Infinity);
    expect(g.zone).toBe("unknown");
    expect(g.remaining).toBeNull();
  });
});

describe("dayHistory", () => {
  const days: DailyTotal[] = [
    { date: "2024-07-01", expense: 0 },
    { date: "2024-07-02", expense: 500 },
    { date: "2024-07-03", expense: 499 },
    { date: "2024-07-04", expense: 1000 },
    { date: "2024-07-05", expense: 1001 },
  ];

  it("median відомий → класифікує кожен день відносно нього", () => {
    const out = dayHistory(days, 1000);
    expect(out.map((d) => d.vsTypical)).toEqual([
      "light",
      "typical",
      "light",
      "typical",
      "heavy",
    ]);
  });

  it("нульовий день при нульовій медіані — typical, не light (чесний факт, а не вигадана легкість)", () => {
    const out = dayHistory([{ date: "2024-07-01", expense: 0 }], 0);
    expect(out[0].vsTypical).toBe("typical");
  });

  it("typicalMedian === null → усі vsTypical null, дні й суми лишаються", () => {
    const out = dayHistory(days, null);
    expect(out.every((d) => d.vsTypical === null)).toBe(true);
    expect(out.map((d) => d.spent)).toEqual([0, 500, 499, 1000, 1001]);
    expect(out.map((d) => d.date)).toEqual(days.map((d) => d.date));
  });

  it("NaN median (пошкоджені дані) → усі vsTypical null, а не «typical» навмання", () => {
    const out = dayHistory(days, NaN);
    expect(out.every((d) => d.vsTypical === null)).toBe(true);
  });

  it("NaN spent у конкретному дні → vsTypical null лише для нього", () => {
    const out = dayHistory([{ date: "2024-07-01", expense: NaN }], 1000);
    expect(out[0].vsTypical).toBeNull();
    expect(out[0].spent).toBeNaN();
  });

  it("порожній список днів → []", () => {
    expect(dayHistory([], 1000)).toEqual([]);
  });
});
