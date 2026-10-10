"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Repeat, Check, X, Trash2, Plus, CreditCard, Banknote, UserCheck } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { Cadence } from "@/lib/metrics/cadence";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { currencyMeta } from "@/lib/monobank";
import { cn } from "@/lib/utils";

import type { CommitmentSettlement } from "@/lib/commitmentPayments";
import type { CommitmentOverride, CommitmentOverridesMap } from "@/lib/storage";

interface CommitmentRow {
  id: number;
  name: string;
  amount: number;
  currency: number;
  cadence: Cadence;
  anchor_day: number;
  source?: "card" | "cash";
}

interface Suggestion {
  name: string;
  matcher: string;
  amount: number;
  currency: number;
  cadence: Cadence;
  anchorDay: number;
  occurrences: number;
}

const WEEKDAYS = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"];

function when(cadence: Cadence, anchorDay: number): string {
  return cadence === "weekly" ? `щотижня, ${WEEKDAYS[anchorDay]}` : `щомісяця, ${anchorDay}-го`;
}

export function CommitmentsCard({
  base,
  onChanged,
  settlements,
  commitmentOverrides,
  onUpdateCommitmentOverride,
  periodStart,
}: {
  base: number;
  onChanged: () => void;
  settlements?: Map<number, CommitmentSettlement>;
  commitmentOverrides?: CommitmentOverridesMap;
  onUpdateCommitmentOverride?: (commitmentId: number, override: CommitmentOverride | null) => void;
  periodStart?: number;
}) {
  const [items, setItems] = useState<CommitmentRow[] | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [manualCurrency, setManualCurrency] = useState(base);
  const [manualCadence, setManualCadence] = useState<Cadence>("monthly");
  const [manualAnchorDay, setManualAnchorDay] = useState(1);
  const [manualSource, setManualSource] = useState<"card" | "cash">("card");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        fetch("/api/commitments", { cache: "no-store" }),
        fetch("/api/commitments/suggestions", { cache: "no-store" }),
      ]);
      if (!a.ok || !b.ok) throw new Error(`HTTP ${a.status}/${b.status}`);
      const list = (await a.json()) as { items: CommitmentRow[] };
      const sug = (await b.json()) as { items: Suggestion[] };
      if (!mounted.current) return;
      setItems(list.items);
      setSuggestions(sug.items);
      setError(null);
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const confirm = async (s: Suggestion) => {
    setBusy(true);
    try {
      await fetch("/api/commitments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: s.name,
          amount: s.amount,
          currency: s.currency,
          cadence: s.cadence,
          anchorDay: s.anchorDay,
          matcher: s.matcher,
        }),
      });
      await load();
      onChanged();
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const reject = (s: Suggestion) => {
    setSuggestions((prev) => prev.filter((x) => x.matcher !== s.matcher));
  };

  const addManual = async () => {
    const amountMinor = Math.round(parseFloat(manualAmount.replace(",", ".")) * 100);
    if (!manualName.trim() || !Number.isFinite(amountMinor) || amountMinor <= 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/commitments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: manualName.trim(),
          amount: amountMinor,
          currency: manualCurrency,
          cadence: manualCadence,
          anchorDay: manualAnchorDay,
          matcher: null,
          source: manualSource,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setManualName("");
      setManualAmount("");
      setManualSource("card");
      setAdding(false);
      await load();
      onChanged();
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const toggleSource = async (c: CommitmentRow) => {
    const nextSource = c.source === "cash" ? "card" : "cash";
    setBusy(true);
    try {
      const res = await fetch("/api/commitments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, source: nextSource }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
      onChanged();
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const remove = async (id: number) => {
    setBusy(true);
    try {
      await fetch(`/api/commitments?id=${id}`, { method: "DELETE" });
      await load();
      onChanged();
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const monthly = (items ?? [])
    .filter((c) => c.cadence === "monthly")
    .reduce((s, c) => s + c.amount, 0);

  const cardMonthly = (items ?? [])
    .filter((c) => c.cadence === "monthly" && c.source !== "cash")
    .reduce((s, c) => s + c.amount, 0);

  const cashMonthly = (items ?? [])
    .filter((c) => c.cadence === "monthly" && c.source === "cash")
    .reduce((s, c) => s + c.amount, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Repeat className="size-4" /> Регулярні платежі
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => setAdding((v) => !v)}
          >
            <Plus className="size-3.5" /> Додати платіж
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Те, що спишеться або оплачується регулярно (оренда, зв'язок, підписки). Резервується з денного ліміту.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <div className="space-y-3 rounded-2xl border bg-secondary/50 p-3.5">
            <div className="text-xs font-semibold">Новий регулярний платіж</div>
            <Input
              placeholder="Назва (напр. Оренда квартири, Спортзал)"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              className="h-9 text-sm"
            />

            {/* Вибір джерела: Картка чи Готівка */}
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground font-medium">Спосіб оплати:</div>
              <div className="flex rounded-xl bg-background p-1 border border-border/60">
                <button
                  type="button"
                  onClick={() => setManualSource("card")}
                  className={cn(
                    "flex-1 py-1.5 text-xs rounded-lg transition-all flex items-center justify-center gap-1.5",
                    manualSource === "card"
                      ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <CreditCard className="size-3.5" /> Картка
                </button>
                <button
                  type="button"
                  onClick={() => setManualSource("cash")}
                  className={cn(
                    "flex-1 py-1.5 text-xs rounded-lg transition-all flex items-center justify-center gap-1.5",
                    manualSource === "cash"
                      ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Banknote className="size-3.5" /> Готівка
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                step="0.01"
                placeholder="Сума"
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                className="h-9 text-sm"
              />
              <Select value={String(manualCurrency)} onValueChange={(v) => setManualCurrency(Number(v))}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[980, 840, 978].map((c) => (
                    <SelectItem key={c} value={String(c)}>
                      {currencyMeta(c).code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select value={manualCadence} onValueChange={(v) => setManualCadence(v as Cadence)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Щомісяця</SelectItem>
                  <SelectItem value="weekly">Щотижня</SelectItem>
                </SelectContent>
              </Select>
              {manualCadence === "monthly" ? (
                <Select value={String(manualAnchorDay)} onValueChange={(v) => setManualAnchorDay(Number(v))}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d}-го числа
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={String(manualAnchorDay)} onValueChange={(v) => setManualAnchorDay(Number(v))}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((w, idx) => (
                      <SelectItem key={idx} value={String(idx)}>
                        Що{idx === 0 || idx === 6 ? "неділі" : "дня"}: {w}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                className="h-8 flex-1 text-xs"
                onClick={addManual}
                disabled={busy || !manualName.trim() || !manualAmount}
              >
                Зберегти платіж
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setAdding(false)}>
                Скасувати
              </Button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">Не вдалося завантажити: {error}</p>}

        {items === null && !error && (
          <p className="text-sm text-muted-foreground">Завантаження…</p>
        )}

        {items !== null && items.length === 0 && (
          <p className="text-sm text-muted-foreground">Жодного не підтверджено.</p>
        )}

        {items !== null && items.length > 0 && (
          <>
            {items.map((c) => {
              const isCash = c.source === "cash";
              return (
                <div key={c.id} className="flex items-center justify-between gap-2 text-sm p-1 rounded-xl hover:bg-secondary/40 transition-colors">
                  <div className="min-w-0 pr-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{c.name}</span>
                      <button
                        type="button"
                        onClick={() => void toggleSource(c)}
                        title="Натисніть, щоб перемкнути (Картка / Готівка)"
                        disabled={busy}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium border transition-colors cursor-pointer shrink-0",
                          isCash
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
                            : "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20"
                        )}
                      >
                        {isCash ? (
                          <>
                            <Banknote className="size-3" /> Готівка
                          </>
                        ) : (
                          <>
                            <CreditCard className="size-3" /> Картка
                          </>
                        )}
                      </button>
                    </div>
                    <div className="text-xs text-muted-foreground">{when(c.cadence, c.anchor_day)}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {(() => {
                      const settlement = settlements?.get(c.id);
                      const isPaid = settlement?.isPaid ?? false;
                      const isExternal = settlement?.settledExternally ?? false;
                      const hasPayments = (settlement?.paidCount ?? 0) > 0;
                      const statusOverride = settlement?.statusOverride;

                      if (isExternal) {
                        return (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="tabular-nums font-semibold line-through text-muted-foreground text-xs">
                              {formatMoney(c.amount, c.currency)}
                            </span>
                            <div className="flex items-center gap-1">
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                                <UserCheck className="size-3" /> Оплачено сторонньо
                              </span>
                              <button
                                type="button"
                                onClick={() => onUpdateCommitmentOverride?.(c.id, null)}
                                className="text-[10px] text-muted-foreground hover:text-foreground underline ml-0.5 cursor-pointer"
                                title="Скасувати стороннє закриття"
                              >
                                (скасувати)
                              </button>
                            </div>
                          </div>
                        );
                      }

                      if (hasPayments) {
                        const paidBase = settlement?.paidBase ?? 0;
                        const isPartialPending = statusOverride === "partial_pending";
                        const isUnderpaid = paidBase < c.amount;

                        if (isPartialPending) {
                          return (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="tabular-nums font-semibold text-xs text-foreground">
                                {formatMoney(c.amount, c.currency)}
                              </span>
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                Частково: {formatMoney(paidBase, base)}
                              </span>
                              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <span>резерв {formatMoney(settlement?.remainingReserve ?? 0, base)}</span>
                                <button
                                  type="button"
                                  onClick={() => onUpdateCommitmentOverride?.(c.id, null)}
                                  className="text-primary hover:underline font-medium cursor-pointer"
                                  title="Закрити платіж повністю без резерву залишку"
                                >
                                  Закрити повністю
                                </button>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="tabular-nums font-semibold line-through text-muted-foreground text-xs">
                              {formatMoney(c.amount, c.currency)}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                              <Check className="size-3" /> Сплачено {formatMoney(paidBase, base)}
                            </span>
                            {isUnderpaid && (
                              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <span>покрито з балансу</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateCommitmentOverride?.(c.id, {
                                      periodStart: periodStart ?? 0,
                                      status: "partial_pending",
                                    })
                                  }
                                  className="text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
                                  title="Залишити залишок у резерві бюджету"
                                >
                                  (очікується залишок)
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      }

                      // No payments and not external: waiting
                      return (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="tabular-nums font-semibold text-foreground">
                            {formatMoney(c.amount, c.currency)}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-muted-foreground">⏳ Очікує</span>
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateCommitmentOverride?.(c.id, {
                                  periodStart: periodStart ?? 0,
                                  status: "settled_externally",
                                  note: "Оплачено сторонньо",
                                })
                              }
                              className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary hover:underline bg-primary/10 hover:bg-primary/20 px-1.5 py-0.5 rounded-md cursor-pointer transition-colors"
                              title="Позначити, що платіж оплатив хтось інший або він покритий бонусами"
                            >
                              <UserCheck className="size-2.5" /> Хтось оплатив
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      onClick={() => void remove(c.id)}
                      disabled={busy}
                      title="Прибрати"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {monthly > 0 && (
              <div className="border-t border-border pt-2.5 text-xs text-muted-foreground space-y-1">
                <div className="flex items-center justify-between font-medium text-foreground">
                  <span>Щомісяця загалом:</span>
                  <span className="tabular-nums font-bold">{formatMoney(monthly, base)}</span>
                </div>
                {(() => {
                  let paidTotal = 0;
                  if (settlements) {
                    for (const s of settlements.values()) {
                      if (s.isPaid) paidTotal += s.paidBase;
                    }
                  }
                  if (paidTotal > 0) {
                    return (
                      <div className="flex items-center justify-between text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                        <span>✓ Вже сплачено за період:</span>
                        <span className="tabular-nums font-bold">{formatMoney(paidTotal, base)}</span>
                      </div>
                    );
                  }
                  return null;
                })()}
                {(cardMonthly > 0 || cashMonthly > 0) && (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">
                      Картка: <span className="text-foreground font-medium">{formatMoney(cardMonthly, base)}</span>
                    </span>
                    <span className="text-muted-foreground">
                      Готівка: <span className="text-foreground font-medium">{formatMoney(cashMonthly, base)}</span>
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {suggestions.length > 0 && (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">
              Знайдено в історії — підтвердь, якщо це справді регулярний платіж:
            </p>
            {suggestions.map((s) => (
              <div key={s.matcher} className="rounded-xl bg-secondary p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {when(s.cadence, s.anchorDay)} · {s.occurrences}× у історії
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-sm tabular-nums">{formatMoney(s.amount, s.currency)}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-success"
                      onClick={() => void confirm(s)}
                      disabled={busy}
                      title="Підтвердити"
                    >
                      <Check className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground"
                      onClick={() => reject(s)}
                      disabled={busy}
                      title="Не зараз"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
