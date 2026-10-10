import { incomePeriodEnd, daysUntilIncome, type IncomeSchedule } from "./schedule";
import { occurrencesBetween, type Cadence } from "./cadence";
import { goalsReserve, type AllowanceGoal } from "./goals";

export interface AllowanceCommitment {
  id?: number;
  name: string;
  amountBase: number;
  cadence: Cadence;
  anchorDay: number;
  source?: "card" | "cash";
  paidInPeriod?: boolean;
  paidBase?: number;
  remainingReserve?: number;
  settledExternally?: boolean;
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
  dueBeforeIncome: { name: string; totalBase: number; source?: "card" | "cash" }[];
  paidCommitments: { name: string; paidBase: number; source?: "card" | "cash"; settledExternally?: boolean }[];
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

  const dueBeforeIncome: { name: string; totalBase: number; source?: "card" | "cash" }[] = [];
  const paidCommitments: { name: string; paidBase: number; source?: "card" | "cash"; settledExternally?: boolean }[] = [];
  let reserved = 0;
  for (const c of commitments) {
    if (c.paidInPeriod) {
      const item: { name: string; paidBase: number; source?: "card" | "cash"; settledExternally?: boolean } = {
        name: c.name,
        paidBase: c.paidBase ?? c.amountBase,
      };
      if (c.source) item.source = c.source;
      if (c.settledExternally) item.settledExternally = true;
      paidCommitments.push(item);
      continue;
    }

    const times = occurrencesBetween(c.cadence, c.anchorDay, nowSeconds, periodEnd);
    if (times === 0) continue;
    const baseToReserve = c.remainingReserve !== undefined ? c.remainingReserve : c.amountBase;
    const sum = baseToReserve * times;
    reserved += sum;
    const item: { name: string; totalBase: number; source?: "card" | "cash" } = {
      name: c.name,
      totalBase: sum,
    };
    if (c.source) item.source = c.source;
    dueBeforeIncome.push(item);
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
    paidCommitments,
    goalsReserved,
    goalsBeforeIncome,
    overdueGoals,
    invalidGoals,
  };
}
