"use client";

import { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  PiggyBank,
  CalendarDays,
  CalendarRange,
  PieChart as PieChartIcon,
  Store,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  Clock,
  Edit2,
  Check,
  X,
  Sparkles,
} from "lucide-react";
import type { AnalyticsResult } from "@/lib/analytics";
import type { Strategy, StrategyLevel } from "@/lib/strategies";
import type { Confidence } from "@/lib/coverage";
import type { Runway } from "@/lib/metrics/runway";
import type { CategoryJoy } from "@/lib/metrics/joy";
import { formatMoney } from "@/lib/format";
import { currencyMeta } from "@/lib/monobank";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Joy } from "@/components/Joy";
import { Disclosure } from "@/components/ui/disclosure";
import { CategoryPie, IncomeExpenseBars } from "@/components/Charts";
import { cn } from "@/lib/utils";

export interface MetricsView {
  dailyMedian: number | null;
  dailyConfidence: Confidence;
  p10: number | null;
  p50: number | null;
  p90: number | null;
  monthlyConfidence: Confidence;
  anomalies: { date: string; expense: number }[];
  anomaliesFxUnavailable: number | null;
  fxUnavailableCurrency: number | null;
  runway: Runway | null;
  incomeUnavailableReason: string | null;
}

export function Insights({
  analytics,
  base,
  periodLabel,
  budgets,
  onBudgetChange,
  strategies,
  metrics,
  joy,
  joyRatedCount,
  joyRatableCount,
  joyFxUnavailableCurrency,
  joyRatingsLoading,
  joyRatingsError,
}: {
  analytics: AnalyticsResult;
  base: number;
  periodLabel: string;
  budgets: Record<string, number>;
  onBudgetChange: (b: Record<string, number>) => void;
  strategies: Strategy[];
  metrics: MetricsView | null;
  joy: CategoryJoy[] | null;
  joyRatedCount: number;
  joyRatableCount: number;
  joyFxUnavailableCurrency: number | null;
  joyRatingsLoading: boolean;
  joyRatingsError: string | null;
}) {
  const [editingCatKey, setEditingCatKey] = useState<string | null>(null);
  const [editingLimitValue, setEditingLimitValue] = useState("");

  const incomeText =
    analytics.totalIncome !== null
      ? formatMoney(analytics.totalIncome, base)
      : analytics.incomeLoading
        ? "Завантаження…"
        : `Немає курсу для ${currencyMeta(analytics.incomeFxUnavailableCurrency ?? 0).code}`;

  const expenseText =
    analytics.totalExpense !== null
      ? formatMoney(analytics.totalExpense, base)
      : `Немає курсу для ${currencyMeta(analytics.expenseFxUnavailableCurrency ?? 0).code}`;

  const netValue = analytics.net;
  const isPositiveNet = netValue !== null && netValue >= 0;

  const handleStartEditBudget = (catKey: string, currentLimitMinor: number) => {
    setEditingCatKey(catKey);
    setEditingLimitValue(currentLimitMinor > 0 ? (currentLimitMinor / 100).toString() : "");
  };

  const handleSaveBudget = (catKey: string) => {
    const val = Math.round(parseFloat(editingLimitValue.replace(",", ".")) * 100);
    const nextLimit = Number.isFinite(val) && val > 0 ? val : 0;
    onBudgetChange({ ...budgets, [catKey]: nextLimit });
    setEditingCatKey(null);
  };

  return (
    <div className="animate-in fade-in duration-300 space-y-6">
      {/* 1. Головне табло періоду (Hero Stats) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <TrendingDown className="size-4 text-destructive" /> Витрати
            </div>
            <div className="text-xl font-bold tabular-nums font-display tracking-tight text-foreground">
              {expenseText}
            </div>
            {analytics.cardExpense !== null && analytics.cashExpense !== null && analytics.cashExpense > 0 && (
              <div className="text-[11px] text-muted-foreground truncate">
                Картка: {formatMoney(analytics.cardExpense, base)} · Готівка: {formatMoney(analytics.cashExpense, base)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <TrendingUp className="size-4 text-success" /> Доходи
            </div>
            <div className="text-xl font-bold tabular-nums font-display tracking-tight text-success">
              {incomeText}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {periodLabel}
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <PiggyBank className="size-4 text-primary" /> Заощаджено
            </div>
            <div
              className={cn(
                "text-xl font-bold tabular-nums font-display tracking-tight",
                netValue === null
                  ? "text-muted-foreground"
                  : isPositiveNet
                    ? "text-success"
                    : "text-destructive"
              )}
            >
              {netValue !== null
                ? `${isPositiveNet ? "+" : ""}${formatMoney(netValue, base)}`
                : "—"}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {isPositiveNet ? "Позитивний баланс" : "Витрачено більше за дохід"}
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <CalendarDays className="size-4 text-primary" /> Типовий день
            </div>
            <div className="text-xl font-bold tabular-nums font-display tracking-tight text-foreground">
              {metrics?.dailyMedian !== null && metrics?.dailyMedian !== undefined
                ? formatMoney(metrics.dailyMedian, base)
                : "—"}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {metrics?.dailyConfidence === "low" ? "Орієнтовно (мало даних)" : "Медіана денних витрат"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 2. Структура витрат: Кругова діаграма + Топ категорій */}
      <Card className="border shadow-xs overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <PieChartIcon className="size-4 text-primary" /> Структура витрат за категоріями
            </CardTitle>
            <span className="text-xs text-muted-foreground font-medium">{periodLabel}</span>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          {analytics.byCategory.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              За обраний період витрат не знайдено.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              <div className="md:col-span-5 flex items-center justify-center">
                <CategoryPie data={analytics.byCategory} base={base} />
              </div>

              <div className="md:col-span-7 space-y-3">
                {analytics.byCategory.slice(0, 7).map((c) => {
                  const pct =
                    analytics.totalExpense && analytics.totalExpense > 0
                      ? Math.round((c.total / analytics.totalExpense) * 100)
                      : 0;
                  return (
                    <div key={c.category.key} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium flex items-center gap-2 text-foreground">
                          <span>{c.category.emoji}</span>
                          <span>{c.category.label}</span>
                        </span>
                        <div className="flex items-center gap-2 tabular-nums">
                          <span className="font-semibold text-foreground">
                            {formatMoney(c.total, base)}
                          </span>
                          <span className="text-muted-foreground w-9 text-right">{pct}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${pct}%`, backgroundColor: c.category.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Динаміка доходів та витрат по днях */}
      <Card className="border shadow-xs overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CalendarRange className="size-4 text-primary" /> Динаміка по днях
            </CardTitle>
            <span className="text-xs text-muted-foreground">{periodLabel}</span>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <IncomeExpenseBars data={analytics.daily} base={base} />
        </CardContent>
      </Card>

      {/* 4. Очікувані витрати на місяць (Прогноз людською мовою) */}
      <Card className="border shadow-xs">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Clock className="size-4 text-primary" /> Очікувані витрати на місяць
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Статистичний прогноз місячного бюджету на основі вашої історії (без аномальних великих покупок).
          </p>
        </CardHeader>
        <CardContent className="p-4 pt-2 space-y-4">
          {!metrics || metrics.monthlyConfidence === "insufficient" ? (
            <p className="text-xs text-muted-foreground py-2">
              Для формування точного прогнозу потрібно щонайменше 2-3 місяці історії витрат.
            </p>
          ) : metrics.p50 === null ? (
            <p className="text-xs text-muted-foreground py-2">
              Немає курсу для валюти — прогноз тимчасово недоступний.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl bg-secondary/60 p-3 space-y-1">
                  <div className="text-xs text-muted-foreground font-medium">Ощадливий місяць</div>
                  <div className="text-base font-bold tabular-nums font-display">
                    {formatMoney(metrics.p10!, base)}
                  </div>
                  <p className="text-[11px] text-muted-foreground">Коли мало непередбачуваних витрат</p>
                </div>

                <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3 space-y-1">
                  <div className="text-xs font-semibold text-primary">Звичайний темп</div>
                  <div className="text-base font-bold tabular-nums font-display text-foreground">
                    {formatMoney(metrics.p50!, base)}
                  </div>
                  <p className="text-[11px] text-muted-foreground">Ваш реальний медіанний рівень</p>
                </div>

                <div className="rounded-xl bg-secondary/60 p-3 space-y-1">
                  <div className="text-xs text-muted-foreground font-medium">Витратний місяць</div>
                  <div className="text-base font-bold tabular-nums font-display">
                    {formatMoney(metrics.p90!, base)}
                  </div>
                  <p className="text-[11px] text-muted-foreground">З подарунками або святами</p>
                </div>
              </div>

              {metrics.runway && (
                <div className="rounded-xl border bg-secondary/40 p-3 text-xs leading-relaxed">
                  {metrics.runway.infinite ? (
                    <span className="text-success font-medium flex items-center gap-1.5">
                      <CheckCircle2 className="size-4 shrink-0" />
                      Ваш дохід перекриває навіть найвитратніший місяць — резерви та накопичення не проїдаються.
                    </span>
                  ) : (
                    <span>
                      За консервативного сценарію поточного запасу ліквідних коштів вистачить на{" "}
                      <strong className="font-semibold tabular-nums text-foreground">{metrics.runway.days} днів</strong>{" "}
                      (орієнтовно до {metrics.runway.exhaustDate}).
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 5. Бюджети по категоріях та Найбільші отримувачі коштів */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Бюджети категорій */}
        <Card className="border shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="size-4 text-warning" /> Бюджети за категоріями
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Встановіть комфортний щомісячний ліміт і слідкуйте за його дотриманням.
            </p>
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-4">
            {analytics.byCategory.slice(0, 8).map((c) => {
              const limit = budgets[c.category.key] ?? 0;
              const hasLimit = limit > 0;
              const pct = hasLimit ? Math.min(100, Math.round((c.total / limit) * 100)) : 0;
              const isOver = hasLimit && c.total > limit;
              const isEditing = editingCatKey === c.category.key;

              return (
                <div key={c.category.key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium flex items-center gap-1.5 text-foreground truncate max-w-[160px]">
                      <span>{c.category.emoji}</span>
                      <span className="truncate">{c.category.label}</span>
                    </span>

                    <div className="flex items-center gap-2 shrink-0">
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            inputMode="decimal"
                            value={editingLimitValue}
                            onChange={(e) => setEditingLimitValue(e.target.value)}
                            placeholder="0"
                            className="h-7 w-20 text-xs text-right tabular-nums px-1.5"
                            autoFocus
                            onKeyDown={(e) => e.key === "Enter" && handleSaveBudget(c.category.key)}
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveBudget(c.category.key)}
                            className="size-7 flex items-center justify-center rounded-lg bg-primary text-primary-foreground"
                          >
                            <Check className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingCatKey(null)}
                            className="size-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className={cn("font-semibold tabular-nums", isOver && "text-destructive")}>
                            {formatMoney(c.total, base)}
                          </span>
                          <span className="text-muted-foreground">/</span>
                          <button
                            type="button"
                            onClick={() => handleStartEditBudget(c.category.key, limit)}
                            className="text-muted-foreground hover:text-foreground hover:underline tabular-nums flex items-center gap-1"
                            title="Змінити місячний ліміт"
                          >
                            <span>{hasLimit ? formatMoney(limit, base) : "Задати ліміт"}</span>
                            <Edit2 className="size-2.5 opacity-50" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {hasLimit && (
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-300",
                          isOver ? "bg-destructive" : "bg-primary"
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {analytics.byCategory.length === 0 && (
              <p className="text-xs text-muted-foreground py-4 text-center">
                Немає витрат для встановлення лімітів.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Топ отримувачів коштів */}
        <Card className="border shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Store className="size-4 text-primary" /> Топ місць покупок
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Продавці та сервіси, де ви залишили найбільше коштів за період.
            </p>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            {analytics.topMerchants.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                Немає даних за обраний період.
              </p>
            ) : (
              <div className="divide-y text-xs">
                {analytics.topMerchants.slice(0, 8).map((m, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0 pr-3">
                      <div className="font-semibold text-foreground truncate">{m.name}</div>
                      <div className="text-[11px] text-muted-foreground">{m.count} покупок</div>
                    </div>
                    <div className="font-bold tabular-nums font-display text-sm shrink-0">
                      {formatMoney(m.total, base)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 6. Додаткові блоки: Разові великі покупки, Joy, Стратегії */}
      <div className="space-y-4 pt-2">
        {/* Разові аномальні покупки */}
        {metrics && (metrics.anomalies.length > 0 || metrics.anomaliesFxUnavailable !== null) && (
          <Disclosure title="Разові великі покупки">
            <div className="space-y-2 pt-1 text-xs">
              <p className="text-muted-foreground leading-relaxed">
                Ці операції відокремлені від регулярного «типового дня», щоб не викривляти повсякденну статистику.
              </p>
              <div className="divide-y rounded-xl border bg-card p-3">
                {metrics.anomalies.map((a) => (
                  <div key={a.date} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                    <span className="text-muted-foreground">{a.date}</span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {formatMoney(a.expense, base)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Disclosure>
        )}

        {/* Емоційне задоволення від покупок (Joy) */}
        <Joy
          categories={joy}
          ratedCount={joyRatedCount}
          ratableCount={joyRatableCount}
          fxUnavailableCurrency={joyFxUnavailableCurrency}
          ratingsLoading={joyRatingsLoading}
          ratingsError={joyRatingsError}
          base={base}
        />

        {/* Розумні поради та фінансові стратегії */}
        <Disclosure title="Фінансові поради та стратегії">
          <div className="space-y-3 pt-1">
            {strategies.map((s) => (
              <StrategyCard key={s.id} s={s} />
            ))}
          </div>
        </Disclosure>
      </div>
    </div>
  );
}

const LEVEL_STYLE: Record<StrategyLevel, { icon: React.ReactNode; color: string }> = {
  good: { icon: <CheckCircle2 className="size-4" />, color: "var(--success)" },
  warn: { icon: <AlertTriangle className="size-4" />, color: "var(--warning)" },
  bad: { icon: <XCircle className="size-4" />, color: "var(--destructive)" },
  info: { icon: <Info className="size-4" />, color: "var(--primary)" },
};

function StrategyCard({ s }: { s: Strategy }) {
  const m = LEVEL_STYLE[s.level];
  return (
    <Card className="border shadow-xs">
      <CardContent className="p-3.5 space-y-2">
        <div className="flex gap-3">
          <span className="mt-0.5 shrink-0" style={{ color: m.color }}>
            {m.icon}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold">{s.title}</div>
            {s.metric && <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">{s.metric}</div>}
            <div className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{s.detail}</div>
          </div>
        </div>
        {s.progress !== undefined && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="meter-fill h-full rounded-full"
              style={{ width: `${Math.round(s.progress * 100)}%`, background: m.color }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
