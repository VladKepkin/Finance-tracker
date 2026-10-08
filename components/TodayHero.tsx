"use client";

import { Eye, EyeOff, ChevronRight } from "lucide-react";
import type { TodayHero as TodayHeroState } from "@/lib/home/todayHero";
import { formatMoney, formatDate, moneyParts, pluralUk } from "@/lib/format";
import { useCountUp } from "@/components/useCountUp";
import { cn } from "@/lib/utils";

const MASK = "••••";

function BigAmount({ minor, base, masked, tone }: { minor: number; base: number; masked: boolean; tone?: string }) {
  const animated = useCountUp(minor);
  const p = moneyParts(animated, base);
  if (masked) {
    return <span className="font-display text-[44px] font-semibold leading-none tracking-tight">{MASK}</span>;
  }
  return (
    <span className={cn("font-display flex items-baseline leading-none", tone)}>
      <span className="text-[44px] font-semibold tracking-tight tabular-nums">
        {p.negative ? "−" : ""}
        {p.whole}
      </span>
      <span className="ml-0.5 text-xl font-medium tabular-nums opacity-45">{p.fraction}</span>
      <span className="ml-1.5 text-2xl font-medium opacity-70">{p.symbol}</span>
    </span>
  );
}

function ProgressBar({ ratio, over }: { ratio: number | null; over: boolean }) {
  const pct = over ? 100 : Math.max(2, Math.min(100, (ratio ?? 0) * 100));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/[0.07]">
      <div
        className={cn("meter-slide h-full w-full rounded-full", over ? "bg-destructive" : "brand-gradient")}
        style={{ transform: `translateX(${pct - 100}%)` }}
      />
    </div>
  );
}

export function TodayHero({
  state,
  base,
  masked,
  onToggleMasked,
  onOpen,
  onSetup,
}: {
  state: TodayHeroState;
  base: number;
  masked: boolean;
  onToggleMasked: () => void;
  onOpen: () => void;
  onSetup: (action: "salary" | "schedule") => void;
}) {
  const money = (minor: number) => (masked ? MASK : formatMoney(minor, base));
  const over = state.kind === "over";

  const label =
    state.kind === "within"
      ? "Можна ще сьогодні"
      : state.kind === "over"
        ? "Перевитрата сьогодні"
        : state.kind === "unknown"
          ? "Сьогодні"
          : "Витрачено сьогодні";

  const formatSalaryDate = (unixSeconds: number) =>
    new Date(unixSeconds * 1000).toLocaleDateString("uk-UA", {
      day: "numeric",
      month: "long",
    });

  const incomeLine =
    state.kind === "within" || state.kind === "over"
      ? `Зарплата ${formatSalaryDate(state.periodEnd)}`
      : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}
      className={cn(
        "hero-rise soft-shadow relative isolate w-full cursor-pointer overflow-hidden rounded-[28px] border border-white/70 bg-card p-5 text-left transition-transform duration-200 ease-[var(--ease-out)] active:scale-[0.985]"
      )}
    >
      <div aria-hidden className={cn("hero-aurora -z-10", over && "hero-aurora-over")} />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-medium text-foreground">{label}</span>
          <span className="inline-flex items-center gap-0.5 rounded-full bg-secondary/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground">
            Деталі <ChevronRight className="size-3" />
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleMasked();
          }}
          aria-label={masked ? "Показати суми" : "Приховати суми"}
          className="-mr-1 flex size-9 items-center justify-center rounded-full text-foreground/60 transition-colors hover:bg-secondary"
        >
          {masked ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        {state.kind === "within" && <BigAmount minor={state.remaining} base={base} masked={masked} />}
        {state.kind === "over" && (
          <BigAmount minor={-state.overBy} base={base} masked={masked} tone="text-destructive" />
        )}
        {(state.kind === "spentOnly" || state.kind === "loading") && (
          <BigAmount minor={state.spent} base={base} masked={masked} />
        )}
        {state.kind === "unknown" && <p className="text-sm text-muted-foreground">{state.reason}</p>}
        {state.kind === "within" && (
          <span className="pb-1 text-sm text-muted-foreground tabular-nums">із {money(state.perDay)}</span>
        )}
        {state.kind === "over" && (
          <span className="pb-1 text-sm text-muted-foreground tabular-nums">ліміт {money(state.perDay)}</span>
        )}
      </div>

      {(state.kind === "within" || state.kind === "over") && (
        <div className="mt-4 space-y-2.5">
          <ProgressBar ratio={state.kind === "within" ? state.ratio : null} over={over} />
          <div className="flex items-center justify-between gap-2 text-[13px] text-muted-foreground">
            <span className="whitespace-nowrap tabular-nums">Витрачено {money(state.spent)}</span>
            <span
              className="flex items-center gap-0.5 whitespace-nowrap text-foreground/80 font-medium"
              title={`Зарплата ${formatSalaryDate(state.periodEnd)} (${state.daysToIncome} ${pluralUk(state.daysToIncome, "день", "дні", "днів")})`}
            >
              {incomeLine}
              <ChevronRight className="size-3.5 shrink-0 opacity-70" />
            </span>
          </div>
        </div>
      )}

      {state.kind === "loading" && (
        <div className="mt-4 space-y-2">
          <div className="h-2 w-full animate-pulse rounded-full bg-foreground/[0.07]" />
          <p className="text-[13px] text-muted-foreground">Перевіряємо ліміт…</p>
        </div>
      )}

      {state.kind === "spentOnly" && (
        <div className="mt-4 space-y-3">
          <p className="text-[13px] leading-snug text-muted-foreground">
            {state.reason || "Налаштуй день зарплати в Меню, щоб побачити свій безпечний ліміт."}
          </p>
          {state.action !== null && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSetup(state.action as "salary" | "schedule");
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-transform active:scale-[0.97]"
            >
              {state.action === "salary" ? "Вказати суму зарплати" : "Вказати день зарплати"}
              <ChevronRight className="size-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
