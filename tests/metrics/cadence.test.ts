import { describe, it, expect } from "vitest";
import { nextDue, occurrencesBetween } from "@/lib/metrics/cadence";

const at = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 1000;

describe("nextDue monthly", () => {
  it("якір попереду в цьому місяці", () => {
    expect(nextDue("monthly", 20, at(2026, 3, 10))).toBe(at(2026, 3, 20));
  });

  it("якір уже минув → наступний місяць", () => {
    expect(nextDue("monthly", 5, at(2026, 3, 10))).toBe(at(2026, 4, 5));
  });

  it("сьогодні і є якір → сьогодні", () => {
    expect(nextDue("monthly", 10, at(2026, 3, 10))).toBe(at(2026, 3, 10));
  });

  it("якір 31 у лютому → останній день місяця (28)", () => {
    expect(nextDue("monthly", 31, at(2026, 2, 1))).toBe(at(2026, 2, 28));
  });

  it("якір 31 у високосному лютому → 29", () => {
    expect(nextDue("monthly", 31, at(2024, 2, 1))).toBe(at(2024, 2, 29));
  });

  it("якір 31 у квітні (30 днів) → 30", () => {
    expect(nextDue("monthly", 31, at(2026, 4, 1))).toBe(at(2026, 4, 30));
  });

  it("перехід через грудень → січень наступного року", () => {
    expect(nextDue("monthly", 5, at(2026, 12, 10))).toBe(at(2027, 1, 5));
  });
});

describe("nextDue weekly", () => {
  it("2026-03-10 — вівторок (2); якір середа (3) → 11-те", () => {
    expect(nextDue("weekly", 3, at(2026, 3, 10))).toBe(at(2026, 3, 11));
  });

  it("якір уже минув цього тижня → наступний тиждень", () => {
    expect(nextDue("weekly", 1, at(2026, 3, 10))).toBe(at(2026, 3, 16));
  });

  it("сьогодні і є якір → сьогодні", () => {
    expect(nextDue("weekly", 2, at(2026, 3, 10))).toBe(at(2026, 3, 10));
  });
});

describe("occurrencesBetween", () => {
  it("порожній діапазон (to < from) → 0", () => {
    expect(occurrencesBetween("monthly", 5, at(2026, 3, 10), at(2026, 3, 1))).toBe(0);
  });

  it("місячний, 45 днів → 2 рази", () => {
    expect(occurrencesBetween("monthly", 20, at(2026, 3, 10), at(2026, 4, 24))).toBe(2);
  });

  it("місячний, вікно без якоря → 0", () => {
    expect(occurrencesBetween("monthly", 20, at(2026, 3, 21), at(2026, 4, 19))).toBe(0);
  });

  it("якір рівно на межі from → рахується", () => {
    expect(occurrencesBetween("monthly", 10, at(2026, 3, 10), at(2026, 3, 10))).toBe(1);
  });

  it("якір рівно на межі to → рахується", () => {
    expect(occurrencesBetween("monthly", 20, at(2026, 3, 1), at(2026, 3, 20))).toBe(1);
  });

  it("тижневий за 3 тижні → 3", () => {
    expect(occurrencesBetween("weekly", 3, at(2026, 3, 10), at(2026, 3, 30))).toBe(3);
  });
});
