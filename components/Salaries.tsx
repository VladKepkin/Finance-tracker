"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Banknote, Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { currencyMeta } from "@/lib/monobank";
import type { WorkSchedule } from "@/lib/metrics/salary";
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

const CURRENCIES = [980, 840, 978];
const WEEKDAY_LABELS = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"];

interface SalaryRow {
  id: number;
  paid_on: string;
  amount: number;
  currency: number;
}

export function SalariesCard({
  base,
  workSchedule,
  onWorkScheduleChange,
  onChanged,
  monthlyIncome,
  monthlyIncomeConfidenceLow,
  incomeUnavailableReason,
}: {
  base: number;
  workSchedule: WorkSchedule | null;
  onWorkScheduleChange: (s: WorkSchedule) => void;
  onChanged: () => void;
  monthlyIncome: number | null;
  monthlyIncomeConfidenceLow: boolean;
  incomeUnavailableReason: string | null;
}) {
  const [items, setItems] = useState<SalaryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/salaries", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { items: SalaryRow[] };
      if (!mounted.current) return;
      setItems(data.items);
      setError(null);
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const [newDate, setNewDate] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newCurrency, setNewCurrency] = useState(980);

  const add = async () => {
    const amountMinor = Math.round(parseFloat(newAmount.replace(",", ".")) * 100);
    if (!newDate || !Number.isFinite(amountMinor) || amountMinor <= 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/salaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paidOn: newDate, amount: amountMinor, currency: newCurrency }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNewDate("");
      setNewAmount("");
      await load();
      onChanged();
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCurrency, setEditCurrency] = useState(980);

  const startEdit = (s: SalaryRow) => {
    setEditingId(s.id);
    setEditDate(s.paid_on);
    setEditAmount(String(s.amount / 100));
    setEditCurrency(s.currency);
  };
  const cancelEdit = () => setEditingId(null);

  const saveEdit = async () => {
    if (editingId === null) return;
    const amountMinor = Math.round(parseFloat(editAmount.replace(",", ".")) * 100);
    if (!editDate || !Number.isFinite(amountMinor) || amountMinor <= 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/salaries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, paidOn: editDate, amount: amountMinor, currency: editCurrency }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEditingId(null);
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
      const res = await fetch(`/api/salaries?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
      onChanged();
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const sorted = items ? [...items].sort((a, b) => (a.paid_on < b.paid_on ? 1 : a.paid_on > b.paid_on ? -1 : 0)) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Banknote className="size-4" /> Зарплата
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Історія виплат — з неї рахується місячний дохід і ставка за годину. Додай хоч одну.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-xl bg-secondary p-2.5 text-sm">
          {monthlyIncome !== null ? (
            <>
              <span className="font-semibold tabular-nums">{formatMoney(monthlyIncome, base)}</span>
              <span className="text-muted-foreground"> / міс.</span>
              {monthlyIncomeConfidenceLow && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  З однієї зарплати — додай ще одну для точнішої оцінки.
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{incomeUnavailableReason ?? "Дохід невідомий."}</p>
          )}
        </div>

        {error && <p className="text-sm text-destructive">Не вдалося: {error}</p>}
        {sorted === null && !error && <p className="text-sm text-muted-foreground">Завантаження…</p>}
        {sorted !== null && sorted.length === 0 && (
          <p className="text-sm text-muted-foreground">Ще жодної зарплати не записано.</p>
        )}

        {sorted !== null &&
          sorted.map((s) =>
            editingId === s.id ? (
              <div key={s.id} className="space-y-2 rounded-xl bg-secondary p-2.5">
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Select value={String(editCurrency)} onValueChange={(v) => setEditCurrency(Number(v))}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={String(c)}>
                          {currencyMeta(c).code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-1.5">
                  <Button variant="ghost" size="icon" className="size-7" onClick={() => void saveEdit()} disabled={busy}>
                    <Check className="size-4 text-success" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-7" onClick={cancelEdit} disabled={busy}>
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
                <div className="text-xs text-muted-foreground">{s.paid_on}</div>
                <div className="flex items-center gap-1">
                  <span className="tabular-nums font-medium">{formatMoney(s.amount, s.currency)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground"
                    onClick={() => startEdit(s)}
                    disabled={busy}
                    title="Редагувати"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    onClick={() => void remove(s.id)}
                    disabled={busy}
                    title="Видалити"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            )
          )}

        <div className="grid grid-cols-3 gap-2 border-t border-border pt-3">
          <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="h-8 text-xs" />
          <Input
            type="number"
            inputMode="decimal"
            placeholder="Сума"
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
            className="h-8 text-xs"
          />
          <Select value={String(newCurrency)} onValueChange={(v) => setNewCurrency(Number(v))}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={String(c)}>
                  {currencyMeta(c).code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => void add()} disabled={busy} className="w-full" size="sm">
          <Plus className="size-4" /> Додати зарплату
        </Button>

        <WorkScheduleEditor schedule={workSchedule} onChange={onWorkScheduleChange} />
      </CardContent>
    </Card>
  );
}

function WorkScheduleEditor({
  schedule,
  onChange,
}: {
  schedule: WorkSchedule | null;
  onChange: (s: WorkSchedule) => void;
}) {
  const lastSentHours = useRef(schedule?.hoursPerDay ?? null);
  const lastSentWeekdaysKey = useRef(JSON.stringify(schedule?.weekdays ?? []));
  const [hoursText, setHoursText] = useState(schedule?.hoursPerDay != null ? String(schedule.hoursPerDay) : "");
  const [pendingWeekdays, setPendingWeekdays] = useState<number[]>(schedule?.weekdays ?? []);

  useEffect(() => {
    const hours = schedule?.hoursPerDay ?? null;
    if (hours === lastSentHours.current) return;
    lastSentHours.current = hours;
    setHoursText(hours != null ? String(hours) : "");
  }, [schedule?.hoursPerDay]);

  useEffect(() => {
    const key = JSON.stringify(schedule?.weekdays ?? []);
    if (key === lastSentWeekdaysKey.current) return;
    lastSentWeekdaysKey.current = key;
    setPendingWeekdays(schedule?.weekdays ?? []);
  }, [schedule?.weekdays]);

  const commit = (hours: number | null, weekdays: number[]) => {
    if (hours === null || weekdays.length === 0) return;
    lastSentHours.current = hours;
    lastSentWeekdaysKey.current = JSON.stringify(weekdays);
    onChange({ hoursPerDay: hours, weekdays });
  };

  const setHours = (raw: string) => {
    setHoursText(raw);
    const n = parseInt(raw, 10);
    const valid = Number.isInteger(n) && n >= 1 && n <= 24 ? n : null;
    commit(valid, pendingWeekdays);
  };

  const toggleDay = (d: number) => {
    const next = pendingWeekdays.includes(d)
      ? pendingWeekdays.filter((x) => x !== d)
      : [...pendingWeekdays, d].sort((a, b) => a - b);
    setPendingWeekdays(next);
    const n = parseInt(hoursText, 10);
    const validHours = Number.isInteger(n) && n >= 1 && n <= 24 ? n : null;
    commit(validHours, next);
  };

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <p className="text-xs text-muted-foreground">Графік роботи — з нього рахується ціна речей у годинах.</p>
      <div className="flex items-center gap-2">
        <Label className="whitespace-nowrap text-xs text-muted-foreground">Годин на день</Label>
        <Input
          type="number"
          inputMode="numeric"
          placeholder="8"
          value={hoursText}
          onChange={(e) => setHours(e.target.value)}
          className="h-8 w-20 text-xs"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAY_LABELS.map((label, d) => (
          <button
            key={d}
            type="button"
            onClick={() => toggleDay(d)}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
              pendingWeekdays.includes(d)
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {schedule === null && (
        <p className="text-xs text-muted-foreground">Графік не налаштовано — вкажи години й дні.</p>
      )}
    </div>
  );
}
