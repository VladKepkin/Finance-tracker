"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Database, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Payload {
  coverage: { days: number; samples: number; from: string | null; to: string | null };
  accounts: { accountId: string; backfillDone: boolean; status: string; error: string | null }[];
}

export function HistoryCard() {
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sync/status", { cache: "no-store" });
      if (!res.ok) throw new Error(`Статус ${res.status}`);
      const json = (await res.json()) as Payload;
      if (!mountedRef.current) return;
      setData(json);
      setLoadError(null);
    } catch (e) {
      if (!mountedRef.current) return;
      setLoadError(e instanceof Error ? e.message : "Не вдалося отримати статус");
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [load]);

  const trigger = async () => {
    setBusy(true);
    try {
      await fetch("/api/sync/status", { method: "POST" });
      await load();
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const months = data ? Math.floor(data.coverage.days / 30) : 0;
  const backfilling = data?.accounts.some((a) => !a.backfillDone) ?? false;
  const syncError = data?.accounts.find((a) => a.error)?.error ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Database className="size-4" /> Історія
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Сервер збирає виписку сам — на ній рахуються медіана й прогноз.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!data && !loadError ? (
          <div className="text-sm text-muted-foreground">Завантаження…</div>
        ) : !data && loadError ? (
          <p className="text-sm text-destructive">Не вдалося завантажити статус: {loadError}</p>
        ) : data && data.coverage.samples === 0 ? (
          <div className="text-sm text-muted-foreground">
            Даних ще немає. Перший збір триває до ~25 хвилин.
          </div>
        ) : (
          data && (
            <div className="text-sm">
              Зібрано <span className="font-semibold">{months} міс</span> ({data.coverage.samples}{" "}
              операцій)
              <div className="text-xs text-muted-foreground">
                {data.coverage.from} — {data.coverage.to}
              </div>
            </div>
          )
        )}

        {backfilling && data && data.coverage.samples > 0 && (
          <div className="text-xs text-muted-foreground">Збір історії триває…</div>
        )}
        {data && loadError && (
          <p className="text-sm text-destructive">
            Дані застарілі — оновити не вдалося: {loadError}
          </p>
        )}
        {syncError && <p className="text-sm text-destructive">Помилка синку: {syncError}</p>}

        <Button variant="outline" className="w-full" onClick={trigger} disabled={busy}>
          <RefreshCw className={cn("size-4", busy && "spin")} /> Оновити зараз
        </Button>
      </CardContent>
    </Card>
  );
}
