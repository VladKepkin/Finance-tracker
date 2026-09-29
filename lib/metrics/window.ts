const DAY = 86_400;

export interface MetricsWindow {
  from: number;
  to: number;
}

export function metricsWindow(input: {
  coveredFrom: number | null;
  coveredTo: number | null;
  nowSeconds: number;
  maxDays?: number;
}): MetricsWindow | null {
  const { coveredFrom, coveredTo, nowSeconds, maxDays = 365 } = input;
  if (coveredFrom == null || coveredTo == null) return null;

  const lastCompleteDay = Math.floor(nowSeconds / DAY) * DAY - 1;

  const to = Math.min(coveredTo, lastCompleteDay);
  const from = Math.max(coveredFrom, to - maxDays * DAY + 1);

  if (to < from) return null;
  return { from, to };
}
