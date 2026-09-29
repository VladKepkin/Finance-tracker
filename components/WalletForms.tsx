"use client";

import { useState } from "react";
import { Plus, ArrowRightLeft } from "lucide-react";
import { currencyMeta } from "@/lib/monobank";
import { convertMinor, rateBetween, type CurrencyRate } from "@/lib/fx";
import { CATEGORIES } from "@/lib/mcc";
import { DEFAULT_CASH_ACCOUNT_ID, type CashAccount } from "@/lib/cashAccounts";
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

export const CURRENCIES = [840, 980, 978];
export const minor = (s: string) => Math.round(parseFloat(s.replace(",", ".")) * 100) || 0;

export function MoneyForm({
  today,
  defaultCurrency,
  sourceLabel,
  sourcePlaceholder,
  cta,
  withCategory,
  hint,
  accounts,
  defaultAccountId,
  onSubmit,
}: {
  today: string;
  defaultCurrency: number;
  sourceLabel: string;
  sourcePlaceholder: string;
  cta: string;
  withCategory: boolean;
  hint?: string;
  accounts: CashAccount[];
  defaultAccountId: string;
  onSubmit: (v: {
    amount: number;
    currency: number;
    source: string;
    date: string;
    category?: string;
    accountId: string;
  }) => void;
}) {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [source, setSource] = useState("");
  const [date, setDate] = useState(today);
  const [category, setCategory] = useState("other");
  const [accountId, setAccountId] = useState(defaultAccountId);

  const submit = () => {
    const a = minor(amount);
    if (a <= 0) return;
    onSubmit({ amount: a, currency, source: source || sourcePlaceholder, date, category, accountId });
    setAmount("");
    setSource("");
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Сума</Label>
          <Input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1000"
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Валюта</Label>
          <CurrencySelect value={currency} onChange={setCurrency} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Рахунок</Label>
        <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
      </div>
      {withCategory && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Категорія</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(CATEGORIES)
                .filter((c) => c.key !== "income")
                .map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.emoji} {c.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{sourceLabel}</Label>
          <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder={sourcePlaceholder} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Дата</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <Button onClick={submit} className="w-full">
        <Plus className="size-4" /> {cta}
      </Button>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ConvertForm({
  today,
  rates,
  accounts,
  defaultAccountId,
  onSubmit,
}: {
  today: string;
  rates: CurrencyRate[];
  accounts: CashAccount[];
  defaultAccountId: string;
  onSubmit: (e: {
    date: string;
    fromAmount: number;
    fromCurrency: number;
    toAmount: number;
    toCurrency: number;
    accountId: string;
  }) => void;
}) {
  const [fromCurrency, setFromCurrency] = useState(840);
  const [toCurrency, setToCurrency] = useState(980);
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [date, setDate] = useState(today);
  const [accountId, setAccountId] = useState(defaultAccountId);

  const suggest = () => {
    const fa = minor(fromAmount);
    if (fa <= 0) return;
    const conv = convertMinor(fa, fromCurrency, toCurrency, rates);
    if (conv !== null) setToAmount((conv / 100).toFixed(2));
  };

  const liveRate = rateBetween(rates, fromCurrency, toCurrency);

  const submit = () => {
    const fa = minor(fromAmount);
    const ta = minor(toAmount);
    if (fa <= 0 || ta <= 0 || fromCurrency === toCurrency) return;
    onSubmit({ date, fromAmount: fa, fromCurrency, toAmount: ta, toCurrency, accountId });
    setFromAmount("");
    setToAmount("");
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Списати</Label>
          <Input
            type="number"
            inputMode="decimal"
            value={fromAmount}
            onChange={(e) => setFromAmount(e.target.value)}
            onBlur={suggest}
            placeholder="100"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">З валюти</Label>
          <CurrencySelect value={fromCurrency} onChange={setFromCurrency} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Отримати</Label>
          <Input
            type="number"
            inputMode="decimal"
            value={toAmount}
            onChange={(e) => setToAmount(e.target.value)}
            placeholder="4150"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">У валюту</Label>
          <CurrencySelect value={toCurrency} onChange={setToCurrency} />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {liveRate
            ? `Курс Monobank: 1 ${currencyMeta(fromCurrency).code} ≈ ${liveRate.toFixed(2)} ${currencyMeta(toCurrency).code}`
            : "Курс недоступний"}
        </span>
        <Button variant="ghost" size="sm" onClick={suggest} disabled={!liveRate}>
          За курсом
        </Button>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Рахунок</Label>
        <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
      </div>
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <Button onClick={submit} className="w-full">
        <ArrowRightLeft className="size-4" /> Записати обмін
      </Button>
    </div>
  );
}

export function TransferForm({
  today,
  accounts,
  defaultFromAccountId,
  onSubmit,
}: {
  today: string;
  accounts: CashAccount[];
  defaultFromAccountId: string;
  onSubmit: (e: {
    date: string;
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    currency: number;
  }) => void;
}) {
  const otherAccount = accounts.find((a) => a.id !== defaultFromAccountId);
  const [fromAccountId, setFromAccountId] = useState(defaultFromAccountId);
  const [toAccountId, setToAccountId] = useState(otherAccount?.id ?? DEFAULT_CASH_ACCOUNT_ID);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(980);
  const [date, setDate] = useState(today);

  const canSubmit = fromAccountId !== toAccountId && accounts.length > 1;

  const submit = () => {
    const a = minor(amount);
    if (a <= 0 || fromAccountId === toAccountId) return;
    onSubmit({ date, fromAccountId, toAccountId, amount: a, currency });
    setAmount("");
  };

  if (accounts.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">
        Потрібно щонайменше два рахунки, щоб переказати між ними — спершу створи ще один у «Мої рахунки».
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Звідки</Label>
          <AccountSelect accounts={accounts} value={fromAccountId} onChange={setFromAccountId} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Куди</Label>
          <AccountSelect accounts={accounts} value={toAccountId} onChange={setToAccountId} />
        </div>
      </div>
      {fromAccountId === toAccountId && (
        <p className="text-xs text-destructive">Рахунки мають відрізнятись.</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Сума</Label>
          <Input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="2000"
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Валюта</Label>
          <CurrencySelect value={currency} onChange={setCurrency} />
        </div>
      </div>
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <Button onClick={submit} className="w-full" disabled={!canSubmit}>
        <ArrowRightLeft className="size-4" /> Переказати
      </Button>
    </div>
  );
}

export function CurrencySelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
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
  );
}

export function AccountSelect({
  accounts,
  value,
  onChange,
}: {
  accounts: CashAccount[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {accounts.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
