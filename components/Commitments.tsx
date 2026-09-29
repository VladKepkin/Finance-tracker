"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Repeat, Check, X, Trash2 } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { Cadence } from "@/lib/metrics/cadence";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface CommitmentRow {
  id: number;
  name: string;
  amount: number;
  currency: number;
  cadence: Cadence;
  anchor_day: number;
}

interface Suggestion {
  name: string;
  matcher: string;
  amount: number;
  currency: number;
  cadence: Cadence;
  anchorDay: number;
  occurrences: number;
}

const WEEKDAYS = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"];

function when(cadence: Cadence, anchorDay: number): string {
  return cadence === "weekly" ? `щотижня, ${WEEKDAYS[anchorDay]}` : `щомісяця, ${anchorDay}-го`;
}

export function CommitmentsCard({ base, onChanged }: { base: number; onChanged: () => void }) {
  const [items, setItems] = useState<CommitmentRow[] | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
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
      const [a, b] = await Promise.all([
        fetch("/api/commitments", { cache: "no-store" }),
        fetch("/api/commitments/suggestions", { cache: "no-store" }),
      ]);
      if (!a.ok || !b.ok) throw new Error(`HTTP ${a.status}/${b.status}`);
      const list = (await a.json()) as { items: CommitmentRow[] };
      const sug = (await b.json()) as { items: Suggestion[] };
      if (!mounted.current) return;
      setItems(list.items);
      setSuggestions(sug.items);
      setError(null);
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const confirm = async (s: Suggestion) => {
    setBusy(true);
    try {
      await fetch("/api/commitments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: s.name,
          amount: s.amount,
          currency: s.currency,
          cadence: s.cadence,
          anchorDay: s.anchorDay,
          matcher: s.matcher,
        }),
      });
      await load();
      onChanged();
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const reject = (s: Suggestion) => {
    setSuggestions((prev) => prev.filter((x) => x.matcher !== s.matcher));
  };

  const remove = async (id: number) => {
    setBusy(true);
    try {
      await fetch(`/api/commitments?id=${id}`, { method: "DELETE" });
      await load();
      onChanged();
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const monthly = (items ?? [])
    .filter((c) => c.cadence === "monthly")
    .reduce((s, c) => s + c.amount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Repeat className="size-4" /> Регулярні платежі
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Те, що спишеться саме. Резервується з денного ліміту.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-destructive">Не вдалося завантажити: {error}</p>}

        {items === null && !error && (
          <p className="text-sm text-muted-foreground">Завантаження…</p>
        )}

        {items !== null && items.length === 0 && (
          <p className="text-sm text-muted-foreground">Жодного не підтверджено.</p>
        )}

        {items !== null && items.length > 0 && (
          <>
            {items.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{when(c.cadence, c.anchor_day)}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums">{formatMoney(c.amount, c.currency)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    onClick={() => void remove(c.id)}
                    disabled={busy}
                    title="Прибрати"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            {monthly > 0 && (
              <p className="border-t border-border pt-2 text-xs text-muted-foreground">
                Щомісяця: {formatMoney(monthly, base)}
              </p>
            )}
          </>
        )}

        {suggestions.length > 0 && (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">
              Знайдено в історії — підтвердь, якщо це справді регулярний платіж:
            </p>
            {suggestions.map((s) => (
              <div key={s.matcher} className="rounded-xl bg-secondary p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {when(s.cadence, s.anchorDay)} · {s.occurrences}× у історії
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-sm tabular-nums">{formatMoney(s.amount, s.currency)}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-success"
                      onClick={() => void confirm(s)}
                      disabled={busy}
                      title="Підтвердити"
                    >
                      <Check className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground"
                      onClick={() => reject(s)}
                      disabled={busy}
                      title="Не зараз"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
