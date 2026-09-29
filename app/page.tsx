"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { House, ReceiptText, Target, ChartPie, Menu, RefreshCw } from "lucide-react";
import { useMono, fetchTransactionsRange, type Period } from "@/lib/useMono";
import { analyze, cashBalances } from "@/lib/analytics";
import { mccToCategory } from "@/lib/mcc";
import { monthlyIncomeFromSalaries, hourlyRate, type WorkSchedule, type SalaryRecord } from "@/lib/metrics/salary";
import { buildStrategies } from "@/lib/strategies";
import { convertMinor, rateBetween } from "@/lib/fx";
import type { MetricsPayload } from "@/lib/metricsPayload";
import { computeRunway } from "@/lib/metrics/runway";
import { computeAllowance, type AllowanceCommitment } from "@/lib/metrics/allowance";
import { spendableLiquid } from "@/lib/metrics/spendableLiquid";
import { daysUntilDeadline, type AllowanceGoal } from "@/lib/metrics/goals";
import { emergencyState, SAVINGS_RESERVE_GOAL_NAME, type SavingsPlan } from "@/lib/metrics/savings";
import { savingsStillOwed, daysToMonthEnd } from "@/lib/metrics/savingsContribution";
import { categoryJoy, type RatedSpend } from "@/lib/metrics/joy";
import type { Cadence } from "@/lib/metrics/cadence";
import {
  hydrateStore,
  getWallet,
  setWallet as persistWallet,
  getBudgets,
  setBudgets as persistBudgets,
  getFakeIds,
  setFakeIds as persistFakeIds,
  getWishlist,
  setWishlist as persistWishlist,
  getBaseCurrency,
  setBaseCurrency as persistBase,
  getIncomeSchedule,
  setIncomeSchedule as persistSchedule,
  getWorkSchedule,
  setWorkSchedule as persistWorkSchedule,
  getBuffer,
  setBuffer as persistBuffer,
  getSavingsPlan,
  setSavingsPlan as persistSavingsPlan,
  getCashAccounts,
  setCashAccounts as persistCashAccounts,
  type WalletEntry,
  type WishItem,
} from "@/lib/storage";
import { DEFAULT_CASH_ACCOUNT_ID, type CashAccount } from "@/lib/cashAccounts";
import { incomePeriodStart, incomePeriodEnd, type IncomeSchedule } from "@/lib/metrics/schedule";
import { currencyMeta, type MonoStatementItem } from "@/lib/monobank";
import { formatMoney } from "@/lib/format";
import { isOwnJarTransfer } from "@/lib/jarTransfers";
import { cn } from "@/lib/utils";
import { TokenGate } from "@/components/TokenGate";
import { RefreshButton } from "@/components/RefreshButton";
import { Dashboard } from "@/components/Dashboard";
import { HomeSkeleton } from "@/components/HomeSkeleton";
import { Button } from "@/components/ui/button";
import dynamic from "next/dynamic";
import { greeting, todayLongUk } from "@/lib/home/greeting";

type Tab = "dashboard" | "money" | "goals" | "insights" | "settings";

function TabFallback() {
  return (
    <div className="space-y-4">
      <div className="skeleton h-40 rounded-3xl" />
      <div className="skeleton h-64 rounded-3xl" />
    </div>
  );
}

const loadMoney = () => import("@/components/Money").then((m) => m.Money);
const loadGoals = () => import("@/components/Goals").then((m) => m.Goals);
const loadInsights = () => import("@/components/Insights").then((m) => m.Insights);
const loadSettings = () => import("@/components/Settings").then((m) => m.Settings);
const Money = dynamic(loadMoney, { loading: TabFallback });
const Goals = dynamic(loadGoals, { loading: TabFallback });
const Insights = dynamic(loadInsights, { loading: TabFallback });
const Settings = dynamic(loadSettings, { loading: TabFallback });

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "dashboard", label: "Головна", icon: <House className="size-5" /> },
  { key: "money", label: "Операції", icon: <ReceiptText className="size-5" /> },
  { key: "goals", label: "Цілі", icon: <Target className="size-5" /> },
  { key: "insights", label: "Аналітика", icon: <ChartPie className="size-5" /> },
  { key: "settings", label: "Меню", icon: <Menu className="size-5" /> },
];

const TAB_TITLE: Record<Exclude<Tab, "dashboard">, string> = {
  money: "Операції",
  goals: "Цілі",
  insights: "Аналітика",
  settings: "Меню",
};

const MASKED_KEY = "money.masked";

function readMasked(): boolean {
  try {
    return window.localStorage.getItem(MASKED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMasked(v: boolean) {
  try {
    window.localStorage.setItem(MASKED_KEY, v ? "1" : "0");
  } catch {}
}

const PERIODS: { key: Period; label: string }[] = [
  { key: "month", label: "Місяць" },
  { key: "prev", label: "Мин." },
  { key: "7d", label: "7д" },
];

export default function Home() {
  const { state, connect, refresh, changeAccount, changePeriod, disconnect } = useMono();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [masked, setMasked] = useState(false);
  useEffect(() => setMasked(readMasked()), []);
  const clientReady = state.client !== null;
  useEffect(() => {
    if (!clientReady) return;
    const warm = () => {
      void loadMoney();
      void loadGoals();
      void loadInsights();
      void loadSettings();
      void import("@/components/SpendGauge");
    };
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(warm, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(warm, 1500);
    return () => clearTimeout(id);
  }, [clientReady]);
  const toggleMasked = useCallback(() => {
    setMasked((v) => {
      writeMasked(!v);
      return !v;
    });
  }, []);
  const [wallet, setWalletState] = useState<WalletEntry[]>([]);
  const [budgets, setBudgetsState] = useState<Record<string, number>>({});
  const [fakeIds, setFakeIdsState] = useState<string[]>([]);
  const [wishlist, setWishlistState] = useState<WishItem[]>([]);
  const [base, setBaseState] = useState(980);
  const [schedule, setScheduleState] = useState<IncomeSchedule | null>(null);
  const [workSchedule, setWorkScheduleState] = useState<WorkSchedule | null>(null);
  const [buffer, setBufferState] = useState(0);
  const [savingsPlan, setSavingsPlanState] = useState<SavingsPlan>({
    emergencyMonths: null,
    monthlyContribution: null,
    spendablePct: null,
  });
  const [cashAccounts, setCashAccountsState] = useState<CashAccount[]>(() => getCashAccounts());
  const [lastUsedAccountId, setLastUsedAccountId] = useState(DEFAULT_CASH_ACCOUNT_ID);
  const [hydrated, setHydrated] = useState(false);
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null);
  const [rawCommitments, setRawCommitments] = useState<
    { name: string; amount: number; currency: number; cadence: Cadence; anchorDay: number }[] | null
  >(null);
  const [commitmentsError, setCommitmentsError] = useState<string | null>(null);
  const [rawSalaries, setRawSalaries] = useState<{ paidOn: string; amount: number; currency: number }[] | null>(
    null
  );
  const [salariesError, setSalariesError] = useState<string | null>(null);
  const [ratings, setRatingsState] = useState<Record<string, number> | null>(null);
  const [ratingsError, setRatingsError] = useState<string | null>(null);
  const [suggestionsCount, setSuggestionsCount] = useState<number | null>(null);

  useEffect(() => {
    void hydrateStore().then(() => {
      setWalletState(getWallet());
      setBudgetsState(getBudgets());
      setFakeIdsState(getFakeIds());
      setWishlistState(getWishlist());
      setBaseState(getBaseCurrency());
      setScheduleState(getIncomeSchedule());
      setWorkScheduleState(getWorkSchedule());
      setBufferState(getBuffer());
      setSavingsPlanState(getSavingsPlan());
      setCashAccountsState(getCashAccounts());
      setHydrated(true);
    });
  }, []);

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
    }
    window.location.href = "/login";
  };

  const updateWallet = (list: WalletEntry[]) => {
    setWalletState(list);
    persistWallet(list);
  };
  const updateCashAccounts = (list: CashAccount[]) => {
    setCashAccountsState(list);
    persistCashAccounts(list);
  };
  const updateBudgets = (b: Record<string, number>) => {
    setBudgetsState(b);
    persistBudgets(b);
  };
  const updateWishlist = (list: WishItem[]) => {
    setWishlistState(list);
    persistWishlist(list);
  };
  const updateBase = (c: number) => {
    setBaseState(c);
    persistBase(c);
  };
  const updateSchedule = (s: IncomeSchedule) => {
    setScheduleState(s);
    persistSchedule(s);
  };
  const updateWorkSchedule = (s: WorkSchedule) => {
    setWorkScheduleState(s);
    persistWorkSchedule(s);
  };
  const updateBuffer = (v: number) => {
    setBufferState(v);
    persistBuffer(v);
  };
  const updateSavingsPlan = (p: SavingsPlan) => {
    setSavingsPlanState(p);
    persistSavingsPlan(p);
  };
  const toggleFake = (id: string) => {
    const next = fakeIds.includes(id) ? fakeIds.filter((x) => x !== id) : [...fakeIds, id];
    setFakeIdsState(next);
    persistFakeIds(next);
  };

  const account = state.client?.accounts.find((a) => a.id === state.selectedAccount);
  const accountCurrency = account?.currencyCode ?? 980;
  const fakeSet = useMemo(() => new Set(fakeIds), [fakeIds]);
  const rates = state.rates;

  const jarTitlesRaw =
    state.client?.jars
      ?.map((j) => j.title)
      .filter((t): t is string => typeof t === "string" && t.trim() !== "") ?? null;
  const jarTitlesKey = jarTitlesRaw?.join("") ?? null;
  const jarTitles = useMemo(() => jarTitlesRaw, [jarTitlesKey]);

  const analytics = useMemo(
    () =>
      analyze({
        items: state.statement,
        wallet,
        fakeIds: fakeSet,
        base,
        accountCurrency,
        rates,
        fromMs: state.range.fromMs,
        toMs: state.range.toMs,
        jarTitles,
        salaries: rawSalaries,
      }),
    [
      state.statement,
      wallet,
      fakeSet,
      base,
      accountCurrency,
      rates,
      state.range.fromMs,
      state.range.toMs,
      jarTitles,
      rawSalaries,
    ]
  );

  useEffect(() => {
    setMetrics(null);
    if (!state.selectedAccount) return;
    let cancelled = false;
    const params = new URLSearchParams({ account: state.selectedAccount });
    for (const t of jarTitles ?? []) params.append("jarTitle", t);
    fetch(`/api/metrics?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: MetricsPayload | null) => {
        if (!cancelled) setMetrics(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [state.selectedAccount, jarTitles]);

  const loadCommitments = useCallback(async (isCancelled?: () => boolean) => {
    try {
      const res = await fetch("/api/commitments", { cache: "no-store" });
      if (isCancelled?.()) return;
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) {
        setCommitmentsError(`Статус ${res.status}`);
        return;
      }
      const data = (await res.json()) as {
        items: { name: string; amount: number; currency: number; cadence: Cadence; anchor_day: number }[];
      };
      if (isCancelled?.()) return;
      setRawCommitments(
        data.items.map((c) => ({
          name: c.name,
          amount: c.amount,
          currency: c.currency,
          cadence: c.cadence,
          anchorDay: c.anchor_day,
        }))
      );
      setCommitmentsError(null);
    } catch (e) {
      if (isCancelled?.()) return;
      setCommitmentsError(e instanceof Error ? e.message : "Не вдалося завантажити зобов'язання");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadCommitments(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadCommitments]);

  const loadSuggestions = useCallback(async (isCancelled?: () => boolean) => {
    try {
      const res = await fetch("/api/commitments/suggestions", { cache: "no-store" });
      if (isCancelled?.()) return;
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as { items: unknown[] };
      if (isCancelled?.()) return;
      setSuggestionsCount(Array.isArray(data.items) ? data.items.length : null);
    } catch {
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadSuggestions(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadSuggestions]);

  const reloadCommitments = useCallback(() => {
    void loadCommitments();
    void loadSuggestions();
  }, [loadCommitments, loadSuggestions]);

  const loadSalaries = useCallback(async (isCancelled?: () => boolean) => {
    try {
      const res = await fetch("/api/salaries", { cache: "no-store" });
      if (isCancelled?.()) return;
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) {
        setSalariesError(`Статус ${res.status}`);
        return;
      }
      const data = (await res.json()) as {
        items: { paid_on: string; amount: number; currency: number }[];
      };
      if (isCancelled?.()) return;
      setRawSalaries(data.items.map((s) => ({ paidOn: s.paid_on, amount: s.amount, currency: s.currency })));
      setSalariesError(null);
    } catch (e) {
      if (isCancelled?.()) return;
      setSalariesError(e instanceof Error ? e.message : "Не вдалося завантажити зарплати");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadSalaries(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadSalaries]);

  const RATINGS_CHUNK = 150;
  const loadRatings = useCallback(async (ids: string[], isCancelled: () => boolean) => {
    try {
      const merged: Record<string, number> = {};
      for (let i = 0; i < ids.length; i += RATINGS_CHUNK) {
        const chunk = ids.slice(i, i + RATINGS_CHUNK);
        const res = await fetch(`/api/ratings?ids=${chunk.join(",")}`, { cache: "no-store" });
        if (isCancelled()) return;
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!res.ok) throw new Error(`Статус ${res.status}`);
        const data = (await res.json()) as { ratings: Record<string, number> };
        Object.assign(merged, data.ratings);
      }
      if (!isCancelled()) {
        setRatingsState(merged);
        setRatingsError(null);
      }
    } catch (e) {
      if (isCancelled()) return;
      setRatingsError(e instanceof Error ? e.message : "Не вдалося завантажити оцінки");
    }
  }, []);

  useEffect(() => {
    const ids = state.statement
      .filter(
        (it) => it.amount < 0 && !fakeSet.has(it.id) && !isOwnJarTransfer(it.mcc, it.description, jarTitles)
      )
      .map((it) => it.id);
    if (ids.length === 0) {
      setRatingsState({});
      setRatingsError(null);
      return;
    }
    let cancelled = false;
    void loadRatings(ids, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [state.statement, fakeSet, jarTitles, loadRatings]);

  const rateTx = useCallback(
    async (txId: string, score: number | null) => {
      let prevScore: number | undefined;
      setRatingsState((r) => {
        prevScore = r?.[txId];
        const next = { ...r };
        if (score === null) delete next[txId];
        else next[txId] = score;
        return next;
      });
      try {
        const res =
          score === null
            ? await fetch(`/api/ratings?txId=${encodeURIComponent(txId)}`, { method: "DELETE" })
            : await fetch("/api/ratings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ txId, score }),
              });
        if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
      } catch {
        setRatingsState((r) => {
          const next = { ...r };
          if (prevScore === undefined) delete next[txId];
          else next[txId] = prevScore;
          return next;
        });
      }
    },
    []
  );

  const liquidResult = useMemo(() => {
    const cash = cashBalances(wallet);
    let cashBase = 0;
    for (const [cur, amt] of Object.entries(cash)) {
      const v = convertMinor(amt, Number(cur), base, rates);
      if (v === null) return { ok: false as const, currency: Number(cur) };
      cashBase += v;
    }
    if (account) {
      const cardBase = convertMinor(account.balance, accountCurrency, base, rates);
      if (cardBase === null) return { ok: false as const, currency: accountCurrency };
      cashBase += cardBase;
    }
    return { ok: true as const, value: cashBase };
  }, [wallet, account, accountCurrency, base, rates]);

  const liquid = liquidResult.ok ? liquidResult.value : null;
  const liquidFxUnavailable = liquidResult.ok ? null : liquidResult.currency;

  const commitmentsResult = useMemo(() => {
    if (rawCommitments === null) return null;
    const converted: AllowanceCommitment[] = [];
    for (const c of rawCommitments) {
      const amountBase = convertMinor(c.amount, c.currency, base, rates);
      if (amountBase === null) return { ok: false as const, currency: c.currency };
      converted.push({ name: c.name, amountBase, cadence: c.cadence, anchorDay: c.anchorDay });
    }
    return { ok: true as const, commitments: converted };
  }, [rawCommitments, base, rates]);

  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNowSeconds(Math.floor(Date.now() / 1000)), 60_000);
    return () => clearInterval(id);
  }, []);

  const spentTodayResult = useMemo(() => {
    const todayStart = Math.floor(nowSeconds / 86_400) * 86_400;
    let total = 0;
    for (const it of state.statement) {
      if (it.amount >= 0) continue;
      if (fakeSet.has(it.id)) continue;
      if (isOwnJarTransfer(it.mcc, it.description, jarTitles)) continue;
      if (it.time < todayStart || it.time >= todayStart + 86_400) continue;
      const v = convertMinor(Math.abs(it.amount), accountCurrency, base, rates);
      if (v === null) return { ok: false as const, currency: accountCurrency };
      total += v;
    }
    for (const e of wallet) {
      if (e.kind !== "expense") continue;
      if (typeof e.amount !== "number") continue;
      const entryDayStart = Math.floor(new Date(e.date).getTime() / 1000 / 86_400) * 86_400;
      if (entryDayStart !== todayStart) continue;
      const cur = e.currency ?? base;
      const v = convertMinor(e.amount, cur, base, rates);
      if (v === null) return { ok: false as const, currency: cur };
      total += v;
    }
    return { ok: true as const, value: total };
  }, [state.statement, fakeSet, jarTitles, accountCurrency, base, rates, wallet, nowSeconds]);
  const spentTodayBase = spentTodayResult.ok ? spentTodayResult.value : null;
  const spentTodayFxUnavailable = spentTodayResult.ok ? null : spentTodayResult.currency;

  const periodBounds = useMemo(
    () =>
      schedule ? { start: incomePeriodStart(schedule, nowSeconds), end: incomePeriodEnd(schedule, nowSeconds) } : null,
    [schedule, nowSeconds]
  );

  const [periodStatement, setPeriodStatement] = useState<MonoStatementItem[] | null>(null);
  const [periodStatementError, setPeriodStatementError] = useState<string | null>(null);
  useEffect(() => {
    if (!periodBounds || !state.selectedAccount) {
      setPeriodStatement(null);
      setPeriodStatementError(null);
      return;
    }
    let cancelled = false;
    setPeriodStatement(null);
    setPeriodStatementError(null);
    fetchTransactionsRange(state.selectedAccount, periodBounds.start, periodBounds.end)
      .then((items) => {
        if (!cancelled) setPeriodStatement(items ?? []);
      })
      .catch((e) => {
        if (!cancelled) setPeriodStatementError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [periodBounds, state.selectedAccount, state.lastFetched]);

  const periodSpentResult = useMemo(() => {
    if (!periodBounds) return null;
    if (periodStatement === null) return { ok: true as const, loading: true as const, value: null };
    const todayStart = Math.floor(nowSeconds / 86_400) * 86_400;
    const rangeEnd = Math.min(periodBounds.end, todayStart + 86_400);
    let total = 0;
    for (const it of periodStatement) {
      if (it.amount >= 0) continue;
      if (fakeSet.has(it.id)) continue;
      if (isOwnJarTransfer(it.mcc, it.description, jarTitles)) continue;
      if (it.time < periodBounds.start || it.time >= rangeEnd) continue;
      const v = convertMinor(Math.abs(it.amount), accountCurrency, base, rates);
      if (v === null) return { ok: false as const, currency: accountCurrency };
      total += v;
    }
    for (const e of wallet) {
      if (e.kind !== "expense") continue;
      if (typeof e.amount !== "number") continue;
      const entryDayStart = Math.floor(new Date(e.date).getTime() / 1000 / 86_400) * 86_400;
      if (entryDayStart < periodBounds.start || entryDayStart >= rangeEnd) continue;
      const cur = e.currency ?? base;
      const v = convertMinor(e.amount, cur, base, rates);
      if (v === null) return { ok: false as const, currency: cur };
      total += v;
    }
    return { ok: true as const, loading: false as const, value: total };
  }, [periodBounds, periodStatement, fakeSet, jarTitles, accountCurrency, base, rates, wallet, nowSeconds]);
  const periodSpentLoading = periodSpentResult !== null && periodSpentResult.ok && periodSpentResult.loading;
  const periodSpentBase = periodSpentResult && periodSpentResult.ok && !periodSpentResult.loading ? periodSpentResult.value : null;
  const periodSpentFxUnavailable = periodSpentResult && !periodSpentResult.ok ? periodSpentResult.currency : null;

  const goalsResult = useMemo(() => {
    const goals: AllowanceGoal[] = [];
    for (const w of wishlist) {
      if (w.deadline === undefined) continue;
      const priceBase = convertMinor(w.price, w.currency, base, rates);
      if (priceBase === null) return { ok: false as const, currency: w.currency };
      const deadlineDays = daysUntilDeadline(w.deadline, nowSeconds);
      goals.push({ name: w.name, remainingBase: priceBase, deadlineDays: deadlineDays ?? NaN });
    }
    return { ok: true as const, goals };
  }, [wishlist, base, rates, nowSeconds]);

  const commitmentsFxUnavailable = commitmentsResult && !commitmentsResult.ok ? commitmentsResult.currency : null;
  const goalsFxUnavailable = !goalsResult.ok ? goalsResult.currency : null;

  const jarsResult = useMemo(() => {
    const jars = state.client?.jars;
    if (!jars || jars.length === 0) return { ok: true as const, value: 0 };
    let total = 0;
    for (const j of jars) {
      const v = convertMinor(j.balance, j.currencyCode, base, rates);
      if (v === null) return { ok: false as const, currency: j.currencyCode };
      total += v;
    }
    return { ok: true as const, value: total };
  }, [state.client?.jars, base, rates]);
  const jarsTotalBase = jarsResult.ok ? jarsResult.value : null;
  const jarsFxUnavailable = jarsResult.ok ? null : jarsResult.currency;

  const toBase = useCallback(
    (v: number) => convertMinor(v, accountCurrency, base, rates),
    [accountCurrency, base, rates]
  );

  const monthlyExpenseBase = useMemo<number | null>(
    () =>
      metrics?.monthly.value && metrics.monthly.confidence !== "insufficient"
        ? toBase(metrics.monthly.value.p50)
        : null,
    [metrics, toBase]
  );

  const accountFxUnavailable =
    accountCurrency !== base && rateBetween(rates, accountCurrency, base) === null ? accountCurrency : null;

  const dailySeriesBase = useMemo<{ date: string; spent: number }[] | null>(() => {
    if (!metrics || accountFxUnavailable !== null) return null;
    return metrics.dailySeries.map((d) => ({ date: d.date, spent: toBase(d.spent) as number }));
  }, [metrics, accountFxUnavailable, toBase]);
  const seriesFxUnavailable = metrics && accountFxUnavailable !== null ? accountFxUnavailable : null;

  const dailyMedianBase =
    metrics?.dailyMedian.value !== null && metrics?.dailyMedian.value !== undefined && accountFxUnavailable === null
      ? toBase(metrics.dailyMedian.value)
      : null;

  const emergency = useMemo(
    () =>
      emergencyState({
        plan: savingsPlan,
        savedBase: buffer,
        medianMonthlyExpense: monthlyExpenseBase,
        fxUnavailableCurrency: accountFxUnavailable,
      }),
    [savingsPlan, buffer, monthlyExpenseBase, accountFxUnavailable]
  );

  const savingsOwedResult = useMemo(() => {
    const c = savingsPlan.monthlyContribution;
    if (c === null || !(c > 0)) return { ok: true as const, goal: null };
    const owed = savingsStillOwed({
      statement: state.statement,
      jarTitles,
      monthlyContributionBase: c,
      accountCurrency,
      base,
      rates,
      nowSeconds,
    });
    if (!owed.ok) return { ok: false as const, currency: owed.currency };
    return {
      ok: true as const,
      goal: {
        name: SAVINGS_RESERVE_GOAL_NAME,
        remainingBase: owed.remainingBase,
        deadlineDays: daysToMonthEnd(nowSeconds),
      } satisfies AllowanceGoal,
    };
  }, [savingsPlan.monthlyContribution, state.statement, jarTitles, accountCurrency, base, rates, nowSeconds]);
  const savingsGoal: AllowanceGoal | null = savingsOwedResult.ok ? savingsOwedResult.goal : null;
  const savingsFxUnavailable = !savingsOwedResult.ok ? savingsOwedResult.currency : null;

  const fxUnavailableCurrency =
    liquidFxUnavailable ?? commitmentsFxUnavailable ?? goalsFxUnavailable ?? savingsFxUnavailable;
  const hasCommitments = commitmentsResult?.ok === true && commitmentsResult.commitments.length > 0;
  const allowanceLoading = rawCommitments === null && commitmentsError === null;

  const baseGoals = goalsResult.ok ? goalsResult.goals : [];
  const allGoals = savingsGoal ? [...baseGoals, savingsGoal] : baseGoals;

  const salariesBaseResult = useMemo(() => {
    if (rawSalaries === null) return null;
    const records: SalaryRecord[] = [];
    for (let i = 0; i < rawSalaries.length; i++) {
      const s = rawSalaries[i];
      const v = convertMinor(s.amount, s.currency, base, rates);
      if (v === null) return { ok: false as const, currency: s.currency };
      records.push({ id: i, paidOn: s.paidOn, amount: v, currency: base });
    }
    return { ok: true as const, records };
  }, [rawSalaries, base, rates]);

  const salaryIncomeResult = useMemo(
    () =>
      salariesBaseResult && salariesBaseResult.ok
        ? monthlyIncomeFromSalaries(salariesBaseResult.records.map((r) => r.amount))
        : null,
    [salariesBaseResult]
  );

  const monthlyIncomeBase =
    salaryIncomeResult && salaryIncomeResult.confidence !== "insufficient" ? salaryIncomeResult.value : null;
  const monthlyIncomeConfidenceLow = salaryIncomeResult?.confidence === "low";

  const spendableLiquidResult = useMemo(
    () =>
      liquid === null
        ? null
        : spendableLiquid({ actualLiquid: liquid, monthlyIncome: monthlyIncomeBase, spendablePct: savingsPlan.spendablePct }),
    [liquid, monthlyIncomeBase, savingsPlan.spendablePct]
  );
  const liquidForLimit = spendableLiquidResult ? spendableLiquidResult.value : null;
  const spendableReason = spendableLiquidResult?.reason ?? null;
  const limitedBy = spendableLiquidResult?.limitedBy ?? null;
  const salaryBudget = spendableLiquidResult?.salaryBudget ?? null;

  const allowance = useMemo(
    () =>
      liquidForLimit === null || !commitmentsResult || !commitmentsResult.ok || !goalsResult.ok
        ? null
        : computeAllowance({
            liquid: liquidForLimit,
            commitments: commitmentsResult.commitments,
            goals: allGoals,
            buffer,
            schedule,
            nowSeconds,
          }),
    [commitmentsResult, goalsResult, liquidForLimit, buffer, schedule, nowSeconds, allGoals]
  );

  const incomeFxUnavailable = salariesBaseResult && !salariesBaseResult.ok ? salariesBaseResult.currency : null;

  const hourlyRateResult = useMemo(
    () =>
      salariesBaseResult && salariesBaseResult.ok
        ? hourlyRate({ salaries: salariesBaseResult.records, schedule: workSchedule })
        : null,
    [salariesBaseResult, workSchedule]
  );
  const hourlyRateBase = hourlyRateResult?.value ?? null;
  const hourlyRateReason =
    incomeFxUnavailable !== null
      ? `Немає курсу для ${currencyMeta(incomeFxUnavailable).code} — ставку за годину порахувати не можна.`
      : rawSalaries === null
        ? "Зарплати ще завантажуються…"
        : (hourlyRateResult?.reason ?? null);

  const incomeUnavailableReasonPlain =
    monthlyIncomeBase !== null || incomeFxUnavailable !== null
      ? null
      : salariesError !== null
        ? `Не вдалося завантажити зарплати: ${salariesError}.`
        : rawSalaries === null
          ? "Зарплати ще завантажуються…"
          : "Додай хоч одну зарплату — без неї дохід невідомий.";

  const incomeUnavailableReason =
    incomeFxUnavailable !== null
      ? `Немає курсу для ${currencyMeta(incomeFxUnavailable).code} — дохід порахувати не можна.`
      : incomeUnavailableReasonPlain;

  const recurringMonthlyBase = useMemo(() => {
    if (!commitmentsResult || !commitmentsResult.ok) return 0;
    return commitmentsResult.commitments.reduce(
      (s, c) => s + (c.cadence === "weekly" ? c.amountBase * (52 / 12) : c.amountBase),
      0
    );
  }, [commitmentsResult]);

  const ratableItems = useMemo(
    () =>
      state.statement.filter(
        (it) => it.amount < 0 && !fakeSet.has(it.id) && !isOwnJarTransfer(it.mcc, it.description, jarTitles)
      ),
    [state.statement, fakeSet, jarTitles]
  );
  const ratingsLoading = ratings === null && ratingsError === null;
  const joyRatedCount = useMemo(
    () => (ratings ? ratableItems.filter((it) => ratings[it.id] !== undefined).length : 0),
    [ratableItems, ratings]
  );
  const joyCategories = useMemo(() => {
    if (accountFxUnavailable !== null) return null;
    if (ratings === null) return null;
    const rated: RatedSpend[] = [];
    for (const it of ratableItems) {
      const score = ratings[it.id];
      if (score === undefined) continue;
      const amountBase = toBase(Math.abs(it.amount));
      if (amountBase === null) continue;
      rated.push({ category: mccToCategory(it.mcc, it.amount).key, score, amountBase });
    }
    return categoryJoy(rated);
  }, [ratableItems, ratings, toBase, accountFxUnavailable]);

  const monthlyNetBase =
    monthlyExpenseBase !== null && monthlyIncomeBase !== null
      ? monthlyIncomeBase - monthlyExpenseBase
      : null;

  const runway = useMemo(() => {
    if (!metrics?.monthly.value || liquid === null || monthlyIncomeBase === null) return null;
    const monthlyExpenseP90 = toBase(metrics.monthly.value.p90);
    if (monthlyExpenseP90 === null) return null;
    return computeRunway({
      liquid,
      monthlyIncome: monthlyIncomeBase,
      monthlyExpenseP90,
      nowSeconds: Math.floor(Date.now() / 1000),
    });
  }, [metrics, liquid, monthlyIncomeBase, toBase]);

  const strategies = useMemo(
    () =>
      buildStrategies({
        monthlyIncome: monthlyIncomeBase,
        incomeFxUnavailable,
        incomeUnavailableReason: incomeUnavailableReasonPlain,
        monthlyExpense: monthlyExpenseBase,
        liquid,
        liquidFxUnavailable,
        recurringMonthly: recurringMonthlyBase,
        recurringFxUnavailable: commitmentsFxUnavailable,
        recurringError: commitmentsError,
        byCategory: analytics.byCategory,
        fmt: (m: number) => formatMoney(m, base),
      }),
    [
      monthlyIncomeBase,
      incomeFxUnavailable,
      incomeUnavailableReasonPlain,
      monthlyExpenseBase,
      liquid,
      liquidFxUnavailable,
      recurringMonthlyBase,
      commitmentsFxUnavailable,
      commitmentsError,
      analytics.byCategory,
      base,
    ]
  );

  if (!hydrated) return null;

  if (state.initializing) return <HomeSkeleton />;

  if (!state.hasToken) {
    return <TokenGate onConnect={connect} loading={state.loading} error={state.error} />;
  }

  if (!state.client) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-5">
        <div className="soft-shadow space-y-4 rounded-[28px] bg-card p-6">
          <h1 className="font-display text-xl font-semibold">Monobank зараз не відповів</h1>
          <p className="text-sm text-muted-foreground">{state.error ?? "Дані рахунків не завантажились."}</p>
          <Button className="h-11 w-full rounded-full" onClick={() => window.location.reload()}>
            <RefreshCw className="size-4" /> Спробувати ще
          </Button>
        </div>
      </div>
    );
  }

  const now = new Date();
  const showPeriod = tab === "money" || tab === "insights";

  return (
    <div className="mx-auto max-w-lg px-4 pb-32 pt-5">
      <header className="mb-5 flex items-center justify-between gap-3">
        {tab === "dashboard" ? (
          <div className="min-w-0">
            <h1 className="font-display truncate text-[26px] font-semibold leading-tight">{greeting(now.getHours())}</h1>
            <p className="text-sm text-muted-foreground">{todayLongUk(now)}</p>
          </div>
        ) : (
          <h1 className="font-display text-[26px] font-semibold leading-tight">{TAB_TITLE[tab]}</h1>
        )}
        <RefreshButton lastFetched={state.lastFetched} refreshing={state.refreshing} onClick={refresh} />
      </header>

      {showPeriod && (
        <div className="mb-4 flex rounded-full bg-card p-1 soft-shadow">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => changePeriod(p.key)}
              className={cn(
                "flex-1 rounded-full py-2 text-xs font-medium transition-[color,background-color,transform] duration-200 active:scale-[0.97]",
                state.period === p.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {state.error && (
        <div className="mb-4 rounded-3xl bg-destructive/10 p-4 text-sm text-destructive">{state.error}</div>
      )}

      {state.loading && (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="size-3.5 spin" /> Завантаження даних…
        </div>
      )}

      <main key={tab} className="tab-in">
        {tab === "dashboard" && (
          <Dashboard
            account={account}
            wallet={wallet}
            cashAccounts={cashAccounts}
            rates={rates}
            base={base}
            allowance={allowance}
            allowanceLoading={allowanceLoading}
            allowanceError={commitmentsError}
            fxUnavailableCurrency={fxUnavailableCurrency}
            hasCommitments={hasCommitments}
            hasSavingsGoal={savingsGoal !== null}
            spentTodayBase={spentTodayBase}
            spentTodayFxUnavailable={spentTodayFxUnavailable}
            dailySeries={dailySeriesBase}
            seriesFxUnavailable={seriesFxUnavailable}
            dailyMedianBase={dailyMedianBase}
            onSetupIncome={() => setTab("settings")}
            statement={state.statement}
            accountCurrency={accountCurrency}
            fakeIds={fakeSet}
            onViewAllOperations={() => setTab("money")}
            limitedBy={limitedBy}
            salaryBudget={salaryBudget}
            spendableReason={spendableReason}
            periodStart={periodBounds?.start ?? null}
            periodEnd={periodBounds?.end ?? null}
            periodSpentBase={periodSpentBase}
            periodSpentLoading={periodSpentLoading}
            periodSpentFxUnavailable={periodSpentFxUnavailable}
            periodStatementError={periodStatementError}
            suggestionsCount={suggestionsCount}
            onOpenCommitments={() => setTab("settings")}
            monoAccounts={state.client.accounts}
            selectedMonoId={state.selectedAccount}
            onSelectMono={changeAccount}
            onWalletChange={updateWallet}
            onCashAccountsChange={updateCashAccounts}
            lastUsedAccountId={lastUsedAccountId}
            onAccountUsed={setLastUsedAccountId}
            masked={masked}
            onToggleMasked={toggleMasked}
          />
        )}
        {tab === "money" && (
          <Money
            statement={state.statement}
            accountCurrency={accountCurrency}
            fakeIds={fakeSet}
            onToggleFake={toggleFake}
            ratings={ratings}
            onRate={(id, score) => void rateTx(id, score)}
            wallet={wallet}
            onWalletChange={updateWallet}
            account={account}
            rates={rates}
            base={base}
            jarTitles={jarTitles}
            cashAccounts={cashAccounts}
            onCashAccountsChange={updateCashAccounts}
            lastUsedAccountId={lastUsedAccountId}
            onAccountUsed={setLastUsedAccountId}
          />
        )}
        {tab === "goals" && (
          <Goals
            wishlist={wishlist}
            onChange={updateWishlist}
            base={base}
            rates={rates}
            liquid={liquid}
            monthlyNet={monthlyNetBase}
            monthlyIncome={monthlyIncomeBase}
            monthlyIncomeConfidenceLow={monthlyIncomeConfidenceLow}
            hourlyRate={hourlyRateBase}
            hourlyRateReason={hourlyRateReason}
            allowance={allowance}
            commitments={commitmentsResult?.ok ? commitmentsResult.commitments : []}
            goals={allGoals}
            buffer={buffer}
            schedule={schedule}
            allowanceLoading={allowanceLoading}
            allowanceError={commitmentsError}
            fxUnavailableCurrency={fxUnavailableCurrency}
            nowSeconds={nowSeconds}
            savingsPlan={savingsPlan}
            onSavingsPlanChange={updateSavingsPlan}
            emergency={emergency}
            jarsTotalBase={jarsTotalBase}
            jarsFxUnavailable={jarsFxUnavailable}
          />
        )}
        {tab === "insights" && (
          <Insights
            analytics={analytics}
            base={base}
            periodLabel={state.range.label}
            budgets={budgets}
            onBudgetChange={updateBudgets}
            strategies={strategies}
            joy={joyCategories}
            joyRatedCount={joyRatedCount}
            joyRatableCount={ratableItems.length}
            joyFxUnavailableCurrency={accountFxUnavailable}
            joyRatingsLoading={ratingsLoading}
            joyRatingsError={ratingsError}
            metrics={
              metrics
                ? {
                    dailyMedian: metrics.dailyMedian.value !== null ? toBase(metrics.dailyMedian.value) : null,
                    dailyConfidence: metrics.dailyMedian.confidence,
                    p10: metrics.monthly.value ? toBase(metrics.monthly.value.p10) : null,
                    p50: metrics.monthly.value ? toBase(metrics.monthly.value.p50) : null,
                    p90: metrics.monthly.value ? toBase(metrics.monthly.value.p90) : null,
                    monthlyConfidence: metrics.monthly.confidence,
                    anomalies: metrics.anomalies.reduce<{ date: string; expense: number }[]>((acc, a) => {
                      const expense = toBase(a.expense);
                      if (expense !== null) acc.push({ date: a.date, expense });
                      return acc;
                    }, []),
                    anomaliesFxUnavailable:
                      metrics.anomalies.length > 0 && accountFxUnavailable !== null ? accountFxUnavailable : null,
                    fxUnavailableCurrency: accountFxUnavailable,
                    runway,
                    incomeUnavailableReason,
                  }
                : null
            }
          />
        )}
        {tab === "settings" && (
          <Settings
            client={state.client}
            selectedAccount={state.selectedAccount}
            base={base}
            onBaseChange={updateBase}
            onSelect={changeAccount}
            onDisconnect={disconnect}
            onLogout={logout}
            schedule={schedule}
            buffer={buffer}
            onScheduleChange={updateSchedule}
            onBufferChange={updateBuffer}
            onCommitmentsChanged={reloadCommitments}
            workSchedule={workSchedule}
            onWorkScheduleChange={updateWorkSchedule}
            onSalariesChanged={() => void loadSalaries()}
            monthlyIncome={monthlyIncomeBase}
            monthlyIncomeConfidenceLow={monthlyIncomeConfidenceLow}
            incomeUnavailableReason={incomeUnavailableReason}
            accountCurrency={accountCurrency}
            jarTitles={jarTitles}
          />
        )}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
      >
        <div className="dock-shadow relative grid w-full max-w-sm grid-cols-5 rounded-full bg-card/90 p-1.5 backdrop-blur-md">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-1.5 left-1.5 flex w-[calc((100%-0.75rem)/5)] justify-center"
            style={{
              transform: `translateX(${TABS.findIndex((t) => t.key === tab) * 100}%)`,
              transition: "transform 0.42s var(--ease-drawer)",
            }}
          >
            <span className="size-12 rounded-full bg-primary shadow-lg shadow-foreground/20" />
          </span>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => {
                  setTab(t.key);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                aria-label={t.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative z-10 mx-auto flex size-12 items-center justify-center rounded-full transition-[color,transform] duration-300 active:scale-90",
                  active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.icon}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
