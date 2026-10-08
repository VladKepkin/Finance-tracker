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
  txNotes,
  onSaveNote,
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
  txNotes?: Record<string, string>;
  onSaveNote?: (id: string, note: string) => void;
}) {
  const accountName = account
    ? account.maskedPan?.[0]
      ? `••${account.maskedPan[0].slice(-4)}`
      : "Картка Monobank"
    : "Монобанк";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-7 xl:col-span-8 space-y-4">
        <Expenses
          statement={statement}
          accountCurrency={accountCurrency}
          accountName={accountName}
          fakeIds={fakeIds}
          onToggleFake={onToggleFake}
          ratings={ratings}
          onRate={onRate}
          jarTitles={jarTitles}
          wallet={wallet}
          cashAccounts={cashAccounts}
          onDeleteCashEntry={(id) => onWalletChange(wallet.filter((w) => w.id !== id))}
          txNotes={txNotes}
          onSaveNote={onSaveNote}
        />
      </div>
      <div className="lg:col-span-5 xl:col-span-4 sticky top-6 space-y-4">
        <Disclosure title="Готівка: баланси, запис і рахунки" defaultOpen bare>
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
    </div>
  );
}
