"use client";

import { useState } from "react";
import { CreditCard, Wallet, Plus, Check, Landmark, UploadCloud } from "lucide-react";
import type { MonoAccount } from "@/lib/monobank";
import { currencyMeta } from "@/lib/monobank";
import { type WalletEntry, uid } from "@/lib/storage";
import { DEFAULT_CASH_ACCOUNT_ID, type CashAccount, type AccountType } from "@/lib/cashAccounts";
import { accountBalances, entriesForAccount } from "@/lib/home/accountEntries";
import { ACCOUNT_TYPE_LABEL } from "@/lib/accountTypeLabel";
import { convertMinor, type CurrencyRate } from "@/lib/fx";
import { formatMoney, pluralUk } from "@/lib/format";
import { Sheet } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { WalletRow } from "@/components/WalletTab";
import { StatementImportModal } from "@/components/StatementImportModal";
import { cn } from "@/lib/utils";

const MASK = "••••";
const SEGMENT_COLORS = ["var(--brand-violet)", "var(--brand-pink)", "var(--brand-sky)", "var(--warning)"];
const BANK_PRESETS = ["Монобанк", "ПриватБанк", "Sense Bank", "ПУМБ", "Revolut", "А-Банк", "Інший"];
const CURRENCIES = [
  { code: 980, label: "₴ UAH" },
  { code: 840, label: "$ USD" },
  { code: 978, label: "€ EUR" },
];

function currencyLines(balances: Record<number, number>): [number, number][] {
  return Object.entries(balances)
    .map(([cur, v]) => [Number(cur), v] as [number, number])
    .filter(([, v]) => v !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
}

export function AccountsStrip({
  monoAccounts,
  selectedMonoId,
  onSelectMono,
  onOpenCardOperations,
  wallet,
  onWalletChange,
  cashAccounts,
  onCashAccountsChange,
  rates,
  base,
  masked,
  excludedAccounts = [],
}: {
  monoAccounts: MonoAccount[];
  selectedMonoId: string;
  onSelectMono: (id: string) => void;
  onOpenCardOperations: () => void;
  wallet: WalletEntry[];
  onWalletChange: (list: WalletEntry[]) => void;
  cashAccounts: CashAccount[];
  onCashAccountsChange: (list: CashAccount[]) => void;
  rates: CurrencyRate[];
  base: number;
  masked: boolean;
  excludedAccounts?: string[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importTargetId, setImportTargetId] = useState<string | undefined>(undefined);

  // Стан для форми створення нового рахунку
  const [accountType, setAccountType] = useState<AccountType>("card");
  const [newName, setNewName] = useState("");
  const [bankName, setBankName] = useState("Монобанк");
  const [pan, setPan] = useState("");
  const [accountCurrency, setAccountCurrency] = useState<number>(980);
  const [initialBalance, setInitialBalance] = useState("");

  const { byAccount, orphansFolded } = accountBalances(wallet, cashAccounts);
  const visibleMono = monoAccounts.filter((a) => a.balance !== 0 || a.id === selectedMonoId);
  const money = (minor: number, cur: number) => (masked ? MASK : formatMoney(minor, cur));

  const activeMonoAccounts = visibleMono.filter((a) => !excludedAccounts.includes(a.id));
  let aggregatedCardsTotal = 0;
  for (const a of activeMonoAccounts) {
    const own = Math.max(0, a.balance - (a.creditLimit ?? 0));
    const converted = convertMinor(own, a.currencyCode, base, rates) ?? 0;
    aggregatedCardsTotal += converted;
  }

  const trimmed = newName.trim();
  const duplicate = cashAccounts.some((a) => a.name.trim().toLowerCase() === trimmed.toLowerCase());
  const create = () => {
    if (!trimmed || duplicate) return;
    const newId = uid();
    const newAcc: CashAccount = {
      id: newId,
      name: trimmed,
      type: accountType,
      bankName: accountType === "card" || accountType === "bank_account" ? bankName.trim() || undefined : undefined,
      maskedPan: accountType === "card" ? pan.trim().slice(-4) || undefined : undefined,
      currencyCode: accountCurrency,
    };
    onCashAccountsChange([...cashAccounts, newAcc]);

    const initAmt = parseFloat(initialBalance.replace(/\s+/g, "").replace(",", "."));
    if (!isNaN(initAmt) && initAmt > 0) {
      const initialEntry: WalletEntry = {
        id: uid(),
        date: new Date().toISOString().slice(0, 10),
        kind: "income",
        amount: Math.round(initAmt * 100),
        currency: accountCurrency,
        source: "Початковий баланс",
        accountId: newId,
      };
      onWalletChange([initialEntry, ...wallet]);
    }

    setNewName("");
    setPan("");
    setBankName("Монобанк");
    setInitialBalance("");
    setAccountType("card");
    setAdding(false);
  };

  const opened = cashAccounts.find((a) => a.id === openId) ?? null;
  const openedLines = opened ? currencyLines(byAccount[opened.id] ?? {}) : [];
  const openedEntries = opened ? entriesForAccount(wallet, opened.id, cashAccounts) : [];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[17px] font-semibold">Мої рахунки</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setImportTargetId(undefined);
            setImportModalOpen(true);
          }}
          className="h-8 gap-1.5 text-xs rounded-full px-3 font-medium bg-card/60 hover:bg-card border-border/80"
        >
          <UploadCloud className="size-3.5 text-primary" />
          Імпорт виписки
        </Button>
      </div>
      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-3 md:overflow-visible">
        {visibleMono.length > 1 && (
          <button
            onClick={() => onSelectMono("all")}
            className={cn(
              "soft-shadow flex min-w-[158px] md:min-w-0 shrink-0 snap-start flex-col gap-4 rounded-3xl border bg-card p-4 text-left transition-transform active:scale-[0.98]",
              selectedMonoId === "all" || !selectedMonoId ? "border-foreground/70" : "border-transparent"
            )}
          >
            <span className="flex items-center gap-2 text-sm font-medium flex-wrap">
              <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CreditCard className="size-4" />
              </span>
              <span className="truncate font-semibold">Усі рахунки</span>
              <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary font-medium">
                Разом
              </span>
            </span>
            <span className="font-display text-lg font-semibold tabular-nums text-foreground">
              {masked ? MASK : formatMoney(aggregatedCardsTotal, base)}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {(selectedMonoId === "all" || !selectedMonoId) && <Check className="size-3" />}
              {activeMonoAccounts.length}{" "}
              {pluralUk(activeMonoAccounts.length, "картка", "картки", "карток")} у бюджеті
            </span>
          </button>
        )}
        {visibleMono.map((a) => {
          const selected = a.id === selectedMonoId;
          const isExcluded = excludedAccounts.includes(a.id);
          const isFop = a.type === "fop";
          return (
            <button
              key={a.id}
              onClick={() => onSelectMono(a.id)}
              className={cn(
                "soft-shadow flex min-w-[158px] md:min-w-0 shrink-0 snap-start flex-col gap-4 rounded-3xl border bg-card p-4 text-left transition-transform active:scale-[0.98]",
                isExcluded ? "opacity-70 bg-muted/20" : "",
                selected && visibleMono.length > 1 ? "border-foreground/70" : "border-transparent"
              )}
            >
              <span className="flex items-center gap-2 text-sm font-medium flex-wrap">
                <span className="flex size-8 items-center justify-center rounded-full bg-secondary">
                  <CreditCard className="size-4" />
                </span>
                <span className="truncate">{ACCOUNT_TYPE_LABEL[a.type] ?? a.type}</span>
                {isFop && (
                  <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-400 font-medium border border-amber-500/20">
                    ФОП
                  </span>
                )}
                {a.isShared && (
                  <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary font-medium">
                    Сім&apos;я
                  </span>
                )}
                {isExcluded && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-medium">
                    Виключено
                  </span>
                )}
              </span>
              <span className="font-display text-lg font-semibold tabular-nums">
                {money(a.balance, a.currencyCode)}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {selected && visibleMono.length > 1 && <Check className="size-3" />}
                {a.maskedPan?.[0] ? `•• ${a.maskedPan[0].slice(-4)}` : currencyMeta(a.currencyCode).code}
                {isExcluded && " · не в ліміті"}
              </span>
            </button>
          );
        })}

        {cashAccounts.map((acc) => {
          const lines = currencyLines(byAccount[acc.id] ?? {});
          const isCard = acc.type === "card";
          const isBank = acc.type === "bank_account";
          const Icon = isCard ? CreditCard : isBank ? Landmark : Wallet;
          const subLabel = isCard
            ? acc.maskedPan
              ? `•• ${acc.maskedPan}${acc.bankName ? ` · ${acc.bankName}` : ""}`
              : acc.bankName || "Картка"
            : isBank
            ? acc.bankName || "IBAN рахунок"
            : "Готівка";

          return (
            <button
              key={acc.id}
              onClick={() => setOpenId(acc.id)}
              className="soft-shadow flex min-w-[158px] md:min-w-0 shrink-0 snap-start flex-col gap-4 rounded-3xl border border-transparent bg-card p-4 text-left transition-transform active:scale-[0.98]"
            >
              <span className="flex items-center gap-2 text-sm font-medium flex-wrap">
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full",
                    isCard ? "bg-primary/10 text-primary" : "bg-secondary text-foreground"
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="max-w-[110px] truncate font-semibold">{acc.name}</span>
                {isCard && (
                  <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary font-medium">
                    Картка
                  </span>
                )}
                {isBank && (
                  <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground font-medium">
                    IBAN
                  </span>
                )}
              </span>
              <span className="font-display text-lg font-semibold tabular-nums">
                {lines.length === 0 ? (
                  <span className="text-sm font-normal text-muted-foreground">порожньо</span>
                ) : (
                  money(lines[0][1], lines[0][0])
                )}
              </span>
              <span className="truncate text-xs text-muted-foreground tabular-nums">
                {lines.length > 1
                  ? `+ ${lines.slice(1).map(([c, v]) => money(v, c)).join(" · ")}`
                  : subLabel}
              </span>
            </button>
          );
        })}

        <button
          onClick={() => {
            setAccountType("card");
            setNewName("");
            setPan("");
            setBankName("Монобанк");
            setInitialBalance("");
            setAdding(true);
          }}
          aria-label="Новий рахунок"
          className="flex w-16 md:w-full md:min-h-[110px] shrink-0 snap-start items-center justify-center rounded-3xl border-2 border-dashed border-foreground/15 text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        >
          <Plus className="size-5" />
        </button>
      </div>

      <Sheet open={opened !== null} onClose={() => setOpenId(null)} title={opened?.name ?? ""}>
        {opened && (
          <div className="space-y-4">
            <div className="space-y-4 rounded-3xl bg-card p-5 soft-shadow">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Баланс</span>
                <div className="flex items-center gap-1.5">
                  {opened.type === "card" && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary font-medium flex items-center gap-1">
                      <CreditCard className="size-3" />
                      {opened.bankName || "Картка"} {opened.maskedPan ? `•• ${opened.maskedPan}` : ""}
                    </span>
                  )}
                  {opened.type === "bank_account" && (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground font-medium flex items-center gap-1">
                      <Landmark className="size-3" />
                      {opened.bankName || "IBAN"}
                    </span>
                  )}
                </div>
              </div>

              {openedLines.length === 0 ? (
                <p className="font-display text-2xl font-semibold">порожньо</p>
              ) : (
                <div className="space-y-1">
                  {openedLines.map(([cur, v]) => (
                    <p key={cur} className="font-display text-3xl font-semibold tabular-nums tracking-tight">
                      {money(v, cur)}
                    </p>
                  ))}
                </div>
              )}
              <CurrencyShare lines={openedLines} base={base} rates={rates} />
              {opened.id === DEFAULT_CASH_ACCOUNT_ID && orphansFolded && (
                <p className="text-xs text-warning">У т.ч. записи видаленого рахунку, зараховані сюди.</p>
              )}

              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 rounded-2xl h-10 text-xs font-medium border-dashed bg-muted/20 hover:bg-muted/40"
                onClick={() => {
                  setImportTargetId(opened.id);
                  setImportModalOpen(true);
                }}
              >
                <UploadCloud className="size-4 text-primary" />
                Імпортувати виписку CSV для цього рахунку
              </Button>
            </div>

            <div className="space-y-2">
              <h3 className="px-1 text-[15px] font-semibold">Записи</h3>
              <div className="divide-y divide-border/60 overflow-hidden rounded-3xl bg-card soft-shadow">
                {openedEntries.length === 0 && (
                  <p className="p-6 text-center text-sm text-muted-foreground">Поки немає записів.</p>
                )}
                {openedEntries.map((e) => (
                  <WalletRow
                    key={e.id}
                    entry={e}
                    accounts={cashAccounts}
                    onRemove={() => onWalletChange(wallet.filter((w) => w.id !== e.id))}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Новий рахунок">
        <div className="space-y-4 rounded-3xl bg-card p-4 soft-shadow">
          {/* Тип рахунку */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Тип рахунку</label>
            <div className="grid grid-cols-3 gap-1 rounded-2xl bg-secondary/80 p-1">
              <button
                type="button"
                onClick={() => {
                  setAccountType("card");
                  if (!newName) setNewName("Картка");
                }}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-xl transition-all",
                  accountType === "card"
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <CreditCard className="size-3.5" /> Картка
              </button>
              <button
                type="button"
                onClick={() => {
                  setAccountType("cash");
                  if (newName === "Картка") setNewName("");
                }}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-xl transition-all",
                  accountType === "cash"
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Wallet className="size-3.5" /> Готівка
              </button>
              <button
                type="button"
                onClick={() => {
                  setAccountType("bank_account");
                  if (newName === "Картка") setNewName("IBAN рахунок");
                }}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-xl transition-all",
                  accountType === "bank_account"
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Landmark className="size-3.5" /> Рахунок
              </button>
            </div>
          </div>

          {/* Вибір банку для карток і банківських рахунків */}
          {(accountType === "card" || accountType === "bank_account") && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Банк</label>
              <div className="flex flex-wrap gap-1.5">
                {BANK_PRESETS.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => {
                      setBankName(b);
                      if (!newName || BANK_PRESETS.includes(newName)) {
                        setNewName(accountType === "card" ? `${b}` : `Рахунок ${b}`);
                      }
                    }}
                    className={cn(
                      "px-2.5 py-1 text-xs rounded-full border transition-all",
                      bankName === b
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary/60 hover:bg-secondary border-transparent text-foreground"
                    )}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Назва рахунку */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Назва</label>
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={
                accountType === "card"
                  ? "Напр. Моя Чорна, Картка дівчини"
                  : accountType === "bank_account"
                  ? "Напр. ФОП рахунок, Депозит"
                  : "Напр. Гаманець, Сейф"
              }
            />
          </div>

          {/* Останні 4 цифри картки */}
          {accountType === "card" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Останні 4 цифри картки (необов&apos;язково)</label>
              <Input
                value={pan}
                onChange={(e) => setPan(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="Напр. 4152"
                maxLength={4}
                inputMode="numeric"
              />
            </div>
          )}

          {/* Валюта */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Валюта</label>
            <div className="grid grid-cols-3 gap-1.5">
              {CURRENCIES.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => setAccountCurrency(c.code)}
                  className={cn(
                    "py-1.5 text-xs font-medium rounded-xl border transition-all",
                    accountCurrency === c.code
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary/60 hover:bg-secondary border-transparent text-foreground"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Початковий баланс */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Початковий баланс (необов&apos;язково)
            </label>
            <Input
              type="text"
              inputMode="decimal"
              value={initialBalance}
              onChange={(e) => setInitialBalance(e.target.value)}
              placeholder="0.00"
            />
            <p className="text-[11px] text-muted-foreground">
              Якщо вказати баланс, автоматично створиться запис приходу, щоб не вводити його окремо.
            </p>
          </div>

          {trimmed && duplicate && (
            <p className="text-xs text-destructive">Рахунок з такою назвою вже є.</p>
          )}

          <Button
            className="h-11 w-full rounded-full font-medium"
            onClick={create}
            disabled={!trimmed || duplicate}
          >
            Створити рахунок
          </Button>
        </div>
      </Sheet>

      <StatementImportModal
        open={importModalOpen}
        onClose={() => {
          setImportModalOpen(false);
          setImportTargetId(undefined);
        }}
        accounts={cashAccounts}
        onAccountsChange={onCashAccountsChange}
        wallet={wallet}
        onWalletChange={onWalletChange}
        initialAccountId={importTargetId}
      />
    </section>
  );
}

function CurrencyShare({
  lines,
  base,
  rates,
}: {
  lines: [number, number][];
  base: number;
  rates: CurrencyRate[];
}) {
  if (lines.length < 2) return null;
  if (lines.some(([, v]) => v < 0)) return null;
  const converted: { cur: number; value: number }[] = [];
  for (const [cur, v] of lines) {
    const value = convertMinor(v, cur, base, rates);
    if (value === null) {
      return (
        <p className="text-xs text-muted-foreground">
          Немає курсу для {currencyMeta(cur).code} — частку валют не показати.
        </p>
      );
    }
    converted.push({ cur, value });
  }
  const total = converted.reduce((s, c) => s + c.value, 0);
  if (total <= 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex h-3 w-full gap-1 overflow-hidden">
        {converted.map((c, i) => (
          <div
            key={c.cur}
            className="h-full rounded-full"
            style={{ width: `${(c.value / total) * 100}%`, background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {converted.map((c, i) => (
          <span key={c.cur} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }} />
            {currencyMeta(c.cur).code} · {Math.round((c.value / total) * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}
