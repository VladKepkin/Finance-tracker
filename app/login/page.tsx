"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, LogIn, Loader2, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!username.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload: Record<string, string> = { username: username.trim(), password };
      if (mode === "register" && inviteCode.trim()) {
        payload.inviteCode = inviteCode.trim();
      }
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || (mode === "login" ? "Не вдалося увійти" : "Не вдалося зареєструватися"));
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
            <h1 className="text-2xl font-semibold tracking-tight">
              {mode === "login" ? "Вхід у Money" : "Реєстрація акаунта"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {mode === "login"
                ? "Введи логін і пароль, щоб отримати доступ до свого гаманця."
                : "Створи свій особистий акаунт. Можна вказати код запрошення в сім'ю."}
            </p>
          </div>

          <div className="flex rounded-xl bg-muted p-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
              }}
              className={`flex-1 rounded-lg py-1.5 transition-all ${
                mode === "login" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
              }`}
            >
              Вхід
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError(null);
              }}
              className={`flex-1 rounded-lg py-1.5 transition-all ${
                mode === "register" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
              }`}
            >
              Новий користувач
            </button>
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
              placeholder="Пароль (від 6 символів)"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="h-11"
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            {mode === "register" && (
              <Input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="Код запрошення в сім'ю (якщо є)"
                className="h-11 font-mono uppercase"
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              onClick={submit}
              disabled={loading || !username.trim() || !password}
              size="lg"
              className="w-full"
            >
              {loading ? <Loader2 className="size-4 spin" /> : <LogIn className="size-4" />}
              {loading ? (mode === "login" ? "Вхід…" : "Створення…") : (mode === "login" ? "Увійти" : "Зареєструватися")}
            </Button>
          </div>

          <div className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-xs text-muted-foreground">
            <LockKeyhole className="mt-0.5 size-4 shrink-0 text-success" />
            <span>
              Сесія зберігається у захищеній httpOnly-кукі. Твої особисті картки та виписка захищені й ізольовані від інших акаунтів.
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
