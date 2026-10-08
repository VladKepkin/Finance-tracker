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
} from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { CATEGORIES, mccToCategory } from "@/lib/mcc";
import { currencyMeta } from "@/lib/monobank";
import { cn } from "@/lib/utils";

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
}: {
  item: TransactionDetailData | null;
  open: boolean;
  onClose: () => void;
  onToggleFake?: (id: string) => void;
  onRate?: (id: string, score: number | null) => void;
  onSaveNote?: (id: string, note: string) => void;
  onDeleteCashEntry?: (id: string) => void;
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
            {item.isFake && <Badge variant="warning">Фейкова (не в ліміті)</Badge>}
            {item.isJarTransfer && <Badge variant="secondary">У власну банку</Badge>}
            {item.cashbackAmount && item.cashbackAmount > 0 ? (
              <Badge variant="secondary" className="text-success font-medium">
                +{formatMoney(item.cashbackAmount, item.currency)} кешбек
              </Badge>
            ) : null}
          </div>
        </div>

        {/* Швидка дія: Фейковість (виключити з бюджету) */}
        {onToggleFake && item.sourceType === "mono" && (
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
