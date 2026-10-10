"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { House, ReceiptText, Target, ChartPie, Menu, RefreshCw, KeyRound, ExternalLink, Loader2 } from "lucide-react";
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
  getTxNotes,
  setTxNotes as persistTxNotes,
  getExcludedAccounts,
  setExcludedAccounts as persistExcludedAccounts,
  getTxOverrides,
  setTxOverrides as persistTxOverrides,
  getPartnerKeywords,
  setPartnerKeywords as persistPartnerKeywords,
  getTxCommitments,
  setTxCommitments as persistTxCommitments,
  getCommitmentOverrides,
  setCommitmentOverrides as persistCommitmentOverrides,
  getManualMode,
  setManualMode as persistManualMode,
  type CommitmentOverride,
  type CommitmentOverridesMap,
  type TxOverrideType,
  type TxOverridesMap,
  type TxCommitmentsMap,
  type WalletEntry,
  type WishItem,
} from "@/lib/storage";
import { DEFAULT_CASH_ACCOUNT_ID, type CashAccount } from "@/lib/cashAccounts";
import { incomePeriodStart, incomePeriodEnd, type IncomeSchedule } from "@/lib/metrics/schedule";
import { currencyMeta, type MonoStatementItem } from "@/lib/monobank";
import { formatMoney } from "@/lib/format";
import { isOwnJarTransfer } from "@/lib/jarTransfers";
import {
  findPairedTransfers,
  isEffectiveExpense,
  isEffectiveIncome,
} from "@/lib/transfers";
import { computeCommitmentSettlements } from "@/lib/commitmentPayments";
import { cn } from "@/lib/utils";
import { TokenGate } from "@/components/TokenGate";
import { RefreshButton } from "@/components/RefreshButton";
import { Dashboard } from "@/components/Dashboard";
import { HomeSkeleton } from "@/components/HomeSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";

import { Evaluator } from "@/components/Evaluator";
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
  { key: "year", label: "Рік" },
  { key: "all", label: "Увесь час" },
];

export default function Home() {
  const { state, connect, refresh, changeAccount, changePeriod, disconnect } = useMono();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [masked, setMasked] = useState(false);
  const [evaluatorOpen, setEvaluatorOpen] = useState(false);
  const [newTokenInput, setNewTokenInput] = useState("");
  const [isEditingToken, setIsEditingToken] = useState(false);
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
    { id: number; name: string; amount: number; currency: number; cadence: Cadence; anchorDay: number; source?: "card" | "cash" }[] | null
  >(null);
  const [commitmentsError, setCommitmentsError] = useState<string | null>(null);
  const [rawSalaries, setRawSalaries] = useState<{ paidOn: string; amount: number; currency: number }[] | null>(
    null
  );
  const [salariesError, setSalariesError] = useState<string | null>(null);
  const [ratings, setRatingsState] = useState<Record<string, number> | null>(null);
  const [ratingsError, setRatingsError] = useState<string | null>(null);
  const [suggestionsCount, setSuggestionsCount] = useState<number | null>(null);
  const [txNotes, setTxNotesState] = useState<Record<string, string>>({});
  const [excludedAccounts, setExcludedAccountsState] = useState<string[]>([]);
  const [txOverrides, setTxOverridesState] = useState<TxOverridesMap>({});
  const [partnerKeywords, setPartnerKeywordsState] = useState<string[]>([]);
  const [txCommitments, setTxCommitmentsState] = useState<TxCommitmentsMap>({});
  const [commitmentOverrides, setCommitmentOverridesState] = useState<CommitmentOverridesMap>(() =>
    getCommitmentOverrides()
  );
  const [manualMode, setManualModeState] = useState(() => getManualMode());

  const [budgetScope, setBudgetScope] = useState<"personal" | "family">("personal");

  const hasSharedCards = useMemo(() => {
    return state.client?.accounts.some((a) => a.isShared) ?? false;
  }, [state.client?.accounts]);

  const displayedMonoAccounts = useMemo(() => {
    if (!state.client) return [];
    if (!hasSharedCards) return state.client.accounts;
    if (budgetScope === "family") {
      return state.client.accounts.filter((a) => a.isShared);
    }
    return state.client.accounts.filter((a) => !a.isShared);
  }, [state.client, hasSharedCards, budgetScope]);

  const activeMonoAccounts = useMemo(() => {
    return displayedMonoAccounts.filter((a) => !excludedAccounts.includes(a.id));
  }, [displayedMonoAccounts, excludedAccounts]);

  const toggleExcludeAccount = useCallback((id: string) => {
    setExcludedAccountsState((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      persistExcludedAccounts(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (state.client?.accounts && state.client.accounts.length > 0) {
      const saved = getExcludedAccounts();
      if (saved.length === 0) {
        const fopIds = state.client.accounts.filter((a) => a.type === "fop").map((a) => a.id);
        if (fopIds.length > 0) {
          setExcludedAccountsState(fopIds);
          persistExcludedAccounts(fopIds);
        }
      }
    }
  }, [state.client?.accounts]);

  useEffect(() => {
    if (!hasSharedCards) return;
    if (budgetScope === "family") {
      const firstShared = state.client?.accounts.find((a) => a.isShared);
      if (firstShared && state.selectedAccount !== firstShared.id) {
        changeAccount(firstShared.id);
      }
    } else {
      const firstPersonal = state.client?.accounts.find((a) => !a.isShared);
      if (firstPersonal && state.selectedAccount !== firstPersonal.id) {
        changeAccount(firstPersonal.id);
      }
    }
  }, [budgetScope, hasSharedCards, state.client?.accounts, state.selectedAccount, changeAccount]);

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
      setTxNotesState(getTxNotes());
      setExcludedAccountsState(getExcludedAccounts());
      setTxOverridesState(getTxOverrides());
      setPartnerKeywordsState(getPartnerKeywords());
      setTxCommitmentsState(getTxCommitments());
      setCommitmentOverridesState(getCommitmentOverrides());
      setManualModeState(getManualMode());
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
  const updateTxNotes = (txId: string, note: string) => {
    const next = { ...txNotes };
    if (note.trim()) {
      next[txId] = note.trim();
    } else {
      delete next[txId];
    }
    setTxNotesState(next);
    persistTxNotes(next);
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

  const updateTxOverride = (txId: string, override: TxOverrideType | null) => {
    const next = { ...txOverrides };
    if (override === null) {
      delete next[txId];
    } else {
      next[txId] = override;
    }
    setTxOverridesState(next);
    persistTxOverrides(next);

    if (override === "ignored" && !fakeIds.includes(txId)) {
      const nextFake = [...fakeIds, txId];
      setFakeIdsState(nextFake);
      persistFakeIds(nextFake);
    } else if (override !== "ignored" && fakeIds.includes(txId)) {
      const nextFake = fakeIds.filter((id) => id !== txId);
      setFakeIdsState(nextFake);
      persistFakeIds(nextFake);
    }
  };

  const updateTxCommitment = useCallback((txId: string, commitmentId: number | null, sourceType: "mono" | "cash") => {
    if (sourceType === "mono") {
      setTxCommitmentsState((prev) => {
        const next = { ...prev };
        if (commitmentId === null) {
          delete next[txId];
        } else {
          next[txId] = commitmentId;
        }
        persistTxCommitments(next);
        return next;
      });
    } else {
      setWalletState((prev) => {
        const next = prev.map((w) => {
          if (w.id !== txId) return w;
          const copy = { ...w };
          if (commitmentId === null) {
            delete copy.commitmentId;
          } else {
            copy.commitmentId = commitmentId;
          }
          return copy;
        });
        persistWallet(next);
        return next;
      });
    }
  }, []);

  const updateCommitmentOverride = useCallback(
    (commitmentId: number, override: CommitmentOverride | null) => {
      setCommitmentOverridesState((prev) => {
        const next = { ...prev };
        if (!override) {
          delete next[commitmentId];
        } else {
          next[commitmentId] = override;
        }
        persistCommitmentOverrides(next);
        return next;
      });
    },
    []
  );

  const account = state.client?.accounts.find((a) => a.id === state.selectedAccount);
  const accountCurrency = account?.currencyCode ?? 980;
  const fakeSet = useMemo(() => new Set(fakeIds), [fakeIds]);
  const rates = state.rates;

  const jarTitlesRaw =
    state.client?.jars
      ?.map((j) => j.title)
      .filter((t): t is string => typeof t === "string" && t.trim() !== "") ?? null;
  const jarTitlesKey = jarTitlesRaw?.join(" ") ?? null;
  const jarTitles = useMemo(() => jarTitlesRaw, [jarTitlesKey]);

  const pairedIds = useMemo(() => findPairedTransfers(state.statement), [state.statement]);
  const transferContext = useMemo(
    () => ({
      fakeIds: fakeSet,
      txOverrides,
      jarTitles,
      excludedAccounts,
      partnerKeywords,
    }),
    [fakeSet, txOverrides, jarTitles, excludedAccounts, partnerKeywords]
  );

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
        txOverrides,
        excludedAccounts,
        partnerKeywords,
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
      txOverrides,
      excludedAccounts,
      partnerKeywords,
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
        items: { id: number; name: string; amount: number; currency: number; cadence: Cadence; anchor_day: number; source?: "card" | "cash" }[];
      };
      if (isCancelled?.()) return;
      setRawCommitments(
        data.items.map((c) => ({
          id: c.id,
          name: c.name,
          amount: c.amount,
          currency: c.currency,
          cadence: c.cadence,
          anchorDay: c.anchor_day,
          source: c.source ?? "card",
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
      .filter((it) => isEffectiveExpense(it, transferContext, pairedIds))
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
  }, [state.statement, transferContext, pairedIds, loadRatings]);

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
    let totalBase = 0;
    for (const [cur, amt] of Object.entries(cash)) {
      const v = convertMinor(amt, Number(cur), base, rates);
      if (v === null) return { ok: false as const, currency: Number(cur) };
      totalBase += v;
    }
    const accountsToInclude = activeMonoAccounts.length > 0
      ? activeMonoAccounts
      : (account && !excludedAccounts.includes(account.id) ? [account] : []);

    for (const a of accountsToInclude) {
      const ownFunds = Math.max(0, a.balance - (a.creditLimit ?? 0));
      const cardBase = convertMinor(ownFunds, a.currencyCode, base, rates);
      if (cardBase === null) return { ok: false as const, currency: a.currencyCode };
      totalBase += cardBase;
    }
    return { ok: true as const, value: totalBase };
  }, [wallet, activeMonoAccounts, account, excludedAccounts, base, rates]);

  const liquid = liquidResult.ok ? liquidResult.value : null;
  const liquidFxUnavailable = liquidResult.ok ? null : liquidResult.currency;

  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNowSeconds(Math.floor(Date.now() / 1000)), 60_000);
    return () => clearInterval(id);
  }, []);

  const periodBounds = useMemo(
    () =>
      schedule ? { start: incomePeriodStart(schedule, nowSeconds), end: incomePeriodEnd(schedule, nowSeconds) } : null,
    [schedule, nowSeconds]
  );

  const currentPeriodBounds = useMemo(() => {
    if (periodBounds) return periodBounds;
    const d = new Date(nowSeconds * 1000);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const start = Math.floor(Date.UTC(y, m, 1) / 1000);
    const end = Math.floor(Date.UTC(y, m + 1, 0, 23, 59, 59) / 1000);
    return { start, end };
  }, [periodBounds, nowSeconds]);

  const commitmentSettlementResult = useMemo(() => {
    if (!rawCommitments) return null;
    return computeCommitmentSettlements({
      commitments: rawCommitments,
      statement: state.statement,
      wallet,
      txCommitments,
      commitmentOverrides,
      periodStart: currentPeriodBounds.start,
      periodEnd: currentPeriodBounds.end,
      base,
      rates,
      accountCurrency,
    });
  }, [rawCommitments, state.statement, wallet, txCommitments, commitmentOverrides, currentPeriodBounds, base, rates, accountCurrency]);

  const settlements = commitmentSettlementResult?.settlements;
  const commitmentTxIds = commitmentSettlementResult?.commitmentTxIds ?? new Set<string>();
  const commitmentWalletIds = commitmentSettlementResult?.commitmentWalletIds ?? new Set<string>();

  const commitmentsResult = useMemo(() => {
    if (rawCommitments === null) return null;
    const converted: AllowanceCommitment[] = [];
    for (const c of rawCommitments) {
      const amountBase = convertMinor(c.amount, c.currency, base, rates);
      if (amountBase === null) return { ok: false as const, currency: c.currency };
      const settlement = settlements?.get(c.id);
      const isPaid = settlement?.isPaid ?? false;
      const paidBase = settlement?.paidBase;
      const remainingReserve = settlement?.remainingReserve;
      const settledExternally = settlement?.settledExternally;

      converted.push({
        id: c.id,
        name: c.name,
        amountBase,
        cadence: c.cadence,
        anchorDay: c.anchorDay,
        source: c.source ?? "card",
        paidInPeriod: isPaid,
        paidBase,
        remainingReserve,
        settledExternally,
      });
    }
    return { ok: true as const, commitments: converted };
  }, [rawCommitments, settlements, base, rates]);

  const spentTodayResult = useMemo(() => {
    const todayStart = Math.floor(nowSeconds / 86_400) * 86_400;
    let total = 0;
    for (const it of state.statement) {
      if (!isEffectiveExpense(it, transferContext, pairedIds)) continue;
      if (commitmentTxIds.has(it.id)) continue;
      if (it.time < todayStart || it.time >= todayStart + 86_400) continue;
      const cur = it.currencyCode ?? accountCurrency;
      const v = convertMinor(Math.abs(it.amount), cur, base, rates);
      if (v === null) return { ok: false as const, currency: cur };
      total += v;
    }
    for (const e of wallet) {
      if (e.kind !== "expense") continue;
      if (e.commitmentId || commitmentWalletIds.has(e.id)) continue;
      if (typeof e.amount !== "number") continue;
      const entryDayStart = Math.floor(new Date(e.date).getTime() / 1000 / 86_400) * 86_400;
      if (entryDayStart !== todayStart) continue;
      const cur = e.currency ?? base;
      const v = convertMinor(e.amount, cur, base, rates);
      if (v === null) return { ok: false as const, currency: cur };
      total += v;
    }
    return { ok: true as const, value: total };
  }, [state.statement, transferContext, pairedIds, commitmentTxIds, commitmentWalletIds, accountCurrency, base, rates, wallet, nowSeconds]);
  const spentTodayBase = spentTodayResult.ok ? spentTodayResult.value : null;
  const spentTodayFxUnavailable = spentTodayResult.ok ? null : spentTodayResult.currency;

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
    const periodPairedIds = findPairedTransfers(periodStatement);
    let total = 0;
    for (const it of periodStatement) {
      if (!isEffectiveExpense(it, transferContext, periodPairedIds)) continue;
      if (it.time < periodBounds.start || it.time >= rangeEnd) continue;
      const cur = it.currencyCode ?? accountCurrency;
      const v = convertMinor(Math.abs(it.amount), cur, base, rates);
      if (v === null) return { ok: false as const, currency: cur };
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
  }, [periodBounds, periodStatement, transferContext, accountCurrency, base, rates, wallet, nowSeconds]);
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
    () => state.statement.filter((it) => isEffectiveExpense(it, transferContext, pairedIds)),
    [state.statement, transferContext, pairedIds]
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

  if (!state.hasToken && !manualMode) {
    return (
      <TokenGate
        onConnect={(token) => {
          setManualModeState(false);
          persistManualMode(false);
          connect(token);
        }}
        onContinueManual={() => {
          setManualModeState(true);
          persistManualMode(true);
        }}
        loading={state.loading}
        error={state.error}
      />
    );
  }

  if (!state.client && !manualMode) {
    const isTokenError = Boolean(
      state.error && (/токен|token|403|недійсн|невірн|авториз/i.test(state.error))
    );
    const showTokenForm = isTokenError || isEditingToken;

    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-5 py-8">
        <div className="soft-shadow space-y-5 rounded-[28px] bg-card p-6 sm:p-7 border border-border/50">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex size-11 items-center justify-center rounded-2xl shrink-0",
                isTokenError ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
              )}
            >
              {isTokenError ? <KeyRound className="size-5" /> : <RefreshCw className="size-5" />}
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-xl font-semibold leading-tight">
                {isTokenError ? "Токен Monobank недійсний" : "Monobank зараз не відповів"}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isTokenError
                  ? "Потрібно оновити персональний токен"
                  : "Сервер або банк тимчасово недоступний"}
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-secondary/60 p-3.5 text-xs text-muted-foreground border border-border/40">
            {state.error ?? "Не вдалося завантажити дані рахунків з Monobank."}
          </div>

          {showTokenForm ? (
            <div className="space-y-3.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">Введіть новий токен</span>
                <a
                  href="https://api.monobank.ua/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Отримати на api.monobank.ua <ExternalLink className="size-3" />
                </a>
              </div>
              <Input
                type="password"
                value={newTokenInput}
                onChange={(e) => setNewTokenInput(e.target.value)}
                placeholder="Вставте новий токен (u...)"
                className="h-11 rounded-xl"
                onKeyDown={(e) => e.key === "Enter" && newTokenInput.trim() && connect(newTokenInput.trim())}
              />
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  className="h-11 flex-1 rounded-2xl font-medium"
                  disabled={state.loading || !newTokenInput.trim()}
                  onClick={() => connect(newTokenInput.trim())}
                >
                  {state.loading ? (
                    <Loader2 className="size-4 animate-spin mr-2" />
                  ) : (
                    <KeyRound className="size-4 mr-2" />
                  )}
                  {state.loading ? "Збереження…" : "Зберегти новий токен"}
                </Button>
                {isEditingToken && !isTokenError && (
                  <Button
                    variant="outline"
                    className="h-11 rounded-2xl"
                    onClick={() => setIsEditingToken(false)}
                  >
                    Скасувати
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Button className="h-11 w-full rounded-2xl" onClick={() => window.location.reload()}>
                <RefreshCw className="size-4 mr-2" /> Спробувати ще
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full rounded-2xl"
                onClick={() => setIsEditingToken(true)}
              >
                <KeyRound className="size-4 mr-2" /> Змінити токен Monobank
              </Button>
              <Button
                variant="ghost"
                className="h-10 w-full rounded-2xl text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setManualModeState(true);
                  persistManualMode(true);
                }}
              >
                Продовжити в ручному режимі (без Monobank)
              </Button>
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-border/50 text-xs">
            <button
              type="button"
              onClick={disconnect}
              className="text-muted-foreground hover:text-destructive transition-colors font-medium"
            >
              Скинути збережений токен
            </button>
            <button
              type="button"
              onClick={() => {
                void fetch("/api/auth/logout", { method: "POST" }).then(() => {
                  window.location.href = "/login";
                });
              }}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Вийти з акаунта
            </button>
          </div>
        </div>
      </div>
    );
  }

  const now = new Date();
  const showPeriod = tab === "money" || tab === "insights";

  return (
    <div className="min-h-screen">
      {/* Desktop Sidebar (visible on md: and above) */}
      <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-64 border-r bg-card/70 backdrop-blur-md p-6 z-40">
        <div className="flex items-center gap-3 mb-8">
          <div className="size-10 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg shadow-sm">
            ₴
          </div>
          <div>
            <h2 className="font-semibold text-sm leading-tight">Чи доживу я?</h2>
            <p className="text-xs text-muted-foreground">Фінансовий асистент</p>
          </div>
        </div>

        {hasSharedCards && (
          <div className="mb-6 flex flex-col gap-1.5 p-1.5 bg-secondary/80 rounded-2xl text-xs">
            <button
              type="button"
              onClick={() => setBudgetScope("personal")}
              className={cn(
                "px-3 py-2 rounded-xl text-left font-semibold flex items-center gap-2 transition-all",
                budgetScope === "personal"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span>👤</span> Особистий бюджет
            </button>
            <button
              type="button"
              onClick={() => setBudgetScope("family")}
              className={cn(
                "px-3 py-2 rounded-xl text-left font-semibold flex items-center gap-2 transition-all",
                budgetScope === "family"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span>👥</span> Сімейний бюджет
            </button>
          </div>
        )}

        <nav className="flex-1 space-y-1.5">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => {
                  setTab(t.key);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className={cn(
                  "w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-sm font-medium transition-all text-left",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                )}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="pt-4 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
          <div className="truncate font-medium">{state.client?.name ?? "Користувач"}</div>
          <RefreshButton lastFetched={state.lastFetched} refreshing={state.refreshing} onClick={refresh} />
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="md:pl-64">
        <div className="mx-auto max-w-lg md:max-w-5xl lg:max-w-7xl px-4 md:px-8 pb-32 md:pb-12 pt-5 md:pt-8">
          <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            {tab === "dashboard" ? (
              <div className="min-w-0">
                <h1 className="font-display truncate text-[26px] md:text-3xl font-semibold leading-tight">{greeting(now.getHours())}</h1>
                <p className="text-sm text-muted-foreground">{todayLongUk(now)}</p>
              </div>
            ) : (
              <h1 className="font-display text-[26px] md:text-3xl font-semibold leading-tight">{TAB_TITLE[tab]}</h1>
            )}

            <div className="flex items-center gap-3">
              {showPeriod && (
                <div className="flex rounded-full bg-card p-1 soft-shadow">
                  {PERIODS.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => changePeriod(p.key)}
                      className={cn(
                        "px-4 py-1.5 rounded-full text-xs font-medium transition-[color,background-color,transform] duration-200 active:scale-[0.97]",
                        state.period === p.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="md:hidden">
                <RefreshButton lastFetched={state.lastFetched} refreshing={state.refreshing} onClick={refresh} />
              </div>
            </div>
          </header>

          {/* Mobile-only Budget Switcher */}
          {hasSharedCards && (
            <div className="md:hidden mb-5 flex rounded-2xl bg-secondary/80 p-1">
              <button
                type="button"
                onClick={() => setBudgetScope("personal")}
                className={cn(
                  "flex-1 py-2 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5",
                  budgetScope === "personal"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span>👤</span> Мій особистий бюджет
              </button>
              <button
                type="button"
                onClick={() => setBudgetScope("family")}
                className={cn(
                  "flex-1 py-2 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5",
                  budgetScope === "family"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span>👥</span> Спільний сімейний
              </button>
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
            monoAccounts={displayedMonoAccounts}
            selectedMonoId={state.selectedAccount}
            onSelectMono={changeAccount}
            onWalletChange={updateWallet}
            onCashAccountsChange={updateCashAccounts}
            lastUsedAccountId={lastUsedAccountId}
            onAccountUsed={setLastUsedAccountId}
            masked={masked}
            onToggleMasked={toggleMasked}
            onOpenEvaluator={() => setEvaluatorOpen(true)}
            activeMonoAccounts={activeMonoAccounts}
            excludedAccounts={excludedAccounts}
            txOverrides={txOverrides}
            jarTitles={jarTitles}
            partnerKeywords={partnerKeywords}
            commitments={rawCommitments ?? undefined}
            txCommitments={txCommitments}
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
            txNotes={txNotes}
            onSaveNote={updateTxNotes}
            txOverrides={txOverrides}
            onChangeOverride={updateTxOverride}
            partnerKeywords={partnerKeywords}
            excludedAccounts={excludedAccounts}
            commitments={rawCommitments ?? undefined}
            txCommitments={txCommitments}
            onLinkCommitment={updateTxCommitment}
            period={state.period}
            onChangePeriod={changePeriod}
            selectedAccount={state.selectedAccount}
            onSelectAccount={changeAccount}
            monoAccounts={activeMonoAccounts}
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
            jars={state.client?.jars ?? []}
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
            excludedAccounts={excludedAccounts}
            onToggleExcludeAccount={toggleExcludeAccount}
            settlements={settlements}
            commitmentOverrides={commitmentOverrides}
            onUpdateCommitmentOverride={updateCommitmentOverride}
            periodStart={currentPeriodBounds.start}
            onConnectMono={connect}
          />
        )}
      </main>
        </div>
      </div>

      <nav
        className="md:hidden fixed inset-x-0 bottom-0 z-50 flex justify-center px-4"
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

      <Sheet open={evaluatorOpen} onClose={() => setEvaluatorOpen(false)} title="Чи можу я це купити?">
        <div className="rounded-3xl bg-card p-4 soft-shadow">
          <Evaluator
            base={base}
            rates={rates}
            liquid={liquid}
            commitments={commitmentsResult?.ok ? commitmentsResult.commitments : []}
            goals={allGoals}
            buffer={buffer}
            schedule={schedule}
            monthlyNet={monthlyNetBase}
            monthlyIncome={monthlyIncomeBase}
            hourlyRate={hourlyRateBase}
            hourlyRateReason={hourlyRateReason}
            nowSeconds={nowSeconds}
            loading={allowanceLoading}
            error={commitmentsError}
            fxUnavailableCurrency={fxUnavailableCurrency}
          />
        </div>
      </Sheet>
    </div>
  );
}
