const DAY = 86_400;

function dayStart(unix: number): number {
  return Math.floor(unix / DAY) * DAY;
}

export interface AllowanceGoal {
  name: string;
  remainingBase: number;
  deadlineDays: number;
}

export interface GoalsReserve {
  reserved: number;
  goalsBeforeIncome: { name: string; reservedBase: number }[];
  overdueGoals: string[];
  invalidGoals: string[];
}

export function parseDeadline(deadlineISO: unknown): number | null {
  if (typeof deadlineISO !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(deadlineISO);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const deadlineMs = Date.UTC(year, month - 1, day);
  const check = new Date(deadlineMs);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return deadlineMs;
}

export function daysUntilDeadline(deadlineISO: string, nowSeconds: number): number | null {
  const deadlineMs = parseDeadline(deadlineISO);
  if (deadlineMs === null) return null;
  return Math.round((deadlineMs / 1000 - dayStart(nowSeconds)) / DAY) + 1;
}

export function goalsReserve(goals: AllowanceGoal[], daysToIncome: number): GoalsReserve {
  const goalsBeforeIncome: { name: string; reservedBase: number }[] = [];
  const overdueGoals: string[] = [];
  const invalidGoals: string[] = [];
  let reserved = 0;

  for (const goal of goals) {
    if (!Number.isFinite(goal.deadlineDays) || !Number.isFinite(goal.remainingBase)) {
      invalidGoals.push(goal.name);
      continue;
    }

    if (goal.deadlineDays <= 0) {
      overdueGoals.push(goal.name);
      continue;
    }

    const share = Math.min(1, daysToIncome / goal.deadlineDays);
    const reservedBase = Math.ceil(goal.remainingBase * share);
    reserved += reservedBase;
    goalsBeforeIncome.push({ name: goal.name, reservedBase });
  }

  return { reserved, goalsBeforeIncome, overdueGoals, invalidGoals };
}
