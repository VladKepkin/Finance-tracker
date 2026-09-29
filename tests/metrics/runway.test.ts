import { describe, it, expect } from "vitest";
import { computeRunway } from "@/lib/metrics/runway";

const NOW = Date.UTC(2024, 6, 16) / 1000;

describe("computeRunway", () => {
  it("дохід перекриває найгірший місяць → нескінченно", () => {
    const r = computeRunway({ liquid: 100_000, monthlyIncome: 50_000, monthlyExpenseP90: 40_000, nowSeconds: NOW });
    expect(r.infinite).toBe(true);
    expect(r.days).toBeNull();
    expect(r.exhaustDate).toBeNull();
  });

  it("дохід рівно дорівнює P90 → теж нескінченно", () => {
    const r = computeRunway({ liquid: 100_000, monthlyIncome: 40_000, monthlyExpenseP90: 40_000, nowSeconds: NOW });
    expect(r.infinite).toBe(true);
  });

  it("проїдання запасів → days і дата вичерпання", () => {
    const r = computeRunway({ liquid: 60_000, monthlyIncome: 10_000, monthlyExpenseP90: 40_000, nowSeconds: NOW });
    expect(r.infinite).toBe(false);
    expect(r.days).toBe(60);
    expect(r.exhaustDate).toBe("2024-09-14");
  });

  it("нуль ліквідності → 0 днів, не нескінченність", () => {
    const r = computeRunway({ liquid: 0, monthlyIncome: 0, monthlyExpenseP90: 30_000, nowSeconds: NOW });
    expect(r.days).toBe(0);
    expect(r.infinite).toBe(false);
  });
});
