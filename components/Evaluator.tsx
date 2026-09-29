"use client";

import { useState } from "react";
import { Calculator, PiggyBank, Wallet, CalendarClock, AlertTriangle, Hourglass } from "lucide-react";
import { evaluate, type Evaluation } from "@/lib/metrics/evaluator";
import { workHours } from "@/lib/metrics/income";
import type { AllowanceCommitment } from "@/lib/metrics/allowance";
import type { AllowanceGoal } from "@/lib/metrics/goals";
import type { IncomeSchedule } from "@/lib/metrics/schedule";
import { convertMinor, type CurrencyRate } from "@/lib/fx";
import { formatMoney } from "@/lib/format";
import { currencyMeta } from "@/lib/monobank";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CURRENCIES = [840, 980, 978];

function humanMonths(m: number): string {
  if (m <= 0) return "вже зараз";
  if (m < 1) return `${Math.ceil(m * 30)} дн.`;
  if (m < 12) return `${m.toFixed(1).replace(".0", "")} міс.`;
  const y = Math.floor(m / 12);
  const mm = Math.round(m % 12);
  return `${y} р.${mm ? ` ${mm} міс.` : ""}`;
}

export function Evaluator({
  base,
  rates,
  liquid,
  commitments,
  goals,
  buffer,
  schedule,
  monthlyNet,
  monthlyIncome,
  hourlyRate,
  hourlyRateReason,
  nowSeconds,
  loading,
  error,
  fxUnavailableCurrency,
  initialName,
  initialPrice,
  initialCurrency,
}: {
  base: number;
  rates: CurrencyRate[];
  liquid: number | null;
  commitments: AllowanceCommitment[];
  goals: AllowanceGoal[];
  buffer: number;
  schedule: IncomeSchedule | null;
  monthlyNet: number | null;
  monthlyIncome: number | null;
  hourlyRate: number | null;
  hourlyRateReason: string | null;
  nowSeconds: number;
  loading: boolean;
  error: string | null;
  fxUnavailableCurrency: number | null;
  initialName?: string;
  initialPrice?: string;
  initialCurrency?: number;
}) {
  const [name, setName] = useState(initialName ?? "");
  const [priceText, setPriceText] = useState(initialPrice ?? "");
  const [currency, setCurrency] = useState(initialCurrency ?? base);

  const parsed = parseFloat(priceText.replace(",", "."));
  const priceMinor = Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
  const hasPrice = priceMinor > 0;
  const priceBase = hasPrice ? convertMinor(priceMinor, currency, base, rates) : null;
  const priceFxUnavailable = hasPrice && priceBase === null ? currency : null;

  let body: React.ReactNode;

  if (loading) {
    body = <p className="text-sm text-muted-foreground">Перевіряємо регулярні платежі…</p>;
  } else if (error) {
    body = (
      <Reason text={`Не вдалося перевірити зобов'язання: ${error}. Оцінити не можна.`} />
    );
  } else if (fxUnavailableCurrency !== null) {
    body = (
      <Reason
        text={`Немає курсу для ${currencyMeta(fxUnavailableCurrency).code} — оцінити не можна.`}
      />
    );
  } else if (liquid === null) {
    body = <Reason text="Немає курсу для однієї з валют — ліквідні кошти порахувати не можна." />;
  } else if (!hasPrice) {
    body = <p className="text-sm text-muted-foreground">Введи ціну, щоб побачити наслідки.</p>;
  } else if (priceFxUnavailable !== null) {
    body = <Reason text={`Немає курсу для ${currencyMeta(priceFxUnavailable).code} — оцінити не можна.`} />;
  } else {
    const evaluation = evaluate({
      priceBase: priceBase!,
      liquid,
      commitments,
      goals,
      buffer,
      schedule,
      monthlyNet,
      monthlyIncome,
      nowSeconds,
    });
    body = <Scenarios evaluation={evaluation} base={base} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Calculator className="size-4 text-primary" /> А що як куплю?
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Три наслідки з реальних чисел — не порада купувати чи ні. Рішення завжди твоє.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Напр. Навушники" />
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Ціна</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={priceText}
              onChange={(e) => setPriceText(e.target.value)}
              placeholder="1000"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Валюта</Label>
            <Select value={String(currency)} onValueChange={(v) => setCurrency(Number(v))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={String(c)}>
                    {currencyMeta(c).symbol} {currencyMeta(c).code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {hasPrice && (
          <div className="flex items-start gap-2 rounded-xl bg-secondary p-2.5 text-xs">
            <Hourglass className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              {priceBase === null
                ? `Немає курсу для ${currencyMeta(currency).code} — годин життя не порахувати.`
                : workHours(priceBase, hourlyRate) !== null
                  ? `Це ${workHours(priceBase, hourlyRate)!.toFixed(1).replace(".0", "")} год. твого життя.`
                  : (hourlyRateReason ?? "Ставку за годину порахувати не можна.")}
            </span>
          </div>
        )}
        {body}
      </CardContent>
    </Card>
  );
}

function Reason({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-xs">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
      <span>{text}</span>
    </div>
  );
}

function Scenarios({ evaluation, base }: { evaluation: Evaluation; base: number }) {
  const { savings, buyNow, defer } = evaluation;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="space-y-1.5 rounded-xl bg-secondary p-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <PiggyBank className="size-4" /> Накопичити
        </div>
        {savings.value ? (
          <div className="text-sm font-semibold">{humanMonths(savings.value.monthsToAfford)}</div>
        ) : (
          <div className="text-xs text-muted-foreground">{savings.reason}</div>
        )}
      </div>

      <div className="space-y-1.5 rounded-xl bg-secondary p-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Wallet className="size-4" /> Купити зараз
        </div>
        {buyNow.value ? (
          <>
            <div className="text-xs text-muted-foreground">
              Ліміт був {formatMoney(buyNow.value.before, base)}
            </div>
            <div
              className={`text-sm font-semibold ${buyNow.value.allowance.shortfall ? "text-destructive" : ""}`}
            >
              стане {buyNow.value.allowance.shortfall ? formatMoney(0, base) : formatMoney(buyNow.value.after, base)}
            </div>
            {buyNow.value.allowance.shortfall && (
              <p className="text-xs text-muted-foreground">
                Зобов&apos;язання й буфер перевищать баланс на{" "}
                {formatMoney(Math.abs(buyNow.value.allowance.available), base)}.
              </p>
            )}
          </>
        ) : (
          <div className="text-xs text-muted-foreground">{buyNow.reason}</div>
        )}
      </div>

      <div className="space-y-1.5 rounded-xl bg-secondary p-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarClock className="size-4" /> Відкласти до доходу
        </div>
        {defer.value ? (
          <>
            <div className="text-sm font-semibold">{formatMoney(defer.value.after, base)}/день</div>
            <p className="text-xs text-muted-foreground">
              Якщо дохід буде як зазвичай ({formatMoney(defer.value.assumedIncome, base)}).
            </p>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">{defer.reason}</div>
        )}
      </div>
    </div>
  );
}
