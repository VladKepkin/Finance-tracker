"use client";

import { isValidSchedule, type IncomeSchedule } from "./metrics/schedule";
import { parseDeadline } from "./metrics/goals";
import type { SavingsPlan } from "./metrics/savings";
import { isValidWorkSchedule, type WorkSchedule } from "./metrics/salary";
import { parseCashAccounts, type CashAccount } from "./cashAccounts";

export type WalletKind = "income" | "expense" | "convert" | "topup" | "withdraw" | "transfer";

export interface WalletEntry {
  id: string;
  date: string;
  kind: WalletKind;
  amount?: number;
  currency?: number;
  source?: string;
  accountId?: string;
  category?: string;
  commitmentId?: number;
  fromAmount?: number;
  fromCurrency?: number;
  toAmount?: number;
  toCurrency?: number;
  fromAccountId?: string;
  toAccountId?: string;
}

export interface WishItem {
  id: string;
  name: string;
  price: number;
  currency: number;
  url?: string;
  deadline?: string;
  savedAmount?: number;
  completed?: boolean;
  completedAt?: string;
  jarId?: string;
}

const SYNC_KEYS = [
  "wallet",
  "budgets",
  "fake",
  "wishlist",
  "baseCurrency",
  "selectedAccount",
  "incomeSchedule",
  "buffer",
  "savingsPlan",
  "workSchedule",
  "cashAccounts",
  "txNotes",
  "excludedAccounts",
  "txOverrides",
  "partnerKeywords",
  "txCommitments",
  "commitmentOverrides",
  "manualMode",
] as const;
type SyncKey = (typeof SYNC_KEYS)[number];

const cache: Record<string, unknown> = {};
let hydratePromise: Promise<void> | null = null;

async function doHydrate(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const res = await fetch("/api/data", { cache: "no-store" });
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (res.ok) {
      const data = (await res.json()) as Record<string, unknown>;
      Object.assign(cache, data);
      importLegacyLocal(data);
    }
  } catch {
  }
}

export function hydrateStore(): Promise<void> {
  return (hydratePromise ??= doHydrate());
}

function get<T>(key: SyncKey, fallback: T): T {
  return (key in cache ? (cache[key] as T) : fallback);
}

function set<T>(key: SyncKey, value: T): void {
  cache[key] = value;
  if (typeof window === "undefined") return;
  void fetch("/api/data", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  }).catch(() => {});
}

const LEGACY_MAP: Record<SyncKey, string> = {
  wallet: "mt.wallet",
  budgets: "mt.budgets",
  fake: "mt.fake",
  wishlist: "mt.wishlist",
  baseCurrency: "mt.baseCurrency",
  selectedAccount: "mt.selectedAccount",
  incomeSchedule: "mt.incomeSchedule",
  buffer: "mt.buffer",
  savingsPlan: "mt.savingsPlan",
  workSchedule: "mt.workSchedule",
  cashAccounts: "mt.cashAccounts",
  txNotes: "mt.txNotes",
  excludedAccounts: "mt.excludedAccounts",
  txOverrides: "mt.txOverrides",
  partnerKeywords: "mt.partnerKeywords",
  txCommitments: "mt.txCommitments",
  commitmentOverrides: "mt.commitmentOverrides",
  manualMode: "mt.manualMode",
};

function importLegacyLocal(server: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (SYNC_KEYS.some((k) => k in server)) return;
  for (const key of SYNC_KEYS) {
    try {
      const raw = window.localStorage.getItem(LEGACY_MAP[key]);
      if (raw != null) {
        const value = JSON.parse(raw);
        set(key, value);
      }
    } catch {
    }
  }
}

export const getWallet = () => get<WalletEntry[]>("wallet", []);
export const setWallet = (list: WalletEntry[]) => set("wallet", list);

export const getCashAccounts = (): CashAccount[] => parseCashAccounts(get<unknown>("cashAccounts", []));
export const setCashAccounts = (list: CashAccount[]) => set("cashAccounts", list);

export const getBudgets = () => get<Record<string, number>>("budgets", {});
export const setBudgets = (b: Record<string, number>) => set("budgets", b);

export const getFakeIds = () => get<string[]>("fake", []);
export const setFakeIds = (ids: string[]) => set("fake", ids);

export const getWishlist = (): WishItem[] => {
  const list = get<WishItem[]>("wishlist", []);
  return list.map((item) => {
    if (item.deadline === undefined) return item;
    if (parseDeadline(item.deadline) !== null) return item;
    const { deadline: _deadline, ...rest } = item;
    return rest;
  });
};
export const setWishlist = (list: WishItem[]) => set("wishlist", list);

export const getBaseCurrency = () => get<number>("baseCurrency", 980);
export const setBaseCurrency = (c: number) => set("baseCurrency", c);

export const getSelectedAccount = () => get<string>("selectedAccount", "");
export const setSelectedAccount = (id: string) => set("selectedAccount", id);

export const getIncomeSchedule = (): IncomeSchedule | null => {
  const v = get<unknown>("incomeSchedule", null);
  return isValidSchedule(v) ? v : null;
};
export const setIncomeSchedule = (s: IncomeSchedule) => set("incomeSchedule", s);

export const getWorkSchedule = (): WorkSchedule | null => {
  const v = get<unknown>("workSchedule", null);
  return isValidWorkSchedule(v) ? v : null;
};
export const setWorkSchedule = (s: WorkSchedule) => set("workSchedule", s);

export const getBuffer = (): number => {
  const v = get<unknown>("buffer", 0);
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0;
};
export const setBuffer = (v: number) => set("buffer", v);

function validMonths(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 24 ? v : null;
}
function validContribution(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
}
function validSpendablePct(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 100 ? v : null;
}
export const getSavingsPlan = (): SavingsPlan => {
  const v = get<unknown>("savingsPlan", null);
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    return { emergencyMonths: null, monthlyContribution: null, spendablePct: null };
  }
  const obj = v as Record<string, unknown>;
  return {
    emergencyMonths: validMonths(obj.emergencyMonths),
    monthlyContribution: validContribution(obj.monthlyContribution),
    spendablePct: validSpendablePct(obj.spendablePct),
  };
};
export const setSavingsPlan = (p: SavingsPlan) => set("savingsPlan", p);

export const getTxNotes = (): Record<string, string> => {
  const v = get<unknown>("txNotes", {});
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, string>;
  }
  return {};
};
export const setTxNotes = (notes: Record<string, string>) => set("txNotes", notes);

export const getExcludedAccounts = (): string[] => {
  const v = get<unknown>("excludedAccounts", []);
  return Array.isArray(v) ? (v.filter((x): x is string => typeof x === "string") as string[]) : [];
};
export const setExcludedAccounts = (ids: string[]) => set("excludedAccounts", ids);

export type TxOverrideType = "expense" | "internal_transfer" | "shared_transit" | "ignored";
export type TxOverridesMap = Record<string, TxOverrideType>;

export const getTxOverrides = (): TxOverridesMap => {
  const v = get<unknown>("txOverrides", {});
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as TxOverridesMap;
  }
  return {};
};
export const setTxOverrides = (overrides: TxOverridesMap) => set("txOverrides", overrides);

export const getPartnerKeywords = (): string[] => {
  const v = get<unknown>("partnerKeywords", []);
  return Array.isArray(v) ? (v.filter((x): x is string => typeof x === "string") as string[]) : [];
};
export const setPartnerKeywords = (keywords: string[]) => set("partnerKeywords", keywords);

export type TxCommitmentsMap = Record<string, number>;

export const getTxCommitments = (): TxCommitmentsMap => {
  const v = get<unknown>("txCommitments", {});
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as TxCommitmentsMap;
  }
  return {};
};
export const setTxCommitments = (map: TxCommitmentsMap) => set("txCommitments", map);

export interface CommitmentOverride {
  periodStart: number;
  status: "settled_externally" | "fully_settled" | "partial_pending";
  note?: string;
  customCoveredAmount?: number;
}
export type CommitmentOverridesMap = Record<number, CommitmentOverride>;

export const getCommitmentOverrides = (): CommitmentOverridesMap => {
  const v = get<unknown>("commitmentOverrides", {});
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as CommitmentOverridesMap;
  }
  return {};
};
export const setCommitmentOverrides = (map: CommitmentOverridesMap) => set("commitmentOverrides", map);

export const getManualMode = (): boolean => Boolean(get<unknown>("manualMode", false));
export const setManualMode = (v: boolean) => set("manualMode", v);

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
