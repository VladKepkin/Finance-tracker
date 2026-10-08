"use client";

import { useState } from "react";
import {
  Target,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  Clock,
  Hourglass,
  TrendingUp,
  ExternalLink,
  Calendar,
  Sparkles,
  PiggyBank,
  Check,
  RotateCcw,
} from "lucide-react";
import { type WishItem, uid } from "@/lib/storage";
import { wishCalc } from "@/lib/metrics/income";
import { daysUntilDeadline, type AllowanceGoal } from "@/lib/metrics/goals";
import type { Allowance, AllowanceCommitment } from "@/lib/metrics/allowance";
import type { IncomeSchedule } from "@/lib/metrics/schedule";
import type { SavingsPlan, EmergencyState } from "@/lib/metrics/savings";
import type { MonoJar } from "@/lib/monobank";
import { convertMinor, type CurrencyRate } from "@/lib/fx";
import { formatMoney } from "@/lib/format";
import { currencyMeta } from "@/lib/monobank";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { Disclosure } from "@/components/ui/disclosure";
import { cn } from "@/lib/utils";
import { EmergencyFund } from "./EmergencyFund";
import { InvestCalc } from "./InvestCalc";
import { FopCalc } from "./FopCalc";
import { Evaluator } from "./Evaluator";

const CURRENCIES = [980, 840, 978];

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
  jars = [],
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
  nowSeconds?: number;
  savingsPlan: SavingsPlan;
  onSavingsPlanChange: (p: SavingsPlan) => void;
  emergency: EmergencyState;
  jars?: MonoJar[];
  jarsTotalBase: number | null;
  jarsFxUnavailable: number | null;
}) {
  const nowSeconds = nowSecondsProp ?? Math.floor(Date.now() / 1000);

  // Стан фільтра та модалок
  const [tabView, setTabView] = useState<"goals" | "jars" | "completed">("goals");
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [editingWish, setEditingWish] = useState<WishItem | null>(null);
  const [evaluatingWish, setEvaluatingWish] = useState<WishItem | null>(null);
  const [customDepositWishId, setCustomDepositWishId] = useState<string | null>(null);
  const [customDepositAmount, setCustomDepositAmount] = useState("");

  // Поля для нової або редагованої цілі
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState(base);
  const [initialSaved, setInitialSaved] = useState("");
  const [deadline, setDeadline] = useState("");
  const [url, setUrl] = useState("");

  const activeWishes = wishlist.filter((w) => !w.completed);
  const completedWishes = wishlist.filter((w) => w.completed);

  const openAddModal = () => {
    setName("");
    setPrice("");
    setCurrency(base);
    setInitialSaved("");
    setDeadline("");
    setUrl("");
    setAddSheetOpen(true);
  };

  const openEditModal = (w: WishItem) => {
    setEditingWish(w);
    setName(w.name);
    setPrice((w.price / 100).toString());
    setCurrency(w.currency);
    setInitialSaved(w.savedAmount ? (w.savedAmount / 100).toString() : "");
    setDeadline(w.deadline ?? "");
    setUrl(w.url ?? "");
  };

  const handleSaveGoal = () => {
    const p = Math.round(parseFloat(price.replace(",", ".")) * 100) || 0;
    const s = Math.round(parseFloat(initialSaved.replace(",", ".")) * 100) || 0;
    if (!name.trim() || p <= 0) return;

    if (editingWish) {
      onChange(
        wishlist.map((w) =>
          w.id === editingWish.id
            ? {
                ...w,
                name: name.trim(),
                price: p,
                currency,
                savedAmount: s > 0 ? s : undefined,
                deadline: deadline.trim() || undefined,
                url: url.trim() || undefined,
              }
            : w
        )
      );
      setEditingWish(null);
    } else {
      onChange([
        {
          id: uid(),
          name: name.trim(),
          price: p,
          currency,
          savedAmount: s > 0 ? s : undefined,
          deadline: deadline.trim() || undefined,
          url: url.trim() || undefined,
        },
        ...wishlist,
      ]);
      setAddSheetOpen(false);
    }
  };

  const handleRemove = (id: string) => {
    onChange(wishlist.filter((w) => w.id !== id));
  };

  const handleToggleCompleted = (w: WishItem) => {
    const isNowCompleted = !w.completed;
    onChange(
      wishlist.map((item) =>
        item.id === w.id
          ? {
              ...item,
              completed: isNowCompleted,
              completedAt: isNowCompleted ? new Date().toISOString() : undefined,
            }
          : item
      )
    );
  };

  const handleQuickDeposit = (w: WishItem, deltaMinor: number) => {
    const current = w.savedAmount ?? 0;
    const next = Math.max(0, current + deltaMinor);
    onChange(wishlist.map((item) => (item.id === w.id ? { ...item, savedAmount: next } : item)));
  };

  const handleCustomDepositSubmit = (w: WishItem) => {
    const amt = Math.round(parseFloat(customDepositAmount.replace(",", ".")) * 100) || 0;
    if (amt > 0) {
      handleQuickDeposit(w, amt);
    }
    setCustomDepositWishId(null);
    setCustomDepositAmount("");
  };

  return (
    <div className="animate-in fade-in duration-300 space-y-6">
      {/* Верхня панель: перемикач розділів та кнопка додавання */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-xl bg-secondary p-1">
          <button
            type="button"
            onClick={() => setTabView("goals")}
            className={cn(
              "flex-1 sm:flex-none flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all",
              tabView === "goals"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Target className="size-3.5 text-primary" />
            <span>Цілі ({activeWishes.length})</span>
          </button>

          {jars.length > 0 && (
            <button
              type="button"
              onClick={() => setTabView("jars")}
              className={cn(
                "flex-1 sm:flex-none flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all",
                tabView === "jars"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <PiggyBank className="size-3.5 text-success" />
              <span>Банки Моно ({jars.length})</span>
            </button>
          )}

          {completedWishes.length > 0 && (
            <button
              type="button"
              onClick={() => setTabView("completed")}
              className={cn(
                "flex-1 sm:flex-none flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all",
                tabView === "completed"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <CheckCircle2 className="size-3.5 text-success" />
              <span>Досягнуті ({completedWishes.length})</span>
            </button>
          )}
        </div>

        {tabView !== "jars" && (
          <Button onClick={openAddModal} className="rounded-xl h-9 gap-1.5 font-medium shrink-0">
            <Plus className="size-4" />
            <span>Додати ціль</span>
          </Button>
        )}
      </div>

      {/* РОЗДІЛ: Банки Monobank */}
      {tabView === "jars" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <PiggyBank className="size-4 text-success" /> Банки в Monobank
            </h3>
            {jarsTotalBase !== null && (
              <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                Всього: {formatMoney(jarsTotalBase, base)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {jars.map((j) => {
              const hasGoal = j.goal > 0;
              const pct = hasGoal ? Math.min(100, Math.round((j.balance / j.goal) * 100)) : null;
              return (
                <Card key={j.id} className="border shadow-xs overflow-hidden">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="font-semibold text-sm truncate">{j.title}</h4>
                        {j.description && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {j.description}
                          </p>
                        )}
                      </div>
                      {j.sendId && (
                        <a
                          href={`https://send.monobank.ua/jar/${j.sendId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                        >
                          <span>Поповнити</span>
                          <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>

                    <div>
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-base font-bold tabular-nums font-display">
                          {formatMoney(j.balance, j.currencyCode)}
                        </span>
                        {hasGoal && (
                          <span className="text-muted-foreground tabular-nums">
                            з {formatMoney(j.goal, j.currencyCode)} ({pct}%)
                          </span>
                        )}
                      </div>

                      {hasGoal && (
                        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-success transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* РОЗДІЛ: Активні цілі */}
      {tabView === "goals" && (
        <div className="space-y-4">
          {activeWishes.length === 0 ? (
            <Card className="border border-dashed">
              <CardContent className="py-12 text-center text-sm text-muted-foreground space-y-3">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-secondary mx-auto">
                  <Target className="size-6 text-muted-foreground" />
                </div>
                <div className="font-semibold text-foreground">Немає активних цілей</div>
                <p className="text-xs max-w-sm mx-auto leading-relaxed">
                  Додайте покупку або фінансову мрію, про яку думаєте. Ми порахуємо реальну вартість
                  у годинах вашої праці та допоможемо зберегти кошти до дедлайну.
                </p>
                <Button onClick={openAddModal} variant="secondary" size="sm" className="rounded-xl">
                  <Plus className="size-4 mr-1.5" /> Створити першу ціль
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {activeWishes.map((w) => {
                const priceBase = convertMinor(w.price, w.currency, base, rates);
                const savedMinor = w.savedAmount ?? 0;
                const progressPct = Math.min(100, Math.round((savedMinor / w.price) * 100));

                const calc =
                  priceBase !== null
                    ? wishCalc(priceBase, liquid, monthlyNet, monthlyIncome, hourlyRate)
                    : { progress: null, monthsToAfford: null, workMonths: null, workHours: null };

                const deadlineDays = w.deadline ? daysUntilDeadline(w.deadline, nowSeconds) : null;
                const overdue = deadlineDays !== null && deadlineDays <= 0;
                const goalEntry = allowance?.goalsBeforeIncome.find((g) => g.name === w.name) ?? null;

                return (
                  <Card key={w.id} className="border shadow-xs overflow-hidden flex flex-col justify-between">
                    <CardContent className="p-4 space-y-4">
                      {/* Шапка цілі */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 font-semibold text-base">
                            <span className="truncate">{w.name}</span>
                            {w.url && (
                              <a
                                href={w.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                                title="Відкрити посилання"
                              >
                                <ExternalLink className="size-3.5" />
                              </a>
                            )}
                          </div>
                          <div className="text-sm font-semibold tabular-nums text-foreground mt-0.5">
                            {formatMoney(w.price, w.currency)}
                            {w.currency !== base && priceBase !== null && (
                              <span className="text-xs font-normal text-muted-foreground ml-1.5">
                                (≈ {formatMoney(priceBase, base)})
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-foreground"
                            onClick={() => openEditModal(w)}
                            title="Редагувати ціль"
                          >
                            <Edit2 className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemove(w.id)}
                            title="Видалити"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Реальні накопичення */}
                      <div className="rounded-xl bg-secondary/50 p-3 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                            <PiggyBank className="size-3.5 text-success" />
                            {savedMinor > 0 ? "Відкладено на ціль" : "Заощадження на ціль"}
                          </span>
                          <span className="font-semibold tabular-nums">
                            {formatMoney(savedMinor, w.currency)} / {formatMoney(w.price, w.currency)} ({progressPct}%)
                          </span>
                        </div>

                        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-300"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>

                        {/* Швидкі кнопки внеску */}
                        <div className="flex items-center gap-1.5 pt-1">
                          <span className="text-[11px] text-muted-foreground mr-1">Відкласти:</span>
                          <button
                            type="button"
                            onClick={() => handleQuickDeposit(w, 500_00)}
                            className="rounded-lg bg-background px-2 py-0.5 text-xs font-semibold shadow-xs hover:bg-secondary transition-colors"
                          >
                            +500
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickDeposit(w, 1000_00)}
                            className="rounded-lg bg-background px-2 py-0.5 text-xs font-semibold shadow-xs hover:bg-secondary transition-colors"
                          >
                            +1000
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setCustomDepositWishId(customDepositWishId === w.id ? null : w.id)
                            }
                            className="rounded-lg bg-background px-2 py-0.5 text-xs font-semibold shadow-xs hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                          >
                            Своя сума
                          </button>
                        </div>

                        {/* Поле власної суми */}
                        {customDepositWishId === w.id && (
                          <div className="flex gap-2 pt-1 animate-in fade-in duration-200">
                            <Input
                              type="number"
                              inputMode="decimal"
                              value={customDepositAmount}
                              onChange={(e) => setCustomDepositAmount(e.target.value)}
                              placeholder="Сума внеску"
                              className="h-8 text-xs"
                              onKeyDown={(e) => e.key === "Enter" && handleCustomDepositSubmit(w)}
                            />
                            <Button
                              size="sm"
                              className="h-8 text-xs shrink-0"
                              onClick={() => handleCustomDepositSubmit(w)}
                            >
                              Додати
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Розрахунок часу та роботи */}
                      {(calc.workMonths !== null || calc.workHours !== null) && (
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {calc.workMonths !== null && (
                            <div className="rounded-xl border p-2.5 space-y-1">
                              <span className="text-muted-foreground flex items-center gap-1">
                                <Clock className="size-3 text-primary" /> Вартість у доході
                              </span>
                              <div className="font-semibold text-sm tabular-nums">
                                {humanMonths(calc.workMonths)}
                              </div>
                            </div>
                          )}

                          {calc.workHours !== null && (
                            <div className="rounded-xl border p-2.5 space-y-1">
                              <span className="text-muted-foreground flex items-center gap-1">
                                <Hourglass className="size-3 text-primary" /> Годин праці
                              </span>
                              <div className="font-semibold text-sm tabular-nums">
                                {humanHours(calc.workHours)}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Дедлайн */}
                      {w.deadline && (
                        <div className="flex items-center justify-between text-xs rounded-lg border px-3 py-2">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <Calendar className="size-3.5 text-primary" />
                            Дедлайн: {new Date(w.deadline).toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" })}
                          </span>
                          {overdue ? (
                            <Badge variant="destructive" className="py-0 text-[10px]">Дата минула</Badge>
                          ) : goalEntry && allowance ? (
                            <span className="font-medium text-foreground tabular-nums">
                              Резерв: {formatMoney(goalEntry.reservedBase, base)} / день
                            </span>
                          ) : null}
                        </div>
                      )}

                      {/* Нижні дії */}
                      <div className="flex items-center gap-2 pt-1 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEvaluatingWish(w)}
                          className="flex-1 rounded-xl text-xs gap-1.5 h-8 font-medium"
                        >
                          <Sparkles className="size-3 text-warning" />
                          <span>Чи купити зараз?</span>
                        </Button>

                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleToggleCompleted(w)}
                          className="rounded-xl text-xs gap-1.5 h-8 font-medium hover:bg-success/15 hover:text-success"
                        >
                          <Check className="size-3.5" />
                          <span>Досягнуто!</span>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* РОЗДІЛ: Досягнуті цілі */}
      {tabView === "completed" && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {completedWishes.map((w) => (
              <Card key={w.id} className="border shadow-xs bg-card/60">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 font-semibold text-sm">
                        <CheckCircle2 className="size-4 text-success" />
                        <span className="line-through text-muted-foreground">{w.name}</span>
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums mt-0.5">
                        {formatMoney(w.price, w.currency)}
                        {w.completedAt && (
                          <> · Досягнуто {new Date(w.completedAt).toLocaleDateString("uk-UA")}</>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-foreground"
                        onClick={() => handleToggleCompleted(w)}
                        title="Повернути в активні цілі"
                      >
                        <RotateCcw className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemove(w.id)}
                        title="Видалити"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* СЕКЦІЯ: Фінансова стійкість та додаткові інструменти */}
      <div className="space-y-4 pt-4 border-t">
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

        <Disclosure title="Додаткові фінансові інструменти">
          <div className="space-y-4 pt-2">
            <InvestCalc base={base} suggestedMonthly={monthlyNet} />
            <FopCalc rates={rates} />
          </div>
        </Disclosure>
      </div>

      {/* Sheet створення / редагування цілі */}
      <Sheet
        open={addSheetOpen || editingWish !== null}
        onClose={() => {
          setAddSheetOpen(false);
          setEditingWish(null);
        }}
        title={editingWish ? "Редагувати ціль" : "Нова фінансова ціль"}
      >
        <div className="space-y-4 pb-6">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Назва цілі</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Наприклад: MacBook Pro або Відпустка"
              className="h-10 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Ціна</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="25000"
                className="h-10 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Валюта</Label>
              <Select value={String(currency)} onValueChange={(v) => setCurrency(Number(v))}>
                <SelectTrigger className="w-full h-10 text-sm">
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

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Вже відкладено саме на цю ціль (необов'язково)</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={initialSaved}
              onChange={(e) => setInitialSaved(e.target.value)}
              placeholder="0"
              className="h-10 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Дедлайн (дата покупки)</Label>
            <Input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="h-10 text-sm"
            />
            <p className="text-[11px] text-muted-foreground leading-normal">
              Якщо вказати дедлайн, додаток щодня автоматично резервуватиме частину коштів з вашого денного ліміту.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Посилання на товар (необов'язково)</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="h-10 text-sm"
            />
          </div>

          <div className="pt-2">
            <Button onClick={handleSaveGoal} className="w-full h-10 font-semibold rounded-xl">
              {editingWish ? "Зберегти зміни" : "Створити ціль"}
            </Button>
          </div>
        </div>
      </Sheet>

      {/* Sheet перевірки "Чи купити зараз?" */}
      <Sheet
        open={evaluatingWish !== null}
        onClose={() => setEvaluatingWish(null)}
        title="Оцінка покупки"
      >
        {evaluatingWish && (
          <div className="pb-6">
            <Evaluator
              key={evaluatingWish.id}
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
              initialName={evaluatingWish.name}
              initialPrice={(evaluatingWish.price / 100).toString()}
              initialCurrency={evaluatingWish.currency}
            />
          </div>
        )}
      </Sheet>
    </div>
  );
}
