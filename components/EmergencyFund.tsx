"use client";

import { useEffect, useRef, useState } from "react";
import { Shield, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { formatMoney } from "@/lib/format";
import { currencyMeta } from "@/lib/monobank";
import type { SavingsPlan, EmergencyState } from "@/lib/metrics/savings";

export function EmergencyFund({
  base,
  plan,
  onPlanChange,
  emergency,
  jarsTotalBase,
  jarsFxUnavailable,
}: {
  base: number;
  plan: SavingsPlan;
  onPlanChange: (p: SavingsPlan) => void;
  emergency: EmergencyState;
  jarsTotalBase: number | null;
  jarsFxUnavailable: number | null;
}) {
  const lastSentMonths = useRef(plan.emergencyMonths);
  const lastSentContrib = useRef(plan.monthlyContribution);
  const lastSentPct = useRef(plan.spendablePct);
  const [monthsText, setMonthsText] = useState(plan.emergencyMonths !== null ? String(plan.emergencyMonths) : "");
  const [contribText, setContribText] = useState(
    plan.monthlyContribution !== null ? String(plan.monthlyContribution / 100) : ""
  );
  const [pctText, setPctText] = useState(plan.spendablePct !== null ? String(plan.spendablePct) : "");
  useEffect(() => {
    if (plan.emergencyMonths === lastSentMonths.current) return;
    lastSentMonths.current = plan.emergencyMonths;
    setMonthsText(plan.emergencyMonths !== null ? String(plan.emergencyMonths) : "");
  }, [plan.emergencyMonths]);
  useEffect(() => {
    if (plan.monthlyContribution === lastSentContrib.current) return;
    lastSentContrib.current = plan.monthlyContribution;
    setContribText(plan.monthlyContribution !== null ? String(plan.monthlyContribution / 100) : "");
  }, [plan.monthlyContribution]);
  useEffect(() => {
    if (plan.spendablePct === lastSentPct.current) return;
    lastSentPct.current = plan.spendablePct;
    setPctText(plan.spendablePct !== null ? String(plan.spendablePct) : "");
  }, [plan.spendablePct]);

  const monthsInvalid = monthsText.trim() !== "" && plan.emergencyMonths === null;
  const contribInvalid = contribText.trim() !== "" && plan.monthlyContribution === null;
  const pctInvalid = pctText.trim() !== "" && plan.spendablePct === null;

  const setMonths = (raw: string) => {
    setMonthsText(raw);
    const n = parseInt(raw, 10);
    const v = Number.isInteger(n) && n >= 1 && n <= 24 ? n : null;
    lastSentMonths.current = v;
    onPlanChange({ ...plan, emergencyMonths: v });
  };
  const setContribution = (raw: string) => {
    setContribText(raw);
    const parsed = parseFloat(raw);
    const minor = Number.isFinite(parsed) ? Math.round(parsed * 100) : NaN;
    const v = Number.isInteger(minor) && minor >= 0 ? minor : null;
    lastSentContrib.current = v;
    onPlanChange({ ...plan, monthlyContribution: v });
  };
  const setSpendablePct = (raw: string) => {
    setPctText(raw);
    const n = parseInt(raw, 10);
    const v = Number.isInteger(n) && n >= 1 && n <= 100 ? n : null;
    lastSentPct.current = v;
    onPlanChange({ ...plan, spendablePct: v });
  };

  const isFull = emergency.target !== null && emergency.remaining === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Shield className="size-4 text-primary" /> Подушка безпеки
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          На скільки місяців витрат хочеш подушку і скільки відкладаєш щомісяця — і я порахую,
          коли вона буде повна. Це інформаційний розрахунок: сам резерв у денному ліміті ("Сьогодні
          можна витратити") веде поле "Відкладаю щомісяця" нижче — незалежно від того, повна подушка
          чи ні.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Місяців витрат</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={monthsText}
              placeholder="6"
              onChange={(e) => setMonths(e.target.value)}
              className="tabular-nums"
            />
            {monthsInvalid && (
              <p className="text-[11px] text-warning">Ціле 1–24 — це значення проігноровано.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Відкладаю щомісяця</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={contribText}
              placeholder="0"
              onChange={(e) => setContribution(e.target.value)}
              className="tabular-nums"
            />
            {contribInvalid && (
              <p className="text-[11px] text-warning">Невірне число — це значення проігноровано.</p>
            )}
          </div>
        </div>

        {emergency.target === null ? (
          <div className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>{emergency.reason}</span>
          </div>
        ) : (
          <>
            <div>
              <div className="mb-1 flex items-end justify-between">
                <span className="text-2xl font-bold tabular-nums">{formatMoney(emergency.saved, base)}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  із {formatMoney(emergency.target, base)}
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full meter-fill rounded-full bg-primary"
                  style={{ width: `${Math.min(100, (emergency.saved / emergency.target) * 100)}%` }}
                />
              </div>
              {emergency.remaining !== null && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Лишилось {formatMoney(emergency.remaining, base)}
                </p>
              )}
              {jarsFxUnavailable !== null ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Немає курсу для {currencyMeta(jarsFxUnavailable).code} — суму банок Monobank порахувати
                  не можна.
                </p>
              ) : (
                jarsTotalBase !== null &&
                jarsTotalBase > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    З них {formatMoney(jarsTotalBase, base)} уже лежить у банках Monobank — ця сума не
                    входить у «Уже накопичено» вище; онови поле вручну, якщо хочеш це врахувати.
                  </p>
                )
              )}
            </div>

            {isFull ? (
              <div className="flex items-center gap-2 rounded-xl bg-success/10 p-3 text-sm text-success">
                <CheckCircle2 className="size-4 shrink-0" />
                {emergency.reason} — надлишок можна витрачати чи інвестувати.
              </div>
            ) : emergency.reason !== null ? (
              <div className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                <span>{emergency.reason}</span>
              </div>
            ) : (
              <div className="rounded-xl bg-secondary p-3 text-sm">
                <div className="text-muted-foreground">За темпом закриється через:</div>
                <div className="mt-0.5 font-semibold tabular-nums">
                  {emergency.monthsToFull !== null ? `${emergency.monthsToFull.toFixed(1)} міс.` : "—"}
                </div>
              </div>
            )}
          </>
        )}

        <Separator />

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Ліміт від % зарплати (необов'язково)</Label>
          <Input
            type="number"
            inputMode="numeric"
            value={pctText}
            placeholder="не налаштовано"
            onChange={(e) => setSpendablePct(e.target.value)}
            className="tabular-nums"
          />
          {pctInvalid && (
            <p className="text-[11px] text-warning">
              Ціле 1–100 — це значення проігноровано, ліміт лишається від усього залишку.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Скільки відсотків зарплати вважати ліквідними для денного ліміту. Ліміт бере{" "}
            <span className="font-medium">менше</span> з залишку й цього бюджету — не налаштовано
            (порожньо) означає ліміт від усього залишку, як і раніше.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
