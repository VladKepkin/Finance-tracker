import type { DB } from "./db";
import { queryRange, timeBounds } from "./repo/transactions";
import { listForUser } from "./repo/syncState";
import { coverageFromSyncState, confidenceFor, type Coverage, type Metric } from "./coverage";
import { median } from "./metrics/stats";
import { dailyTotals, weekdayBaselines, type WeekdayBaseline } from "./metrics/daily";
import { detectAnomalies, withoutAnomalies, type Anomaly } from "./metrics/anomalies";
import { monthlyTotals, monthlyPercentiles, type Percentiles } from "./metrics/monthly";
import { metricsWindow } from "./metrics/window";
import { isOwnJarTransfer } from "./jarTransfers";

const DAILY_T = { low: 14, high: 60 };
const WEEKDAY_T = { low: 8, high: 26 };
const MONTHLY_T = { low: 3, high: 6 };

export interface DaySpent {
  date: string;
  spent: number;
}

export interface MetricsPayload {
  coverage: Coverage;
  dailyMedian: Metric<number>;
  weekday: Metric<WeekdayBaseline[]>;
  monthly: Metric<Percentiles>;
  anomalies: Anomaly[];
  dailySeries: DaySpent[];
}

const DAILY_SERIES_WINDOW = 30;

export function buildMetricsPayload(
  database: DB,
  userId: number,
  accountId: string,
  nowSeconds: number,
  jarTitles?: readonly string[] | null
): MetricsPayload {
  const syncRows = listForUser(database, userId).filter((r) => r.account_id === accountId);
  const coverage = coverageFromSyncState(syncRows, timeBounds(database, userId, accountId).samples);

  const syncRow = syncRows[0];
  const window = metricsWindow({
    coveredFrom: syncRow?.covered_from ?? null,
    coveredTo: syncRow?.covered_to ?? null,
    nowSeconds,
  });

  const txs = window
    ? queryRange(database, userId, window.from, window.to)
        .filter((t) => t.account_id === accountId)
        .filter((t) => !isOwnJarTransfer(t.mcc, t.description, jarTitles))
    : [];

  const days = window ? dailyTotals(txs, window.from, window.to) : [];
  const anomalies = detectAnomalies(days);
  const clean = withoutAnomalies(days, anomalies);

  const dailyConf =
    coverage.samples === 0 || !window ? "insufficient" : confidenceFor(clean.length, DAILY_T);
  const dailyMedian: Metric<number> = {
    value: dailyConf === "insufficient" ? null : median(clean.map((d) => d.expense)),
    coverage,
    confidence: dailyConf,
  };

  const wd = weekdayBaselines(clean);
  const minSamples = Math.min(...wd.map((w) => w.samples));
  const wdConf = coverage.samples === 0 ? "insufficient" : confidenceFor(minSamples, WEEKDAY_T);
  const weekday: Metric<WeekdayBaseline[]> = {
    value: wdConf === "insufficient" ? null : wd,
    coverage,
    confidence: wdConf,
  };

  const months = window ? monthlyTotals(txs, window.from, window.to) : [];
  const monthlyConf = confidenceFor(months.length, MONTHLY_T);
  const monthly: Metric<Percentiles> = {
    value: monthlyConf === "insufficient" ? null : monthlyPercentiles(months),
    coverage,
    confidence: monthlyConf,
  };

  const dailySeries: DaySpent[] = days
    .slice(-DAILY_SERIES_WINDOW)
    .map((d) => ({ date: d.date, spent: d.expense }));

  return { coverage, dailyMedian, weekday, monthly, anomalies, dailySeries };
}

export async function buildMetricsPayloadAsync(
  userId: number,
  accountId: string,
  nowSeconds: number,
  jarTitles?: readonly string[] | null
): Promise<MetricsPayload> {
  const { adapterListSyncStateForUser, adapterTimeBoundsTransactions, adapterQueryRangeTransactions } = await import(
    "./data-adapter"
  );
  const syncRowsAll = await adapterListSyncStateForUser(userId);
  const syncRows = syncRowsAll.filter((r) => r.account_id === accountId);
  const bounds = await adapterTimeBoundsTransactions(userId, accountId);
  const coverage = coverageFromSyncState(syncRows, bounds.samples);

  const syncRow = syncRows[0];
  const window = metricsWindow({
    coveredFrom: syncRow?.covered_from ?? null,
    coveredTo: syncRow?.covered_to ?? null,
    nowSeconds,
  });

  const allTxs = window ? await adapterQueryRangeTransactions(userId, window.from, window.to) : [];
  const txs = allTxs
    .filter((t) => t.account_id === accountId)
    .filter((t) => !isOwnJarTransfer(t.mcc, t.description, jarTitles));

  const days = window ? dailyTotals(txs, window.from, window.to) : [];
  const anomalies = detectAnomalies(days);
  const clean = withoutAnomalies(days, anomalies);

  const dailyConf =
    coverage.samples === 0 || !window ? "insufficient" : confidenceFor(clean.length, DAILY_T);
  const dailyMedian: Metric<number> = {
    value: dailyConf === "insufficient" ? null : median(clean.map((d) => d.expense)),
    coverage,
    confidence: dailyConf,
  };

  const wd = weekdayBaselines(clean);
  const minSamples = Math.min(...wd.map((w) => w.samples));
  const wdConf = coverage.samples === 0 ? "insufficient" : confidenceFor(minSamples, WEEKDAY_T);
  const weekday: Metric<WeekdayBaseline[]> = {
    value: wdConf === "insufficient" ? null : wd,
    coverage,
    confidence: wdConf,
  };

  const months = window ? monthlyTotals(txs, window.from, window.to) : [];
  const monthlyConf = confidenceFor(months.length, MONTHLY_T);
  const monthly: Metric<Percentiles> = {
    value: monthlyConf === "insufficient" ? null : monthlyPercentiles(months),
    coverage,
    confidence: monthlyConf,
  };

  const dailySeries: DaySpent[] = days
    .slice(-DAILY_SERIES_WINDOW)
    .map((d) => ({ date: d.date, spent: d.expense }));

  return { coverage, dailyMedian, weekday, monthly, anomalies, dailySeries };
}
