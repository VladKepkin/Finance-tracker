"use client";

import { useEffect, useRef, useState } from "react";
import { FileDown, Copy, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function ExportCard({
  accountId,
  accountCurrency,
  jarTitles,
}: {
  accountId: string;
  accountCurrency: number;
  jarTitles: readonly string[] | null;
}) {
  const [month, setMonth] = useState(currentMonth());
  const [busy, setBusy] = useState<"download" | "copy" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const buildUrl = () => {
    const params = new URLSearchParams({
      account: accountId,
      accountCurrency: String(accountCurrency),
      month,
    });
    for (const t of jarTitles ?? []) params.append("jarTitle", t);
    return `/api/export?${params.toString()}`;
  };

  const download = async () => {
    setBusy("download");
    setError(null);
    try {
      const res = await fetch(buildUrl(), { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `money-${month}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  const copy = async () => {
    setBusy("copy");
    setError(null);
    try {
      const res = await fetch(buildUrl(), { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      if (mounted.current) {
        setCopied(true);
        setTimeout(() => {
          if (mounted.current) setCopied(false);
        }, 2000);
      }
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileDown className="size-4" /> Експорт для аналізу
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Місячний звіт для вставки в чат із потужною моделлю — з обмеженнями, а не порадами загального штибу.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-destructive">Не вдалося: {error}</p>}
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => void download()} disabled={busy !== null}>
            <FileDown className="size-4" /> Завантажити
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => void copy()} disabled={busy !== null}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Скопійовано" : "Скопіювати"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
