import { describe, expect, it } from "vitest";
import {
  SALARY_T,
  workingHours,
  monthlyIncomeFromSalaries,
  hourlyRate,
  isValidWorkSchedule,
  type WorkSchedule,
  type SalaryRecord,
} from "../../lib/metrics/salary";

const schedule: WorkSchedule = { hoursPerDay: 8, weekdays: [1, 2, 3, 4, 5] };

function salary(id: number, paidOn: string, amount: number): SalaryRecord {
  return { id, paidOn, amount, currency: 980 };
}

describe("workingHours", () => {
  it("межа: одна доба-будній день включно", () => {
    expect(workingHours("2026-07-13", "2026-07-13", schedule)).toBe(8);
  });

  it("обидва кінці включно: пн-пт → 5 днів × 8 год", () => {
    expect(workingHours("2026-07-13", "2026-07-17", schedule)).toBe(40);
  });

  it("вихідний день у діапазоні не рахується", () => {
    expect(workingHours("2026-07-18", "2026-07-19", schedule)).toBe(0);
  });

  it("тиждень цілком: пн-нд → ті самі 5 робочих днів", () => {
    expect(workingHours("2026-07-13", "2026-07-19", schedule)).toBe(40);
  });

  it("to раніше за from → 0, не від'ємне число", () => {
    expect(workingHours("2026-07-17", "2026-07-13", schedule)).toBe(0);
  });

  it("некоректні дати → 0", () => {
    expect(workingHours("не-дата", "2026-07-17", schedule)).toBe(0);
    expect(workingHours("2026-07-13", "2026-13-40", schedule)).toBe(0);
  });

  it("зіпсований графік (NaN/не-ціле/0/від'ємне hoursPerDay) → 0, не NaN", () => {
    expect(workingHours("2026-07-13", "2026-07-17", { hoursPerDay: NaN, weekdays: [1] })).toBe(0);
    expect(workingHours("2026-07-13", "2026-07-17", { hoursPerDay: 8.5, weekdays: [1] })).toBe(0);
    expect(workingHours("2026-07-13", "2026-07-17", { hoursPerDay: 0, weekdays: [1] })).toBe(0);
    expect(workingHours("2026-07-13", "2026-07-17", { hoursPerDay: -8, weekdays: [1] })).toBe(0);
  });

  it("порожній weekdays → 0", () => {
    expect(workingHours("2026-07-13", "2026-07-17", { hoursPerDay: 8, weekdays: [] })).toBe(0);
  });
});

describe("monthlyIncomeFromSalaries", () => {
  it("0 записів → insufficient, value null", () => {
    const r = monthlyIncomeFromSalaries([]);
    expect(r).toEqual({ value: null, confidence: "insufficient" });
  });

  it("1 запис (SALARY_T.low=1) → confidence low, значення саме воно", () => {
    const r = monthlyIncomeFromSalaries([22_000_00]);
    expect(r.confidence).toBe("low");
    expect(r.value).toBe(22_000_00);
  });

  it("3 записи (SALARY_T.high=3) → confidence high", () => {
    const r = monthlyIncomeFromSalaries([20_000_00, 21_000_00, 22_000_00]);
    expect(r.confidence).toBe("high");
  });

  it("медіана, не середнє: один бонус не переписує картину", () => {
    const r = monthlyIncomeFromSalaries([20_000_00, 21_000_00, 200_000_00]);
    expect(r.value).toBe(21_000_00);
  });
});

describe("hourlyRate", () => {
  it("немає жодної зарплати → null, причина", () => {
    const r = hourlyRate({ salaries: [], schedule });
    expect(r.value).toBeNull();
    expect(r.reason).toMatch(/Додай хоч одну зарплату/);
  });

  it("немає графіка → null, окрема причина", () => {
    const r = hourlyRate({ salaries: [salary(1, "2026-06-13", 20_000_00)], schedule: null });
    expect(r.value).toBeNull();
    expect(r.reason).toMatch(/графіка/);
  });

  it("перша зарплата (єдина) → null, причина «одна точка не дає періоду»", () => {
    const r = hourlyRate({ salaries: [salary(1, "2026-06-13", 20_000_00)], schedule });
    expect(r.value).toBeNull();
    expect(r.reason).toMatch(/одна точка не дає періоду/i);
  });

  it("дві зарплати поспіль (місяць) → рахує ставку за робочі години періоду", () => {
    const hours = workingHours("2026-06-16", "2026-07-15", schedule);
    const r = hourlyRate({
      salaries: [salary(1, "2026-06-15", 20_000_00), salary(2, "2026-07-15", 20_000_00)],
      schedule,
    });
    expect(r.reason).toBeNull();
    expect(r.value).toBeCloseTo(20_000_00 / hours);
  });

  it("зарплати в неправильному хронологічному порядку у вхідному масиві — сортує сам", () => {
    const forward = hourlyRate({
      salaries: [salary(1, "2026-06-15", 20_000_00), salary(2, "2026-07-15", 21_000_00)],
      schedule,
    });
    const reversed = hourlyRate({
      salaries: [salary(2, "2026-07-15", 21_000_00), salary(1, "2026-06-15", 20_000_00)],
      schedule,
    });
    expect(reversed).toEqual(forward);
  });

  it("дві зарплати в один день → нульовий період → null, окрема причина", () => {
    const r = hourlyRate({
      salaries: [salary(1, "2026-07-15", 20_000_00), salary(2, "2026-07-15", 21_000_00)],
      schedule,
    });
    expect(r.value).toBeNull();
    expect(r.reason).not.toMatch(/одна точка не дає періоду/i);
  });

  it("розрив у кілька місяців — рахує більший період, більше годин", () => {
    const r = hourlyRate({
      salaries: [salary(1, "2026-01-15", 20_000_00), salary(2, "2026-07-15", 20_000_00)],
      schedule,
    });
    expect(r.reason).toBeNull();
    expect(r.value).toBeGreaterThan(0);
    expect(r.value).toBeLessThan(20_000_00 / workingHours("2026-06-16", "2026-07-15", schedule));
  });

  it("зарплата, датована в майбутньому — це просто дата, рахує без спротиву (годинника тут немає)", () => {
    const r = hourlyRate({
      salaries: [salary(1, "2026-06-15", 20_000_00), salary(2, "2099-07-15", 21_000_00)],
      schedule,
    });
    expect(r.reason).toBeNull();
    expect(r.value).toBeGreaterThan(0);
  });
});

describe("isValidWorkSchedule", () => {
  it("валідний графік приймається", () => {
    expect(isValidWorkSchedule({ hoursPerDay: 8, weekdays: [1, 2, 3, 4, 5] })).toBe(true);
  });

  it("межі hoursPerDay: 1 і 24 приймаються, 0 і 25 — ні", () => {
    expect(isValidWorkSchedule({ hoursPerDay: 1, weekdays: [1] })).toBe(true);
    expect(isValidWorkSchedule({ hoursPerDay: 24, weekdays: [1] })).toBe(true);
    expect(isValidWorkSchedule({ hoursPerDay: 0, weekdays: [1] })).toBe(false);
    expect(isValidWorkSchedule({ hoursPerDay: 25, weekdays: [1] })).toBe(false);
  });

  it.each([NaN, Infinity, -Infinity, "8", 3.5, null, undefined])(
    "hoursPerDay=%p відхиляється (NaN/Infinity не проходять x<=0)",
    (bad) => {
      expect(isValidWorkSchedule({ hoursPerDay: bad, weekdays: [1] })).toBe(false);
    }
  );

  it("weekdays: межі 0 і 6 приймаються, 7 і -1 — ні", () => {
    expect(isValidWorkSchedule({ hoursPerDay: 8, weekdays: [0, 6] })).toBe(true);
    expect(isValidWorkSchedule({ hoursPerDay: 8, weekdays: [7] })).toBe(false);
    expect(isValidWorkSchedule({ hoursPerDay: 8, weekdays: [-1] })).toBe(false);
  });

  it("weekdays: порожній масив, дублікати, не-масив відхиляються", () => {
    expect(isValidWorkSchedule({ hoursPerDay: 8, weekdays: [] })).toBe(false);
    expect(isValidWorkSchedule({ hoursPerDay: 8, weekdays: [1, 1] })).toBe(false);
    expect(isValidWorkSchedule({ hoursPerDay: 8, weekdays: "1" })).toBe(false);
  });

  it("не-об'єкт, null, масив відхиляються", () => {
    expect(isValidWorkSchedule(null)).toBe(false);
    expect(isValidWorkSchedule(undefined)).toBe(false);
    expect(isValidWorkSchedule(42)).toBe(false);
    expect(isValidWorkSchedule([1, 2])).toBe(false);
  });
});

describe("SALARY_T", () => {
  it("окремий поріг від MONTHLY_T: low=1, high=3", () => {
    expect(SALARY_T).toEqual({ low: 1, high: 3 });
  });
});
