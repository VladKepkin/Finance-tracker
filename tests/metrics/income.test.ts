import { describe, it, expect } from "vitest";
import { wishCalc, workHours } from "@/lib/metrics/income";

describe("wishCalc", () => {
  it("прогрес і місяці до покупки", () => {
    const c = wishCalc(100_000, 25_000, 25_000, 100_000, null);
    expect(c.progress).toBe(0.25);
    expect(c.monthsToAfford).toBe(3);
    expect(c.workMonths).toBe(1);
  });

  it("вистачає грошей → прогрес 1", () => {
    expect(wishCalc(100_000, 200_000, 1000, 100_000, null).progress).toBe(1);
  });

  it("нічого не відкладається → monthsToAfford null, а не нескінченність", () => {
    expect(wishCalc(100_000, 0, 0, 100_000, null).monthsToAfford).toBeNull();
  });

  it("курс невідомий (liquid=null) → progress і monthsToAfford null, workMonths лишається", () => {
    const c = wishCalc(100_000, null, 25_000, 100_000, null);
    expect(c.progress).toBeNull();
    expect(c.monthsToAfford).toBeNull();
    expect(c.workMonths).toBe(1);
  });

  it("є ставка за годину → workHours рахується незалежно від workMonths", () => {
    const c = wishCalc(100_000, null, null, null, 1_000);
    expect(c.workMonths).toBeNull();
    expect(c.workHours).toBe(100);
  });

  it("немає ставки за годину → workHours null, навіть якщо workMonths є", () => {
    const c = wishCalc(100_000, null, null, 100_000, null);
    expect(c.workMonths).toBe(1);
    expect(c.workHours).toBeNull();
  });
});

describe("workHours", () => {
  it("ціна ÷ ставка за годину", () => {
    expect(workHours(100_000, 1_000)).toBe(100);
  });

  it("ставка null (немає графіка чи періоду) → null, а не 0", () => {
    expect(workHours(100_000, null)).toBeNull();
  });

  it("ставка 0 чи від'ємна → null, а не Infinity/від'ємні години", () => {
    expect(workHours(100_000, 0)).toBeNull();
    expect(workHours(100_000, -500)).toBeNull();
  });
});
