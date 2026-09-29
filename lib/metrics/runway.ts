const DAY_MS = 86_400_000;
const DAYS_IN_MONTH = 30;

export interface Runway {
  days: number | null;
  infinite: boolean;
  exhaustDate: string | null;
}

export function computeRunway(input: {
  liquid: number;
  monthlyIncome: number;
  monthlyExpenseP90: number;
  nowSeconds: number;
}): Runway {
  const { liquid, monthlyIncome, monthlyExpenseP90, nowSeconds } = input;

  if (monthlyIncome >= monthlyExpenseP90) {
    return { days: null, infinite: true, exhaustDate: null };
  }

  const dailyDeficit = (monthlyExpenseP90 - monthlyIncome) / DAYS_IN_MONTH;
  const days = Math.max(0, Math.floor(liquid / dailyDeficit));
  const exhaustDate = new Date(nowSeconds * 1000 + days * DAY_MS).toISOString().slice(0, 10);
  return { days, infinite: false, exhaustDate };
}
