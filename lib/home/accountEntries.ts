import type { WalletEntry } from "@/lib/storage";
import { cashBalancesByAccount } from "@/lib/analytics";
import { resolveAccountId, type CashAccount } from "@/lib/cashAccounts";

export interface AccountBalances {
  byAccount: Record<string, Record<number, number>>;
  orphansFolded: boolean;
}

export function accountBalances(wallet: WalletEntry[], accounts: readonly CashAccount[]): AccountBalances {
  const raw = cashBalancesByAccount(wallet);
  const knownIds = new Set(accounts.map((a) => a.id));
  const byAccount: Record<string, Record<number, number>> = {};
  let orphansFolded = false;
  for (const [id, balances] of Object.entries(raw)) {
    const target = resolveAccountId(id, knownIds);
    if (target !== id) orphansFolded = true;
    const bucket = (byAccount[target] ??= {});
    for (const [cur, v] of Object.entries(balances)) {
      bucket[Number(cur)] = (bucket[Number(cur)] ?? 0) + v;
    }
  }
  return { byAccount, orphansFolded };
}

export function entriesForAccount(
  wallet: readonly WalletEntry[],
  accountId: string,
  accounts: readonly CashAccount[]
): WalletEntry[] {
  const knownIds = new Set(accounts.map((a) => a.id));
  const touches = (id: string | undefined) => resolveAccountId(id, knownIds) === accountId;
  return wallet
    .filter((e) => (e.kind === "transfer" ? touches(e.fromAccountId) || touches(e.toAccountId) : touches(e.accountId)))
    .sort((a, b) => b.date.localeCompare(a.date));
}
