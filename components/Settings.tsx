"use client";

import { useState } from "react";
import {
  CreditCard,
  LogOut,
  PiggyBank,
  Check,
  Sliders,
  ShieldAlert,
  AlertTriangle,
} from "lucide-react";
import type { MonoClientInfo } from "@/lib/monobank";
import { currencyMeta } from "@/lib/monobank";
import { formatMoney } from "@/lib/format";
import { ACCOUNT_TYPE_LABEL } from "@/lib/accountTypeLabel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HistoryCard } from "@/components/HistoryCard";
import { CommitmentsCard } from "@/components/Commitments";
import { IncomeScheduleCard } from "@/components/IncomeSchedule";
import { SalariesCard } from "@/components/Salaries";
import { ExportCard } from "@/components/ExportCard";
import { FamilySettings } from "@/components/FamilySettings";
import type { IncomeSchedule } from "@/lib/metrics/schedule";
import type { WorkSchedule } from "@/lib/metrics/salary";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const BASE_OPTIONS = [980, 840, 978];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [showAllJars, setShowAllJars] = useState(false);

  const jars = client.jars ?? [];
  const visibleJars = showAllJars ? jars : jars.slice(0, 3);

  return (
    <div className="animate-in fade-in duration-300 space-y-6">
      {/* 1. Блок профілю (Identity Hero) */}
      <Card className="border shadow-xs overflow-hidden">
        <div className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-linear-to-r from-secondary/50 via-card to-secondary/30">
          <div className="flex items-center gap-4">
            <div className="size-13 sm:size-14 rounded-2xl bg-primary text-primary-foreground font-display font-bold text-lg sm:text-xl flex items-center justify-center shadow-xs shrink-0">
              {getInitials(client.name)}
            </div>
            <div className="space-y-1 min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold font-display tracking-tight text-foreground truncate">
                {client.name}
              </h2>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 font-medium text-success">
                  <span className="size-2 rounded-full bg-success inline-block animate-pulse" />
                  Monobank підключено
                </span>
                <span>·</span>
                <span>{client.accounts.length} рахунків</span>
                {jars.length > 0 && (
                  <>
                    <span>·</span>
                    <span>{jars.length} {jars.length === 1 ? "банка" : jars.length < 5 ? "банки" : "банок"}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 2. Основна збалансована сітка */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Ліва колонка (Фінанси: Рахунки, Банки, Доходи та Графік) */}
        <div className="space-y-6">
          {/* Рахунки */}
          <Card className="border shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CreditCard className="size-4 text-primary" /> Мої рахунки
                </CardTitle>
                <span className="text-xs text-muted-foreground font-normal">
                  Оберіть активний
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {client.accounts.map((a) => {
                const active = a.id === selectedAccount;
                return (
                  <button
                    key={a.id}
                    onClick={() => onSelect(a.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl border p-3 text-left transition-all",
                      active
                        ? "border-primary bg-primary/5 shadow-xs"
                        : "border-border/60 hover:border-primary/40 hover:bg-secondary/40"
                    )}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {ACCOUNT_TYPE_LABEL[a.type] ?? a.type}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                          {currencyMeta(a.currencyCode).code}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">
                        {a.maskedPan?.[0] ?? a.iban}
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="text-sm font-bold tabular-nums">
                        {formatMoney(a.balance, a.currencyCode)}
                      </span>
                      {active ? (
                        <div className="size-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                          <Check className="size-3 stroke-[2.5]" />
                        </div>
                      ) : (
                        <div className="size-5 rounded-full border border-border/80 shrink-0" />
                      )}
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {/* Банки (Jars) Monobank */}
          {jars.length > 0 && (
            <Card className="border shadow-xs">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <PiggyBank className="size-4 text-primary" /> Банки Monobank
                  </CardTitle>
                  <span className="text-xs text-muted-foreground font-medium">
                    {jars.length} {jars.length === 1 ? "банка" : jars.length < 5 ? "банки" : "банок"}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {visibleJars.map((j) => {
                  const pct = j.goal > 0 ? Math.min(100, (j.balance / j.goal) * 100) : 0;
                  return (
                    <div key={j.id} className="rounded-xl border border-border/60 bg-secondary/30 p-3 space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-foreground truncate pr-2">{j.title}</span>
                        <span className="font-bold tabular-nums shrink-0">
                          {formatMoney(j.balance, j.currencyCode)}
                        </span>
                      </div>
                      {j.goal > 0 && (
                        <div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full bg-success transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>ціль {formatMoney(j.goal, j.currencyCode)}</span>
                            <span className="font-medium">{pct.toFixed(0)}%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {jars.length > 3 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setShowAllJars(!showAllJars)}
                  >
                    {showAllJars ? "Згорнути банки" : `Показати всі банки (${jars.length})`}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Зарплата та доходи */}
          <SalariesCard
            base={base}
            workSchedule={workSchedule}
            onWorkScheduleChange={onWorkScheduleChange}
            onChanged={onSalariesChanged}
            monthlyIncome={monthlyIncome}
            monthlyIncomeConfidenceLow={monthlyIncomeConfidenceLow}
            incomeUnavailableReason={incomeUnavailableReason}
          />

          {/* Графік надходження доходу та подушка безпеки */}
          <IncomeScheduleCard
            schedule={schedule}
            buffer={buffer}
            base={base}
            onScheduleChange={onScheduleChange}
            onBufferChange={onBufferChange}
          />
        </div>

        {/* Права колонка (Планування, Спільний доступ, Параметри) */}
        <div className="space-y-6">
          {/* Регулярні платежі / Підписки */}
          <CommitmentsCard base={base} onChanged={onCommitmentsChanged} />

          {/* Спільний сімейний бюджет */}
          <FamilySettings accounts={client.accounts} onRefresh={onCommitmentsChanged} />

          {/* Базова валюта додатку */}
          <Card className="border shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Sliders className="size-4 text-primary" /> Параметри додатку
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-secondary/40 border border-border/50">
                <div>
                  <div className="text-sm font-medium text-foreground">Базова валюта</div>
                  <div className="text-xs text-muted-foreground">
                    У ній розраховуються ліміти, денний бюджет та аналітика
                  </div>
                </div>
                <Select value={String(base)} onValueChange={(v) => onBaseChange(Number(v))}>
                  <SelectTrigger className="w-full sm:w-32 h-8 text-xs font-semibold bg-background">
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
              </div>
            </CardContent>
          </Card>

          {/* Експорт для AI */}
          <ExportCard accountId={selectedAccount} accountCurrency={accountCurrency} jarTitles={jarTitles} />

          {/* Історія та статус синхронізації SQLite */}
          <HistoryCard />
        </div>
      </div>

      {/* 3. Безпечна зона сесії (Footer Danger Zone) - в самому низу під усім контентом */}
      <Card className="border border-destructive/20 bg-destructive/5 shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm text-destructive">
            <ShieldAlert className="size-4" /> Сесія та безпека
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Керування активним підключенням до Monobank та обліковим записом.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Відключити Monobank */}
            {confirmDisconnect ? (
              <div className="rounded-xl border border-destructive/30 bg-background p-3 space-y-2">
                <div className="flex items-start gap-2 text-xs text-destructive font-medium">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                  <span>Відключити токен Monobank? Синхронізацію буде зупинено.</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={() => {
                      setConfirmDisconnect(false);
                      onDisconnect();
                    }}
                  >
                    Так, відключити
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setConfirmDisconnect(false)}
                  >
                    Скасувати
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full text-destructive hover:bg-destructive/10 border-destructive/30 text-xs h-10"
                onClick={() => setConfirmDisconnect(true)}
              >
                <LogOut className="size-4 mr-2" /> Відключити Monobank
              </Button>
            )}

            {/* Вийти з акаунта */}
            {confirmLogout ? (
              <div className="rounded-xl border border-border bg-background p-3 space-y-2">
                <div className="flex items-start gap-2 text-xs text-foreground font-medium">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5 text-warning" />
                  <span>Вийти з облікового запису на цьому пристрої?</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={() => {
                      setConfirmLogout(false);
                      onLogout();
                    }}
                  >
                    Так, вийти
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setConfirmLogout(false)}
                  >
                    Скасувати
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="ghost"
                className="w-full text-muted-foreground hover:text-foreground text-xs h-10"
                onClick={() => setConfirmLogout(true)}
              >
                <LogOut className="size-4 mr-2" /> Вийти з акаунта
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground/80">
            Ваші персональні налаштування, цілі та збережені записи залишаються збереженими в системі.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

