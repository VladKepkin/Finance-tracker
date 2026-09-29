"use client";

import { CreditCard, LogOut } from "lucide-react";
import type { MonoClientInfo } from "@/lib/monobank";
import { currencyMeta } from "@/lib/monobank";
import { formatMoney } from "@/lib/format";
import { ACCOUNT_TYPE_LABEL } from "@/lib/accountTypeLabel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HistoryCard } from "@/components/HistoryCard";
import { CommitmentsCard } from "@/components/Commitments";
import { IncomeScheduleCard } from "@/components/IncomeSchedule";
import { SalariesCard } from "@/components/Salaries";
import { ExportCard } from "@/components/ExportCard";
import type { IncomeSchedule } from "@/lib/metrics/schedule";
import type { WorkSchedule } from "@/lib/metrics/salary";
import { Disclosure } from "@/components/ui/disclosure";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const BASE_OPTIONS = [980, 840, 978];

export function Settings({
  client,
  selectedAccount,
  base,
  onBaseChange,
  onSelect,
  onDisconnect,
  onLogout,
  schedule,
  buffer,
  onScheduleChange,
  onBufferChange,
  onCommitmentsChanged,
  workSchedule,
  onWorkScheduleChange,
  onSalariesChanged,
  monthlyIncome,
  monthlyIncomeConfidenceLow,
  incomeUnavailableReason,
  accountCurrency,
  jarTitles,
}: {
  client: MonoClientInfo;
  selectedAccount: string;
  base: number;
  onBaseChange: (c: number) => void;
  onSelect: (id: string) => void;
  onDisconnect: () => void;
  onLogout: () => void;
  schedule: IncomeSchedule | null;
  buffer: number;
  onScheduleChange: (s: IncomeSchedule) => void;
  onBufferChange: (v: number) => void;
  onCommitmentsChanged: () => void;
  workSchedule: WorkSchedule | null;
  onWorkScheduleChange: (s: WorkSchedule) => void;
  onSalariesChanged: () => void;
  monthlyIncome: number | null;
  monthlyIncomeConfidenceLow: boolean;
  incomeUnavailableReason: string | null;
  accountCurrency: number;
  jarTitles: readonly string[] | null;
}) {
  return (
    <div className="animate-in fade-in duration-300 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Профіль</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{client.name}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <CreditCard className="size-4" /> Рахунки
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {client.accounts.map((a) => {
            const active = a.id === selectedAccount;
            return (
              <button
                key={a.id}
                onClick={() => onSelect(a.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl border p-3 text-left transition-colors",
                  active ? "border-primary bg-secondary" : "hover:bg-secondary/50"
                )}
              >
                <div>
                  <div className="text-sm font-medium">
                    {ACCOUNT_TYPE_LABEL[a.type] ?? a.type} · {currencyMeta(a.currencyCode).code}
                  </div>
                  <div className="text-xs text-muted-foreground">{a.maskedPan?.[0] ?? a.iban}</div>
                </div>
                <div className="text-sm font-semibold tabular-nums">
                  {formatMoney(a.balance, a.currencyCode)}
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {client.jars && client.jars.length > 0 && (
        <Disclosure title="Банки (jars) Monobank">
          <div className="space-y-2">
            {client.jars.map((j) => {
              const pct = j.goal > 0 ? Math.min(100, (j.balance / j.goal) * 100) : 0;
              return (
                <div key={j.id} className="rounded-xl bg-secondary p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{j.title}</span>
                    <span className="tabular-nums">{formatMoney(j.balance, j.currencyCode)}</span>
                  </div>
                  {j.goal > 0 && (
                    <>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-background">
                        <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        ціль {formatMoney(j.goal, j.currencyCode)} · {pct.toFixed(0)}%
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </Disclosure>
      )}

      <SalariesCard
        base={base}
        workSchedule={workSchedule}
        onWorkScheduleChange={onWorkScheduleChange}
        onChanged={onSalariesChanged}
        monthlyIncome={monthlyIncome}
        monthlyIncomeConfidenceLow={monthlyIncomeConfidenceLow}
        incomeUnavailableReason={incomeUnavailableReason}
      />

      <IncomeScheduleCard
        schedule={schedule}
        buffer={buffer}
        base={base}
        onScheduleChange={onScheduleChange}
        onBufferChange={onBufferChange}
      />

      <CommitmentsCard base={base} onChanged={onCommitmentsChanged} />

      <ExportCard accountId={selectedAccount} accountCurrency={accountCurrency} jarTitles={jarTitles} />

      <Disclosure title="Базова валюта зведення">
        <p className="mb-3 text-xs text-muted-foreground">
          У ній рахуються капітал, дохід, витрати й аналітика. Суми в інших валютах
          перераховуються за курсом Monobank.
        </p>
        <Select value={String(base)} onValueChange={(v) => onBaseChange(Number(v))}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BASE_OPTIONS.map((c) => (
              <SelectItem key={c} value={String(c)}>
                {currencyMeta(c).symbol} {currencyMeta(c).code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Disclosure>

      <Disclosure title="Історія синхронізації">
        <HistoryCard />
      </Disclosure>

      <Button variant="outline" className="w-full text-destructive" onClick={onDisconnect}>
        <LogOut className="size-4" /> Відключити Monobank
      </Button>

      <Button variant="ghost" className="w-full" onClick={onLogout}>
        <LogOut className="size-4" /> Вийти з акаунта
      </Button>
    </div>
  );
}
