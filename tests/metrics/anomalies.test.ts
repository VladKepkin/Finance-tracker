import { describe, it, expect } from "vitest";
import { detectAnomalies, withoutAnomalies } from "@/lib/metrics/anomalies";
import { median } from "@/lib/metrics/stats";

const day = (n: number, expense: number) => ({
  date: `2024-07-${String(n).padStart(2, "0")}`,
  expense,
});

describe("detectAnomalies", () => {
  it("ловить купівлю техніки серед звичайних днів (MAD > 0)", () => {
    const days = [];
    for (let i = 1; i <= 30; i++) days.push(day(i, 400 + (i % 5) * 50));
    days.push(day(31, 40000));
    const out = detectAnomalies(days);
    expect(out).toHaveLength(1);
    expect(out[0].date).toBe("2024-07-31");
    expect(out[0].expense).toBe(40000);
    expect(out[0].zScore).toBeGreaterThan(3.5);
  });

  it("MAD = 0 → відкат на median × 5 (реальний випадок: усі дні однакові)", () => {
    const days = [];
    for (let i = 1; i <= 30; i++) days.push(day(i, 500));
    days.push(day(31, 40000));
    const out = detectAnomalies(days);
    expect(out).toHaveLength(1);
    expect(out[0].expense).toBe(40000);
    expect(out[0].zScore).toBeNull();
  });

  it("не чіпає низькі дні: малі витрати — це не викид, а нормальна поведінка (відкат MAD=0)", () => {
    const days = [];
    for (let i = 1; i <= 30; i++) days.push(day(i, 500));
    days.push(day(31, 0));
    expect(detectAnomalies(days)).toEqual([]);
  });

  it("не чіпає нульовий день у z-гілці: абсолютне значення Z не застосовується", () => {
    const days = [];
    const cycle = [950, 975, 1000, 1025, 1050];
    let dayNum = 1;
    for (let i = 0; i < 6; i++) {
      for (const expense of cycle) {
        days.push(day(dayNum, expense));
        dayNum++;
      }
    }
    days.push(day(31, 0));
    expect(detectAnomalies(days)).toEqual([]);
  });

  it("рівний ряд без викидів → порожньо", () => {
    const days = [];
    for (let i = 1; i <= 30; i++) days.push(day(i, 400 + (i % 5) * 50));
    expect(detectAnomalies(days)).toEqual([]);
  });

  it("порожній вхід → порожньо", () => {
    expect(detectAnomalies([])).toEqual([]);
  });
});

describe("withoutAnomalies", () => {
  it("медіана без аномалії лишається типовою", () => {
    const days = [];
    for (let i = 1; i <= 30; i++) days.push(day(i, 500));
    days.push(day(31, 40000));
    const clean = withoutAnomalies(days, detectAnomalies(days));
    expect(clean).toHaveLength(30);
    expect(median(clean.map((d) => d.expense))).toBe(500);
  });
});
