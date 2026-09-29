"use client";

import { useId } from "react";
import { Gauge, History, Settings2, AlertTriangle, BarChart3, CalendarRange } from "lucide-react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { spendGauge, dayHistory, type DayBar } from "@/lib/metrics/spendGauge";
import { tomorrowForecast } from "@/lib/metrics/spendableLiquid";
import type { Allowance } from "@/lib/metrics/allowance";
import { currencyMeta } from "@/lib/monobank";
import { formatMoney, formatMoneyShort, formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

function ReasonBox({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-xs">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
      <span>{text}</span>
    </div>
  );
}

function colorFor(v: DayBar["vsTypical"]): string {
  switch (v) {
    case "light":
      return "bg-success/50";
    case "heavy":
      return "bg-warning/70";
    case "typical":
      return "bg-brand/60";
    default:
      return "bg-secondary";
  }
}

function toneFor(v: DayBar["vsTypical"]): string {
  switch (v) {
    case "light":
      return "text-success";
    case "heavy":
      return "text-warning";
    case "typical":
      return "text-brand";
    default:
      return "text-muted-foreground";
  }
}

const WEEKDAY_UK = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
function weekdayShortUk(date: string): string {
  return WEEKDAY_UK[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

function polarPoint(cx: number, cy: number, r: number, t: number) {
  const angle = Math.PI * (1 - t);
  return { x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle) };
}

function arcPath(cx: number, cy: number, r: number, t0: number, t1: number): string {
  if (t1 <= t0) return "";
  const p0 = polarPoint(cx, cy, r, t0);
  const p1 = polarPoint(cx, cy, r, t1);
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 0 1 ${p1.x} ${p1.y}`;
}

function Dial({
  gradId,
  fillPct,
  toneClass,
  size,
  solid,
  target,
}: {
  gradId: string;
  fillPct: number | null;
  toneClass: string;
  size: "lg" | "sm";
  solid?: boolean;
  target?: boolean;
}) {
  const cx = 60;
  const cy = 58;
  const r = 50;
  const strokeWidth = size === "lg" ? 8 : 6;
  const trackD = arcPath(cx, cy, r, 0, 1);
  const clamped = fillPct === null ? null : Math.max(0, Math.min(100, fillPct));
  const fillD = clamped !== null ? arcPath(cx, cy, r, 0, Math.max(0.012, clamped / 100)) : "";
  const uid = useId();
  const gid = `${gradId}-${uid}`;
  return (
    <svg
      viewBox="0 0 120 66"
      className={cn(
        size === "lg" ? "h-20 w-full max-w-[220px] sm:h-24 sm:w-40" : "h-12 w-24 shrink-0",
        toneClass
      )}
    >
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="currentColor" stopOpacity={solid ? 1 : 0.35} />
          <stop offset="100%" stopColor="currentColor" stopOpacity="1" />
        </linearGradient>
      </defs>
      <path
        d={trackD}
        fill="none"
        stroke="var(--secondary)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={target ? "6 6" : undefined}
      />
      {clamped !== null && (
        <path
          d={fillD}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          pathLength={size === "lg" ? 1 : undefined}
          className={size === "lg" ? "dial-glow dial-sweep" : undefined}
        />
      )}
    </svg>
  );
}

export function SpendGaugeCard({
  spentTodayBase,
  spentTodayFxUnavailable,
  allowance,
  allowanceLoading,
  allowanceError,
  fxUnavailableCurrency,
  base,
  onSetup,
  dailySeries,
  seriesFxUnavailable,
  dailyMedianBase,
  spendableReason,
  salaryBudget,
  periodStart,
  periodEnd,
  periodSpentBase,
  periodSpentLoading,
  periodSpentFxUnavailable,
  periodStatementError,
  netWorthBase,
  capitalFxUnavailable,
}: {
  spentTodayBase: number | null;
  spentTodayFxUnavailable: number | null;
  allowance: Allowance | null;
  allowanceLoading: boolean;
  allowanceError: string | null;
  fxUnavailableCurrency: number | null;
  base: number;
  onSetup: () => void;
  dailySeries: { date: string; spent: number }[] | null;
  seriesFxUnavailable: number | null;
  dailyMedianBase: number | null;
  spendableReason: string | null;
  salaryBudget: number | null;
  periodStart: number | null;
  periodEnd: number | null;
  periodSpentBase: number | null;
  periodSpentLoading: boolean;
  periodSpentFxUnavailable: number | null;
  periodStatementError: string | null;
  netWorthBase: number | null;
  capitalFxUnavailable: number | null;
}) {
  let gaugeBody: React.ReactNode;
  if (spentTodayFxUnavailable !== null) {
    gaugeBody = (
      <p className="text-sm text-muted-foreground">
        Немає курсу для {currencyMeta(spentTodayFxUnavailable).code} — витрату сьогодні порахувати не
        можна.
      </p>
    );
  } else if (spentTodayBase === null) {
    gaugeBody = <p className="text-sm text-muted-foreground">Витрату сьогодні порахувати не можна.</p>;
  } else {
    const spentLine = (
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Витрачено сьогодні</span>
        <span className="font-semibold tabular-nums">{formatMoney(spentTodayBase, base)}</span>
      </div>
    );

    if (allowanceLoading) {
      gaugeBody = (
        <div className="space-y-2">
          {spentLine}
          <p className="text-sm text-muted-foreground">Перевіряємо ліміт…</p>
        </div>
      );
    } else if (allowanceError) {
      gaugeBody = (
        <div className="space-y-2">
          {spentLine}
          <ReasonBox text={`Не вдалося перевірити зобов'язання: ${allowanceError}. Ліміт не порахований.`} />
        </div>
      );
    } else if (fxUnavailableCurrency !== null) {
      gaugeBody = (
        <div className="space-y-2">
          {spentLine}
          <ReasonBox
            text={`Немає курсу для ${currencyMeta(fxUnavailableCurrency).code} — ліміт зараз порахувати не можна.`}
          />
        </div>
      );
    } else if (spendableReason !== null) {
      gaugeBody = (
        <div className="space-y-3">
          {spentLine}
          <ReasonBox text={spendableReason} />
          <Button variant="outline" className="w-full" onClick={onSetup}>
            <Settings2 className="size-4" /> Додати зарплату
          </Button>
        </div>
      );
    } else if (!allowance) {
      gaugeBody = (
        <div className="space-y-3">
          {spentLine}
          <p className="text-sm text-muted-foreground">Ліміт не налаштовано.</p>
          <Button variant="outline" className="w-full" onClick={onSetup}>
            <Settings2 className="size-4" /> Налаштувати графік доходу
          </Button>
        </div>
      );
    } else {
      const g = spendGauge(spentTodayBase, allowance.perDay);
      const fillPct = g.ratio !== null ? Math.min(1, Math.max(0, g.ratio)) * 100 : 0;
      const over = g.zone === "over";
      gaugeBody = (
        <div className="space-y-3">
          <div className="flex flex-col items-center">
            <Dial
              gradId="sg-today"
              fillPct={fillPct}
              toneClass={over ? "text-destructive" : "text-brand"}
              size="lg"
              solid={over}
            />
            <div className="-mt-3 flex flex-col items-center gap-0.5">
              <span className="font-display hero-rise text-4xl font-bold tracking-tight tabular-nums sm:text-2xl">
                {formatMoney(g.spent, base)}
              </span>
              <span className="text-sm text-muted-foreground">із {formatMoney(allowance.perDay, base)}</span>
            </div>
          </div>
          {over ? (
            <div className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-xs">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>
                Перевитрата на{" "}
                <span className="font-semibold tabular-nums text-destructive">
                  {formatMoney(Math.abs(g.remaining as number), base)}
                </span>{" "}
                понад денний ліміт.
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Залишилось {formatMoney(g.remaining as number, base)}
            </p>
          )}
        </div>
      );
    }
  }

  let yesterdayBody: React.ReactNode;
  if (seriesFxUnavailable !== null) {
    yesterdayBody = (
      <p className="text-center text-[11px] text-muted-foreground">
        Немає курсу для {currencyMeta(seriesFxUnavailable).code}.
      </p>
    );
  } else if (dailySeries === null) {
    yesterdayBody = <div className="h-12 w-24 animate-pulse rounded-full bg-secondary/60" />;
  } else if (dailySeries.length === 0) {
    yesterdayBody = <p className="text-center text-[11px] text-muted-foreground">Замало історії.</p>;
  } else {
    const y = dailySeries[dailySeries.length - 1];
    const [bar] = dayHistory([{ date: y.date, expense: y.spent }], dailyMedianBase);
    const caption =
      bar.vsTypical === "light"
        ? "Легше за типовий день"
        : bar.vsTypical === "heavy"
          ? "Важче за типовий день"
          : bar.vsTypical === "typical"
            ? "Типовий день"
            : "Замало історії для типового дня";
    yesterdayBody = (
      <>
        <span className={cn("text-sm font-semibold tabular-nums", toneFor(bar.vsTypical))}>
          {formatMoney(y.spent, base)}
        </span>
        <span className="text-center text-[11px] text-muted-foreground">{caption}</span>
        <span className="text-center text-[10px] text-muted-foreground/70">{weekdayShortUk(y.date)}, {y.date}</span>
      </>
    );
  }

  let tomorrowBody: React.ReactNode;
  if (allowanceLoading) {
    tomorrowBody = <p className="text-center text-[11px] text-muted-foreground">Прогноз ще рахується…</p>;
  } else if (allowanceError) {
    tomorrowBody = (
      <p className="text-center text-[11px] text-muted-foreground">Збій зобов&apos;язань — прогноз недоступний.</p>
    );
  } else if (fxUnavailableCurrency !== null) {
    tomorrowBody = (
      <p className="text-center text-[11px] text-muted-foreground">
        Немає курсу для {currencyMeta(fxUnavailableCurrency).code} — прогноз недоступний.
      </p>
    );
  } else if (spendableReason !== null) {
    tomorrowBody = <p className="text-center text-[11px] text-muted-foreground">Без зарплати прогнозу немає.</p>;
  } else if (!allowance) {
    tomorrowBody = <p className="text-center text-[11px] text-muted-foreground">Без графіка доходу прогнозу немає.</p>;
  } else {
    const t = tomorrowForecast({ available: allowance.available, daysToIncome: allowance.daysToIncome });
    if (t.perDay === null) {
      tomorrowBody = <p className="text-center text-[11px] text-muted-foreground">{t.reason}</p>;
    } else {
      tomorrowBody = (
        <>
          <Dial gradId="sg-tomorrow" fillPct={null} toneClass="text-muted-foreground" size="sm" target />
          <span className="text-sm font-semibold tabular-nums">{formatMoney(t.perDay, base)}</span>
          {t.reason !== null ? (
            <span className="text-center text-[11px] text-warning">{t.reason}</span>
          ) : (
            <span className="text-center text-[11px] text-muted-foreground">ціль на день</span>
          )}
        </>
      );
    }
  }

  const periodLabel =
    periodStart !== null && periodEnd !== null ? `з ${formatDate(periodStart)} по ${formatDate(periodEnd)}` : null;
  let monthlyBody: React.ReactNode;
  if (periodStart === null || periodEnd === null) {
    monthlyBody = (
      <p className="text-sm text-muted-foreground">
        Без графіка доходу період не визначений — місячний бюджет порахувати нема з чого.
      </p>
    );
  } else if (periodStatementError !== null) {
    monthlyBody = <ReasonBox text={`Не вдалося завантажити операції за період: ${periodStatementError}.`} />;
  } else if (periodSpentFxUnavailable !== null) {
    monthlyBody = (
      <ReasonBox
        text={`Немає курсу для ${currencyMeta(periodSpentFxUnavailable).code} — витрату за період порахувати не можна.`}
      />
    );
  } else if (periodSpentLoading || periodSpentBase === null) {
    monthlyBody = <div className="h-6 w-full animate-pulse rounded-full bg-secondary/60" />;
  } else {
    const spentLine = (
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Витрачено за період</span>
        <span className="font-semibold tabular-nums">{formatMoney(periodSpentBase, base)}</span>
      </div>
    );
    if (spendableReason !== null) {
      monthlyBody = (
        <div className="space-y-2">
          {spentLine}
          <ReasonBox text={spendableReason} />
        </div>
      );
    } else if (salaryBudget === null) {
      monthlyBody = (
        <div className="space-y-2">
          {spentLine}
          <p className="text-sm text-muted-foreground">Місячний бюджет не налаштовано.</p>
        </div>
      );
    } else {
      const g = spendGauge(periodSpentBase, salaryBudget);
      const over = g.zone === "over";
      const pct = g.ratio !== null ? g.ratio * 100 : 0;
      monthlyBody = (
        <div className="space-y-2">
          {spentLine}
          <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={cn("meter-fill h-full rounded-full", over ? "bg-destructive" : "brand-gradient")}
              style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="tabular-nums">із {formatMoney(salaryBudget, base)}</span>
            <span className={cn("tabular-nums", over && "font-semibold text-destructive")}>{Math.round(pct)}%</span>
          </div>
          {over && (
            <div className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-xs">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>
                Перевитрата на{" "}
                <span className="font-semibold tabular-nums text-destructive">
                  {formatMoney(Math.abs(g.remaining as number), base)}
                </span>{" "}
                понад місячний бюджет.
              </span>
            </div>
          )}
        </div>
      );
    }
  }

  let weeklyBody: React.ReactNode;
  if (seriesFxUnavailable !== null) {
    weeklyBody = (
      <p className="text-xs text-muted-foreground">
        Немає курсу для {currencyMeta(seriesFxUnavailable).code} — тижневий графік порахувати не можна.
      </p>
    );
  } else if (dailySeries === null) {
    weeklyBody = (
      <div className="flex h-[120px] items-end gap-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-1/2 flex-1 animate-pulse rounded-sm bg-secondary" />
        ))}
      </div>
    );
  } else if (dailySeries.length === 0) {
    weeklyBody = <p className="text-xs text-muted-foreground">Замало історії за тиждень.</p>;
  } else {
    const week = dailySeries.slice(-7);
    const bars = dayHistory(
      week.map((d) => ({ date: d.date, expense: d.spent })),
      dailyMedianBase
    );
    const chartData = bars.map((b) => ({ date: b.date, label: weekdayShortUk(b.date), spent: b.spent, vsTypical: b.vsTypical }));
    weeklyBody = (
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--secondary)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v: number) => formatMoneyShort(v, base)} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} width={56} />
          <Tooltip
            formatter={(v: number) => formatMoney(v, base)}
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--foreground)" }}
          />
          {dailyMedianBase !== null && (
            <ReferenceLine y={dailyMedianBase} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
          )}
          <Bar dataKey="spent" radius={[4, 4, 0, 0]}>
            {chartData.map((d) => (
              <Cell key={d.date} className={toneFor(d.vsTypical)} fill="currentColor" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }
  const weeklyCaption =
    dailyMedianBase !== null
      ? `По вчора включно — сьогоднішній день ще не завершився. Пунктир — твій типовий день (${formatMoney(dailyMedianBase, base)}).`
      : "По вчора включно — сьогоднішній день ще не завершився.";

  let historyBody: React.ReactNode;
  if (seriesFxUnavailable !== null) {
    historyBody = (
      <p className="text-sm text-muted-foreground">
        Немає курсу для {currencyMeta(seriesFxUnavailable).code} — історію порахувати не можна.
      </p>
    );
  } else if (dailySeries === null) {
    historyBody = (
      <div className="space-y-2">
        <div className="flex h-16 items-end gap-0.5">
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} className="h-1/2 flex-1 animate-pulse rounded-sm bg-secondary" />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Завантажуємо історію…</p>
      </div>
    );
  } else {
    const bars = dayHistory(
      dailySeries.map((d) => ({ date: d.date, expense: d.spent })),
      dailyMedianBase
    );
    const max = Math.max(1, ...bars.map((b) => Number.isFinite(b.spent) ? b.spent : 0));
    historyBody = (
      <div className="space-y-2">
        <div className="flex h-16 items-end gap-0.5">
          {bars.map((b, i) => (
            <div
              key={b.date}
              title={`${b.date}: ${formatMoney(b.spent, base)}`}
              className={cn("bar-grow flex-1 rounded-sm", colorFor(b.vsTypical))}
              style={{ height: `${Math.max(4, (Math.max(0, b.spent) / max) * 100)}%`, animationDelay: `${i * 15}ms` }}
            />
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-success/50" /> легше
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-brand/60" /> типовий
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-warning/70" /> більше
          </span>
        </div>
        {dailyMedianBase === null && (
          <p className="text-xs text-muted-foreground">Замало історії для власного типового дня.</p>
        )}
      </div>
    );
  }

  const todayHeader = (
    <span className="flex items-center gap-1.5 text-sm font-medium">
      <Gauge className="size-4" /> Сьогодні · зараз
    </span>
  );
  const yesterdayBlock = (
    <div className="flex flex-col items-center gap-1 opacity-70">
      <span className="text-xs font-medium text-muted-foreground">Вчора · факт</span>
      {yesterdayBody}
    </div>
  );
  const tomorrowBlock = (
    <div className="flex flex-col items-center gap-1 opacity-70">
      <span className="text-xs font-medium text-muted-foreground">Завтра · прогноз</span>
      {tomorrowBody}
    </div>
  );

  const daysToIncomeStat = allowance !== null ? allowance.daysToIncome : null;
  const incomeDateStat = allowance !== null ? formatDate(allowance.periodEnd) : null;
  const monthlyPctStat: number | null =
    periodStart !== null &&
    periodEnd !== null &&
    periodStatementError === null &&
    periodSpentFxUnavailable === null &&
    !periodSpentLoading &&
    periodSpentBase !== null &&
    spendableReason === null &&
    salaryBudget !== null
      ? (() => {
          const g = spendGauge(periodSpentBase, salaryBudget);
          return g.ratio !== null ? Math.round(g.ratio * 100) : null;
        })()
      : null;
  const capitalStat = netWorthBase !== null ? formatMoneyShort(netWorthBase, base) : null;

  const situationRow = (
    <div className="grid grid-cols-3 gap-2 rounded-2xl bg-secondary p-3 text-center">
      <SituationStat
        label="До зарплати"
        value={daysToIncomeStat !== null ? `${daysToIncomeStat} дн` : "—"}
        sub={daysToIncomeStat !== null ? (incomeDateStat ?? undefined) : undefined}
      />
      <SituationStat label="Місяць" value={monthlyPctStat !== null ? `${monthlyPctStat}%` : "—"} />
      <SituationStat label="Капітал" value={capitalStat ?? "—"} muted={capitalFxUnavailable !== null} />
    </div>
  );

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:hidden">
          <div className="flex flex-col items-center gap-1">
            {todayHeader}
            {gaugeBody}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {yesterdayBlock}
            {tomorrowBlock}
          </div>
        </div>
        <div className="hidden items-start gap-2 sm:grid sm:grid-cols-[1fr_1.5fr_1fr]">
          {yesterdayBlock}
          <div className="flex flex-col items-center gap-1">
            {todayHeader}
            {gaugeBody}
          </div>
          {tomorrowBlock}
        </div>

        {situationRow}

        <Separator />
        <div className="flex items-center gap-2 text-sm font-medium">
          <CalendarRange className="size-4" /> Місяць{periodLabel ? ` · ${periodLabel}` : ""}
        </div>
        {monthlyBody}

        <Separator />
        <div className="flex items-center gap-2 text-sm font-medium">
          <BarChart3 className="size-4" /> Тиждень
        </div>
        <p className="text-xs text-muted-foreground">{weeklyCaption}</p>
        {weeklyBody}

        <Separator />

        <div className="flex items-center gap-2 text-sm font-medium">
          <History className="size-4" /> Останні дні проти твого типового дня
        </div>
        {historyBody}
      </CardContent>
    </Card>
  );
}

function SituationStat({
  label,
  value,
  sub,
  muted,
}: {
  label: string;
  value: string;
  sub?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-display text-lg font-bold tabular-nums leading-tight",
          muted && "text-muted-foreground"
        )}
      >
        {value}
      </span>
      {sub && <span className="text-[10px] text-muted-foreground/70">{sub}</span>}
    </div>
  );
}
