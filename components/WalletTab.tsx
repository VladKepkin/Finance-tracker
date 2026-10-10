"use client";

import { useState } from "react";
import {
  Trash2,
  Banknote,
  CreditCard,
  ArrowRightLeft,
  TrendingUp,
  TrendingDown,
  ArrowDownToLine,
  ArrowUpFromLine,
  Plus,
  Wallet,
  Landmark,
} from "lucide-react";
import type { MonoAccount } from "@/lib/monobank";
import { currencyMeta } from "@/lib/monobank";
import { type WalletEntry, type WalletKind, uid } from "@/lib/storage";
import { cashBalances, cashBalancesByAccount, referencedAccountIds } from "@/lib/analytics";
import { convertMinor, type CurrencyRate } from "@/lib/fx";
import { formatMoney } from "@/lib/format";
import { CATEGORIES } from "@/lib/mcc";
import { DEFAULT_CASH_ACCOUNT_ID, accountDisplay, type CashAccount } from "@/lib/cashAccounts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MoneyForm, ConvertForm, TransferForm } from "@/components/WalletForms";
import { cn } from "@/lib/utils";

export function WalletTab({
  wallet,
  onChange,
  account,
  rates,
  base,
  accounts,
  onAccountsChange,
  lastUsedAccountId,
  onAccountUsed,
  commitments,
}: {
  wallet: WalletEntry[];
  onChange: (list: WalletEntry[]) => void;
  account: MonoAccount | undefined;
  rates: CurrencyRate[];
  base: number;
  accounts: CashAccount[];
  onAccountsChange: (list: CashAccount[]) => void;
  lastUsedAccountId: string;
  onAccountUsed: (id: string) => void;
  commitments?: { id: number; name: string; amount: number; currency: number }[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [kind, setKind] = useState<WalletKind>("income");

  const cash = cashBalances(wallet);
  const cashCur = Object.entries(cash).filter(([, v]) => Math.abs(v) > 0);

  let cashFxUnavailable: number | null = null;
  let cashTotalBaseSum = 0;
  for (const [cur, amt] of Object.entries(cash)) {
    const v = convertMinor(amt, Number(cur), base, rates);
    if (v === null) {
      cashFxUnavailable = Number(cur);
      break;
    }
    cashTotalBaseSum += v;
  }
  const cashTotalBase = cashFxUnavailable === null ? cashTotalBaseSum : null;

  const remove = (id: string) => onChange(wallet.filter((e) => e.id !== id));
  const add = (entry: WalletEntry) => onChange([entry, ...wallet]);

  return (
    <div className="animate-in fade-in duration-300 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="px-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CreditCard className="size-4 text-primary" /> На картці
            </div>
            <div className="mt-1 text-xl font-bold tabular-nums">
              {account ? formatMoney(account.balance, account.currencyCode) : "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Banknote className="size-4 text-success" /> Готівка
            </div>
            <div className="mt-1 text-xl font-bold tabular-nums">
              {cashTotalBase !== null ? (
                formatMoney(cashTotalBase, base)
              ) : (
                <span className="text-sm font-normal text-muted-foreground">
                  Немає курсу для {currencyMeta(cashFxUnavailable ?? 0).code}
                </span>
              )}
            </div>
            {cashCur.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {cashCur.map(([cur, v]) => (
                  <Badge key={cur} variant="secondary" className="tabular-nums">
                    {formatMoney(v, Number(cur))}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Додати запис</CardTitle>
          <div className="mt-1 grid grid-cols-3 gap-1 rounded-lg bg-secondary p-1">
            <Seg active={kind === "income"} onClick={() => setKind("income")}>
              <TrendingUp className="size-4" /> Дохід
            </Seg>
            <Seg active={kind === "expense"} onClick={() => setKind("expense")}>
              <TrendingDown className="size-4" /> Витрата
            </Seg>
            <Seg active={kind === "convert"} onClick={() => setKind("convert")}>
              <ArrowRightLeft className="size-4" /> Обмін
            </Seg>
            <Seg active={kind === "topup"} onClick={() => setKind("topup")}>
              <ArrowDownToLine className="size-4" /> На картку
            </Seg>
            <Seg active={kind === "withdraw"} onClick={() => setKind("withdraw")}>
              <ArrowUpFromLine className="size-4" /> З картки
            </Seg>
            <Seg active={kind === "transfer"} onClick={() => setKind("transfer")}>
              <ArrowRightLeft className="size-4" /> Переказ
            </Seg>
          </div>
        </CardHeader>
        <CardContent>
          {kind === "income" && (
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
              onSubmit={({ amount, currency, source, date, accountId }) => {
                add({ id: uid(), date, kind: "income", amount, currency, source, accountId });
                onAccountUsed(accountId);
              }}
            />
          )}
          {kind === "expense" && (
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
              commitments={commitments}
              onSubmit={({ amount, currency, source, date, category, accountId, commitmentId }) => {
                add({ id: uid(), date, kind: "expense", amount, currency, source, category, accountId, commitmentId });
                onAccountUsed(accountId);
              }}
            />
          )}
          {kind === "convert" && (
            <ConvertForm
              today={today}
              rates={rates}
              accounts={accounts}
              defaultAccountId={lastUsedAccountId}
              onSubmit={(e) => {
                add({ id: uid(), ...e, kind: "convert" });
                onAccountUsed(e.accountId);
              }}
            />
          )}
          {kind === "topup" && (
            <MoneyForm
              key="topup"
              today={today}
              defaultCurrency={980}
              sourceLabel="Нотатка"
              sourcePlaceholder="Поповнення картки"
              cta="Списати з готівки"
              withCategory={false}
              hint="Готівка зменшиться. Баланс картки оновиться автоматично з Monobank — щоб гроші не рахувались двічі."
              accounts={accounts}
              defaultAccountId={lastUsedAccountId}
              onSubmit={({ amount, currency, source, date, accountId }) => {
                add({ id: uid(), date, kind: "topup", amount, currency, source, accountId });
                onAccountUsed(accountId);
              }}
            />
          )}
          {kind === "withdraw" && (
            <MoneyForm
              key="withdraw"
              today={today}
              defaultCurrency={980}
              sourceLabel="Нотатка"
              sourcePlaceholder="Зняття готівки"
              cta="Додати до готівки"
              withCategory={false}
              hint="Готівка збільшиться. Баланс картки оновиться автоматично з Monobank."
              accounts={accounts}
              defaultAccountId={lastUsedAccountId}
              onSubmit={({ amount, currency, source, date, accountId }) => {
                add({ id: uid(), date, kind: "withdraw", amount, currency, source, accountId });
                onAccountUsed(accountId);
              }}
            />
          )}
          {kind === "transfer" && (
            <TransferForm
              today={today}
              accounts={accounts}
              defaultFromAccountId={lastUsedAccountId}
              onSubmit={(e) => {
                add({ id: uid(), ...e, kind: "transfer" });
                onAccountUsed(e.fromAccountId);
              }}
            />
          )}
        </CardContent>
      </Card>

      <CashAccountsPanel wallet={wallet} accounts={accounts} onAccountsChange={onAccountsChange} />

      <Card className="py-0">
        <CardContent className="divide-y px-0">
          {wallet.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">Поки немає записів.</p>
          )}
          {[...wallet]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((e) => (
              <WalletRow key={e.id} entry={e} accounts={accounts} onRemove={() => remove(e.id)} commitments={commitments} />
            ))}
        </CardContent>
      </Card>

      <p className="px-1 text-xs text-muted-foreground">
        Зведення показано у базовій валюті ({currencyMeta(base).code}). Картковий баланс — з
        Monobank, готівка та обміни — твої ручні записи. Надходження на картку доходом не вважаються.
      </p>
    </div>
  );
}

export function WalletRow({
  entry,
  accounts,
  onRemove,
  commitments,
}: {
  entry: WalletEntry;
  accounts: CashAccount[];
  onRemove: () => void;
  commitments?: { id: number; name: string }[];
}) {
  let icon: React.ReactNode;
  let title: string;
  let right: React.ReactNode;
  let accountTag: string;

  switch (entry.kind) {
    case "income": {
      icon = "💰";
      title = entry.source || "Дохід";
      right = (
        <span className="text-sm font-semibold tabular-nums text-success">
          +{formatMoney(entry.amount ?? 0, entry.currency ?? 980)}
        </span>
      );
      accountTag = accountDisplay(entry.accountId, accounts).name;
      break;
    }
    case "expense": {
      const cat = CATEGORIES[entry.category ?? "other"] ?? CATEGORIES.other;
      icon = cat.emoji;
      title = entry.source || cat.label;
      right = (
        <span className="text-sm font-semibold tabular-nums text-destructive">
          −{formatMoney(entry.amount ?? 0, entry.currency ?? 980)}
        </span>
      );
      accountTag = accountDisplay(entry.accountId, accounts).name;
      break;
    }
    case "topup": {
      icon = "💳";
      title = entry.source || "Поповнення картки";
      right = (
        <span className="text-sm font-semibold tabular-nums text-muted-foreground">
          готівка −{formatMoney(entry.amount ?? 0, entry.currency ?? 980)}
        </span>
      );
      accountTag = accountDisplay(entry.accountId, accounts).name;
      break;
    }
    case "withdraw": {
      icon = "🏧";
      title = entry.source || "Зняття готівки";
      right = (
        <span className="text-sm font-semibold tabular-nums text-success">
          готівка +{formatMoney(entry.amount ?? 0, entry.currency ?? 980)}
        </span>
      );
      accountTag = accountDisplay(entry.accountId, accounts).name;
      break;
    }
    case "convert": {
      icon = "🔄";
      title = "Обмін валют";
      right = (
        <span className="flex flex-col items-end text-sm font-semibold tabular-nums">
          <span className="text-muted-foreground">−{formatMoney(entry.fromAmount ?? 0, entry.fromCurrency ?? 840)}</span>
          <span className="text-success">+{formatMoney(entry.toAmount ?? 0, entry.toCurrency ?? 980)}</span>
        </span>
      );
      accountTag = accountDisplay(entry.accountId, accounts).name;
      break;
    }
    case "transfer": {
      const from = accountDisplay(entry.fromAccountId, accounts);
      const to = accountDisplay(entry.toAccountId, accounts);
      icon = "↔️";
      title = `${from.name} → ${to.name}`;
      right = (
        <span className="text-sm font-semibold tabular-nums">
          {formatMoney(entry.amount ?? 0, entry.currency ?? 980)}
        </span>
      );
      accountTag = "Переказ";
      break;
    }
    default: {
      const exhaustiveCheck: never = entry.kind;
      throw new Error(`Unhandled WalletKind: ${exhaustiveCheck}`);
    }
  }

  return (
    <div className="flex items-center gap-3 p-3.5">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-lg">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{title}</div>
        <div className="truncate text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
          <span>
            {new Date(entry.date).toLocaleDateString("uk-UA", {
              day: "numeric",
              month: "short",
              year: entry.date.slice(0, 4) === String(new Date().getFullYear()) ? undefined : "numeric",
            })}
            {" · "}
            {accountTag}
          </span>
          {entry.commitmentId && (
            <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 bg-primary/10 text-primary text-[10px] font-medium">
              🗓️ {commitments?.find((c) => c.id === entry.commitmentId)?.name || "Регулярний платіж"}
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 whitespace-nowrap">{right}</div>
      <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" onClick={onRemove}>
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

function Seg({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function CashAccountsPanel({
  wallet,
  accounts,
  onAccountsChange,
}: {
  wallet: WalletEntry[];
  accounts: CashAccount[];
  onAccountsChange: (list: CashAccount[]) => void;
}) {
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");

  const byAccount = cashBalancesByAccount(wallet);
  const usedIds = referencedAccountIds(wallet);
  const knownIds = new Set(accounts.map((a) => a.id));
  const orphanBalances: Record<number, number> = {};
  for (const id of usedIds) {
    if (knownIds.has(id)) continue;
    for (const [cur, v] of Object.entries(byAccount[id] ?? {})) {
      orphanBalances[Number(cur)] = (orphanBalances[Number(cur)] ?? 0) + v;
    }
  }
  const hasOrphans = Object.keys(orphanBalances).length > 0;

  const addAccount = () => {
    const name = newName.trim();
    if (!name) return;
    onAccountsChange([...accounts, { id: uid(), name }]);
    setNewName("");
  };

  const startRename = (a: CashAccount) => {
    setRenamingId(a.id);
    setRenameText(a.name);
  };
  const commitRename = () => {
    const name = renameText.trim();
    if (renamingId === null) return;
    if (name) onAccountsChange(accounts.map((a) => (a.id === renamingId ? { ...a, name } : a)));
    setRenamingId(null);
  };

  const removeAccount = (id: string) => {
    if (usedIds.has(id)) return;
    onAccountsChange(accounts.filter((a) => a.id !== id));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Рахунки та картки</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {accounts.map((a) => {
          const balances: Record<number, number> = { ...(byAccount[a.id] ?? {}) };
          if (a.id === DEFAULT_CASH_ACCOUNT_ID) {
            for (const [cur, v] of Object.entries(orphanBalances)) {
              balances[Number(cur)] = (balances[Number(cur)] ?? 0) + v;
            }
          }
          const currencies = Object.entries(balances).filter(([, v]) => Math.abs(v) > 0);
          const locked = usedIds.has(a.id);
          const isDefault = a.id === DEFAULT_CASH_ACCOUNT_ID;
          const isCard = a.type === "card";
          const isBank = a.type === "bank_account";
          const Icon = isCard ? CreditCard : isBank ? Landmark : Wallet;

          return (
            <div key={a.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                {renamingId === a.id ? (
                  <Input
                    autoFocus
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && commitRename()}
                    onBlur={commitRename}
                    className="h-8"
                  />
                ) : (
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full text-xs",
                        isCard ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
                      )}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <button
                      className="truncate text-left text-sm font-medium hover:underline"
                      onClick={() => startRename(a)}
                    >
                      {a.name}
                    </button>
                    {isCard && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[10px] text-primary font-medium shrink-0">
                        {a.bankName || "Картка"} {a.maskedPan ? `••${a.maskedPan}` : ""}
                      </span>
                    )}
                    {isBank && (
                      <span className="rounded-full bg-secondary px-1.5 py-0.2 text-[10px] text-muted-foreground font-medium shrink-0">
                        {a.bankName || "IBAN"}
                      </span>
                    )}
                  </div>
                )}
                {!isDefault && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 text-muted-foreground"
                    disabled={locked}
                    title={locked ? "На рахунку є записи — спершу перенеси або видали їх" : "Видалити рахунок"}
                    onClick={() => removeAccount(a.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {currencies.length === 0 ? (
                  <span className="text-xs text-muted-foreground">порожньо</span>
                ) : (
                  currencies.map(([cur, v]) => (
                    <Badge key={cur} variant="secondary" className="tabular-nums">
                      {formatMoney(v, Number(cur))}
                    </Badge>
                  ))
                )}
              </div>
              {isDefault && hasOrphans && (
                <p className="mt-1.5 text-xs text-warning">
                  У т.ч. записи видаленого рахунку, зараховані сюди.
                </p>
              )}
            </div>
          );
        })}
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Напр. Конверт"
            onKeyDown={(e) => e.key === "Enter" && addAccount()}
          />
          <Button onClick={addAccount} className="shrink-0">
            <Plus className="size-4" /> Додати
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
