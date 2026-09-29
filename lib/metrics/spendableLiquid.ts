export interface SpendableLiquid {
  value: number | null;
  limitedBy: "balance" | "budget" | null;
  salaryBudget: number | null;
  reason: string | null;
}

export function spendableLiquid(input: {
  actualLiquid: number;
  monthlyIncome: number | null;
  spendablePct: number | null;
}): SpendableLiquid {
  const { actualLiquid, monthlyIncome, spendablePct } = input;

  if (!Number.isFinite(actualLiquid)) {
    return { value: null, limitedBy: null, salaryBudget: null, reason: "Залишок пошкоджений — онови дані вручну." };
  }

  if (spendablePct === null) {
    return { value: actualLiquid, limitedBy: "balance", salaryBudget: null, reason: null };
  }

  if (!Number.isFinite(spendablePct)) {
    return {
      value: null,
      limitedBy: null,
      salaryBudget: null,
      reason: "Пошкоджений відсоток від зарплати — онови дані вручну.",
    };
  }

  if (monthlyIncome === null) {
    return {
      value: null,
      limitedBy: null,
      salaryBudget: null,
      reason: "Додай зарплату — інакше % від неї порахувати нічим.",
    };
  }

  if (!Number.isFinite(monthlyIncome)) {
    return { value: null, limitedBy: null, salaryBudget: null, reason: "Пошкоджений дохід — онови дані вручну." };
  }

  const salaryBudget = (monthlyIncome * spendablePct) / 100;

  if (actualLiquid <= salaryBudget) {
    return { value: actualLiquid, limitedBy: "balance", salaryBudget, reason: null };
  }
  return { value: salaryBudget, limitedBy: "budget", salaryBudget, reason: null };
}

export interface TomorrowForecast {
  perDay: number | null;
  reason: string | null;
}

export function tomorrowForecast(input: {
  available: number;
  daysToIncome: number;
}): TomorrowForecast {
  const { available, daysToIncome } = input;

  if (!Number.isFinite(available) || !Number.isFinite(daysToIncome)) {
    return { perDay: null, reason: "Пошкоджені дані — прогноз на завтра порахувати не можна." };
  }

  if (daysToIncome === 1) {
    return { perDay: null, reason: "Завтра зарплата — прогнозу на завтра в цьому періоді немає." };
  }

  if (daysToIncome < 1) {
    return { perDay: null, reason: "Дні до доходу пошкоджені — прогноз порахувати не можна." };
  }

  if (available < 0) {
    return { perDay: 0, reason: "Зобов'язання й буфер перевищують залишок — завтра ліміт 0." };
  }

  return { perDay: Math.floor(available / (daysToIncome - 1)), reason: null };
}
