import { parseDeadline } from "./goals";
import { median } from "./stats";
import { confidenceFor, type Confidence } from "../coverage";

const DAY_MS = 86_400_000;

export interface WorkSchedule {
  hoursPerDay: number;
  weekdays: number[];
}

export function isValidWorkSchedule(v: unknown): v is WorkSchedule {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const s = v as Record<string, unknown>;
  if (!Number.isInteger(s.hoursPerDay) || (s.hoursPerDay as number) < 1 || (s.hoursPerDay as number) > 24) {
    return false;
  }
  if (!Array.isArray(s.weekdays) || s.weekdays.length === 0) return false;
  const okDay = (d: unknown) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6;
  if (!s.weekdays.every(okDay)) return false;
  return new Set(s.weekdays).size === s.weekdays.length;
}

export interface SalaryRecord {
  id: number;
  paidOn: string;
  amount: number;
  currency: number;
}

export const SALARY_T = { low: 1, high: 3 };

export function workingHours(fromISO: string, toISO: string, schedule: WorkSchedule): number {
  if (!Number.isInteger(schedule.hoursPerDay) || schedule.hoursPerDay <= 0) return 0;
  if (!Array.isArray(schedule.weekdays) || schedule.weekdays.length === 0) return 0;

  const fromMs = parseDeadline(fromISO);
  const toMs = parseDeadline(toISO);
  if (fromMs === null || toMs === null || toMs < fromMs) return 0;

  const weekdaySet = new Set(schedule.weekdays);
  let days = 0;
  for (let t = fromMs; t <= toMs; t += DAY_MS) {
    if (weekdaySet.has(new Date(t).getUTCDay())) days++;
  }
  return days * schedule.hoursPerDay;
}

export interface MonthlyIncomeResult {
  value: number | null;
  confidence: Confidence;
}

export function monthlyIncomeFromSalaries(salariesBase: number[]): MonthlyIncomeResult {
  const finite = salariesBase.filter((v) => Number.isFinite(v));
  const confidence = confidenceFor(finite.length, SALARY_T);
  if (confidence === "insufficient") return { value: null, confidence };
  return { value: median(finite), confidence };
}

export interface HourlyRateResult {
  value: number | null;
  reason: string | null;
}

export function hourlyRate(input: { salaries: SalaryRecord[]; schedule: WorkSchedule | null }): HourlyRateResult {
  const { salaries, schedule } = input;

  if (salaries.length === 0) {
    return { value: null, reason: "Додай хоч одну зарплату — без неї ставка невідома" };
  }
  if (schedule === null) {
    return { value: null, reason: "Немає графіка роботи: скажи, скільки годин на день і в які дні працюєш" };
  }

  const sorted = [...salaries].sort((a, b) => (a.paidOn < b.paidOn ? -1 : a.paidOn > b.paidOn ? 1 : 0));
  const last = sorted[sorted.length - 1];

  if (sorted.length < 2) {
    return { value: null, reason: "Period невідомий: одна точка не дає періоду" };
  }
  const prev = sorted[sorted.length - 2];

  if (!Number.isFinite(last.amount) || last.amount <= 0) {
    return { value: null, reason: "Некоректна сума останньої виплати" };
  }

  const prevMs = parseDeadline(prev.paidOn);
  if (prevMs === null) {
    return { value: null, reason: "Некоректна дата попередньої виплати" };
  }
  const periodFromISO = new Date(prevMs + DAY_MS).toISOString().slice(0, 10);

  const hours = workingHours(periodFromISO, last.paidOn, schedule);
  if (!Number.isFinite(hours) || hours <= 0) {
    return { value: null, reason: "Період не містить жодної робочої години" };
  }

  return { value: last.amount / hours, reason: null };
}
