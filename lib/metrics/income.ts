export interface WishCalc {
  progress: number | null;
  monthsToAfford: number | null;
  workMonths: number | null;
  workHours: number | null;
}

export function workHours(priceBase: number, hourlyRateBase: number | null): number | null {
  return hourlyRateBase !== null && hourlyRateBase > 0 ? priceBase / hourlyRateBase : null;
}

export function wishCalc(
  priceBase: number,
  liquidBase: number | null,
  monthlyNet: number | null,
  monthlyIncomeBase: number | null,
  hourlyRateBase: number | null
): WishCalc {
  const progress =
    liquidBase === null ? null : priceBase > 0 ? Math.min(1, Math.max(0, liquidBase / priceBase)) : 1;
  const remaining = liquidBase === null ? null : Math.max(0, priceBase - liquidBase);
  const monthsToAfford =
    remaining !== null && monthlyNet !== null && monthlyNet > 0 ? remaining / monthlyNet : null;
  const workMonths =
    monthlyIncomeBase !== null && monthlyIncomeBase > 0 ? priceBase / monthlyIncomeBase : null;
  return { progress, monthsToAfford, workMonths, workHours: workHours(priceBase, hourlyRateBase) };
}
