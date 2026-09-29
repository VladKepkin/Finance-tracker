"use client";

import { useMemo, useState } from "react";
import { Search, EyeOff, Star } from "lucide-react";
import type { MonoStatementItem } from "@/lib/monobank";
import { mccToCategory, CATEGORIES } from "@/lib/mcc";
import { formatMoney } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { isOwnJarTransfer } from "@/lib/jarTransfers";
import { cn } from "@/lib/utils";

function dayLabel(unix: number): string {
  const d = new Date(unix * 1000);
  const today = new Date();
  const yest = new Date(Date.now() - 86400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Сьогодні";
  if (same(d, yest)) return "Вчора";
  return d.toLocaleDateString("uk-UA", { day: "2-digit", month: "long", weekday: "short" });
}

export function Expenses({
  statement,
  accountCurrency,
  fakeIds,
  onToggleFake,
  ratings,
  onRate,
  jarTitles,
}: {
  statement: MonoStatementItem[];
  accountCurrency: number;
  fakeIds: Set<string>;
  onToggleFake: (id: string) => void;
  ratings: Record<string, number> | null;
  onRate: (txId: string, score: number | null) => void;
  jarTitles: readonly string[] | null;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "expense" | "income">("expense");
  const [cat, setCat] = useState<string>("all");

  const usedCategories = useMemo(() => {
    const set = new Set<string>();
    for (const it of statement) set.add(mccToCategory(it.mcc, it.amount).key);
    return [...set];
  }, [statement]);

  const filtered = useMemo(() => {
    return statement
      .filter((it) => {
        if (filter === "expense" && it.amount >= 0) return false;
        if (filter === "income" && it.amount < 0) return false;
        if (cat !== "all" && mccToCategory(it.mcc, it.amount).key !== cat) return false;
        if (query && !it.description?.toLowerCase().includes(query.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => b.time - a.time);
  }, [statement, filter, cat, query]);

  const isJarTransfer = (it: MonoStatementItem) => isOwnJarTransfer(it.mcc, it.description, jarTitles);

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: MonoStatementItem[]; total: number }>();
    for (const it of filtered) {
      const key = new Date(it.time * 1000).toDateString();
      let g = map.get(key);
      if (!g) {
        g = { label: dayLabel(it.time), items: [], total: 0 };
        map.set(key, g);
      }
      g.items.push(it);
      if (it.amount < 0 && !fakeIds.has(it.id) && !isJarTransfer(it)) g.total += Math.abs(it.amount);
    }
    return [...map.values()];
  }, [filtered, fakeIds, jarTitles]);

  const periodTotal = filtered
    .filter((it) => it.amount < 0 && !fakeIds.has(it.id) && !isJarTransfer(it))
    .reduce((s, it) => s + Math.abs(it.amount), 0);

  return (
    <div className="animate-in fade-in duration-300 space-y-3">
      <Card>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Пошук…"
              className="h-10 pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["expense", "income", "all"] as const).map((f) => (
              <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
                {f === "all" ? "Усі" : f === "expense" ? "Витрати" : "Надходження"}
              </Chip>
            ))}
            <span className="mx-0.5 w-px self-stretch bg-border" />
            <Chip active={cat === "all"} onClick={() => setCat("all")}>
              Категорії
            </Chip>
            {usedCategories.map((k) => (
              <Chip key={k} active={cat === k} onClick={() => setCat(k)}>
                {CATEGORIES[k]?.emoji} {CATEGORIES[k]?.label ?? k}
              </Chip>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2 text-sm">
            <span className="text-muted-foreground">Витрат за період</span>
            <span className="font-semibold tabular-nums">{formatMoney(periodTotal, accountCurrency)}</span>
          </div>
          {jarTitles === null && (
            <p className="text-xs text-muted-foreground">
              Список банок (jars) недоступний — перекази у власні банки тут порахувані як витрати.
            </p>
          )}
        </CardContent>
      </Card>

      {filtered.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Транзакцій не знайдено.
          </CardContent>
        </Card>
      )}

      {groups.map((g) => (
        <div key={g.label} className="space-y-1.5">
          <div className="flex items-center justify-between px-1 text-xs">
            <span className="font-medium text-muted-foreground">{g.label}</span>
            {g.total > 0 && (
              <span className="tabular-nums text-muted-foreground">−{formatMoney(g.total, accountCurrency)}</span>
            )}
          </div>
          <Card className="gap-0 py-0">
            <CardContent className="divide-y px-0">
              {g.items.map((it) => (
                <Row
                  key={it.id}
                  it={it}
                  cc={accountCurrency}
                  fake={fakeIds.has(it.id)}
                  onToggle={() => onToggleFake(it.id)}
                  rating={ratings ? ratings[it.id] : undefined}
                  ratingUnknown={ratings === null}
                  onRate={(score) => onRate(it.id, score)}
                  jarTransfer={isJarTransfer(it)}
                />
              ))}
            </CardContent>
          </Card>
        </div>
      ))}

      <p className="px-1 pt-1 text-xs text-muted-foreground">
        💡 Перемикач <EyeOff className="inline size-3" /> робить транзакцію фейковою — її не
        враховує жоден підрахунок (напр. оплата за когось, кому повернули готівкою).
      </p>
    </div>
  );
}

function Row({
  it,
  cc,
  fake,
  onToggle,
  rating,
  ratingUnknown,
  onRate,
  jarTransfer,
}: {
  it: MonoStatementItem;
  cc: number;
  fake: boolean;
  onToggle: () => void;
  rating: number | undefined;
  ratingUnknown: boolean;
  onRate: (score: number | null) => void;
  jarTransfer: boolean;
}) {
  const c = mccToCategory(it.mcc, it.amount);
  const expense = it.amount < 0;
  const time = new Date(it.time * 1000).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className={cn("flex flex-col gap-1.5 px-3 py-2.5 transition-opacity", fake && "opacity-45")}>
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-base">
          {c.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn("truncate text-sm font-medium", fake && "line-through")}>
            {it.description || c.label}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate">
              {c.label} · {time}
            </span>
            {it.hold && <Badge variant="outline" className="shrink-0 py-0">hold</Badge>}
            {fake && <Badge variant="warning" className="shrink-0 py-0">фейк</Badge>}
            {jarTransfer && (
              <Badge variant="secondary" className="shrink-0 py-0" title="Переказ у власну банку — не покупка">
                у свою банку
              </Badge>
            )}
          </div>
        </div>
        <div className="text-right">
          <div
            className={cn(
              "text-sm font-semibold tabular-nums",
              fake && "line-through",
              !expense && !fake && "text-success"
            )}
          >
            {expense ? "" : "+"}
            {formatMoney(it.amount, cc)}
          </div>
          {it.cashbackAmount > 0 && !fake && (
            <div className="text-[11px] text-success">+{formatMoney(it.cashbackAmount, cc)} кб</div>
          )}
        </div>
        {expense && (
          <Switch
            checked={fake}
            onCheckedChange={onToggle}
            aria-label="Позначити фейковою"
            title="Зробити фейковою (виключити з підрахунків)"
          />
        )}
      </div>
      {expense && !fake && !jarTransfer && (
        <RatingControl score={rating ?? null} unknown={ratingUnknown} onRate={onRate} />
      )}
    </div>
  );
}

function RatingControl({
  score,
  unknown,
  onRate,
}: {
  score: number | null;
  unknown: boolean;
  onRate: (score: number | null) => void;
}) {
  return (
    <div className="ml-12 flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onClick={() => !unknown && onRate(score === n ? null : n)}
          disabled={unknown}
          aria-label={`Оцінити радість на ${n} з 5`}
          title={unknown ? "Оцінки завантажуються…" : score === n ? "Прибрати оцінку" : `Оцінити на ${n}`}
          className={cn(
            "p-0.5 text-muted-foreground transition-colors",
            unknown ? "opacity-40" : "hover:text-warning"
          )}
        >
          <Star className={cn("size-3.5", !unknown && score !== null && n <= score && "fill-warning text-warning")} />
        </button>
      ))}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
