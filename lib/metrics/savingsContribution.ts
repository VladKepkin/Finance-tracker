import { convertMinor, type CurrencyRate } from "@/lib/fx";
import { isOwnJarTransfer } from "@/lib/jarTransfers";

const DAY = 86_400;

export interface StatementItemForSavings {
  amount: number;
  mcc: number | null | undefined;
  description: string | null | undefined;
  time: number;
}

function monthStartSeconds(nowSeconds: number): number {
  const d = new Date(nowSeconds * 1000);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000);
}

function nextMonthStartSeconds(nowSeconds: number): number {
  const d = new Date(nowSeconds * 1000);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000);
}

export function daysToMonthEnd(nowSeconds: number): number {
  const todayStart = Math.floor(nowSeconds / DAY) * DAY;
  const nextMonthStart = nextMonthStartSeconds(nowSeconds);
  return Math.max(1, Math.round((nextMonthStart - todayStart) / DAY));
}

export function savingsStillOwed(input: {
  statement: readonly StatementItemForSavings[];
  jarTitles: readonly string[] | null | undefined;
  monthlyContributionBase: number;
  accountCurrency: number;
  base: number;
  rates: readonly CurrencyRate[];
  nowSeconds: number;
}): { ok: true; remainingBase: number } | { ok: false; currency: number } {
  const { statement, jarTitles, monthlyContributionBase, accountCurrency, base, rates, nowSeconds } = input;
  const start = monthStartSeconds(nowSeconds);
  const end = nextMonthStartSeconds(nowSeconds);
  let savedBase = 0;
  for (const it of statement) {
    if (it.amount >= 0) continue;
    if (it.time < start || it.time >= end) continue;
    if (!isOwnJarTransfer(it.mcc, it.description, jarTitles)) continue;
    const v = convertMinor(Math.abs(it.amount), accountCurrency, base, rates as CurrencyRate[]);
    if (v === null) return { ok: false, currency: accountCurrency };
    savedBase += v;
  }
  return { ok: true, remainingBase: Math.max(0, monthlyContributionBase - savedBase) };
}
