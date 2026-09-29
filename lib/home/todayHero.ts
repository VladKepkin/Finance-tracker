import { currencyMeta } from "@/lib/monobank";
import { spendGauge } from "@/lib/metrics/spendGauge";
import type { Allowance } from "@/lib/metrics/allowance";

export type HeroAction = "salary" | "schedule" | null;

export type TodayHero =
  | { kind: "unknown"; reason: string }
  | { kind: "loading"; spent: number }
  | { kind: "spentOnly"; spent: number; reason: string; action: HeroAction }
  | {
      kind: "within";
      spent: number;
      perDay: number;
      remaining: number;
      ratio: number | null;
      daysToIncome: number;
      periodEnd: number;
    }
  | { kind: "over"; spent: number; perDay: number; overBy: number; daysToIncome: number; periodEnd: number };

export function todayHero(input: {
  spentToday: number | null;
  spentTodayFxUnavailable: number | null;
  allowance: Allowance | null;
  allowanceLoading: boolean;
  allowanceError: string | null;
  fxUnavailableCurrency: number | null;
  spendableReason: string | null;
}): TodayHero {
  const { spentToday, allowance } = input;
  if (input.spentTodayFxUnavailable !== null) {
    return {
      kind: "unknown",
      reason: `Немає курсу для ${currencyMeta(input.spentTodayFxUnavailable).code} — витрату сьогодні порахувати не можна.`,
    };
  }
  if (spentToday === null) {
    return { kind: "unknown", reason: "Витрату сьогодні порахувати не можна." };
  }
  if (input.allowanceLoading) return { kind: "loading", spent: spentToday };
  if (input.allowanceError !== null) {
    return {
      kind: "spentOnly",
      spent: spentToday,
      reason: `Не вдалося перевірити зобов'язання: ${input.allowanceError}. Ліміт не порахований.`,
      action: null,
    };
  }
  if (input.fxUnavailableCurrency !== null) {
    return {
      kind: "spentOnly",
      spent: spentToday,
      reason: `Немає курсу для ${currencyMeta(input.fxUnavailableCurrency).code} — ліміт зараз порахувати не можна.`,
      action: null,
    };
  }
  if (input.spendableReason !== null) {
    return { kind: "spentOnly", spent: spentToday, reason: input.spendableReason, action: "salary" };
  }
  if (allowance === null) {
    return {
      kind: "spentOnly",
      spent: spentToday,
      reason: "Ліміт не налаштовано — вкажи, коли приходить зарплата.",
      action: "schedule",
    };
  }
  const g = spendGauge(spentToday, allowance.perDay);
  if (g.zone === "over") {
    return {
      kind: "over",
      spent: spentToday,
      perDay: allowance.perDay,
      overBy: Math.abs(g.remaining as number),
      daysToIncome: allowance.daysToIncome,
      periodEnd: allowance.periodEnd,
    };
  }
  if (g.zone === "unknown") {
    return { kind: "unknown", reason: "Витрату сьогодні порахувати не можна." };
  }
  return {
    kind: "within",
    spent: spentToday,
    perDay: allowance.perDay,
    remaining: g.remaining as number,
    ratio: g.ratio,
    daysToIncome: allowance.daysToIncome,
    periodEnd: allowance.periodEnd,
  };
}
