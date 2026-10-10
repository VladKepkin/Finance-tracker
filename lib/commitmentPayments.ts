import type { MonoStatementItem } from "./monobank";
import type { WalletEntry, CommitmentOverride } from "./storage";
import { convertMinor, type CurrencyRate } from "./fx";
import type { Cadence } from "./metrics/cadence";

export interface CommitmentItem {
  id: number;
  name: string;
  amount: number;
  currency: number;
  cadence: Cadence;
  anchorDay: number;
  source?: "card" | "cash";
}

export interface CommitmentPaymentRecord {
  sourceType: "mono" | "cash";
  id: string;
  amount: number; // in original minor units (positive absolute)
  currency: number;
  amountBase: number;
  time: number; // unix seconds
  title?: string;
}

export interface CommitmentSettlement {
  commitmentId: number;
  isPaid: boolean;
  settledExternally: boolean;
  paidBase: number;
  paidCount: number;
  payments: CommitmentPaymentRecord[];
  remainingReserve: number;
  note?: string;
  statusOverride?: "settled_externally" | "fully_settled" | "partial_pending";
}

export function computeCommitmentSettlements(params: {
  commitments: readonly CommitmentItem[];
  statement: readonly MonoStatementItem[];
  wallet: readonly WalletEntry[];
  txCommitments: Record<string, number>;
  commitmentOverrides?: Record<number, CommitmentOverride>;
  periodStart: number;
  periodEnd: number;
  base: number;
  rates: readonly CurrencyRate[];
  accountCurrency: number;
}): {
  settlements: Map<number, CommitmentSettlement>;
  commitmentTxIds: Set<string>;
  commitmentWalletIds: Set<string>;
} {
  const {
    commitments,
    statement,
    wallet,
    txCommitments,
    commitmentOverrides,
    periodStart,
    periodEnd,
    base,
    rates,
    accountCurrency,
  } = params;

  const settlements = new Map<number, CommitmentSettlement>();
  const commitmentTxIds = new Set<string>();
  const commitmentWalletIds = new Set<string>();

  // Initialize settlements map for all commitments
  for (const c of commitments) {
    const plannedBase = convertMinor(c.amount, c.currency, base, rates) ?? c.amount;
    const override = commitmentOverrides?.[c.id];
    const isOverrideActive =
      Boolean(override &&
      (!override.periodStart ||
        (override.periodStart >= periodStart && override.periodStart <= periodEnd) ||
        override.periodStart === periodStart));

    const isExternallySettled = Boolean(isOverrideActive && override?.status === "settled_externally");

    settlements.set(c.id, {
      commitmentId: c.id,
      isPaid: isExternallySettled,
      settledExternally: isExternallySettled,
      paidBase: 0,
      paidCount: 0,
      payments: [],
      remainingReserve: isExternallySettled ? 0 : plannedBase,
      note: isExternallySettled ? override?.note || "Оплачено сторонньо" : undefined,
      statusOverride: isOverrideActive ? override?.status : undefined,
    });
  }

  // 1. Process card statement items
  for (const it of statement) {
    const cId = txCommitments[it.id];
    if (cId === undefined) continue;
    commitmentTxIds.add(it.id);

    // Only count within current period bounds
    if (it.time < periodStart || it.time > periodEnd) continue;

    const s = settlements.get(cId);
    if (!s) continue;

    const cur = it.currencyCode ?? accountCurrency;
    const absMinor = Math.abs(it.amount);
    const converted = convertMinor(absMinor, cur, base, rates) ?? absMinor;

    s.isPaid = true;
    s.paidBase += converted;
    s.paidCount += 1;
    s.payments.push({
      sourceType: "mono",
      id: it.id,
      amount: absMinor,
      currency: cur,
      amountBase: converted,
      time: it.time,
      title: it.description || it.comment || undefined,
    });
  }

  // 2. Process manual cash wallet entries
  for (const e of wallet) {
    if (e.kind !== "expense" || !e.commitmentId) continue;
    commitmentWalletIds.add(e.id);

    const entryTime = Math.floor(new Date(e.date).getTime() / 1000);
    if (entryTime < periodStart || entryTime > periodEnd) continue;

    const s = settlements.get(e.commitmentId);
    if (!s) continue;

    const cur = e.currency ?? base;
    const absMinor = Math.abs(e.amount ?? 0);
    const converted = convertMinor(absMinor, cur, base, rates) ?? absMinor;

    s.paidBase += converted;
    s.paidCount += 1;
    s.payments.push({
      sourceType: "cash",
      id: e.id,
      amount: absMinor,
      currency: cur,
      amountBase: converted,
      time: entryTime,
      title: e.source || undefined,
    });
  }

  // 3. Finalize settlement statuses and remaining reserves
  for (const c of commitments) {
    const s = settlements.get(c.id);
    if (!s) continue;
    const plannedBase = convertMinor(c.amount, c.currency, base, rates) ?? c.amount;

    if (s.settledExternally) {
      s.isPaid = true;
      s.remainingReserve = 0;
      continue;
    }

    if (s.paidCount > 0) {
      if (s.statusOverride === "partial_pending") {
        s.remainingReserve = Math.max(0, plannedBase - s.paidBase);
        s.isPaid = s.remainingReserve === 0;
      } else {
        // Default & fully_settled: completely fulfilled
        s.isPaid = true;
        s.remainingReserve = 0;
      }
    } else {
      s.isPaid = false;
      s.remainingReserve = plannedBase;
    }
  }

  return { settlements, commitmentTxIds, commitmentWalletIds };
}
