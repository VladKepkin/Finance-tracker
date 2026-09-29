import type { AllowanceGoal } from "./goals";
import { currencyMeta } from "@/lib/monobank";

export interface SavingsPlan {
  emergencyMonths: number | null;
  monthlyContribution: number | null;
  spendablePct: number | null;
}

export const SAVINGS_RESERVE_GOAL_NAME = "Заощадження з цієї зарплати";

export interface EmergencyState {
  target: number | null;
  saved: number;
  remaining: number | null;
  monthsToFull: number | null;
  goal: AllowanceGoal | null;
  reason: string | null;
}

const DAYS_PER_MONTH = 30.44;

export function emergencyState(input: {
  plan: SavingsPlan;
  savedBase: number;
  medianMonthlyExpense: number | null;
  fxUnavailableCurrency: number | null;
}): EmergencyState {
  const { plan, savedBase, medianMonthlyExpense, fxUnavailableCurrency } = input;

  if (!Number.isFinite(savedBase)) {
    return {
      target: null,
      saved: savedBase,
      remaining: null,
      monthsToFull: null,
      goal: null,
      reason: "Збережена сума подушки пошкоджена — онови дані вручну.",
    };
  }

  if (medianMonthlyExpense !== null && !Number.isFinite(medianMonthlyExpense)) {
    return {
      target: null,
      saved: savedBase,
      remaining: null,
      monthsToFull: null,
      goal: null,
      reason: "Пошкоджені дані про витрати — онови дані вручну.",
    };
  }

  if (plan.emergencyMonths !== null && !Number.isFinite(plan.emergencyMonths)) {
    return {
      target: null,
      saved: savedBase,
      remaining: null,
      monthsToFull: null,
      goal: null,
      reason: "Пошкоджені дані плану (кількість місяців) — онови дані вручну.",
    };
  }

  if (plan.monthlyContribution !== null && !Number.isFinite(plan.monthlyContribution)) {
    return {
      target: null,
      saved: savedBase,
      remaining: null,
      monthsToFull: null,
      goal: null,
      reason: "Пошкоджені дані плану (щомісячний внесок) — онови дані вручну.",
    };
  }

  if (medianMonthlyExpense === null && fxUnavailableCurrency !== null) {
    return {
      target: null,
      saved: savedBase,
      remaining: null,
      monthsToFull: null,
      goal: null,
      reason: `Немає курсу для ${currencyMeta(fxUnavailableCurrency).code} — подушку порахувати не можна.`,
    };
  }

  if (medianMonthlyExpense === null || medianMonthlyExpense <= 0) {
    return {
      target: null,
      saved: savedBase,
      remaining: null,
      monthsToFull: null,
      goal: null,
      reason: "Замало даних — потрібно щонайменше 3 повні місяці.",
    };
  }

  if (plan.emergencyMonths === null || plan.emergencyMonths <= 0) {
    return {
      target: null,
      saved: savedBase,
      remaining: null,
      monthsToFull: null,
      goal: null,
      reason: "Скажи, на скільки місяців хочеш подушку",
    };
  }

  const target = plan.emergencyMonths * medianMonthlyExpense;
  const remaining = Math.max(0, target - savedBase);

  if (remaining === 0) {
    return {
      target,
      saved: savedBase,
      remaining: 0,
      monthsToFull: 0,
      goal: null,
      reason: "Подушка повна",
    };
  }

  if (plan.monthlyContribution === null || plan.monthlyContribution <= 0) {
    return {
      target,
      saved: savedBase,
      remaining,
      monthsToFull: null,
      goal: null,
      reason: "Скажи, скільки відкладаєш щомісяця — інакше не знаю, за який час її закрити",
    };
  }

  const horizonDays = Math.ceil((remaining / plan.monthlyContribution) * DAYS_PER_MONTH);
  const monthsToFull = remaining / plan.monthlyContribution;

  return {
    target,
    saved: savedBase,
    remaining,
    monthsToFull,
    goal: { name: "Подушка безпеки", remainingBase: remaining, deadlineDays: horizonDays },
    reason: null,
  };
}
