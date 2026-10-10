"use client";

import { useState } from "react";
import type { MonoAccount, MonoStatementItem } from "@/lib/monobank";
import type { WalletEntry } from "@/lib/storage";
import type { CashAccount } from "@/lib/cashAccounts";
import type { CurrencyRate } from "@/lib/fx";
import type { TxOverrideType } from "@/lib/transfers";
import { Expenses } from "@/components/Expenses";
import { WalletTab } from "@/components/WalletTab";
import { Disclosure } from "@/components/ui/disclosure";
import { StatementImportModal } from "@/components/StatementImportModal";

import type { Period } from "@/lib/useMono";

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
  txOverrides,
  onChangeOverride,
  partnerKeywords,
  excludedAccounts,
  commitments,
  txCommitments,
  onLinkCommitment,
  period,
  onChangePeriod,
  selectedAccount,
  onSelectAccount,
  monoAccounts,
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
  txOverrides?: Record<string, TxOverrideType>;
  onChangeOverride?: (id: string, override: TxOverrideType | null) => void;
  partnerKeywords?: readonly string[];
  excludedAccounts?: readonly string[];
  commitments?: { id: number; name: string; amount: number; currency: number }[];
  txCommitments?: Record<string, number>;
  onLinkCommitment?: (id: string, commitmentId: number | null, sourceType: "mono" | "cash") => void;
  period?: Period;
  onChangePeriod?: (p: Period) => void;
  selectedAccount?: string;
  onSelectAccount?: (id: string) => void;
  monoAccounts?: MonoAccount[];
}) {
  const [importOpen, setImportOpen] = useState(false);

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
          txOverrides={txOverrides}
          onChangeOverride={onChangeOverride}
          partnerKeywords={partnerKeywords}
          excludedAccounts={excludedAccounts}
          commitments={commitments}
          txCommitments={txCommitments}
          onLinkCommitment={onLinkCommitment}
          onOpenImport={() => setImportOpen(true)}
          period={period}
          onChangePeriod={onChangePeriod}
          selectedAccount={selectedAccount}
          onSelectAccount={onSelectAccount}
          monoAccounts={monoAccounts}
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
            commitments={commitments}
          />
        </Disclosure>
      </div>

      <StatementImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        accounts={cashAccounts}
        onAccountsChange={onCashAccountsChange}
        wallet={wallet}
        onWalletChange={onWalletChange}
      />
    </div>
  );
}
