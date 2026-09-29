import { describe, it, expect } from "vitest";
import { monthlyTotals, monthlyPercentiles } from "@/lib/metrics/monthly";

const at = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 1000;
const NOW = at(2024, 10, 20);
const WINDOW_FROM = at(2023, 1, 1);
const WINDOW_TO = at(2024, 9, 30) + 86_400 - 1;

describe("monthlyTotals", () => {
  it("групує витрати по місяцях", () => {
    const txs = [
      { time: at(2024, 7, 5), amount: -1000 },
      { time: at(2024, 7, 20), amount: -500 },
      { time: at(2024, 8, 1), amount: -300 },
    ];
    expect(monthlyTotals(txs, WINDOW_FROM, WINDOW_TO)).toEqual([
      { month: "2024-07", expense: 1500 },
      { month: "2024-08", expense: 300 },
    ]);
  });

  it("ВИКЛЮЧАЄ місяць, що не повністю лежить у вікні (тягнув би P10 донизу)", () => {
    const txs = [
      { time: at(2024, 9, 10), amount: -1000 },
      { time: at(2024, 10, 3), amount: -50 },
    ];
    const out = monthlyTotals(txs, WINDOW_FROM, WINDOW_TO);
    expect(out.map((m) => m.month)).toEqual(["2024-09"]);
  });

  it("надходження ігнорує", () => {
    const txs = [
      { time: at(2024, 7, 5), amount: -1000 },
      { time: at(2024, 7, 6), amount: 50000 },
    ];
    expect(monthlyTotals(txs, WINDOW_FROM, WINDOW_TO)).toEqual([{ month: "2024-07", expense: 1000 }]);
  });

  it("порожньо → порожньо", () => {
    expect(monthlyTotals([], WINDOW_FROM, WINDOW_TO)).toEqual([]);
  });

  it("ВИКЛЮЧАЄ перший місяць вікна, якщо він покритий не з 1-го числа", () => {
    const txs = [
      { time: at(2024, 7, 20), amount: -1000 },
      { time: at(2024, 8, 1), amount: -300 },
      { time: at(2024, 9, 1), amount: -400 },
    ];
    const windowFrom = at(2024, 7, 15);
    const out = monthlyTotals(txs, windowFrom, WINDOW_TO);
    expect(out.map((m) => m.month)).toEqual(["2024-08", "2024-09"]);
  });

  it("НЕ виключає перший місяць, якщо вікно починається з 1-го числа", () => {
    const txs = [
      { time: at(2024, 7, 5), amount: -1000 },
      { time: at(2024, 8, 1), amount: -300 },
    ];
    const windowFrom = at(2024, 7, 1);
    expect(monthlyTotals(txs, windowFrom, WINDOW_TO).map((m) => m.month)).toEqual(["2024-07", "2024-08"]);
  });

  it("ВИКЛЮЧАЄ місяць, залишений частковим через стейл-синк (windowTo падає всередину місяця)", () => {
    const staleWindowTo = at(2026, 6, 20) + 86_400 - 1;
    const staleWindowFrom = at(2025, 6, 21);
    const txs = [
      { time: at(2026, 5, 10), amount: -1000 },
      { time: at(2026, 6, 5), amount: -300 },
      { time: at(2026, 6, 18), amount: -200 },
    ];
    const out = monthlyTotals(txs, staleWindowFrom, staleWindowTo);
    expect(out.map((m) => m.month)).toEqual(["2026-05"]);
  });
});

describe("monthlyPercentiles", () => {
  it("P10 < P50 < P90 на реальному розкиді", () => {
    const months = [
      { month: "2024-01", expense: 1000 },
      { month: "2024-02", expense: 2000 },
      { month: "2024-03", expense: 3000 },
      { month: "2024-04", expense: 4000 },
      { month: "2024-05", expense: 5000 },
      { month: "2024-06", expense: 9000 },
    ];
    const p = monthlyPercentiles(months)!;
    expect(p.p10).toBeLessThan(p.p50);
    expect(p.p50).toBeLessThan(p.p90);
    expect(p.p50).toBe(3500);
  });

  it("один місяць → усі перцентилі однакові", () => {
    const p = monthlyPercentiles([{ month: "2024-01", expense: 1000 }])!;
    expect(p).toEqual({ p10: 1000, p50: 1000, p90: 1000 });
  });

  it("порожньо → null", () => {
    expect(monthlyPercentiles([])).toBeNull();
  });
});
