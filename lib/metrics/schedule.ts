export type IncomeSchedule =
  | { kind: "monthly"; day: number }
  | { kind: "semimonthly"; days: [number, number] };

const DAY = 86_400;

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

function dayStart(unix: number): number {
  return Math.floor(unix / DAY) * DAY;
}

function onDay(year: number, month0: number, day: number): number {
  return Date.UTC(year, month0, Math.min(day, daysInMonth(year, month0))) / 1000;
}

function scheduleDays(schedule: IncomeSchedule): number[] {
  return schedule.kind === "monthly" ? [schedule.day] : [...schedule.days].sort((a, b) => a - b);
}

export function nextIncomeDate(schedule: IncomeSchedule, fromTime: number): number {
  const from = dayStart(fromTime);
  const d = new Date(from * 1000);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const days = scheduleDays(schedule);

  for (const day of days) {
    const candidate = onDay(y, m, day);
    if (candidate >= from) return candidate;
  }
  return onDay(y, m + 1, days[0]);
}

export function incomePeriodEnd(schedule: IncomeSchedule, fromTime: number): number {
  const from = dayStart(fromTime);
  const inclusive = nextIncomeDate(schedule, fromTime);
  if (inclusive !== from) return inclusive;
  return nextIncomeDate(schedule, from + DAY);
}

export function daysUntilIncome(schedule: IncomeSchedule, fromTime: number): number {
  const from = dayStart(fromTime);
  const next = incomePeriodEnd(schedule, fromTime);
  return Math.round((next - from) / DAY) + 1;
}

export function incomePeriodStart(schedule: IncomeSchedule, fromTime: number): number {
  const from = dayStart(fromTime);
  const d = new Date(from * 1000);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const days = scheduleDays(schedule);

  for (let i = days.length - 1; i >= 0; i--) {
    const candidate = onDay(y, m, days[i]);
    if (candidate <= from) return candidate;
  }
  const prevMonth = m - 1;
  return prevMonth < 0 ? onDay(y - 1, 11, days[days.length - 1]) : onDay(y, prevMonth, days[days.length - 1]);
}

export function isValidSchedule(v: unknown): v is IncomeSchedule {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  const okDay = (d: unknown) => typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= 31;
  if (s.kind === "monthly") return okDay(s.day);
  if (s.kind === "semimonthly") {
    return Array.isArray(s.days) && s.days.length === 2 && s.days.every(okDay);
  }
  return false;
}
