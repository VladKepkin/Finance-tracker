"use client";

import { useState } from "react";
import { ArrowUpRight, ArrowDownLeft, ArrowRightLeft, Repeat } from "lucide-react";
import { type WalletEntry, uid } from "@/lib/storage";
import type { CashAccount } from "@/lib/cashAccounts";
import type { CurrencyRate } from "@/lib/fx";
import { MoneyForm, ConvertForm, TransferForm } from "@/components/WalletForms";
import { Sheet } from "@/components/ui/sheet";

type Action = "expense" | "income" | "transfer" | "convert";

const ACTIONS: { key: Action; label: string; title: string; icon: React.ReactNode }[] = [
  { key: "expense", label: "Витрата", title: "Витрата готівкою", icon: <ArrowUpRight className="size-5" /> },
  { key: "income", label: "Дохід", title: "Дохід готівкою", icon: <ArrowDownLeft className="size-5" /> },
  { key: "transfer", label: "Переказ", title: "Переказ між рахунками", icon: <ArrowRightLeft className="size-5" /> },
  { key: "convert", label: "Обмін", title: "Обмін валюти", icon: <Repeat className="size-5" /> },
];

export function HomeActions({
  wallet,
  onChange,
  accounts,
  rates,
  lastUsedAccountId,
  onAccountUsed,
}: {
  wallet: WalletEntry[];
  onChange: (list: WalletEntry[]) => void;
  accounts: CashAccount[];
  rates: CurrencyRate[];
  lastUsedAccountId: string;
  onAccountUsed: (id: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState<Action | null>(null);
  const current = ACTIONS.find((a) => a.key === open);

  const add = (entry: WalletEntry, accountId: string) => {
    onChange([entry, ...wallet]);
    onAccountUsed(accountId);
    setOpen(null);
  };

  return (
    <>
      <div className="grid grid-cols-4 gap-2 rounded-[28px] bg-card px-2 py-4 soft-shadow">
        {ACTIONS.map((a) => (
          <button
            key={a.key}
            onClick={() => setOpen(a.key)}
            className="group flex flex-col items-center gap-2 text-[13px] font-medium text-foreground/80"
          >
            <span className="flex size-14 items-center justify-center rounded-full bg-secondary transition-[transform,background-color] duration-150 group-hover:bg-accent group-active:scale-95">
              {a.icon}
            </span>
            {a.label}
          </button>
        ))}
      </div>

      <Sheet open={open !== null} onClose={() => setOpen(null)} title={current?.title ?? ""}>
        <div className="rounded-3xl bg-card p-4 soft-shadow">
          {open === "expense" && (
            <MoneyForm
              key="expense"
              today={today}
              defaultCurrency={980}
              sourceLabel="Опис"
              sourcePlaceholder="Покупка готівкою"
              cta="Додати витрату"
              withCategory
              accounts={accounts}
              defaultAccountId={lastUsedAccountId}
              onSubmit={({ amount, currency, source, date, category, accountId }) =>
                add({ id: uid(), date, kind: "expense", amount, currency, source, category, accountId }, accountId)
              }
            />
          )}
          {open === "income" && (
            <MoneyForm
              key="income"
              today={today}
              defaultCurrency={840}
              sourceLabel="Джерело"
              sourcePlaceholder="Зарплата"
              cta="Додати дохід"
              withCategory={false}
              accounts={accounts}
              defaultAccountId={lastUsedAccountId}
              onSubmit={({ amount, currency, source, date, accountId }) =>
                add({ id: uid(), date, kind: "income", amount, currency, source, accountId }, accountId)
              }
            />
          )}
          {open === "transfer" && (
            <TransferForm
              today={today}
              accounts={accounts}
              defaultFromAccountId={lastUsedAccountId}
              onSubmit={(e) => add({ id: uid(), ...e, kind: "transfer" }, e.fromAccountId)}
            />
          )}
          {open === "convert" && (
            <ConvertForm
              today={today}
              rates={rates}
              accounts={accounts}
              defaultAccountId={lastUsedAccountId}
              onSubmit={(e) => add({ id: uid(), ...e, kind: "convert" }, e.accountId)}
            />
          )}
        </div>
      </Sheet>
    </>
  );
}
