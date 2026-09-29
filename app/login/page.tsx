"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, LogIn, Loader2, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!username.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Не вдалося увійти");
      }
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-10">
      <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500">
        <CardContent className="space-y-5">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Wallet className="size-5" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Вхід у Money</h1>
            <p className="text-sm text-muted-foreground">
              Введи логін і пароль, щоб отримати доступ до свого гаманця.
            </p>
          </div>

          <div className="space-y-3">
            <Input
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Логін"
              autoComplete="username"
              className="h-11"
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Пароль"
              autoComplete="current-password"
              className="h-11"
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              onClick={submit}
              disabled={loading || !username.trim() || !password}
              size="lg"
              className="w-full"
            >
              {loading ? <Loader2 className="size-4 spin" /> : <LogIn className="size-4" />}
              {loading ? "Вхід…" : "Увійти"}
            </Button>
          </div>

          <div className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-xs text-muted-foreground">
            <LockKeyhole className="mt-0.5 size-4 shrink-0 text-success" />
            <span>
              Сесія зберігається у захищеній httpOnly-кукі. Дані гаманця живуть на твоєму
              сервері під цим акаунтом.
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
