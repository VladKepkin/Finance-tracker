import { describe, it, expect } from "vitest";
import {
  nextIncomeDate,
  incomePeriodEnd,
  incomePeriodStart,
  daysUntilIncome,
  isValidSchedule,
} from "@/lib/metrics/schedule";

const at = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 1000;

describe("nextIncomeDate", () => {
  it("щомісяця 1-го, сьогодні 25-те → 1-ше наступного", () => {
    expect(nextIncomeDate({ kind: "monthly", day: 1 }, at(2026, 3, 25))).toBe(at(2026, 4, 1));
  });

  it("сьогодні і є день доходу → сьогодні", () => {
    expect(nextIncomeDate({ kind: "monthly", day: 10 }, at(2026, 3, 10))).toBe(at(2026, 3, 10));
  });

  it("двічі на місяць [5,20], сьогодні 10-те → 20-те", () => {
    expect(nextIncomeDate({ kind: "semimonthly", days: [5, 20] }, at(2026, 3, 10))).toBe(
      at(2026, 3, 20)
    );
  });

  it("двічі на місяць [5,20], сьогодні 25-те → 5-те наступного", () => {
    expect(nextIncomeDate({ kind: "semimonthly", days: [5, 20] }, at(2026, 3, 25))).toBe(
      at(2026, 4, 5)
    );
  });

  it("порядок днів у semimonthly не важливий", () => {
    expect(nextIncomeDate({ kind: "semimonthly", days: [20, 5] }, at(2026, 3, 10))).toBe(
      at(2026, 3, 20)
    );
  });

  it("день 31 у лютому → останній день місяця", () => {
    expect(nextIncomeDate({ kind: "monthly", day: 31 }, at(2026, 2, 1))).toBe(at(2026, 2, 28));
  });
});

describe("incomePeriodEnd", () => {
  it("день перед доходом → сам дохід (без змін)", () => {
    expect(incomePeriodEnd({ kind: "monthly", day: 25 }, at(2026, 7, 24))).toBe(at(2026, 7, 25));
  });

  it("сам день доходу → період рестартує до НАСТУПНОГО доходу, не до сьогодні", () => {
    expect(incomePeriodEnd({ kind: "monthly", day: 25 }, at(2026, 7, 25))).toBe(at(2026, 8, 25));
  });

  it("день після доходу → наступний дохід (без змін)", () => {
    expect(incomePeriodEnd({ kind: "monthly", day: 25 }, at(2026, 7, 26))).toBe(at(2026, 8, 25));
  });
});

describe("incomePeriodStart", () => {
  it("сам день доходу (15-те) → початок ЦЬОГО ж дня, період рестартує, а не старий", () => {
    expect(incomePeriodStart({ kind: "monthly", day: 15 }, at(2026, 7, 15))).toBe(at(2026, 7, 15));
  });

  it("день після доходу (20-те) → початок лишається 15-м", () => {
    expect(incomePeriodStart({ kind: "monthly", day: 15 }, at(2026, 7, 20))).toBe(at(2026, 7, 15));
  });

  it("день перед доходом (14-те) → початок ще МИНУЛОГО 15-го", () => {
    expect(incomePeriodStart({ kind: "monthly", day: 15 }, at(2026, 7, 14))).toBe(at(2026, 6, 15));
  });

  it("день перед доходом наступного місяця (14-те серпня) → початок 15-го липня", () => {
    expect(incomePeriodStart({ kind: "monthly", day: 15 }, at(2026, 8, 14))).toBe(at(2026, 7, 15));
  });

  it("перехід через межу року: 1-ше січня, дохід 15-го → початок 15-го грудня минулого року", () => {
    expect(incomePeriodStart({ kind: "monthly", day: 15 }, at(2026, 1, 1))).toBe(at(2025, 12, 15));
  });

  it("двічі на місяць [5,20], сьогодні 10-те → початок 5-го", () => {
    expect(incomePeriodStart({ kind: "semimonthly", days: [5, 20] }, at(2026, 3, 10))).toBe(at(2026, 3, 5));
  });

  it("двічі на місяць [5,20], сьогодні 3-тє → початок 20-го МИНУЛОГО місяця", () => {
    expect(incomePeriodStart({ kind: "semimonthly", days: [5, 20] }, at(2026, 3, 3))).toBe(at(2026, 2, 20));
  });

  it("день 31 у лютому (клампінг) → 28-ме лютого", () => {
    expect(incomePeriodStart({ kind: "monthly", day: 31 }, at(2026, 2, 28))).toBe(at(2026, 2, 28));
  });

  it("мутація-перевірка: бере ОСТАННІЙ дохід ДО(=) fromTime, не найближчий будь-де", () => {
    const r = incomePeriodStart({ kind: "monthly", day: 15 }, at(2026, 7, 20));
    expect(r).toBe(at(2026, 7, 15));
    expect(r).not.toBe(at(2026, 8, 15));
  });

  it("властивість: [periodStart, periodEnd) завжди містить fromTime", () => {
    const schedule = { kind: "monthly" as const, day: 15 };
    for (let day = 1; day <= 28; day++) {
      const from = at(2026, 7, day);
      const start = incomePeriodStart(schedule, from);
      const end = incomePeriodEnd(schedule, from);
      expect(start).toBeLessThanOrEqual(from);
      expect(end).toBeGreaterThan(from);
      expect(start).toBeLessThan(end);
    }
  });
});

describe("daysUntilIncome", () => {
  it("дохід сьогодні → період рестартує до наступного доходу (31 день різниці + сьогодні = 32), не 1 — " +
    "сказати «1 день» означало б звеліти витратити весь баланс за день зарплати", () => {
    expect(daysUntilIncome({ kind: "monthly", day: 10 }, at(2026, 3, 10))).toBe(32);
  });

  it("дохід завтра → 2", () => {
    expect(daysUntilIncome({ kind: "monthly", day: 11 }, at(2026, 3, 10))).toBe(2);
  });

  it("з 25-го до 1-го (березень 31 день) → 8 днів", () => {
    expect(daysUntilIncome({ kind: "monthly", day: 1 }, at(2026, 3, 25))).toBe(8);
  });

  it("24/25/26 липня (day:25) — руками перевірений ланцюжок з бріфу", () => {
    expect(daysUntilIncome({ kind: "monthly", day: 25 }, at(2026, 7, 24))).toBe(2);
    expect(daysUntilIncome({ kind: "monthly", day: 25 }, at(2026, 7, 25))).toBe(32);
    expect(daysUntilIncome({ kind: "monthly", day: 25 }, at(2026, 7, 26))).toBe(31);
  });

  it("ніколи не повертає 0 (ділимо на нього в ліміті)", () => {
    expect(daysUntilIncome({ kind: "monthly", day: 25 }, at(2026, 7, 25))).toBeGreaterThan(0);
  });
});

describe("isValidSchedule", () => {
  it("приймає коректні", () => {
    expect(isValidSchedule({ kind: "monthly", day: 1 })).toBe(true);
    expect(isValidSchedule({ kind: "semimonthly", days: [5, 20] })).toBe(true);
  });

  it("відхиляє некоректні", () => {
    expect(isValidSchedule(null)).toBe(false);
    expect(isValidSchedule({ kind: "monthly", day: 0 })).toBe(false);
    expect(isValidSchedule({ kind: "monthly", day: 32 })).toBe(false);
    expect(isValidSchedule({ kind: "weekly", day: 1 })).toBe(false);
    expect(isValidSchedule({ kind: "semimonthly", days: [5] })).toBe(false);
    expect(isValidSchedule({ kind: "semimonthly", days: [5, 40] })).toBe(false);
  });
});
