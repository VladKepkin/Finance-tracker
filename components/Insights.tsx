"use client";

import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  CalendarRange,
  Activity,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  CalendarDays,
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
import { Input } from "@/components/ui/input";
import { Joy } from "@/components/Joy";
import { Disclosure } from "@/components/ui/disclosure";
import { CategoryPie, IncomeExpenseBars } from "@/components/Charts";

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
  const sym = currencyMeta(base).symbol;

  const incomeText =
    analytics.totalIncome !== null
      ? formatMoney(analytics.totalIncome, base)
      : analytics.incomeLoading
        ? "Зарплати завантажуються…"
        : `Немає курсу для ${currencyMeta(analytics.incomeFxUnavailableCurrency ?? 0).code}`;

  const expenseText =
    analytics.totalExpense !== null
      ? formatMoney(analytics.totalExpense, base)
      : `Немає курсу для ${currencyMeta(analytics.expenseFxUnavailableCurrency ?? 0).code}`;

  return (
    <div className="animate-in fade-in duration-300 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Activity className="size-4" /> Типовий день
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Медіана денних витрат за наявну історію (до 12 місяців). Разові великі покупки не враховані —
            вони окремо нижче.
          </p>
        </CardHeader>
        <CardContent>
          {!metrics || metrics.dailyConfidence === "insufficient" ? (
            <p className="text-sm text-muted-foreground">
              Замало даних — потрібно щонайменше 14 днів історії.
            </p>
          ) : metrics.dailyMedian === null ? (
            <p className="text-sm text-muted-foreground">
              Немає курсу для {currencyMeta(metrics.fxUnavailableCurrency ?? 0).code} — типовий день порахувати не можна.
            </p>
          ) : (
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">
                {formatMoney(metrics.dailyMedian, base)}
              </span>
              <span className="text-xs text-muted-foreground">/день</span>
              {metrics.dailyConfidence === "low" && (
                <Badge variant="secondary" className="text-[10px]">мало даних</Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <CalendarRange className="size-4" /> Прогноз на місяць
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Сценарії — це реальні перцентилі твоїх місяців, а не вигадані коефіцієнти.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {!metrics || metrics.monthlyConfidence === "insufficient" ? (
            <p className="text-sm text-muted-foreground">
              Замало даних — потрібно щонайменше 3 повні місяці.
            </p>
          ) : metrics.p50 === null ? (
            <p className="text-sm text-muted-foreground">
              Немає курсу для {currencyMeta(metrics.fxUnavailableCurrency ?? 0).code} — прогноз порахувати не можна.
            </p>
          ) : (
            <>
              <div className="divide-y divide-border/60 rounded-2xl bg-secondary px-3.5">
                {[
                  { label: "Оптимістично", v: metrics.p10, hint: "P10" },
                  { label: "Реалістично", v: metrics.p50, hint: "P50" },
                  { label: "Консервативно", v: metrics.p90, hint: "P90" },
                ].map((s) => (
                  <div key={s.hint} className="flex items-center justify-between gap-3 py-2.5">
                    <div>
                      <div className="text-sm">{s.label}</div>
                      <div className="text-[11px] text-muted-foreground">{s.hint}</div>
                    </div>
                    <div className="whitespace-nowrap font-semibold tabular-nums">{formatMoney(s.v!, base)}</div>
                  </div>
                ))}
              </div>
              {metrics.monthlyConfidence === "low" && (
                <Badge variant="secondary" className="text-[10px]">мало місяців — оцінка груба</Badge>
              )}
              {metrics.runway && (
                <div className="rounded-xl bg-secondary p-3 text-sm">
                  {metrics.runway.infinite ? (
                    <span className="text-success">
                      Дохід перекриває навіть найвитратніший місяць — запас не проїдається.
                    </span>
                  ) : (
                    <>
                      За консервативного сценарію запасу вистачить на{" "}
                      <span className="font-semibold tabular-nums">{metrics.runway.days} дн.</span>{" "}
                      <span className="text-muted-foreground">(до {metrics.runway.exhaustDate})</span>
                    </>
                  )}
                </div>
              )}
              {!metrics.runway && metrics.incomeUnavailableReason && (
                <p className="text-xs text-muted-foreground">{metrics.incomeUnavailableReason}</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Joy
        categories={joy}
        ratedCount={joyRatedCount}
        ratableCount={joyRatableCount}
        fxUnavailableCurrency={joyFxUnavailableCurrency}
        ratingsLoading={joyRatingsLoading}
        ratingsError={joyRatingsError}
        base={base}
      />

      {metrics && (metrics.anomalies.length > 0 || metrics.anomaliesFxUnavailable !== null) && (
        <Disclosure title="Разові витрати">
          <p className="mb-2 text-xs text-muted-foreground">
            Виділені з «типового дня», щоб не спотворювати картину. Гроші, звісно, витрачені.
          </p>
          <div className="space-y-2">
            {metrics.anomaliesFxUnavailable !== null ? (
              <p className="text-sm text-muted-foreground">
                Немає курсу для {currencyMeta(metrics.anomaliesFxUnavailable).code} — суми порахувати не можна.
              </p>
            ) : (
              metrics.anomalies.map((a) => (
                <div key={a.date} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{a.date}</span>
                  <span className="tabular-nums">{formatMoney(a.expense, base)}</span>
                </div>
              ))
            )}
          </div>
        </Disclosure>
      )}

      <Disclosure title="Графіки: дохід і витрати за період">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat icon={<TrendingUp className="size-4" />} label="Дохід" value={incomeText} color="text-success" />
            <Stat icon={<TrendingDown className="size-4" />} label="Витрати" value={expenseText} color="text-destructive" />
            <Stat
              icon={<PiggyBank className="size-4" />}
              label="Заощаджено"
              value={
                analytics.net !== null
                  ? formatMoney(analytics.net, base)
                  : analytics.totalIncome === null
                    ? incomeText
                    : expenseText
              }
              color={analytics.net === null ? "text-muted-foreground" : analytics.net >= 0 ? "text-success" : "text-destructive"}
            />
            <Stat
              icon={<CalendarDays className="size-4" />}
              label="Типовий день"
              value={metrics?.dailyMedian == null ? "—" : formatMoney(metrics.dailyMedian, base)}
              color="text-primary"
            />
          </div>

          {analytics.expenseFxUnavailableCurrency !== null ? (
            <div className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-xs">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>
                Немає курсу для {currencyMeta(analytics.expenseFxUnavailableCurrency).code} — графік і
                структуру витрат за період порахувати не можна.
              </span>
            </div>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Дохід проти витрат</CardTitle>
                  <p className="text-xs text-muted-foreground">{periodLabel}</p>
                </CardHeader>
                <CardContent>
                  <IncomeExpenseBars data={analytics.daily} base={base} />
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Структура витрат</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CategoryPie data={analytics.byCategory} base={base} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Топ категорій</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {analytics.byCategory.slice(0, 6).map((c) => {
                      const pct = analytics.totalExpense && analytics.totalExpense > 0 ? (c.total / analytics.totalExpense) * 100 : 0;
                      return (
                        <div key={c.category.key}>
                          <div className="flex items-center justify-between text-sm">
                            <span>
                              {c.category.emoji} {c.category.label}
                            </span>
                            <span className="tabular-nums">{formatMoney(c.total, base)}</span>
                          </div>
                          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-secondary">
                            <div
                              className="meter-fill h-full rounded-full"
                              style={{ width: `${pct}%`, background: c.category.color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    {analytics.byCategory.length === 0 && (
                      <p className="text-sm text-muted-foreground">Немає витрат за обраний період.</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      </Disclosure>

      <Disclosure title="Бюджети по категоріях">
        <p className="mb-3 text-xs text-muted-foreground">
          Задай місячний ліміт ({sym}) — і слідкуй, скільки вже витрачено за період.
        </p>
        <div className="space-y-4">
          {analytics.byCategory.slice(0, 8).map((c) => {
            const limit = budgets[c.category.key] ?? 0;
            const pct = limit > 0 ? Math.min(100, (c.total / limit) * 100) : 0;
            const over = limit > 0 && c.total > limit;
            return (
              <div key={c.category.key}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    {c.category.emoji} {c.category.label}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`whitespace-nowrap tabular-nums ${over ? "text-destructive" : ""}`}>
                      {formatMoney(c.total, base)}
                    </span>
                    <span className="text-muted-foreground">/</span>
                    <Input
                      type="number"
                      value={limit ? limit / 100 : ""}
                      placeholder="ліміт"
                      onChange={(e) => {
                        const v = Math.round(parseFloat(e.target.value || "0") * 100);
                        onBudgetChange({ ...budgets, [c.category.key]: v > 0 ? v : 0 });
                      }}
                      className="h-7 w-20 px-2 text-right text-xs tabular-nums"
                    />
                  </div>
                </div>
                {limit > 0 && (
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="meter-fill h-full rounded-full"
                      style={{ width: `${pct}%`, background: over ? "var(--destructive)" : c.category.color }}
                    />
                  </div>
                )}
              </div>
            );
          })}
          {analytics.byCategory.length === 0 &&
            (analytics.expenseFxUnavailableCurrency !== null ? (
              <p className="text-sm text-muted-foreground">
                Немає курсу для {currencyMeta(analytics.expenseFxUnavailableCurrency).code} — бюджети
                порахувати не можна.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Немає витрат для встановлення бюджетів.</p>
            ))}
        </div>
      </Disclosure>

      {(analytics.topMerchants.length > 0 || analytics.expenseFxUnavailableCurrency !== null) && (
        <Disclosure title="Найбільші отримувачі коштів">
          {analytics.expenseFxUnavailableCurrency !== null && (
            <p className="mb-2 text-sm text-muted-foreground">
              Немає курсу для {currencyMeta(analytics.expenseFxUnavailableCurrency).code} — суми
              порахувати не можна.
            </p>
          )}
          <div className="space-y-2.5">
            {analytics.topMerchants.map((m, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="truncate pr-3">{m.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {m.count}× · {formatMoney(m.total, base)}
                </span>
              </div>
            ))}
          </div>
        </Disclosure>
      )}

      <Disclosure title="Поради: стратегії розвитку">
        <div className="space-y-3">
          {strategies.map((s) => (
            <StrategyCard key={s.id} s={s} />
          ))}
        </div>
      </Disclosure>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="px-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={color}>{icon}</span>
          {label}
        </div>
        <div className="mt-1.5 whitespace-nowrap text-base font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

const LEVEL_STYLE: Record<StrategyLevel, { icon: React.ReactNode; color: string }> = {
  good: { icon: <CheckCircle2 className="size-[18px]" />, color: "var(--success)" },
  warn: { icon: <AlertTriangle className="size-[18px]" />, color: "var(--warning)" },
  bad: { icon: <XCircle className="size-[18px]" />, color: "var(--destructive)" },
  info: { icon: <Info className="size-[18px]" />, color: "var(--primary)" },
};

function StrategyCard({ s }: { s: Strategy }) {
  const m = LEVEL_STYLE[s.level];
  return (
    <Card>
      <CardContent className="space-y-2">
        <div className="flex gap-3">
          <span className="mt-0.5 shrink-0" style={{ color: m.color }}>
            {m.icon}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{s.title}</div>
            {s.metric && <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">{s.metric}</div>}
            <div className="mt-0.5 text-sm text-muted-foreground">{s.detail}</div>
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
