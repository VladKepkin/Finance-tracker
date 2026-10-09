"use client";

import { useState } from "react";
import { CreditCard, Wallet, Plus, Check } from "lucide-react";
import type { MonoAccount } from "@/lib/monobank";
import { currencyMeta } from "@/lib/monobank";
import { type WalletEntry, uid } from "@/lib/storage";
import { DEFAULT_CASH_ACCOUNT_ID, type CashAccount } from "@/lib/cashAccounts";
import { accountBalances, entriesForAccount } from "@/lib/home/accountEntries";
import { ACCOUNT_TYPE_LABEL } from "@/lib/accountTypeLabel";
import { convertMinor, type CurrencyRate } from "@/lib/fx";
import { formatMoney } from "@/lib/format";
import { Sheet } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { WalletRow } from "@/components/WalletTab";
import { cn } from "@/lib/utils";

const MASK = "••••";
const SEGMENT_COLORS = ["var(--brand-violet)", "var(--brand-pink)", "var(--brand-sky)", "var(--warning)"];

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
  const [newName, setNewName] = useState("");

  const { byAccount, orphansFolded } = accountBalances(wallet, cashAccounts);
  const visibleMono = monoAccounts.filter((a) => a.balance !== 0 || a.id === selectedMonoId);
  const money = (minor: number, cur: number) => (masked ? MASK : formatMoney(minor, cur));

  const trimmed = newName.trim();
  const duplicate = cashAccounts.some((a) => a.name.trim().toLowerCase() === trimmed.toLowerCase());
  const create = () => {
    if (!trimmed || duplicate) return;
    onCashAccountsChange([...cashAccounts, { id: uid(), name: trimmed }]);
    setNewName("");
    setAdding(false);
  };

  const opened = cashAccounts.find((a) => a.id === openId) ?? null;
  const openedLines = opened ? currencyLines(byAccount[opened.id] ?? {}) : [];
  const openedEntries = opened ? entriesForAccount(wallet, opened.id, cashAccounts) : [];

  return (
    <section className="space-y-3">
      <h2 className="px-1 text-[17px] font-semibold">Мої рахунки</h2>
      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-3 md:overflow-visible">
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
          return (
            <button
              key={acc.id}
              onClick={() => setOpenId(acc.id)}
              className="soft-shadow flex min-w-[158px] md:min-w-0 shrink-0 snap-start flex-col gap-4 rounded-3xl border border-transparent bg-card p-4 text-left transition-transform active:scale-[0.98]"
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <span className="flex size-8 items-center justify-center rounded-full bg-secondary">
                  <Wallet className="size-4" />
                </span>
                <span className="max-w-[96px] truncate">{acc.name}</span>
              </span>
              <span className="font-display text-lg font-semibold tabular-nums">
                {lines.length === 0 ? (
                  <span className="text-sm font-normal text-muted-foreground">порожньо</span>
                ) : (
                  money(lines[0][1], lines[0][0])
                )}
              </span>
              <span className="truncate text-xs text-muted-foreground tabular-nums">
                {lines.length > 1 ? `+ ${lines.slice(1).map(([c, v]) => money(v, c)).join(" · ")}` : "Готівка"}
              </span>
            </button>
          );
        })}

        <button
          onClick={() => setAdding(true)}
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
              <span className="text-sm text-muted-foreground">Баланс</span>
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
        <div className="space-y-3 rounded-3xl bg-card p-4 soft-shadow">
          <p className="text-sm text-muted-foreground">
            Місце, де лежить готівка: гаманець, конверт, сейф удома.
          </p>
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="Напр. Конверт"
          />
          {trimmed && duplicate && <p className="text-xs text-destructive">Рахунок з такою назвою вже є.</p>}
          <Button className="h-11 w-full rounded-full" onClick={create} disabled={!trimmed || duplicate}>
            Створити
          </Button>
        </div>
      </Sheet>
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
