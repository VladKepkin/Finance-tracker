import { describe, expect, it } from "vitest";
import { emergencyState } from "../../lib/metrics/savings";
import { goalsReserve } from "../../lib/metrics/goals";

describe("emergencyState", () => {
  it("реальний план → goal з правильним remainingBase і deadlineDays", () => {
    const s = emergencyState({
      plan: { emergencyMonths: 6, monthlyContribution: 500_000, spendablePct: null },
      savedBase: 2_200_000,
      medianMonthlyExpense: 1_000_000,
      fxUnavailableCurrency: null,
    });
    expect(s.reason).toBeNull();
    expect(s.target).toBe(6_000_000);
    expect(s.remaining).toBe(3_800_000);
    expect(s.goal).toEqual({
      name: "Подушка безпеки",
      remainingBase: 3_800_000,
      deadlineDays: 232,
    });
    expect(s.monthsToFull).toBeCloseTo(7.6, 5);
  });

  it("резерв із horizonDays відповідає ідентичності §4.2: goalsReserve на 31 день дає ~місячний внесок", () => {
    const s = emergencyState({
      plan: { emergencyMonths: 6, monthlyContribution: 500_000, spendablePct: null },
      savedBase: 2_200_000,
      medianMonthlyExpense: 1_000_000,
      fxUnavailableCurrency: null,
    });
    const r = goalsReserve([s.goal!], 31);
    expect(r.reserved).toBe(507_759);
    expect(r.reserved).toBeGreaterThan(500_000);
    expect(r.reserved).toBeLessThan(520_000);
  });

  it("медіана невідома (null) → reason M2 дослівно, goal null", () => {
    const s = emergencyState({
      plan: { emergencyMonths: 6, monthlyContribution: 500_000, spendablePct: null },
      savedBase: 0,
      medianMonthlyExpense: null,
      fxUnavailableCurrency: null,
    });
    expect(s.goal).toBeNull();
    expect(s.reason).toBe("Замало даних — потрібно щонайменше 3 повні місяці.");
  });

  it("медіана <= 0 → та сама причина M2, не якась своя", () => {
    const s = emergencyState({
      plan: { emergencyMonths: 6, monthlyContribution: 500_000, spendablePct: null },
      savedBase: 0,
      medianMonthlyExpense: 0,
      fxUnavailableCurrency: null,
    });
    expect(s.goal).toBeNull();
    expect(s.reason).toBe("Замало даних — потрібно щонайменше 3 повні місяці.");
  });

  it("emergencyMonths не задано (null) → причина про місяці, не про темп чи медіану", () => {
    const s = emergencyState({
      plan: { emergencyMonths: null, monthlyContribution: 500_000, spendablePct: null },
      savedBase: 0,
      medianMonthlyExpense: 1_000_000,
      fxUnavailableCurrency: null,
    });
    expect(s.goal).toBeNull();
    expect(s.reason).toBe("Скажи, на скільки місяців хочеш подушку");
  });

  it("emergencyMonths <= 0 → та сама причина про місяці", () => {
    const s = emergencyState({
      plan: { emergencyMonths: 0, monthlyContribution: 500_000, spendablePct: null },
      savedBase: 0,
      medianMonthlyExpense: 1_000_000,
      fxUnavailableCurrency: null,
    });
    expect(s.goal).toBeNull();
    expect(s.reason).toBe("Скажи, на скільки місяців хочеш подушку");
  });

  it("monthlyContribution = 0 → не Infinity, goal null, причина про темп", () => {
    const s = emergencyState({
      plan: { emergencyMonths: 6, monthlyContribution: 0, spendablePct: null },
      savedBase: 2_200_000,
      medianMonthlyExpense: 1_000_000,
      fxUnavailableCurrency: null,
    });
    expect(s.goal).toBeNull();
    expect(s.remaining).toBe(3_800_000);
    expect(s.monthsToFull).toBeNull();
    expect(s.reason).toBe(
      "Скажи, скільки відкладаєш щомісяця — інакше не знаю, за який час її закрити"
    );
  });

  it("monthlyContribution = null → та сама причина про темп, не 'немає даних'", () => {
    const s = emergencyState({
      plan: { emergencyMonths: 6, monthlyContribution: null, spendablePct: null },
      savedBase: 2_200_000,
      medianMonthlyExpense: 1_000_000,
      fxUnavailableCurrency: null,
    });
    expect(s.goal).toBeNull();
    expect(s.reason).toBe(
      "Скажи, скільки відкладаєш щомісяця — інакше не знаю, за який час її закрити"
    );
  });

  it("monthlyContribution від'ємний → так само гейт, а не NaN/негативний horizonDays", () => {
    const s = emergencyState({
      plan: { emergencyMonths: 6, monthlyContribution: -100, spendablePct: null },
      savedBase: 2_200_000,
      medianMonthlyExpense: 1_000_000,
      fxUnavailableCurrency: null,
    });
    expect(s.goal).toBeNull();
    expect(s.reason).toBe(
      "Скажи, скільки відкладаєш щомісяця — інакше не знаю, за який час її закрити"
    );
  });

  it("подушка вже повна (saved >= target) → goal null, reason 'повна' — дозвіл, а не тиша", () => {
    const s = emergencyState({
      plan: { emergencyMonths: 6, monthlyContribution: 500_000, spendablePct: null },
      savedBase: 10_000_000,
      medianMonthlyExpense: 1_000_000,
      fxUnavailableCurrency: null,
    });
    expect(s.target).toBe(6_000_000);
    expect(s.remaining).toBe(0);
    expect(s.monthsToFull).toBe(0);
    expect(s.goal).toBeNull();
    expect(s.reason).toBe("Подушка повна");
  });

  it("повна навіть без monthlyContribution — повнота не залежить від темпу", () => {
    const s = emergencyState({
      plan: { emergencyMonths: 6, monthlyContribution: null, spendablePct: null },
      savedBase: 10_000_000,
      medianMonthlyExpense: 1_000_000,
      fxUnavailableCurrency: null,
    });
    expect(s.goal).toBeNull();
    expect(s.reason).toBe("Подушка повна");
  });

  it("рівно на межі (saved === target) → теж повна, не goal з remainingBase 0", () => {
    const s = emergencyState({
      plan: { emergencyMonths: 6, monthlyContribution: 500_000, spendablePct: null },
      savedBase: 6_000_000,
      medianMonthlyExpense: 1_000_000,
      fxUnavailableCurrency: null,
    });
    expect(s.remaining).toBe(0);
    expect(s.goal).toBeNull();
    expect(s.reason).toBe("Подушка повна");
  });

  it("medianMonthlyExpense = NaN → пошкоджені дані про витрати, не 'немає даних'", () => {
    const s = emergencyState({
      plan: { emergencyMonths: 6, monthlyContribution: 500_000, spendablePct: null },
      savedBase: 0,
      medianMonthlyExpense: NaN,
      fxUnavailableCurrency: null,
    });
    expect(s.goal).toBeNull();
    expect(s.reason).toBe("Пошкоджені дані про витрати — онови дані вручну.");
    expect(s.remaining).toBeNull();
  });

  it("medianMonthlyExpense = Infinity → пошкоджені дані про витрати", () => {
    const s = emergencyState({
      plan: { emergencyMonths: 6, monthlyContribution: 500_000, spendablePct: null },
      savedBase: 0,
      medianMonthlyExpense: Infinity,
      fxUnavailableCurrency: null,
    });
    expect(s.goal).toBeNull();
    expect(s.reason).toBe("Пошкоджені дані про витрати — онови дані вручну.");
  });

  it("emergencyMonths = NaN → пошкоджені дані плану (місяці)", () => {
    const s = emergencyState({
      plan: { emergencyMonths: NaN, monthlyContribution: 500_000, spendablePct: null },
      savedBase: 0,
      medianMonthlyExpense: 1_000_000,
      fxUnavailableCurrency: null,
    });
    expect(s.goal).toBeNull();
    expect(s.reason).toBe("Пошкоджені дані плану (кількість місяців) — онови дані вручну.");
  });

  it("emergencyMonths = Infinity → пошкоджені дані плану (місяці)", () => {
    const s = emergencyState({
      plan: { emergencyMonths: Infinity, monthlyContribution: 500_000, spendablePct: null },
      savedBase: 0,
      medianMonthlyExpense: 1_000_000,
      fxUnavailableCurrency: null,
    });
    expect(s.goal).toBeNull();
    expect(s.reason).toBe("Пошкоджені дані плану (кількість місяців) — онови дані вручну.");
  });

  it("monthlyContribution = NaN → пошкоджені дані плану (внесок), не NaN horizonDays", () => {
    const s = emergencyState({
      plan: { emergencyMonths: 6, monthlyContribution: NaN, spendablePct: null },
      savedBase: 2_200_000,
      medianMonthlyExpense: 1_000_000,
      fxUnavailableCurrency: null,
    });
    expect(s.goal).toBeNull();
    expect(s.reason).toBe("Пошкоджені дані плану (щомісячний внесок) — онови дані вручну.");
  });

  it("monthlyContribution = Infinity → пошкоджені дані плану (внесок), не 'Дата минула' через deadlineDays=0", () => {
    const s = emergencyState({
      plan: { emergencyMonths: 6, monthlyContribution: Infinity, spendablePct: null },
      savedBase: 2_200_000,
      medianMonthlyExpense: 1_000_000,
      fxUnavailableCurrency: null,
    });
    expect(s.goal).toBeNull();
    expect(s.reason).toBe("Пошкоджені дані плану (щомісячний внесок) — онови дані вручну.");
  });

  it("savedBase = NaN → збережена сума пошкоджена, не NaN remaining", () => {
    const s = emergencyState({
      plan: { emergencyMonths: 6, monthlyContribution: 500_000, spendablePct: null },
      savedBase: NaN,
      medianMonthlyExpense: 1_000_000,
      fxUnavailableCurrency: null,
    });
    expect(s.goal).toBeNull();
    expect(s.reason).toBe("Збережена сума подушки пошкоджена — онови дані вручну.");
    expect(s.remaining).toBeNull();
  });

  it("savedBase = Infinity → збережена сума пошкоджена", () => {
    const s = emergencyState({
      plan: { emergencyMonths: 6, monthlyContribution: 500_000, spendablePct: null },
      savedBase: Infinity,
      medianMonthlyExpense: 1_000_000,
      fxUnavailableCurrency: null,
    });
    expect(s.goal).toBeNull();
    expect(s.reason).toBe("Збережена сума подушки пошкоджена — онови дані вручну.");
  });

  it("медіана null через невідомий курс → причина про курс, а не 'замало даних'", () => {
    const s = emergencyState({
      plan: { emergencyMonths: 6, monthlyContribution: 500_000, spendablePct: null },
      savedBase: 0,
      medianMonthlyExpense: null,
      fxUnavailableCurrency: 978,
    });
    expect(s.goal).toBeNull();
    expect(s.reason).toBe("Немає курсу для EUR — подушку порахувати не можна.");
  });

  it("медіана null і немає курсу теж null (справжня нестача історії) → лишається М2-причина", () => {
    const s = emergencyState({
      plan: { emergencyMonths: 6, monthlyContribution: 500_000, spendablePct: null },
      savedBase: 0,
      medianMonthlyExpense: null,
      fxUnavailableCurrency: null,
    });
    expect(s.reason).toBe("Замало даних — потрібно щонайменше 3 повні місяці.");
  });

  it("медіана відома (не null) навіть при переданій fxUnavailableCurrency → курс не заважає порахувати ціль", () => {
    const s = emergencyState({
      plan: { emergencyMonths: 6, monthlyContribution: 500_000, spendablePct: null },
      savedBase: 2_200_000,
      medianMonthlyExpense: 1_000_000,
      fxUnavailableCurrency: 978,
    });
    expect(s.reason).toBeNull();
    expect(s.target).toBe(6_000_000);
  });

  it("goal !== null ⟺ reason === null — перевірка інваріанту на всіх кейсах", () => {
    const cases = [
      { plan: { emergencyMonths: 6, monthlyContribution: 500_000, spendablePct: null }, savedBase: 2_200_000, medianMonthlyExpense: 1_000_000, fxUnavailableCurrency: null },
      { plan: { emergencyMonths: 6, monthlyContribution: 500_000, spendablePct: null }, savedBase: 0, medianMonthlyExpense: null, fxUnavailableCurrency: null },
      { plan: { emergencyMonths: null, monthlyContribution: 500_000, spendablePct: null }, savedBase: 0, medianMonthlyExpense: 1_000_000, fxUnavailableCurrency: null },
      { plan: { emergencyMonths: 6, monthlyContribution: 0, spendablePct: null }, savedBase: 0, medianMonthlyExpense: 1_000_000, fxUnavailableCurrency: null },
      { plan: { emergencyMonths: 6, monthlyContribution: 500_000, spendablePct: null }, savedBase: 10_000_000, medianMonthlyExpense: 1_000_000, fxUnavailableCurrency: null },
    ];
    for (const c of cases) {
      const s = emergencyState(c);
      expect(s.goal !== null).toBe(s.reason === null);
    }
  });
});
