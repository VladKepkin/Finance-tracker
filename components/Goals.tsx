"use client";

import { useRef, useState } from "react";
import { Plus, Trash2, Target, Clock, Hourglass, TrendingUp, Link as LinkIcon } from "lucide-react";
import { type WishItem, uid } from "@/lib/storage";
import { wishCalc } from "@/lib/metrics/income";
import { daysUntilDeadline, type AllowanceGoal } from "@/lib/metrics/goals";
import type { Allowance, AllowanceCommitment } from "@/lib/metrics/allowance";
import type { IncomeSchedule } from "@/lib/metrics/schedule";
import type { SavingsPlan, EmergencyState } from "@/lib/metrics/savings";
import { convertMinor, type CurrencyRate } from "@/lib/fx";
import { formatMoney } from "@/lib/format";
import { currencyMeta } from "@/lib/monobank";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { EmergencyFund } from "./EmergencyFund";
import { InvestCalc } from "./InvestCalc";
import { FopCalc } from "./FopCalc";
import { Evaluator } from "./Evaluator";
import { Disclosure } from "@/components/ui/disclosure";

const CURRENCIES = [840, 980, 978];

function noReserveReason(
  allowanceLoading: boolean,
  allowanceError: string | null,
  fxUnavailableCurrency: number | null,
  liquid: number | null,
  schedule: IncomeSchedule | null
): string {
  if (allowanceLoading) return "Перевіряємо регулярні платежі…";
  if (allowanceError) return `Не вдалося перевірити зобов'язання: ${allowanceError}. Резерв не порахований.`;
  if (fxUnavailableCurrency !== null) {
    return `Немає курсу для ${currencyMeta(fxUnavailableCurrency).code} — резерв не порахований.`;
  }
  if (liquid === null) return "Немає курсу для однієї з валют — ліквідні кошти порахувати не можна.";
  if (!schedule) return "Щоб побачити резерв у денному ліміті, налаштуй графік доходу.";
  return "Резерв для цієї цілі не порахований.";
}

function humanMonths(m: number | null): string {
  if (m === null) return "—";
  if (m <= 0) return "вже зараз";
  if (m < 1) return `${Math.ceil(m * 30)} дн.`;
  if (m < 12) return `${m.toFixed(1).replace(".0", "")} міс.`;
  const y = Math.floor(m / 12);
  const mm = Math.round(m % 12);
  return `${y} р.${mm ? ` ${mm} міс.` : ""}`;
}

function humanHours(h: number | null): string {
  if (h === null) return "—";
  if (h < 1) return "< 1 год.";
  return `${h.toFixed(1).replace(".0", "")} год.`;
}

export function Goals({
  wishlist,
  onChange,
  base,
  rates,
  liquid,
  monthlyNet,
  monthlyIncome,
  monthlyIncomeConfidenceLow,
  hourlyRate,
  hourlyRateReason,
  allowance,
  commitments,
  goals,
  buffer,
  schedule,
  allowanceLoading,
  allowanceError,
  fxUnavailableCurrency,
  nowSeconds: nowSecondsProp,
  savingsPlan,
  onSavingsPlanChange,
  emergency,
  jarsTotalBase,
  jarsFxUnavailable,
}: {
  wishlist: WishItem[];
  onChange: (list: WishItem[]) => void;
  base: number;
  rates: CurrencyRate[];
  liquid: number | null;
  monthlyNet: number | null;
  monthlyIncome: number | null;
  monthlyIncomeConfidenceLow: boolean;
  hourlyRate: number | null;
  hourlyRateReason: string | null;
  allowance: Allowance | null;
  commitments: AllowanceCommitment[];
  goals: AllowanceGoal[];
  buffer: number;
  schedule: IncomeSchedule | null;
  allowanceLoading: boolean;
  allowanceError: string | null;
  fxUnavailableCurrency: number | null;
  nowSeconds: number;
  savingsPlan: SavingsPlan;
  onSavingsPlanChange: (p: SavingsPlan) => void;
  emergency: EmergencyState;
  jarsTotalBase: number | null;
  jarsFxUnavailable: number | null;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState(base);
  const [url, setUrl] = useState("");
  const [evalPrefill, setEvalPrefill] = useState<{
    key: number;
    name: string;
    price: string;
    currency: number;
  } | null>(null);
  const evaluatorRef = useRef<HTMLDivElement>(null);

  const evaluateWish = (w: WishItem) => {
    setEvalPrefill({ key: Date.now(), name: w.name, price: (w.price / 100).toString(), currency: w.currency });
    evaluatorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const add = () => {
    const p = Math.round(parseFloat(price.replace(",", ".")) * 100) || 0;
    if (!name.trim() || p <= 0) return;
    onChange([{ id: uid(), name: name.trim(), price: p, currency, url: url.trim() || undefined }, ...wishlist]);
    setName("");
    setPrice("");
    setUrl("");
  };

  const remove = (id: string) => onChange(wishlist.filter((w) => w.id !== id));

  const setDeadline = (id: string, iso: string) =>
    onChange(wishlist.map((w) => (w.id === id ? { ...w, deadline: iso || undefined } : w)));

  const nowSeconds = nowSecondsProp;

  return (
    <div className="animate-in fade-in duration-300 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Target className="size-4 text-primary" /> Додати ціль
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Напр. MacBook Pro" />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Ціна</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="2000"
                onKeyDown={(e) => e.key === "Enter" && add()}
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
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Посилання (необов'язково)" />
          <Button onClick={add} className="w-full">
            <Plus className="size-4" /> Додати у вішліст
          </Button>
        </CardContent>
      </Card>

      {wishlist.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Додай річ, про яку мрієш — і я порахую, скільки ще треба працювати та відкладати.
          </CardContent>
        </Card>
      )}

      {wishlist.map((w) => {
        const priceBase = convertMinor(w.price, w.currency, base, rates);
        const calc =
          priceBase !== null
            ? wishCalc(priceBase, liquid, monthlyNet, monthlyIncome, hourlyRate)
            : { progress: null, monthsToAfford: null, workMonths: null, workHours: null };
        const pctText = calc.progress !== null ? Math.round(calc.progress * 100) : null;
        const deadlineDays = w.deadline ? daysUntilDeadline(w.deadline, nowSeconds) : null;
        const overdue = deadlineDays !== null && deadlineDays <= 0;
        const goalEntry = allowance?.goalsBeforeIncome.find((g) => g.name === w.name) ?? null;
        return (
          <Card key={w.id}>
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-medium">
                    {w.name}
                    {w.url && (
                      <a href={w.url} target="_blank" rel="noreferrer" className="text-primary">
                        <LinkIcon className="size-3.5" />
                      </a>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground tabular-nums">
                    {formatMoney(w.price, w.currency)}
                    {w.currency !== base && (
                      <> · ≈ {priceBase !== null ? formatMoney(priceBase, base) : "курс невідомий"}</>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" onClick={() => remove(w.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>

              <Button variant="outline" size="sm" className="w-full" onClick={() => evaluateWish(w)}>
                А що як куплю зараз?
              </Button>

              <div>
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>Накопичено (від ліквідних коштів)</span>
                  <span className="tabular-nums">{pctText === null ? "—" : `${pctText}%`}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full meter-fill rounded-full bg-primary"
                    style={{ width: `${pctText ?? 0}%` }}
                  />
                </div>
                {pctText === null && (
                  <p className="mt-1 text-xs text-muted-foreground">Немає курсу — прогрес порахувати не можна.</p>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs">
                <Label className="whitespace-nowrap text-muted-foreground">Дедлайн</Label>
                <Input
                  type="date"
                  value={w.deadline ?? ""}
                  onChange={(e) => setDeadline(w.id, e.target.value)}
                  className="h-8 w-auto"
                />
              </div>
              {w.deadline && (
                <p className="text-xs text-muted-foreground">
                  {overdue
                    ? "Дата минула — прибери дедлайн або перенеси."
                    : priceBase === null
                      ? "Немає курсу — резерв у ліміті порахувати не можна."
                      : goalEntry && allowance
                        ?
                          `Резервує ${formatMoney(goalEntry.reservedBase, base)} з денного ліміту на період до ${new Date(
                            allowance.periodEnd * 1000
                          ).toLocaleDateString("uk-UA", { day: "numeric", month: "long" })}.`
                        : noReserveReason(allowanceLoading, allowanceError, fxUnavailableCurrency, liquid, schedule)}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Metric
                  icon={<TrendingUp className="size-4 text-success" />}
                  label="Накопичити за темпом"
                  value={
                    calc.monthsToAfford === null && calc.progress === null
                      ? "невідомо — курс не порахувати"
                      : monthlyNet === null
                        ? "невідомо — замало історії"
                        : monthlyNet > 0
                          ? humanMonths(calc.monthsToAfford)
                          : "немає заощаджень"
                  }
                />
                <Metric
                  icon={<Clock className="size-4 text-primary" />}
                  label="Це стільки роботи"
                  value={humanMonths(calc.workMonths)}
                  caption={
                    calc.workMonths !== null && monthlyIncomeConfidenceLow ? "з однієї зарплати" : undefined
                  }
                />
              </div>

              {priceBase !== null && (
                <Metric
                  icon={<Hourglass className="size-4 text-primary" />}
                  label="Це стільки годин твого життя"
                  value={calc.workHours !== null ? humanHours(calc.workHours) : (hourlyRateReason ?? "невідомо")}
                  full
                />
              )}
            </CardContent>
          </Card>
        );
      })}

      <p className="px-1 text-xs text-muted-foreground">
        «За темпом» — на скільки місяців вистачить поточних щомісячних заощаджень, щоб покрити
        залишок. «Стільки роботи» — скільки місяців твого доходу коштує річ (груба оцінка з медіани
        зарплат). «Стільки годин життя» — точніша ціна за реальною ставкою за годину (потрібен
        графік роботи в Налаштуваннях).
      </p>

      <div ref={evaluatorRef}>
        <Evaluator
          key={evalPrefill?.key ?? "default"}
          base={base}
          rates={rates}
          liquid={liquid}
          commitments={commitments}
          goals={goals}
          buffer={buffer}
          schedule={schedule}
          monthlyNet={monthlyNet}
          monthlyIncome={monthlyIncome}
          hourlyRate={hourlyRate}
          hourlyRateReason={hourlyRateReason}
          nowSeconds={nowSeconds}
          loading={allowanceLoading}
          error={allowanceError}
          fxUnavailableCurrency={fxUnavailableCurrency}
          initialName={evalPrefill?.name}
          initialPrice={evalPrefill?.price}
          initialCurrency={evalPrefill?.currency}
        />
      </div>

      <Disclosure title="Подушка безпеки">
        <EmergencyFund
          base={base}
          plan={savingsPlan}
          onPlanChange={onSavingsPlanChange}
          emergency={emergency}
          jarsTotalBase={jarsTotalBase}
          jarsFxUnavailable={jarsFxUnavailable}
        />
      </Disclosure>
      <Disclosure title="Калькулятор інвестицій">
        <InvestCalc base={base} suggestedMonthly={monthlyNet} />
      </Disclosure>
      <Disclosure title="Калькулятор податків ФОП (3 група)">
        <FopCalc rates={rates} />
      </Disclosure>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  caption,
  full,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  caption?: string;
  full?: boolean;
}) {
  return (
    <div className={cn("rounded-xl bg-secondary p-3", full && "mt-3")}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-base font-semibold">{value}</div>
      {caption && <div className="mt-0.5 text-xs text-muted-foreground">{caption}</div>}
    </div>
  );
}
