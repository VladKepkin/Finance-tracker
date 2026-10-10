"use client";

import { useState, useEffect } from "react";
import {
  CreditCard,
  Banknote,
  Star,
  EyeOff,
  Eye,
  Tag,
  Clock,
  Sparkles,
  Trash2,
  Check,
  ArrowLeftRight,
  Users,
  ShoppingBag,
  Repeat,
} from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import { CATEGORIES, mccToCategory } from "@/lib/mcc";
import { currencyMeta } from "@/lib/monobank";
import { cn } from "@/lib/utils";
import type { TxOverrideType } from "@/lib/storage";

export interface TransactionDetailData {
  id: string;
  sourceType: "mono" | "cash";
  title: string;
  description?: string;
  amount: number; // in minor units (signed: negative for expense, positive for income)
  currency: number;
  time: number; // unix timestamp in seconds
  categoryKey: string;
  mcc?: number;
  originalMcc?: number;
  accountName: string;
  isFake: boolean;
  isHold?: boolean;
  isJarTransfer?: boolean;
  cashbackAmount?: number;
  balance?: number;
  operationAmount?: number;
  rating?: number | null;
  ratingUnknown?: boolean;
  note?: string;
  cashKind?: string;
  cashEntryId?: string;
  overrideType?: TxOverrideType | null;
  classificationKind?: "expense" | "income" | "internal_transfer" | "shared_transit" | "ignored";
  classificationBadge?: { label: string; variant: "default" | "secondary" | "warning" | "outline" | "success" };
  commitmentId?: number | null;
  commitmentName?: string | null;
}

const JOY_LABELS: Record<number, string> = {
  1: "Розчарування / Даремно",
  2: "Сумнівно, можна було без цього",
  3: "Звичайна побутова потреба",
  4: "Гарна та приємна покупка",
  5: "Чиста радість та кайф! ✨",
};

export function TransactionDetailsModal({
  item,
  open,
  onClose,
  onToggleFake,
  onRate,
  onSaveNote,
  onDeleteCashEntry,
  onChangeOverride,
  commitments,
  onLinkCommitment,
}: {
  item: TransactionDetailData | null;
  open: boolean;
  onClose: () => void;
  onToggleFake?: (id: string) => void;
  onRate?: (id: string, score: number | null) => void;
  onSaveNote?: (id: string, note: string) => void;
  onDeleteCashEntry?: (id: string) => void;
  onChangeOverride?: (id: string, override: TxOverrideType | null) => void;
  commitments?: { id: number; name: string; amount: number; currency: number }[];
  onLinkCommitment?: (id: string, commitmentId: number | null, sourceType: "mono" | "cash") => void;
}) {
  const [noteText, setNoteText] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);

  useEffect(() => {
    if (item) {
      setNoteText(item.note ?? "");
      setNoteSaved(false);
    }
  }, [item]);

  if (!item) return null;

  const isExpense = item.amount < 0;
  const cat = CATEGORIES[item.categoryKey] ?? {
    key: "other",
    label: "Інше",
    emoji: "📦",
    color: "#9ca3af",
  };

  const formattedDate = new Date(item.time * 1000).toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
  });
  const formattedTime = new Date(item.time * 1000).toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const handleSaveNote = () => {
    if (onSaveNote) {
      onSaveNote(item.id, noteText.trim());
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2000);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Деталі операції">
      <div className="space-y-6 pb-6">
        {/* Сума та головна плашка */}
        <div className="flex flex-col items-center justify-center text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-secondary text-2xl shadow-xs">
            {cat.emoji}
          </div>

          <div
            className={cn(
              "mt-3 text-3xl font-bold tabular-nums tracking-tight font-display",
              item.isFake && "line-through opacity-50",
              !isExpense && !item.isFake && "text-success"
            )}
          >
            {isExpense ? "−" : "+"}
            {formatMoney(Math.abs(item.amount), item.currency)}
          </div>

          <h3 className="mt-1 max-w-sm text-base font-semibold text-foreground">
            {item.title}
          </h3>

          <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
            <Badge variant="secondary" className="gap-1 font-normal">
              {item.sourceType === "mono" ? (
                <>
                  <CreditCard className="size-3 text-primary" /> {item.accountName}
                </>
              ) : (
                <>
                  <Banknote className="size-3 text-success" /> {item.accountName}
                </>
              )}
            </Badge>

            {item.isHold && <Badge variant="outline">Hold (заблоковано)</Badge>}
            {item.classificationBadge ? (
              <Badge variant={item.classificationBadge.variant}>{item.classificationBadge.label}</Badge>
            ) : item.isFake ? (
              <Badge variant="warning">Фейкова (не в ліміті)</Badge>
            ) : null}
            {item.isJarTransfer && <Badge variant="secondary">У власну банку</Badge>}
            {item.commitmentName && (
              <Badge variant="outline" className="border-primary/40 text-primary gap-1 font-medium">
                🗓️ {item.commitmentName}
              </Badge>
            )}
            {item.cashbackAmount && item.cashbackAmount > 0 ? (
              <Badge variant="secondary" className="text-success font-medium">
                +{formatMoney(item.cashbackAmount, item.currency)} кешбек
              </Badge>
            ) : null}
          </div>
        </div>

        {/* Швидка дія: Керування статусом транзакції */}
        {onChangeOverride && item.sourceType === "mono" ? (
          <div className="rounded-2xl border bg-card p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <ArrowLeftRight className="size-3.5 text-primary" /> Статус у бюджеті
              </span>
              {item.classificationBadge && (
                <span className="text-xs font-medium text-muted-foreground">
                  Зараз: {item.classificationBadge.label}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => {
                  const target = item.overrideType === "expense" ? null : "expense";
                  onChangeOverride(item.id, target);
                }}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-xl p-2.5 text-xs font-medium transition-all text-center border",
                  item.overrideType === "expense" || (!item.overrideType && item.classificationKind === "expense")
                    ? "bg-primary text-primary-foreground border-primary shadow-xs"
                    : "bg-secondary/60 hover:bg-secondary text-muted-foreground border-transparent"
                )}
              >
                <ShoppingBag className="size-4" />
                <span>Витрата</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const target = item.overrideType === "internal_transfer" ? null : "internal_transfer";
                  onChangeOverride(item.id, target);
                }}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-xl p-2.5 text-xs font-medium transition-all text-center border",
                  item.overrideType === "internal_transfer" || (!item.overrideType && item.classificationKind === "internal_transfer")
                    ? "bg-brand-sky text-white border-brand-sky shadow-xs"
                    : "bg-secondary/60 hover:bg-secondary text-muted-foreground border-transparent"
                )}
              >
                <ArrowLeftRight className="size-4" />
                <span>Між своїми</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const target = item.overrideType === "shared_transit" ? null : "shared_transit";
                  onChangeOverride(item.id, target);
                }}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-xl p-2.5 text-xs font-medium transition-all text-center border",
                  item.overrideType === "shared_transit" || (!item.overrideType && item.classificationKind === "shared_transit")
                    ? "bg-brand-violet text-white border-brand-violet shadow-xs"
                    : "bg-secondary/60 hover:bg-secondary text-muted-foreground border-transparent"
                )}
              >
                <Users className="size-4" />
                <span>Спільне</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const target = item.overrideType === "ignored" ? null : "ignored";
                  onChangeOverride(item.id, target);
                  if (onToggleFake) {
                    if (target === "ignored" && !item.isFake) onToggleFake(item.id);
                    if (target === null && item.isFake) onToggleFake(item.id);
                  }
                }}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-xl p-2.5 text-xs font-medium transition-all text-center border",
                  item.overrideType === "ignored" || (!item.overrideType && (item.classificationKind === "ignored" || item.isFake))
                    ? "bg-warning text-warning-foreground border-warning shadow-xs"
                    : "bg-secondary/60 hover:bg-secondary text-muted-foreground border-transparent"
                )}
              >
                <EyeOff className="size-4" />
                <span>Виключити</span>
              </button>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              {item.overrideType === "expense" || (!item.overrideType && item.classificationKind === "expense")
                ? "🛒 Враховується у повсякденних витратах і списує щоденний ліміт."
                : item.overrideType === "internal_transfer" || (!item.overrideType && item.classificationKind === "internal_transfer")
                ? "🔄 Переказ між власними картками — чистий транзит. Не списує денний ліміт (0 грн)."
                : item.overrideType === "shared_transit" || (!item.overrideType && item.classificationKind === "shared_transit")
                ? "👥 Внесок у спільний бюджет / партнерці. Не списує персональний ліміт сьогодні та виключає подвійне списання."
                : "🚫 Операція виключена з підрахунків та не впливає на денний ліміт."}
            </p>
          </div>
        ) : onToggleFake && item.sourceType === "mono" ? (
          <div className="rounded-2xl border bg-card p-3.5 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-sm font-semibold flex items-center gap-1.5">
                  {item.isFake ? <EyeOff className="size-4 text-warning" /> : <Eye className="size-4 text-primary" />}
                  {item.isFake ? "Транзакція виключена з бюджету" : "Враховувати у витратах"}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {item.isFake
                    ? "Ця операція позначена фейковою і не списує ваш денний ліміт."
                    : "Увімкніть, якщо ви платили за когось або скидалися, і гроші вам повернули."}
                </p>
              </div>

              <Button
                variant={item.isFake ? "outline" : "secondary"}
                size="sm"
                onClick={() => onToggleFake(item.id)}
                className="shrink-0 font-medium"
              >
                {item.isFake ? "Повернути" : "Виключити"}
              </Button>
            </div>
          </div>
        ) : null}

        {/* Прив'язка до регулярного платежу (Зобов'язання) */}
        {onLinkCommitment && isExpense && commitments && commitments.length > 0 && (
          <div className="rounded-2xl border bg-card p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Repeat className="size-3.5 text-primary" /> Регулярне зобов'язання
              </span>
              {item.commitmentId ? (
                <Badge variant="outline" className="text-xs border-primary/30 text-primary font-medium gap-1">
                  <Check className="size-3 text-success" /> Прив'язано
                </Badge>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <Select
                value={item.commitmentId ? String(item.commitmentId) : "none"}
                onValueChange={(val) => {
                  const cId = val === "none" ? null : Number(val);
                  onLinkCommitment(item.id, cId, item.sourceType);
                }}
              >
                <SelectTrigger className="h-9 text-xs flex-1">
                  <SelectValue placeholder="Оберіть регулярний платіж…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Не прив'язано (звичайна витрата) —</SelectItem>
                  {commitments.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      🗓️ {c.name} ({formatMoney(c.amount, c.currency)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {item.commitmentId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 text-xs text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => onLinkCommitment(item.id, null, item.sourceType)}
                >
                  Відв'язати
                </Button>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {item.commitmentId
                ? "✓ Зараховано як виконання регулярного платежу за цей період. Резерв у ліміті знято (без подвійного списання), а сума не спалює ваш денний ліміт."
                : "Прив'яжіть цю витрату (оренда, комуналка, підписка), щоб зняти її резерв із бюджету та уникнути подвійного списання."}
            </p>
          </div>
        )}

        {/* Joy Rating (Рейтинг радості) */}
        {isExpense && !item.isFake && onRate && (
          <div className="rounded-2xl border bg-card p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-warning" /> Радість від покупки
              </span>
              {item.rating && (
                <span className="text-xs font-medium text-warning tabular-nums">
                  {item.rating} з 5
                </span>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 py-1">
              {[1, 2, 3, 4, 5].map((n) => {
                const active = (item.rating ?? 0) >= n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => onRate(item.id, item.rating === n ? null : n)}
                    className={cn(
                      "flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-2.5 transition-all active:scale-95",
                      active
                        ? "bg-warning/15 text-warning font-semibold"
                        : "bg-secondary/60 text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    <Star className={cn("size-5", active && "fill-warning text-warning")} />
                    <span className="text-[11px]">{n}</span>
                  </button>
                );
              })}
            </div>

            <p className="text-center text-xs text-muted-foreground min-h-[1.2rem]">
              {item.rating ? JOY_LABELS[item.rating] : "Оцініть, чи принесла покупка справжню користь та радість"}
            </p>
          </div>
        )}

        {/* Замітка користувача */}
        {onSaveNote && (
          <div className="rounded-2xl border bg-card p-3.5 space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Tag className="size-3.5" /> Моя замітка
            </label>
            <div className="flex gap-2">
              <Input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Наприклад: подарунок мамі, ТО машини..."
                className="h-9 text-sm"
                onKeyDown={(e) => e.key === "Enter" && handleSaveNote()}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSaveNote}
                className={cn("shrink-0 h-9 font-medium", noteSaved && "text-success border-success/40")}
              >
                {noteSaved ? <Check className="size-4" /> : "Зберегти"}
              </Button>
            </div>
          </div>
        )}

        {/* Реквізити та деталі чека */}
        <div className="rounded-2xl border divide-y overflow-hidden text-sm bg-card">
          <div className="flex items-center justify-between p-3.5">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Clock className="size-4 text-muted-foreground" /> Дата і час
            </span>
            <span className="font-medium text-right">
              {formattedDate} о {formattedTime}
            </span>
          </div>

          <div className="flex items-center justify-between p-3.5">
            <span className="text-muted-foreground">Категорія</span>
            <span className="font-medium flex items-center gap-1.5">
              <span>{cat.emoji}</span> {cat.label}
            </span>
          </div>

          {item.mcc !== undefined && item.mcc > 0 && (
            <div className="flex items-center justify-between p-3.5">
              <span className="text-muted-foreground">MCC-код продавця</span>
              <span className="font-mono font-medium">{item.mcc}</span>
            </div>
          )}

          {item.balance !== undefined && (
            <div className="flex items-center justify-between p-3.5">
              <span className="text-muted-foreground">Залишок після операції</span>
              <span className="font-semibold tabular-nums">
                {formatMoney(item.balance, item.currency)}
              </span>
            </div>
          )}

          {item.operationAmount !== undefined &&
            Math.abs(item.operationAmount) !== Math.abs(item.amount) && (
              <div className="flex items-center justify-between p-3.5">
                <span className="text-muted-foreground">Сума в оригінальній валюті</span>
                <span className="font-semibold tabular-nums text-muted-foreground">
                  {formatMoney(Math.abs(item.operationAmount), item.currency)}
                </span>
              </div>
            )}

          {item.description && item.title !== item.description && (
            <div className="flex items-center justify-between p-3.5">
              <span className="text-muted-foreground">Повний опис</span>
              <span className="font-medium text-right max-w-[200px] truncate">
                {item.description}
              </span>
            </div>
          )}
        </div>

        {/* Дія для готівки: видалення */}
        {item.sourceType === "cash" && item.cashEntryId && onDeleteCashEntry && (
          <div className="pt-2 flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onDeleteCashEntry(item.cashEntryId!);
                onClose();
              }}
              className="text-destructive hover:bg-destructive/10 gap-1.5 text-xs"
            >
              <Trash2 className="size-3.5" /> Видалити цю готівкову операцію
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
