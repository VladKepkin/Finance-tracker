import { computeAllowance, type Allowance, type AllowanceCommitment } from "./allowance";
import type { AllowanceGoal } from "./goals";
import { nextIncomeDate, type IncomeSchedule } from "./schedule";

export interface Scenario<T> {
  value: T | null;
  reason: string | null;
}

export interface Evaluation {
  savings: Scenario<{ monthsToAfford: number }>;
  buyNow: Scenario<{ before: number; after: number; allowance: Allowance }>;
  defer: Scenario<{ after: number; assumedIncome: number }>;
}

const NO_SCHEDULE_REASON = "немає графіка доходу — ліміт порахувати нічим";

function nullScenario<T>(reason: string): Scenario<T> {
  return { value: null, reason };
}

export function evaluate(input: {
  priceBase: number;
  liquid: number;
  commitments: AllowanceCommitment[];
  goals: AllowanceGoal[];
  buffer: number;
  schedule: IncomeSchedule | null;
  monthlyNet: number | null;
  monthlyIncome: number | null;
  nowSeconds: number;
}): Evaluation {
  const { priceBase, liquid, commitments, goals, buffer, schedule, monthlyNet, monthlyIncome, nowSeconds } = input;

  if (!schedule) {
    return {
      savings: nullScenario(NO_SCHEDULE_REASON),
      buyNow: nullScenario(NO_SCHEDULE_REASON),
      defer: nullScenario(NO_SCHEDULE_REASON),
    };
  }

  const savings: Scenario<{ monthsToAfford: number }> =
    monthlyNet === null || monthlyNet <= 0
      ? nullScenario("за поточних заощаджень ця сума не накопичиться")
      : { value: { monthsToAfford: priceBase / monthlyNet }, reason: null };

  const allowanceBefore = computeAllowance({ liquid, commitments, goals, buffer, schedule, nowSeconds })!;
  const allowanceAfter = computeAllowance({
    liquid: liquid - priceBase,
    commitments,
    goals,
    buffer,
    schedule,
    nowSeconds,
  })!;
  const buyNow: Scenario<{ before: number; after: number; allowance: Allowance }> = {
    value: { before: allowanceBefore.perDay, after: allowanceAfter.perDay, allowance: allowanceAfter },
    reason: null,
  };

  let defer: Scenario<{ after: number; assumedIncome: number }>;
  if (monthlyIncome === null) {
    defer = nullScenario("дохід невідомий — графік дає лише дату, не суму");
  } else {
    const incomeDay = nextIncomeDate(schedule, nowSeconds);
    const allowanceDefer = computeAllowance({
      liquid: liquid + monthlyIncome - priceBase,
      commitments,
      goals,
      buffer,
      schedule,
      nowSeconds: incomeDay,
    })!;
    defer = { value: { after: allowanceDefer.perDay, assumedIncome: monthlyIncome }, reason: null };
  }

  return { savings, buyNow, defer };
}
