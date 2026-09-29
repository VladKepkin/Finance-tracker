"use client";

import { Wallet, CalendarClock, AlertTriangle } from "lucide-react";
import type { Allowance } from "@/lib/metrics/allowance";
import { currencyMeta } from "@/lib/monobank";
import { formatMoney } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";

export function AllowanceCard({
  allowance,
  base,
  onSetup,
  loading,
  error,
  fxUnavailableCurrency,
  hasCommitments,
  hasSavingsGoal,
  limitedBy,
  salaryBudget,
  spendableReason,
  collapsible,
}: {
  allowance: Allowance | null;
  base: number;
  onSetup: () => void;
  loading: boolean;
  error: string | null;
  fxUnavailableCurrency: number | null;
  hasCommitments: boolean;
  hasSavingsGoal: boolean;
  limitedBy: "balance" | "budget" | null;
  salaryBudget: number | null;
  spendableReason: string | null;
  collapsible?: boolean;
}) {
  if (loading) {
    return (
      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CalendarClock className="size-4" /> Денний ліміт
          </div>
          <p className="text-sm text-muted-foreground">Перевіряємо регулярні платежі…</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CalendarClock className="size-4" /> Денний ліміт
          </div>
          <div className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-xs">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>Не вдалося перевірити зобов&apos;язання: {error}. Ліміт не порахований.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (fxUnavailableCurrency !== null) {
    return (
      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CalendarClock className="size-4" /> Денний ліміт
          </div>
          <div className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-xs">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>
              Немає курсу для {currencyMeta(fxUnavailableCurrency).code} — ліміт зараз порахувати не
              можна.
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (spendableReason !== null) {
    return (
      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CalendarClock className="size-4" /> Денний ліміт
          </div>
          <div className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-xs">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>{spendableReason}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!allowance) {
    return (
      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CalendarClock className="size-4" /> Денний ліміт
          </div>
          <p className="text-sm text-muted-foreground">
            Щоб порахувати, скільки можна витратити сьогодні, треба знати, коли приходить дохід.
          </p>
          <Button variant="outline" className="w-full" onClick={onSetup}>
            Налаштувати графік доходу
          </Button>
        </CardContent>
      </Card>
    );
  }

  const date = new Date(allowance.periodEnd * 1000).toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "long",
  });

  const savingsEntry =
    hasSavingsGoal && allowance.goalsBeforeIncome.length > 0
      ? allowance.goalsBeforeIncome[allowance.goalsBeforeIncome.length - 1]
      : null;
  const savingsReserved = savingsEntry?.reservedBase ?? 0;
  const otherGoalsReserved = allowance.goalsReserved - savingsReserved;

  const body = (
    <>
      <div className="flex items-center gap-2 text-sm font-medium">
        <Wallet className="size-4" /> Сьогодні можна витратити
      </div>

      {allowance.shortfall ? (
          <div className="space-y-2">
            <div className="font-display text-3xl font-bold tabular-nums text-destructive">
              {formatMoney(0, base)}
            </div>
            <div className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-xs">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>
                Зобов&apos;язання й буфер перевищують {limitedBy === "budget" ? "бюджет із зарплати" : "баланс"} на{" "}
                <span className="font-semibold tabular-nums">
                  {formatMoney(Math.abs(allowance.available), base)}
                </span>
                .
              </span>
            </div>
          </div>
        ) : (
          <div className="font-display text-3xl font-bold tabular-nums">
            {formatMoney(allowance.perDay, base)}
          </div>
        )}

        <div className="space-y-1 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>{limitedBy === "budget" ? "Бюджет із зарплати" : "Ліквідні кошти"}</span>
            <span className="tabular-nums">{formatMoney(allowance.liquid, base)}</span>
          </div>
          {allowance.reserved > 0 && (
            <div className="flex justify-between">
              <span>− регулярні платежі до {date}</span>
              <span className="tabular-nums">−{formatMoney(allowance.reserved, base)}</span>
            </div>
          )}
          {savingsReserved > 0 && (
            <div className="flex justify-between">
              <span>− відкладено на заощадження з цієї зарплати</span>
              <span className="tabular-nums">−{formatMoney(savingsReserved, base)}</span>
            </div>
          )}
          {otherGoalsReserved > 0 && (
            <div className="flex justify-between">
              <span>− частка резерву інших цілей за період до {date}</span>
              <span className="tabular-nums">−{formatMoney(otherGoalsReserved, base)}</span>
            </div>
          )}
          {allowance.buffer > 0 && (
            <div className="flex justify-between">
              <span>− вже накопичено</span>
              <span className="tabular-nums">−{formatMoney(allowance.buffer, base)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-1 text-foreground">
            <span>÷ {allowance.daysToIncome} дн. до {date}</span>
            <span className="tabular-nums">{formatMoney(allowance.available, base)}</span>
          </div>
        </div>

        {limitedBy === "budget" && salaryBudget !== null && (
          <p className="text-xs text-muted-foreground">
            Ліміт звужено до бюджету з зарплати — фактичний залишок на рахунках більший.
          </p>
        )}

        {allowance.reserved + allowance.goalsReserved + allowance.buffer > 0 && (
          <p className="text-xs text-muted-foreground">
            Із {limitedBy === "budget" ? "бюджету із зарплати" : "балансу"} {formatMoney(allowance.liquid, base)}{" "}
            ми вже відняли те, що піде на майбутні платежі, цілі й заощадження — тому "можна витратити"
            менше, ніж просто {limitedBy === "budget" ? "цей бюджет" : "баланс"} поділений на дні до {date}.
          </p>
        )}
        {savingsReserved > 0 && (
          <p className="text-xs text-muted-foreground">
            З них {formatMoney(savingsReserved, base)} — це гроші, які ти вирішив відкладати
            щомісяця: ми забираємо їх із ліміту заздалегідь, пропорційно до довжини цього періоду,
            а не лише в момент, коли вони знадобляться.
          </p>
        )}

        {allowance.overdueGoals.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-xs">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>
              Дедлайн минув для: {allowance.overdueGoals.join(", ")}. Дата минула, резерву в ліміті
              немає — прибери дедлайн або перенеси.
            </span>
          </div>
        )}
        {allowance.invalidGoals.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-xs">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>Зіпсований дедлайн у цілях: {allowance.invalidGoals.join(", ")}. Резерв для них не порахований.</span>
          </div>
        )}
        {!hasCommitments && (
          <p className="text-xs text-muted-foreground">
            Регулярних платежів не підтверджено — ліміт їх не враховує.
          </p>
        )}
      {hasCommitments && allowance.reserved === 0 && (
        <p className="text-xs text-muted-foreground">
          Жодне підтверджене зобов&apos;язання не спишеться до {date} — ліміт враховує лише поточний баланс.
        </p>
      )}
    </>
  );

  if (collapsible) {
    return (
      <Disclosure title="Чому такий ліміт?">
        <div className="space-y-3">{body}</div>
      </Disclosure>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3">{body}</CardContent>
    </Card>
  );
}
