import { describe, it, expect } from "vitest";
import { quantile, median, mad } from "@/lib/metrics/stats";

describe("quantile", () => {
  it("порожній масив → null", () => {
    expect(quantile([], 0.5)).toBeNull();
  });

  it("один елемент → він сам за будь-якого p", () => {
    expect(quantile([7], 0)).toBe(7);
    expect(quantile([7], 0.5)).toBe(7);
    expect(quantile([7], 1)).toBe(7);
  });

  it("P0 і P100 — це min і max", () => {
    expect(quantile([3, 1, 4, 1, 5], 0)).toBe(1);
    expect(quantile([3, 1, 4, 1, 5], 1)).toBe(5);
  });

  it("інтерполює між точками", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75);
  });

  it("не мутує вхідний масив", () => {
    const input = [3, 1, 2];
    quantile(input, 0.5);
    expect(input).toEqual([3, 1, 2]);
  });
});

describe("median", () => {
  it("непарна довжина → середній елемент", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it("парна довжина → середнє двох центральних", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("порожній → null", () => {
    expect(median([])).toBeNull();
  });

  it("стійка до викиду (на відміну від середнього)", () => {
    const days = [...Array(30).fill(500), 40000];
    expect(median(days)).toBe(500);
  });
});

describe("mad", () => {
  it("усі однакові → 0", () => {
    expect(mad([5, 5, 5, 5])).toBe(0);
  });

  it("відомий приклад", () => {
    expect(mad([1, 2, 3, 4, 5])).toBe(1);
  });

  it("порожній → null", () => {
    expect(mad([])).toBeNull();
  });
});
