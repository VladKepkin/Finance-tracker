"use client";

import { useCallback, useEffect, useState } from "react";
import type { MonoClientInfo, MonoStatementItem } from "./monobank";
import type { CurrencyRate } from "./fx";
import {
  hydrateStore,
  getSelectedAccount,
  setSelectedAccount as persistSelected,
} from "./storage";

export const REFRESH_COOLDOWN_MS = 60_000;

interface TxRow {
  id: string;
  time: number;
  description: string | null;
  mcc: number | null;
  original_mcc: number | null;
  amount: number;
  operation_amount: number | null;
  currency_code: number;
  commission_rate: number | null;
  cashback_amount: number | null;
  balance: number | null;
  hold: number;
  comment: string | null;
  counter_name: string | null;
  account_id?: string;
}

function rowToItem(r: TxRow): MonoStatementItem {
  return {
    id: r.id,
    time: r.time,
    description: r.description ?? "",
    mcc: r.mcc ?? 0,
    originalMcc: r.original_mcc ?? 0,
    hold: r.hold === 1,
    amount: r.amount,
    operationAmount: r.operation_amount ?? r.amount,
    currencyCode: r.currency_code,
    commissionRate: r.commission_rate ?? 0,
    cashbackAmount: r.cashback_amount ?? 0,
    balance: r.balance ?? 0,
    comment: r.comment ?? undefined,
    counterName: r.counter_name ?? undefined,
    accountId: r.account_id ?? undefined,
  };
}

export type Period = "month" | "prev" | "7d";

export interface PeriodRange {
  fromMs: number;
  toMs: number;
  label: string;
}

export function rangeFor(period: Period): PeriodRange {
  const now = new Date();
  if (period === "7d") {
    return { fromMs: now.getTime() - 7 * 86400_000, toMs: now.getTime(), label: "7 днів" };
  }
  if (period === "prev") {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0).getTime();
    const to = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0).getTime() - 1000;
    return { fromMs: from, toMs: to, label: "Минулий місяць" };
  }
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0).getTime();
  return { fromMs: from, toMs: now.getTime(), label: "Цей місяць" };
}

export interface MonoState {
  hasToken: boolean;
  initializing: boolean;
  client: MonoClientInfo | null;
  statement: MonoStatementItem[];
  rates: CurrencyRate[];
  selectedAccount: string;
  period: Period;
  range: PeriodRange;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  lastFetched: number | null;
}

function redirectToLogin() {
  if (typeof window !== "undefined") window.location.href = "/login";
}

export async function fetchTransactionsRange(
  accountId: string,
  fromSeconds: number,
  toSeconds: number
): Promise<MonoStatementItem[] | null> {
  const PAGE_SIZE = 500;
  const MAX_PAGES = 20;
  const all: TxRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_SIZE;
    const accParam = accountId && accountId !== "all" ? `&account=${encodeURIComponent(accountId)}` : "";
    const res = await fetch(
      `/api/transactions?from=${fromSeconds}&to=${toSeconds}&limit=${PAGE_SIZE}&offset=${offset}${accParam}`
    );
    if (res.status === 401) {
      redirectToLogin();
      return null;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Не вдалося отримати виписку");
    const rows = data.items as TxRow[];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    if (page === MAX_PAGES - 1) {
      console.warn("Досягнуто ліміт сторінок — виписка може бути неповною");
    }
  }
  return all.map(rowToItem);
}

export function useMono() {
  const [hasToken, setHasToken] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [client, setClient] = useState<MonoClientInfo | null>(null);
  const [statement, setStatement] = useState<MonoStatementItem[]>([]);
  const [rates, setRates] = useState<CurrencyRate[]>([]);
  const [selectedAccount, setSelected] = useState("");
  const [period, setPeriod] = useState<Period>("month");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<number | null>(null);

  useEffect(() => {
    const cachedRaw =
      typeof window !== "undefined" ? window.sessionStorage.getItem("mt.rates") : null;
    if (cachedRaw) {
      try {
        setRates(JSON.parse(cachedRaw) as CurrencyRate[]);
        return;
      } catch {
      }
    }
    fetch("/api/monobank/currency")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: CurrencyRate[]) => {
        if (Array.isArray(d)) {
          setRates(d);
          try {
            window.sessionStorage.setItem("mt.rates", JSON.stringify(d));
          } catch {
          }
        }
      })
      .catch(() => {});
  }, []);

  const loadClient = useCallback(async (): Promise<{ info: MonoClientInfo; fetchedAt: number } | null> => {
    const res = await fetch("/api/monobank/client-info");
    if (res.status === 401) {
      redirectToLogin();
      return null;
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 400 && data?.error === "NO_TOKEN") return null;
    if (!res.ok) throw new Error(data.error || "Не вдалося отримати дані рахунків");
    const fetchedAt = Number(res.headers.get("X-Fetched-At")) || Date.now();
    return { info: data as MonoClientInfo, fetchedAt };
  }, []);

  const fetchStatement = useCallback(
    async (accountId: string, per: Period) => {
      const { fromMs, toMs } = rangeFor(per);
      const items = await fetchTransactionsRange(accountId, Math.floor(fromMs / 1000), Math.floor(toMs / 1000));
      if (items !== null) setStatement(items);
    },
    []
  );

  const connect = useCallback(
    async (t: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/monobank/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: t }),
        });
        if (res.status === 401) {
          redirectToLogin();
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Невірний токен");
        const info = data as MonoClientInfo;
        setHasToken(true);
        setClient(info);
        const first = getSelectedAccount() || info.accounts[0]?.id || "0";
        setSelected(first);
        persistSelected(first);
        await fetchStatement(first, period);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [fetchStatement, period]
  );

  useEffect(() => {
    let cancelled = false;
    void hydrateStore().then(async () => {
      if (cancelled) return;
      setSelected(getSelectedAccount());
      setLoading(true);
      try {
        const loaded = await loadClient();
        if (cancelled || !loaded) return;
        const { info } = loaded;
        setHasToken(true);
        setClient(info);
        setLastFetched(loaded.fetchedAt);
        const acc = getSelectedAccount() || info.accounts[0]?.id || "0";
        setSelected(acc);
        await fetchStatement(acc, period);
      } catch (e) {
        if (!cancelled) {
          setHasToken(true);
          setError((e as Error).message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setInitializing(false);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!hasToken || !selectedAccount) return;
    if (lastFetched && Date.now() - lastFetched < REFRESH_COOLDOWN_MS) return;
    setRefreshing(true);
    setError(null);
    try {
      const loaded = await loadClient();
      if (loaded) {
        setClient(loaded.info);
        setLastFetched(loaded.fetchedAt);
      }
      await fetchStatement(selectedAccount, period);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [hasToken, selectedAccount, period, lastFetched, loadClient, fetchStatement]);

  const changeAccount = useCallback(
    async (accountId: string) => {
      setSelected(accountId);
      persistSelected(accountId);
      if (!hasToken) return;
      setLoading(true);
      setError(null);
      try {
        await fetchStatement(accountId, period);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [hasToken, period, fetchStatement]
  );

  const changePeriod = useCallback(
    async (per: Period) => {
      setPeriod(per);
      if (!hasToken || !selectedAccount) return;
      setLoading(true);
      setError(null);
      try {
        await fetchStatement(selectedAccount, per);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [hasToken, selectedAccount, fetchStatement]
  );

  const disconnect = useCallback(async () => {
    try {
      await fetch("/api/monobank/token", { method: "DELETE" });
    } catch {
    }
    setHasToken(false);
    setClient(null);
    setStatement([]);
    setSelected("");
    persistSelected("");
    setError(null);
    setLastFetched(null);
  }, []);

  return {
    state: {
      hasToken,
      initializing,
      client,
      statement,
      rates,
      selectedAccount,
      period,
      range: rangeFor(period),
      loading,
      refreshing,
      error,
      lastFetched,
    } as MonoState,
    connect,
    refresh,
    changeAccount,
    changePeriod,
    disconnect,
  };
}
