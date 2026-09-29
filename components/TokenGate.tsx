"use client";

import { useState } from "react";
import { KeyRound, ShieldCheck, ExternalLink, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TokenGate({
  onConnect,
  loading,
  error,
}: {
  onConnect: (token: string) => void;
  loading: boolean;
  error: string | null;
}) {
  const [value, setValue] = useState("");

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-10">
      <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500">
        <CardContent className="space-y-5">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <KeyRound className="size-5" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Підключи Monobank</h1>
            <p className="text-sm text-muted-foreground">
              Введи персональний токен Monobank, щоб бачити баланс, витрати та аналітику.
              Токен зберігається на твоєму сервері в зашифрованому вигляді.
            </p>
          </div>

          <a
            href="https://api.monobank.ua/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Отримати токен на api.monobank.ua <ExternalLink className="size-3.5" />
          </a>

          <div className="space-y-3">
            <Input
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Встав токен сюди (u...)"
              className="h-11"
              onKeyDown={(e) => e.key === "Enter" && value.trim() && onConnect(value.trim())}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              onClick={() => value.trim() && onConnect(value.trim())}
              disabled={loading || !value.trim()}
              size="lg"
              className="w-full"
            >
              {loading ? <Loader2 className="size-4 spin" /> : <ShieldCheck className="size-4" />}
              {loading ? "Підключення…" : "Підключити"}
            </Button>
          </div>

          <div className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
            <span>
              Токен шифрується на сервері й використовується лише для запитів до Monobank. Дані
              живуть у базі на твоєму сервері. Для перегляду витрат достатньо токена «тільки читання».
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
