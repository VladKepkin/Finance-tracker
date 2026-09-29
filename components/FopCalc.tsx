"use client";

import { useState } from "react";
import { Landmark, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { convertMinor, type CurrencyRate } from "@/lib/fx";
import { currencyMeta } from "@/lib/monobank";
import { formatMoney } from "@/lib/format";

const MIN_WAGE_UAH = 800_000;
const ESV = Math.round(0.22 * MIN_WAGE_UAH);
const EP_RATE = 0.05;
const VZ_RATE = 0.01;
const CURRENCIES = [840, 980, 978];

export function FopCalc({ rates }: { rates: CurrencyRate[] }) {
  const [amount, setAmount] = useState("500");
  const [currency, setCurrency] = useState(840);

  const incomeCur = Math.round(parseFloat(amount.replace(",", ".")) * 100) || 0;
  const incomeUAH = currency === 980 ? incomeCur : convertMinor(incomeCur, currency, 980, rates);
  const fxUnavailable = incomeUAH === null;

  const ep = incomeUAH !== null ? Math.round(incomeUAH * EP_RATE) : 0;
  const vz = incomeUAH !== null ? Math.round(incomeUAH * VZ_RATE) : 0;
  const total = incomeUAH !== null ? ep + vz + ESV : 0;
  const effRate = incomeUAH !== null && incomeUAH > 0 ? (total / incomeUAH) * 100 : 0;
  const totalCur = currency !== 980 ? convertMinor(total, 980, currency, rates) : total;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Landmark className="size-4 text-primary" /> Калькулятор податків ФОП (3 група)
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Скільки коштує «білий» дохід і яка реальна ефективна ставка.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Дохід/міс</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Валюта</Label>
            <Select value={String(currency)} onValueChange={(v) => setCurrency(Number(v))}>
              <SelectTrigger className="w-full">
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

        {fxUnavailable ? (
          <div className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-xs">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>
              Немає курсу {currencyMeta(currency).code} → {currencyMeta(980).code} — порахувати
              податки зараз не можна.
            </span>
          </div>
        ) : (
          <>
            <div className="space-y-1.5 rounded-xl bg-secondary p-3 text-sm">
              <Row label="Єдиний податок (5%)" value={formatMoney(ep, 980)} />
              <Row label="Військовий збір (1%)" value={formatMoney(vz, 980)} />
              <Row label="ЄСВ (фіксований)" value={formatMoney(ESV, 980)} muted />
            </div>

            <div className="rounded-2xl bg-accent p-4">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-xs text-muted-foreground">Разом податків/міс</div>
                  <div className="mt-0.5 text-2xl font-bold tabular-nums">{formatMoney(total, 980)}</div>
                  {currency !== 980 &&
                    (totalCur !== null ? (
                      <div className="text-xs text-muted-foreground tabular-nums">
                        ≈ {formatMoney(totalCur, currency)}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        Немає курсу {currencyMeta(980).code} → {currencyMeta(currency).code}
                      </div>
                    ))}
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Ефективна ставка</div>
                  <div className="mt-0.5 text-2xl font-bold tabular-nums text-primary">
                    {effRate.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        <p className="text-xs text-muted-foreground">
          Сам податок на дохід — лише <b>6%</b>. Решта — фіксований ЄСВ (≈{formatMoney(ESV, 980)}),
          тому при малому доході ставка вища, а зі зростанням доходу швидко падає. Ставки 2025 —
          перед рішенням звір актуальні (мінзарплата, ЄСВ, воєнні зміни).
        </p>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
      <span className="tabular-nums font-medium">{value}</span>
    </div>
  );
}
