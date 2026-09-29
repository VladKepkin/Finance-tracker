"use client";

import { useState } from "react";
import { LineChart, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

function futureValue(monthly: number, years: number, annualPct: number): number {
  const n = years * 12;
  const i = annualPct / 100 / 12;
  if (i === 0) return monthly * n;
  return monthly * ((Math.pow(1 + i, n) - 1) / i);
}

const YEARS = [5, 10, 20, 30];

export function InvestCalc({
  base,
  suggestedMonthly,
}: {
  base: number;
  suggestedMonthly: number | null;
}) {
  const [monthly, setMonthly] = useState(
    suggestedMonthly !== null && suggestedMonthly > 0 ? Math.round(suggestedMonthly / 100) : 50
  );
  const [rate, setRate] = useState(8);
  const [years, setYears] = useState(20);

  const monthlyMinor = monthly * 100;
  const fv = Math.round(futureValue(monthlyMinor, years, rate));
  const invested = monthlyMinor * years * 12;
  const growth = fv - invested;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <LineChart className="size-4 text-primary" /> Калькулятор інвестицій
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Скільки виросте регулярний внесок завдяки складному відсотку.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Внесок/міс ({base === 840 ? "$" : "₴"})</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={monthly || ""}
              onChange={(e) => setMonthly(Math.max(0, Number(e.target.value)))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Дохідність %/рік</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={rate || ""}
              onChange={(e) => setRate(Math.max(0, Number(e.target.value)))}
            />
          </div>
        </div>

        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">Горизонт</Label>
          <div className="flex gap-1.5">
            {YEARS.map((y) => (
              <button
                key={y}
                onClick={() => setYears(y)}
                className={cn(
                  "flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors",
                  years === y ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                )}
              >
                {y} р.
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-accent p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" /> Через {years} р. матимеш
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{formatMoney(fv, base)}</div>
          <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs [&_.tabular-nums]:whitespace-nowrap">
            <span className="text-muted-foreground">
              Вклав: <span className="text-foreground tabular-nums">{formatMoney(invested, base)}</span>
            </span>
            <span className="text-muted-foreground">
              Приріст: <span className="text-success tabular-nums">+{formatMoney(growth, base)}</span>
            </span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          ~8%/рік — історичне середнє світового ринку акцій у довгому горизонті. Це не гарантія:
          реальна дохідність коливається, бувають падіння. Освітній орієнтир, не інвестрекомендація.
        </p>
      </CardContent>
    </Card>
  );
}
