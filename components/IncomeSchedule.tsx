"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarClock, Shield } from "lucide-react";
import type { IncomeSchedule } from "@/lib/metrics/schedule";
import { currencyMeta } from "@/lib/monobank";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export function IncomeScheduleCard({
  schedule,
  buffer,
  base,
  onScheduleChange,
  onBufferChange,
}: {
  schedule: IncomeSchedule | null;
  buffer: number;
  base: number;
  onScheduleChange: (s: IncomeSchedule) => void;
  onBufferChange: (v: number) => void;
}) {
  const kind = schedule?.kind ?? "monthly";
  const d1 = schedule?.kind === "semimonthly" ? schedule.days[0] : schedule?.kind === "monthly" ? schedule.day : 1;
  const d2 = schedule?.kind === "semimonthly" ? schedule.days[1] : 20;
  const sym = currencyMeta(base).symbol;

  const lastSentBuffer = useRef(buffer);
  const [bufferText, setBufferText] = useState(buffer ? String(buffer / 100) : "");
  useEffect(() => {
    if (buffer === lastSentBuffer.current) return;
    lastSentBuffer.current = buffer;
    setBufferText(buffer ? String(buffer / 100) : "");
  }, [buffer]);

  const setKind = (k: string) => {
    onScheduleChange(
      k === "semimonthly" ? { kind: "semimonthly", days: [d1, d2] } : { kind: "monthly", day: d1 }
    );
  };
  const setDay = (which: 1 | 2, v: number) => {
    if (kind === "monthly") onScheduleChange({ kind: "monthly", day: v });
    else onScheduleChange({ kind: "semimonthly", days: which === 1 ? [v, d2] : [d1, v] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <CalendarClock className="size-4" /> Дохід і накопичення
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Коли приходить дохід — без цього денний ліміт порахувати нічим.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">Раз на місяць</SelectItem>
            <SelectItem value="semimonthly">Двічі на місяць</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">числа</span>
          <Select value={String(d1)} onValueChange={(v) => setDay(1, Number(v))}>
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAYS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {kind === "semimonthly" && (
            <>
              <span className="text-sm text-muted-foreground">і</span>
              <Select value={String(d2)} onValueChange={(v) => setDay(2, Number(v))}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>

        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm">
              <Shield className="size-4 text-muted-foreground" /> Уже накопичено ({sym})
            </span>
            <Input
              type="number"
              value={bufferText}
              placeholder="0"
              onChange={(e) => {
                const raw = e.target.value;
                setBufferText(raw);
                const parsed = parseFloat(raw);
                const v = Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
                const minor = v > 0 ? v : 0;
                lastSentBuffer.current = minor;
                onBufferChange(minor);
              }}
              className="h-8 w-28 text-right text-sm tabular-nums"
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Ці гроші не витрачаються — вони йдуть на подушку безпеки чи іншу мету
            й ніколи не входять у денний ліміт.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
