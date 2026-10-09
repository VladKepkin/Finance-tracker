import type { MonoStatementItem } from "./monobank";
import { CATEGORIES, mccToCategory, type Category } from "./mcc";
import type { WalletEntry } from "./storage";
import { convertMinor, type CurrencyRate } from "./fx";
import { isOwnJarTransfer } from "./jarTransfers";
import { DEFAULT_CASH_ACCOUNT_ID } from "./cashAccounts";
import {
  isEffectiveExpense,
  findPairedTransfers,
  type TxOverrideType,
} from "./transfers";

export interface CategorySpend {
  category: Category;
  total: number;
  count: number;
}

export interface DailyPoint {
  date: string;
  label: string;
  income: number;
  expense: number;
}

export interface AnalyticsResult {
  base: number;
  totalExpense: number | null;
  cardExpense: number | null;
  cashExpense: number | null;
  expenseFxUnavailableCurrency: number | null;
  totalIncome: number | null;
  incomeLoading: boolean;
  incomeFxUnavailableCurrency: number | null;
  net: number | null;
  byCategory: CategorySpend[];
  daily: DailyPoint[];
  topMerchants: { name: string; total: number; count: number }[];
}

export interface AnalyzeInput {
  items: MonoStatementItem[];
  wallet: WalletEntry[];
  fakeIds: Set<string>;
  base: number;
  accountCurrency: number;
  rates: CurrencyRate[];
  fromMs: number;
  toMs: number;
  jarTitles?: readonly string[] | null;
  salaries: { paidOn: string; amount: number; currency: number }[] | null;
  txOverrides?: Record<string, TxOverrideType>;
  excludedAccounts?: readonly string[];
  partnerKeywords?: readonly string[];
}

export function analyze(input: AnalyzeInput): AnalyticsResult {
  const {
    items,
    wallet,
    fakeIds,
    base,
    accountCurrency,
    rates,
    fromMs,
    toMs,
    jarTitles,
    salaries,
    txOverrides,
    excludedAccounts,
    partnerKeywords,
  } = input;
  const inPeriod = (ms: number) => ms >= fromMs && ms <= toMs;
  const cardToBase = (minor: number) => convertMinor(minor, accountCurrency, base, rates);

  const pairedIds = findPairedTransfers(items);
  const context = { fakeIds, txOverrides, jarTitles, excludedAccounts, partnerKeywords };
  const realCardExpenses = items.filter((i) => isEffectiveExpense(i, context, pairedIds));

  const cashExpenseEntries = wallet.filter(
    (e) => e.kind === "expense" && inPeriod(new Date(e.date).getTime())
  );

  let expenseFxUnavailableCurrency: number | null = null;
  let cardExpense = 0;
  for (const it of realCardExpenses) {
    const v = cardToBase(Math.abs(it.amount));
    if (v === null) {
      expenseFxUnavailableCurrency = accountCurrency;
      break;
    }
    cardExpense += v;
  }
  let cashExpense = 0;
  if (expenseFxUnavailableCurrency === null) {
    for (const e of cashExpenseEntries) {
      const cur = e.currency ?? base;
      const v = convertMinor(e.amount ?? 0, cur, base, rates);
      if (v === null) {
        expenseFxUnavailableCurrency = cur;
        break;
      }
      cashExpense += v;
    }
  }
  const expensesOk = expenseFxUnavailableCurrency === null;
  const totalExpense = expensesOk ? cardExpense + cashExpense : null;

  const incomeLoading = salaries === null;
  let totalIncome: number | null = null;
  let incomeFxUnavailableCurrency: number | null = null;
  if (salaries !== null) {
    const inPeriodSalaries = salaries.filter((s) => inPeriod(new Date(s.paidOn).getTime()));
    let sum = 0;
    let fxFail: number | null = null;
    for (const s of inPeriodSalaries) {
      const v = convertMinor(s.amount, s.currency, base, rates);
      if (v === null) {
        fxFail = s.currency;
        break;
      }
      sum += v;
    }
    if (fxFail !== null) {
      incomeFxUnavailableCurrency = fxFail;
    } else {
      totalIncome = sum;
    }
  }

  const net = totalIncome === null || totalExpense === null ? null : totalIncome - totalExpense;

  const catMap = new Map<string, CategorySpend>();
  const dayMap = new Map<string, DailyPoint>();
  const merchMap = new Map<string, { name: string; total: number; count: number }>();
  const touch = (date: string): DailyPoint => {
    let d = dayMap.get(date);
    if (!d) {
      d = {
        date,
        label: new Date(date).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" }),
        income: 0,
        expense: 0,
      };
      dayMap.set(date, d);
    }
    return d;
  };
  if (expensesOk) {
    const addCat = (cat: Category, amountBase: number) => {
      const e = catMap.get(cat.key);
      if (e) {
        e.total += amountBase;
        e.count += 1;
      } else {
        catMap.set(cat.key, { category: cat, total: amountBase, count: 1 });
      }
    };
    for (const it of realCardExpenses) {
      const v = cardToBase(Math.abs(it.amount))!;
      addCat(mccToCategory(it.mcc, it.amount), v);
      const date = new Date(it.time * 1000).toISOString().slice(0, 10);
      touch(date).expense += v;
      const name = (it.description || "Невідомо").trim();
      const e = merchMap.get(name);
      if (e) {
        e.total += v;
        e.count += 1;
      } else {
        merchMap.set(name, { name, total: v, count: 1 });
      }
    }
    for (const e of cashExpenseEntries) {
      const cur = e.currency ?? base;
      const v = convertMinor(e.amount ?? 0, cur, base, rates)!;
      const cat = CATEGORIES[e.category ?? "other"] ?? CATEGORIES.other;
      addCat(cat, v);
      touch(e.date).expense += v;
    }
    if (salaries !== null && incomeFxUnavailableCurrency === null) {
      for (const s of salaries) {
        const ms = new Date(s.paidOn).getTime();
        if (!inPeriod(ms)) continue;
        const v = convertMinor(s.amount, s.currency, base, rates);
        if (v === null) continue;
        touch(s.paidOn).income += v;
      }
    }
  }
  const byCategory = [...catMap.values()].sort((a, b) => b.total - a.total);
  const daily = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));
  const topMerchants = [...merchMap.values()].sort((a, b) => b.total - a.total).slice(0, 6);

  return {
    base,
    totalExpense,
    cardExpense: expensesOk ? cardExpense : null,
    cashExpense: expensesOk ? cashExpense : null,
    expenseFxUnavailableCurrency,
    totalIncome,
    incomeLoading,
    incomeFxUnavailableCurrency,
    net,
    byCategory,
    daily,
    topMerchants,
  };
}

export function cashBalancesByAccount(wallet: WalletEntry[]): Record<string, Record<number, number>> {
  const result: Record<string, Record<number, number>> = {};
  const add = (accountId: string, cur: number, v: number) => {
    const bucket = (result[accountId] ??= {});
    bucket[cur] = (bucket[cur] ?? 0) + v;
  };
  for (const e of wallet) {
    switch (e.kind) {
      case "income":
        add(e.accountId ?? DEFAULT_CASH_ACCOUNT_ID, e.currency ?? 980, e.amount ?? 0);
        break;
      case "expense":
        add(e.accountId ?? DEFAULT_CASH_ACCOUNT_ID, e.currency ?? 980, -(e.amount ?? 0));
        break;
      case "topup":
        add(e.accountId ?? DEFAULT_CASH_ACCOUNT_ID, e.currency ?? 980, -(e.amount ?? 0));
        break;
      case "withdraw":
        add(e.accountId ?? DEFAULT_CASH_ACCOUNT_ID, e.currency ?? 980, e.amount ?? 0);
        break;
      case "convert":
        add(e.accountId ?? DEFAULT_CASH_ACCOUNT_ID, e.fromCurrency ?? 840, -(e.fromAmount ?? 0));
        add(e.accountId ?? DEFAULT_CASH_ACCOUNT_ID, e.toCurrency ?? 980, e.toAmount ?? 0);
        break;
      case "transfer": {
        const cur = e.currency ?? 980;
        const amt = e.amount ?? 0;
        add(e.fromAccountId ?? DEFAULT_CASH_ACCOUNT_ID, cur, -amt);
        add(e.toAccountId ?? DEFAULT_CASH_ACCOUNT_ID, cur, amt);
        break;
      }
      default: {
        const exhaustiveCheck: never = e.kind;
        throw new Error(`Unhandled WalletKind: ${exhaustiveCheck}`);
      }
    }
  }
  return result;
}

export function cashBalances(wallet: WalletEntry[]): Record<number, number> {
  const byAccount = cashBalancesByAccount(wallet);
  const bal: Record<number, number> = {};
  for (const bucket of Object.values(byAccount)) {
    for (const [cur, v] of Object.entries(bucket)) {
      bal[Number(cur)] = (bal[Number(cur)] ?? 0) + v;
    }
  }
  return bal;
}

export function referencedAccountIds(wallet: WalletEntry[]): Set<string> {
  const ids = new Set<string>();
  for (const e of wallet) {
    if (e.accountId !== undefined) ids.add(e.accountId);
    if (e.fromAccountId !== undefined) ids.add(e.fromAccountId);
    if (e.toAccountId !== undefined) ids.add(e.toAccountId);
  }
  return ids;
}

export { CATEGORIES };
