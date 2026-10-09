"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, Repeat, ChevronRight } from "lucide-react";
import type { MonoAccount, MonoStatementItem } from "@/lib/monobank";
import { currencyMeta } from "@/lib/monobank";
import { mccToCategory, CATEGORIES } from "@/lib/mcc";
import { cashBalances } from "@/lib/analytics";
import type { WalletEntry } from "@/lib/storage";
import { accountDisplay, type CashAccount } from "@/lib/cashAccounts";
import { convertMinor, type CurrencyRate } from "@/lib/fx";
import { formatMoney, pluralUk } from "@/lib/format";
import { AllowanceCard } from "@/components/Allowance";
import { TodayHero } from "@/components/TodayHero";
import { HomeActions } from "@/components/HomeActions";
import { AccountsStrip } from "@/components/AccountsStrip";
import { Sheet } from "@/components/ui/sheet";
import type { Allowance } from "@/lib/metrics/allowance";
import { todayHero } from "@/lib/home/todayHero";
import { groupByDay, localDay } from "@/lib/home/groupByDay";
import { cn } from "@/lib/utils";

const RECENT_LIMIT = 6;

const SpendGaugeCard = dynamic(() => import("@/components/SpendGauge").then((m) => m.SpendGaugeCard), {
  loading: () => <div className="skeleton h-80 rounded-3xl" />,
});

export function Dashboard({
  account,
  wallet,
  cashAccounts,
  rates,
  base,
  allowance,
  allowanceLoading,
  allowanceError,
  fxUnavailableCurrency,
  hasCommitments,
  hasSavingsGoal,
  spentTodayBase,
  spentTodayFxUnavailable,
  dailySeries,
  seriesFxUnavailable,
  dailyMedianBase,
  onSetupIncome,
  statement,
  accountCurrency,
  fakeIds,
  onViewAllOperations,
  limitedBy,
  salaryBudget,
  spendableReason,
  periodStart,
  periodEnd,
  periodSpentBase,
  periodSpentLoading,
  periodSpentFxUnavailable,
  periodStatementError,
  suggestionsCount,
  onOpenCommitments,
  monoAccounts,
  selectedMonoId,
  onSelectMono,
  onWalletChange,
  onCashAccountsChange,
  lastUsedAccountId,
  onAccountUsed,
  masked,
  onToggleMasked,
  onOpenEvaluator,
  activeMonoAccounts,
  excludedAccounts,
}: {
  account: MonoAccount | undefined;
  activeMonoAccounts?: MonoAccount[];
  excludedAccounts?: string[];
  wallet: WalletEntry[];
  cashAccounts: CashAccount[];
  rates: CurrencyRate[];
  base: number;
  allowance: Allowance | null;
  allowanceLoading: boolean;
  allowanceError: string | null;
  fxUnavailableCurrency: number | null;
  hasCommitments: boolean;
  hasSavingsGoal: boolean;
  spentTodayBase: number | null;
  spentTodayFxUnavailable: number | null;
  dailySeries: { date: string; spent: number }[] | null;
  seriesFxUnavailable: number | null;
  dailyMedianBase: number | null;
  onSetupIncome: () => void;
  statement: MonoStatementItem[];
  accountCurrency: number;
  fakeIds: Set<string>;
  onViewAllOperations: () => void;
  limitedBy: "balance" | "budget" | null;
  salaryBudget: number | null;
  spendableReason: string | null;
  periodStart: number | null;
  periodEnd: number | null;
  periodSpentBase: number | null;
  periodSpentLoading: boolean;
  periodSpentFxUnavailable: number | null;
  periodStatementError: string | null;
  suggestionsCount: number | null;
  onOpenCommitments: () => void;
  monoAccounts: MonoAccount[];
  selectedMonoId: string;
  onSelectMono: (id: string) => void;
  onWalletChange: (list: WalletEntry[]) => void;
  onCashAccountsChange: (list: CashAccount[]) => void;
  lastUsedAccountId: string;
  onAccountUsed: (id: string) => void;
  masked: boolean;
  onToggleMasked: () => void;
  onOpenEvaluator?: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const cash = cashBalances(wallet);

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

  const { cardsTotalBase, cardFxUnavailable } = useMemo(() => {
    const list = activeMonoAccounts ?? (account ? [account] : []);
    let sum = 0;
    let unavailable: number | null = null;
    for (const a of list) {
      const ownFunds = Math.max(0, a.balance - (a.creditLimit ?? 0));
      const v = convertMinor(ownFunds, a.currencyCode, base, rates);
      if (v === null) {
        unavailable = a.currencyCode;
        break;
      }
      sum += v;
    }
    return {
      cardsTotalBase: unavailable === null ? sum : null,
      cardFxUnavailable: unavailable,
    };
  }, [activeMonoAccounts, account, base, rates]);

  const capitalFxUnavailable = cashFxUnavailable ?? cardFxUnavailable;
  const netWorth = cashTotalBase !== null && cardsTotalBase !== null ? cashTotalBase + cardsTotalBase : null;

  const recent = useMemo(() => {
    const cardRows: RecentEntry[] = statement.map((it) => ({
      source: "card",
      time: it.time,
      day: localDay(it.time),
      key: it.id,
      item: it,
    }));
    const cashRows: RecentEntry[] = wallet
      .filter((e) => e.kind !== "convert")
      .map((e) => ({ source: "cash", time: Math.floor(new Date(e.date).getTime() / 1000), day: e.date, key: e.id, entry: e }));
    return [...cardRows, ...cashRows]
      .sort((a, b) => b.day.localeCompare(a.day) || b.time - a.time)
      .slice(0, RECENT_LIMIT);
  }, [statement, wallet]);

  const showSuggestionsChip = suggestionsCount !== null && suggestionsCount > 0;

  const hero = todayHero({
    spentToday: spentTodayBase,
    spentTodayFxUnavailable,
    allowance,
    allowanceLoading,
    allowanceError,
    fxUnavailableCurrency,
    spendableReason,
  });
  const today = localDay(Math.floor(Date.now() / 1000));
  const recentGroups = groupByDay(recent, today);

  return (
    <div className="stagger">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left column: Hero, actions, and accounts */}
        <div className="space-y-5 lg:col-span-7 xl:col-span-7">
          <TodayHero
            state={hero}
            base={base}
            masked={masked}
            onToggleMasked={onToggleMasked}
            onOpen={() => setDetailsOpen(true)}
            onSetup={onSetupIncome}
          />

          {(showSuggestionsChip || netWorth === null) && (
            <div className="flex flex-wrap gap-2">
              {showSuggestionsChip && (
                <button
                  onClick={onOpenCommitments}
                  className="flex min-h-[36px] items-center gap-1.5 rounded-full bg-card px-3.5 py-1.5 text-xs font-medium soft-shadow transition-colors hover:bg-secondary active:scale-[0.97]"
                >
                  <Repeat className="size-3.5 shrink-0" />
                  {suggestionsCount}{" "}
                  {pluralUk(suggestionsCount as number, "платіж чекає", "платежі чекають", "платежів чекають")}{" "}
                  підтвердження
                  <ChevronRight className="size-3.5 shrink-0 opacity-70" />
                </button>
              )}
              {netWorth === null && (
                <span className="flex min-h-[36px] items-center gap-1.5 rounded-full bg-warning/10 px-3.5 py-1.5 text-xs font-medium text-warning">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  Немає курсу для {currencyMeta(capitalFxUnavailable ?? 0).code} — капітал не порахувати
                </span>
              )}
            </div>
          )}

          <HomeActions
            wallet={wallet}
            onChange={onWalletChange}
            accounts={cashAccounts}
            rates={rates}
            lastUsedAccountId={lastUsedAccountId}
            onAccountUsed={onAccountUsed}
            onOpenEvaluator={onOpenEvaluator}
          />

          <AccountsStrip
            monoAccounts={monoAccounts}
            selectedMonoId={selectedMonoId}
            onSelectMono={onSelectMono}
            onOpenCardOperations={onViewAllOperations}
            wallet={wallet}
            onWalletChange={onWalletChange}
            cashAccounts={cashAccounts}
            onCashAccountsChange={onCashAccountsChange}
            rates={rates}
            base={base}
            masked={masked}
            excludedAccounts={excludedAccounts}
          />
        </div>

        {/* Right column: Recent operations */}
        <div className="space-y-4 lg:col-span-5 xl:col-span-5">
          <section className="space-y-3 rounded-[28px] lg:bg-card/40 lg:border lg:p-5">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-[17px] font-semibold">Операції</h2>
              <button onClick={onViewAllOperations} className="text-sm font-medium text-muted-foreground hover:text-foreground">
                Усі
              </button>
            </div>
            {recentGroups.length === 0 && (
              <p className="rounded-3xl bg-card p-6 text-center text-sm text-muted-foreground soft-shadow">
                Поки немає операцій.
              </p>
            )}
            <div className="space-y-3">
              {recentGroups.map((g) => (
                <div key={g.day} className="space-y-2">
                  <p className="px-1 text-[13px] font-medium text-muted-foreground">{g.label}</p>
                  <div className="space-y-2">
                    {g.rows.map((row) =>
                      row.source === "card" ? (
                        <RecentRow key={row.key} it={row.item} cc={accountCurrency} fake={fakeIds.has(row.item.id)} masked={masked} />
                      ) : (
                        <CashRecentRow key={row.key} entry={row.entry} accounts={cashAccounts} masked={masked} />
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <Sheet open={detailsOpen} onClose={() => setDetailsOpen(false)} title="Сьогодні">
        <div className="space-y-4">
          <SpendGaugeCard
            spentTodayBase={spentTodayBase}
            spentTodayFxUnavailable={spentTodayFxUnavailable}
            allowance={allowance}
            allowanceLoading={allowanceLoading}
            allowanceError={allowanceError}
            fxUnavailableCurrency={fxUnavailableCurrency}
            base={base}
            onSetup={onSetupIncome}
            dailySeries={dailySeries}
            seriesFxUnavailable={seriesFxUnavailable}
            dailyMedianBase={dailyMedianBase}
            spendableReason={spendableReason}
            salaryBudget={salaryBudget}
            periodStart={periodStart}
            periodEnd={periodEnd}
            periodSpentBase={periodSpentBase}
            periodSpentLoading={periodSpentLoading}
            periodSpentFxUnavailable={periodSpentFxUnavailable}
            periodStatementError={periodStatementError}
            netWorthBase={netWorth}
            capitalFxUnavailable={capitalFxUnavailable}
          />
          <AllowanceCard
            allowance={allowance}
            base={base}
            onSetup={onSetupIncome}
            loading={allowanceLoading}
            error={allowanceError}
            fxUnavailableCurrency={fxUnavailableCurrency}
            hasCommitments={hasCommitments}
            hasSavingsGoal={hasSavingsGoal}
            limitedBy={limitedBy}
            salaryBudget={salaryBudget}
            spendableReason={spendableReason}
            collapsible={false}
          />
        </div>
      </Sheet>
    </div>
  );
}

type RecentEntry =
  | { source: "card"; time: number; day: string; key: string; item: MonoStatementItem }
  | { source: "cash"; time: number; day: string; key: string; entry: WalletEntry };

const ROW_CLASS = "flex items-center gap-3 rounded-3xl bg-card px-3.5 py-3 soft-shadow";
const MASKED_AMOUNT = <span className="text-sm font-semibold text-muted-foreground">••••</span>;

function timeOfDay(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
}

function RecentRow({ it, cc, fake, masked }: { it: MonoStatementItem; cc: number; fake: boolean; masked: boolean }) {
  const c = mccToCategory(it.mcc, it.amount);
  const expense = it.amount < 0;
  return (
    <div className={cn(ROW_CLASS, fake && "opacity-45")}>
      <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-lg">
        {c.emoji}
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-sm font-medium", fake && "line-through")}>
          {it.description || c.label}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{c.label}</span>
          <span className="opacity-40">•</span>
          <span className="font-medium text-foreground/70">Картка</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {masked ? (
          MASKED_AMOUNT
        ) : (
          <span
            className={cn(
              "text-sm font-semibold tabular-nums",
              fake && "line-through",
              !expense && !fake && "text-success"
            )}
          >
            {expense ? "" : "+"}
            {formatMoney(it.amount, cc)}
          </span>
        )}
        <span className="text-xs text-muted-foreground tabular-nums">{timeOfDay(it.time)}</span>
      </div>
    </div>
  );
}

function CashRecentRow({
  entry,
  accounts,
  masked,
}: {
  entry: WalletEntry;
  accounts: CashAccount[];
  masked: boolean;
}) {
  let icon: React.ReactNode;
  let title: string;
  let right: React.ReactNode;
  let subtitle: string;

  switch (entry.kind) {
    case "income": {
      icon = "💰";
      title = entry.source || "Дохід";
      right = (
        <span className="text-sm font-semibold tabular-nums text-success">
          +{formatMoney(entry.amount ?? 0, entry.currency ?? 980)}
        </span>
      );
      subtitle = accountDisplay(entry.accountId, accounts).name;
      break;
    }
    case "expense": {
      const cat = CATEGORIES[entry.category ?? "other"] ?? CATEGORIES.other;
      icon = cat.emoji;
      title = entry.source || cat.label;
      right = (
        <span className="text-sm font-semibold tabular-nums">
          −{formatMoney(entry.amount ?? 0, entry.currency ?? 980)}
        </span>
      );
      subtitle = accountDisplay(entry.accountId, accounts).name;
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
      subtitle = accountDisplay(entry.accountId, accounts).name;
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
      subtitle = accountDisplay(entry.accountId, accounts).name;
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
      subtitle = "Переказ";
      break;
    }
    case "convert":
      return null;
    default: {
      const exhaustiveCheck: never = entry.kind;
      throw new Error(`Unhandled WalletKind: ${exhaustiveCheck}`);
    }
  }

  return (
    <div className={ROW_CLASS}>
      <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-lg">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{title}</div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{subtitle}</span>
          <span className="opacity-40">•</span>
          <span className="font-medium text-foreground/70">Готівка</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {masked ? MASKED_AMOUNT : right}
      </div>
    </div>
  );
}
