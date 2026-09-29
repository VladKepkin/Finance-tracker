import type { DB } from "../db";
import { getAllKV } from "../db";
import { queryRange } from "../repo/transactions";
import { listForUser } from "../repo/syncState";
import { listActive as listActiveCommitments } from "../repo/commitments";
import { list as listSalaries } from "../repo/salaries";
import { getRatings } from "../repo/ratings";
import { latestRates } from "../repo/fxRates";
import { convertMinor, rateBetween } from "../fx";
import { median } from "../metrics/stats";
import { dailyTotals } from "../metrics/daily";
import { monthlyTotals } from "../metrics/monthly";
import { metricsWindow } from "../metrics/window";
import { isOwnJarTransfer } from "../jarTransfers";
import { buildMetricsPayload } from "../metricsPayload";
import { analyze } from "../analytics";
import { mccToCategory, CATEGORIES } from "../mcc";
import type { MonoStatementItem } from "../monobank";
import type { TxRow } from "../repo/transactions";
import {
  monthlyIncomeFromSalaries,
  hourlyRate,
  isValidWorkSchedule,
  type WorkSchedule,
  type SalaryRecord,
} from "../metrics/salary";
import { isValidSchedule, incomePeriodStart, incomePeriodEnd, type IncomeSchedule } from "../metrics/schedule";
import { categoryJoy, type RatedSpend } from "../metrics/joy";
import { buildMonthlyReport, type MonthlyReportInput, type ReportCommitment } from "./monthlyReport";

const WEEKS_PER_MONTH = 52 / 12;
const WEEKDAY_NAMES = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"];

export interface ExportParams {
  userId: number;
  accountId: string;
  accountCurrency: number;
  jarTitles: readonly string[] | null;
  month: string | null;
  nowSeconds: number;
}

function toISO(sec: number): string {
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

function calendarMonthBounds(year: number, month1to12: number): { fromSec: number; toSec: number } {
  const fromSec = Date.UTC(year, month1to12 - 1, 1) / 1000;
  const toSec = Date.UTC(year, month1to12, 1) / 1000 - 1;
  return { fromSec, toSec };
}

function parseMonthParam(month: string): { fromSec: number; toSec: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12) return null;
  return calendarMonthBounds(year, mon);
}

function resolvePeriod(
  month: string | null,
  schedule: IncomeSchedule | null,
  nowSeconds: number
): { fromSec: number; toSec: number } {
  if (month) {
    const parsed = parseMonthParam(month);
    if (parsed) return parsed;
  }
  if (schedule) {
    const fromSec = incomePeriodStart(schedule, nowSeconds);
    const toSec = incomePeriodEnd(schedule, nowSeconds) - 1;
    return { fromSec, toSec };
  }
  const now = new Date(nowSeconds * 1000);
  return calendarMonthBounds(now.getUTCFullYear(), now.getUTCMonth() + 1);
}

function toStatementItem(t: TxRow): MonoStatementItem {
  return {
    id: t.id,
    time: t.time,
    description: t.description ?? "",
    mcc: t.mcc ?? 0,
    originalMcc: t.original_mcc ?? t.mcc ?? 0,
    hold: t.hold === 1,
    amount: t.amount,
    operationAmount: t.operation_amount ?? t.amount,
    currencyCode: t.currency_code,
    commissionRate: t.commission_rate ?? 0,
    cashbackAmount: t.cashback_amount ?? 0,
    balance: t.balance ?? 0,
    comment: t.comment ?? undefined,
    counterName: t.counter_name ?? undefined,
  };
}

function validMonths(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 24 ? v : null;
}
function validContribution(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
}
function validSpendablePct(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 100 ? v : null;
}
function validBuffer(v: unknown): number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0;
}

function scheduleLabel(s: IncomeSchedule | null): string | null {
  if (!s) return null;
  if (s.kind === "monthly") return `раз на місяць, ${s.day}-го`;
  return `двічі на місяць, ${s.days[0]}-го та ${s.days[1]}-го`;
}

function weekdaysLabel(days: number[]): string {
  return [...days]
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_NAMES[d] ?? String(d))
    .join(", ");
}

export function buildExportPayload(database: DB, params: ExportParams): MonthlyReportInput {
  const { userId, accountId, accountCurrency, jarTitles, nowSeconds } = params;

  const kv = getAllKV(userId);
  const base = typeof kv.baseCurrency === "number" ? kv.baseCurrency : 980;
  const schedule = isValidSchedule(kv.incomeSchedule) ? kv.incomeSchedule : null;
  const workSchedule = isValidWorkSchedule(kv.workSchedule) ? kv.workSchedule : null;
  const buffer = validBuffer(kv.buffer);
  const savingsPlanRaw =
    kv.savingsPlan && typeof kv.savingsPlan === "object" && !Array.isArray(kv.savingsPlan)
      ? (kv.savingsPlan as Record<string, unknown>)
      : {};
  const savingsPlan = {
    emergencyMonths: validMonths(savingsPlanRaw.emergencyMonths),
    monthlyContribution: validContribution(savingsPlanRaw.monthlyContribution),
    spendablePct: validSpendablePct(savingsPlanRaw.spendablePct),
  };
  const fakeIds = new Set(Array.isArray(kv.fake) ? kv.fake.filter((x): x is string => typeof x === "string") : []);

  const rates = latestRates(database);
  const accountRateKnown = rateBetween(rates, accountCurrency, base) !== null;
  const cardToBase = (minor: number): number | null =>
    accountRateKnown ? convertMinor(minor, accountCurrency, base, rates) : null;

  const { fromSec, toSec } = resolvePeriod(params.month, schedule, nowSeconds);
  const fromISO = toISO(fromSec);
  const toISOStr = toISO(toSec);
  const periodLabel = `${fromISO} — ${toISOStr}`;

  const periodTxs = queryRange(database, userId, fromSec, toSec)
    .filter((t) => t.account_id === accountId)
    .filter((t) => !fakeIds.has(t.id) && !isOwnJarTransfer(t.mcc, t.description, jarTitles));

  const days = dailyTotals(periodTxs, fromSec, toSec);

  const analyzed = analyze({
    items: periodTxs.map(toStatementItem),
    wallet: [],
    fakeIds: new Set(),
    base,
    accountCurrency,
    rates,
    fromMs: fromSec * 1000,
    toMs: toSec * 1000,
    jarTitles: null,
    salaries: null,
  });

  const catAmounts = new Map<string, number[]>();
  const ratingsMap = getRatings(
    database,
    userId,
    periodTxs.filter((t) => t.amount < 0).map((t) => t.id)
  );
  const rated: RatedSpend[] = [];
  if (analyzed.expenseFxUnavailableCurrency === null) {
    for (const t of periodTxs) {
      if (t.amount >= 0) continue;
      const v = cardToBase(Math.abs(t.amount));
      if (v === null) continue;
      const cat = mccToCategory(t.mcc ?? 0, t.amount).key;
      const arr = catAmounts.get(cat) ?? [];
      arr.push(v);
      catAmounts.set(cat, arr);

      const score = ratingsMap.get(t.id);
      if (score !== undefined) {
        rated.push({ category: cat, score, amountBase: v });
      }
    }
  }
  const joyCats = categoryJoy(rated);

  const categories = analyzed.byCategory.map((cs) => {
    const amounts = catAmounts.get(cs.category.key) ?? [];
    return {
      key: cs.category.key,
      label: cs.category.label,
      totalBase: cs.total,
      count: cs.count,
      medianCheckBase: amounts.length > 0 ? median(amounts) : null,
      shareOfExpense:
        analyzed.totalExpense !== null && analyzed.totalExpense > 0 ? cs.total / analyzed.totalExpense : null,
    };
  });

  const metrics = buildMetricsPayload(database, userId, accountId, nowSeconds, jarTitles);

  const anomalies = metrics.anomalies
    .filter((a) => a.date >= fromISO && a.date <= toISOStr)
    .map((a) => ({ date: a.date, expenseBase: cardToBase(a.expense) }));
  const dailyMedianBase = accountRateKnown && metrics.dailyMedian.value !== null ? cardToBase(metrics.dailyMedian.value) : null;
  const monthlyPercentilesBase =
    accountRateKnown && metrics.monthly.value
      ? {
          p10: cardToBase(metrics.monthly.value.p10)!,
          p50: cardToBase(metrics.monthly.value.p50)!,
          p90: cardToBase(metrics.monthly.value.p90)!,
        }
      : null;

  const syncRows = listForUser(database, userId).filter((r) => r.account_id === accountId);
  const syncRow = syncRows[0];
  const window = metricsWindow({
    coveredFrom: syncRow?.covered_from ?? null,
    coveredTo: syncRow?.covered_to ?? null,
    nowSeconds,
  });
  const windowTxs = window
    ? queryRange(database, userId, window.from, window.to)
        .filter((t) => t.account_id === accountId)
        .filter((t) => !fakeIds.has(t.id) && !isOwnJarTransfer(t.mcc, t.description, jarTitles))
    : [];
  const monthlyExpenses = window ? monthlyTotals(windowTxs, window.from, window.to) : [];

  const allSalaries = listSalaries(database, userId);
  const monthlyIncomeMap = new Map<string, number>();
  for (const s of allSalaries) {
    if (window && (new Date(`${s.paid_on}T00:00:00Z`).getTime() / 1000 < window.from || new Date(`${s.paid_on}T00:00:00Z`).getTime() / 1000 > window.to)) {
      continue;
    }
    const v = convertMinor(s.amount, s.currency, base, rates);
    if (v === null) continue;
    const monthKey = s.paid_on.slice(0, 7);
    monthlyIncomeMap.set(monthKey, (monthlyIncomeMap.get(monthKey) ?? 0) + v);
  }
  const dynamicsMonths = new Set<string>([...monthlyExpenses.map((m) => m.month), ...monthlyIncomeMap.keys()]);
  const dynamics = [...dynamicsMonths]
    .sort()
    .slice(-12)
    .map((m) => {
      const exp = monthlyExpenses.find((e) => e.month === m);
      return {
        month: m,
        expenseBase: exp ? cardToBase(exp.expense) : null,
        incomeBase: monthlyIncomeMap.has(m) ? monthlyIncomeMap.get(m)! : null,
      };
    });

  const salariesBaseAll: number[] = [];
  const fxFailCurrencies = new Set<number>();
  for (const s of allSalaries) {
    const v = convertMinor(s.amount, s.currency, base, rates);
    if (v === null) {
      fxFailCurrencies.add(s.currency);
      continue;
    }
    salariesBaseAll.push(v);
  }
  const incomeResult = monthlyIncomeFromSalaries(salariesBaseAll);

  let periodIncomeBase: number | null = 0;
  let periodIncomeFxFailCurrency: number | null = null;
  for (const s of allSalaries) {
    const paidSec = new Date(`${s.paid_on}T00:00:00Z`).getTime() / 1000;
    if (paidSec < fromSec || paidSec > toSec) continue;
    const v = convertMinor(s.amount, s.currency, base, rates);
    if (v === null) {
      periodIncomeFxFailCurrency = s.currency;
      break;
    }
    periodIncomeBase += v;
  }
  if (periodIncomeFxFailCurrency !== null) periodIncomeBase = null;

  const salaryRecords: SalaryRecord[] = allSalaries.map((s) => ({
    id: s.id,
    paidOn: s.paid_on,
    amount: s.amount,
    currency: s.currency,
  }));
  const rate = hourlyRate({ salaries: salaryRecords, schedule: workSchedule });
  let hourlyRateBase: number | null = null;
  if (rate.value !== null) {
    const sorted = [...salaryRecords].sort((a, b) => (a.paidOn < b.paidOn ? -1 : a.paidOn > b.paidOn ? 1 : 0));
    const lastCurrency = sorted[sorted.length - 1]?.currency ?? base;
    hourlyRateBase = convertMinor(rate.value, lastCurrency, base, rates);
  }

  const commitmentRows = listActiveCommitments(database, userId);
  const commitments: ReportCommitment[] = commitmentRows.map((c) => {
    const amountBase = convertMinor(c.amount, c.currency, base, rates);
    const monthlyEquivalentBase =
      amountBase === null ? null : c.cadence === "monthly" ? amountBase : amountBase * WEEKS_PER_MONTH;
    return {
      name: c.name,
      amountOriginal: c.amount,
      currency: c.currency,
      cadence: c.cadence,
      anchorDay: c.anchor_day,
      monthlyEquivalentBase,
    };
  });

  return {
    nowSeconds,
    periodLabel,
    periodFromISO: fromISO,
    periodToISO: toISOStr,
    base,
    accountCurrency,

    income: {
      medianBase: incomeResult.value,
      confidence: incomeResult.confidence,
      salaryCount: salariesBaseAll.length,
      fxFailCount: allSalaries.length - salariesBaseAll.length,
      fxFailCurrencies: [...fxFailCurrencies],
      scheduleLabel: scheduleLabel(schedule),
      periodIncomeBase,
      periodIncomeFxFailCurrency,
    },

    work: workSchedule
      ? (() => {
          const hoursPerWeek = workSchedule.hoursPerDay * workSchedule.weekdays.length;
          return {
            hoursPerDay: workSchedule.hoursPerDay,
            weekdaysLabel: weekdaysLabel(workSchedule.weekdays),
            hoursPerWeek,
            nonWorkHoursPerWeek: 168 - hoursPerWeek,
            hourlyRateBase,
            hourlyRateReason: hourlyRateBase === null ? rate.reason : null,
          };
        })()
      : {
          hoursPerDay: null,
          weekdaysLabel: null,
          hoursPerWeek: null,
          nonWorkHoursPerWeek: null,
          hourlyRateBase: null,
          hourlyRateReason: rate.reason,
        },

    bufferBase: buffer,
    savingsPlan,
    commitments,

    facts: {
      dailyMedianBase,
      dailyMedianConfidence: metrics.dailyMedian.confidence,
      monthlyPercentilesBase,
      monthlyPercentilesConfidence: metrics.monthly.confidence,
      coverage: metrics.coverage,
      fxUnavailableCurrency: accountRateKnown ? null : accountCurrency,
    },

    spend: {
      totalExpenseBase: analyzed.totalExpense,
      fxUnavailableCurrency: analyzed.expenseFxUnavailableCurrency,
      categories,
      merchants: analyzed.topMerchants.map((m) => ({ name: m.name, totalBase: m.total, count: m.count })),
      anomalies,
    },

    joy: {
      ratingsCount: ratingsMap.size,
      categories: joyCats.map((c) => ({
        key: c.key,
        label: CATEGORIES[c.key]?.label ?? c.key,
        ratedCount: c.ratedCount,
        medianJoy: c.medianJoy,
        shareOfRated: c.shareOfRated,
      })),
    },

    dynamics,

    done: {
      incomeScheduleConfigured: schedule !== null,
      workScheduleConfigured: workSchedule !== null,
      bufferConfigured: buffer > 0,
      savingsPlanConfigured:
        savingsPlan.emergencyMonths !== null || savingsPlan.monthlyContribution !== null || savingsPlan.spendablePct !== null,
      commitmentsCount: commitmentRows.length,
    },
  };
}

export function generateMonthlyReport(database: DB, params: ExportParams): string {
  return buildMonthlyReport(buildExportPayload(database, params));
}
