import { incomePeriodEnd, daysUntilIncome, type IncomeSchedule } from "./schedule";
import { occurrencesBetween, type Cadence } from "./cadence";
import { goalsReserve, type AllowanceGoal } from "./goals";

export interface AllowanceCommitment {
  name: string;
  amountBase: number;
  cadence: Cadence;
  anchorDay: number;
}

export interface Allowance {
  perDay: number;
  daysToIncome: number;
  periodEnd: number;
  liquid: number;
  reserved: number;
  buffer: number;
  available: number;
  shortfall: boolean;
  dueBeforeIncome: { name: string; totalBase: number }[];
  goalsReserved: number;
  goalsBeforeIncome: { name: string; reservedBase: number }[];
  overdueGoals: string[];
  invalidGoals: string[];
}

export function computeAllowance(input: {
  liquid: number;
  commitments: AllowanceCommitment[];
  goals: AllowanceGoal[];
  buffer: number;
  schedule: IncomeSchedule | null;
  nowSeconds: number;
}): Allowance | null {
  const { liquid, commitments, goals, buffer, schedule, nowSeconds } = input;
  if (!schedule) return null;

  const periodEnd = incomePeriodEnd(schedule, nowSeconds);
  const daysToIncome = daysUntilIncome(schedule, nowSeconds);

  const dueBeforeIncome: { name: string; totalBase: number }[] = [];
  let reserved = 0;
  for (const c of commitments) {
    const times = occurrencesBetween(c.cadence, c.anchorDay, nowSeconds, periodEnd);
    if (times === 0) continue;
    const sum = c.amountBase * times;
    reserved += sum;
    dueBeforeIncome.push({ name: c.name, totalBase: sum });
  }

  const { reserved: goalsReserved, goalsBeforeIncome, overdueGoals, invalidGoals } = goalsReserve(
    goals,
    daysToIncome
  );

  const available = liquid - reserved - goalsReserved - buffer;
  const shortfall = available < 0;
  const perDay = shortfall ? 0 : Math.floor(available / daysToIncome);

  return {
    perDay,
    daysToIncome,
    periodEnd,
    liquid,
    reserved,
    buffer,
    available,
    shortfall,
    dueBeforeIncome,
    goalsReserved,
    goalsBeforeIncome,
    overdueGoals,
    invalidGoals,
  };
}
