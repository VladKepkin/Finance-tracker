"use client";

import type { MonoAccount, MonoStatementItem } from "@/lib/monobank";
import type { WalletEntry } from "@/lib/storage";
import type { CashAccount } from "@/lib/cashAccounts";
import type { CurrencyRate } from "@/lib/fx";
import { Expenses } from "@/components/Expenses";
import { WalletTab } from "@/components/WalletTab";
import { Disclosure } from "@/components/ui/disclosure";

export function Money({
  statement,
  accountCurrency,
  fakeIds,
  onToggleFake,
  ratings,
  onRate,
  wallet,
  onWalletChange,
  account,
  rates,
  base,
  jarTitles,
  cashAccounts,
  onCashAccountsChange,
  lastUsedAccountId,
  onAccountUsed,
}: {
  statement: MonoStatementItem[];
  accountCurrency: number;
  fakeIds: Set<string>;
  onToggleFake: (id: string) => void;
  ratings: Record<string, number> | null;
  onRate: (txId: string, score: number | null) => void;
  wallet: WalletEntry[];
  onWalletChange: (list: WalletEntry[]) => void;
  account: MonoAccount | undefined;
  rates: CurrencyRate[];
  base: number;
  jarTitles: readonly string[] | null;
  cashAccounts: CashAccount[];
  onCashAccountsChange: (list: CashAccount[]) => void;
  lastUsedAccountId: string;
  onAccountUsed: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <Expenses
        statement={statement}
        accountCurrency={accountCurrency}
        fakeIds={fakeIds}
        onToggleFake={onToggleFake}
        ratings={ratings}
        onRate={onRate}
        jarTitles={jarTitles}
      />
      <Disclosure title="Готівка: баланси, запис і історія" defaultOpen bare>
        <WalletTab
          wallet={wallet}
          onChange={onWalletChange}
          account={account}
          rates={rates}
          base={base}
          accounts={cashAccounts}
          onAccountsChange={onCashAccountsChange}
          lastUsedAccountId={lastUsedAccountId}
          onAccountUsed={onAccountUsed}
        />
      </Disclosure>
    </div>
  );
}
