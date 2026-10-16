"use client";

import { useState, useRef } from "react";
import {
  Database,
  DownloadCloud,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileJson,
  Layers,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface BackupPreview {
  raw: unknown;
  accountsCount: number;
  walletCount: number;
  commitmentsCount: number;
  salariesCount: number;
  ratingsCount?: number;
  exportedAt?: string;
}

export function BackupCard() {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [restoring, setRestoring] = useState(false);
  const [successStats, setSuccessStats] = useState<{
    accountsCount: number;
    walletCount: number;
    commitmentsCount: number;
    salariesCount: number;
    ratingsCount?: number;
  } | null>(null);

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const res = await fetch("/api/backup", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const today = new Date().toISOString().slice(0, 10);
      a.download = `finance-backup-${today}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDownloadError((e as Error).message || "Помилка завантаження");
    } finally {
      setDownloading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseError(null);
    setSuccessStats(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const json = JSON.parse(text);

        const data = json.data || json;
        const kv = data.kv || {};
        const accounts = Array.isArray(kv.cashAccounts) ? kv.cashAccounts : [];
        const wallet = Array.isArray(kv.wallet) ? kv.wallet : [];
        const commitments = Array.isArray(data.commitments) ? data.commitments : [];
        const salaries = Array.isArray(data.salaries) ? data.salaries : [];
        const ratings = Array.isArray(data.ratings) ? data.ratings : [];

        let exportedAt: string | undefined;
        if (json.exportedAt) {
          const d = new Date(json.exportedAt * 1000);
          exportedAt = d.toLocaleDateString("uk-UA") + " " + d.toLocaleTimeString("uk-UA");
        }

        setPreview({
          raw: json,
          accountsCount: accounts.length,
          walletCount: wallet.length,
          commitmentsCount: commitments.length,
          salariesCount: salaries.length,
          ratingsCount: ratings.length,
          exportedAt,
        });
        setIsModalOpen(true);
      } catch (err) {
        setParseError(`Не вдалося розпізнати файл JSON: ${(err as Error).message}`);
      }
    };
    reader.onerror = () => {
      setParseError("Помилка читання файлу");
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleRestoreConfirm = async () => {
    if (!preview) return;
    setRestoring(true);
    setParseError(null);

    try {
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          data: (preview.raw as { data?: unknown })?.data || preview.raw,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      const result = await res.json();
      setSuccessStats(result.stats);
    } catch (err) {
      setParseError((err as Error).message || "Помилка відновлення");
    } finally {
      setRestoring(false);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setPreview(null);
    setParseError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (successStats) {
      window.location.reload();
    }
  };

  return (
    <>
      <Card className="border shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm text-foreground">
            <Database className="size-4 text-primary" /> Резервне копіювання даних
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Повний знімок вашого облікового запису: рахунки, операції, налаштування та регулярні платежі в одному файлі JSON.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {downloadError && <p className="text-xs text-destructive">Помилка: {downloadError}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-10 text-xs gap-2"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? <Loader2 className="size-3.5 animate-spin" /> : <DownloadCloud className="size-3.5" />}
              {downloading ? "Збереження..." : "Завантажити копію (.json)"}
            </Button>

            <Button
              variant="secondary"
              size="sm"
              className="h-10 text-xs gap-2"
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadCloud className="size-3.5" /> Відновити з копії
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
          {parseError && !isModalOpen && (
            <p className="text-xs text-destructive flex items-center gap-1.5 mt-2">
              <AlertCircle className="size-3.5 shrink-0" /> {parseError}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Модальне вікно підтвердження та вибору режиму відновлення */}
      <Sheet open={isModalOpen} onClose={handleCloseModal} title="Відновлення з резервної копії">
        <div className="space-y-4">
          {successStats ? (
            <div className="rounded-3xl bg-card p-6 text-center space-y-3 border border-success/30">
              <CheckCircle2 className="size-12 mx-auto text-success" />
              <h3 className="font-display text-lg font-semibold text-foreground">Дані успішно відновлено!</h3>
              <div className="grid grid-cols-2 gap-2 text-left bg-secondary/30 p-3 rounded-2xl text-xs">
                <div>Рахунків: <span className="font-semibold">{successStats.accountsCount}</span></div>
                <div>Операцій: <span className="font-semibold">{successStats.walletCount}</span></div>
                <div>Платежів: <span className="font-semibold">{successStats.commitmentsCount}</span></div>
                <div>Зарплат: <span className="font-semibold">{successStats.salariesCount}</span></div>
                {successStats.ratingsCount !== undefined && successStats.ratingsCount > 0 && (
                  <div>Оцінок: <span className="font-semibold">{successStats.ratingsCount}</span></div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Сторінка автоматично перезавантажиться для оновлення стану.
              </p>
              <Button className="w-full h-10 rounded-2xl text-xs" onClick={handleCloseModal}>
                Завершити
              </Button>
            </div>
          ) : preview ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-secondary/30 border border-border/50 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <FileJson className="size-4 text-primary" /> Вміст резервної копії:
                </div>
                {preview.exportedAt && (
                  <p className="text-[11px] text-muted-foreground">Експортовано: {preview.exportedAt}</p>
                )}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded-xl bg-background border border-border/40">
                    <span className="text-muted-foreground block text-[11px]">Рахунки</span>
                    <span className="font-semibold text-foreground">{preview.accountsCount}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-background border border-border/40">
                    <span className="text-muted-foreground block text-[11px]">Операції</span>
                    <span className="font-semibold text-foreground">{preview.walletCount}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-background border border-border/40">
                    <span className="text-muted-foreground block text-[11px]">Обов'язкові платежі</span>
                    <span className="font-semibold text-foreground">{preview.commitmentsCount}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-background border border-border/40">
                    <span className="text-muted-foreground block text-[11px]">Зарплати</span>
                    <span className="font-semibold text-foreground">{preview.salariesCount}</span>
                  </div>
                  {preview.ratingsCount !== undefined && preview.ratingsCount > 0 && (
                    <div className="p-2 rounded-xl bg-background border border-border/40 col-span-2">
                      <span className="text-muted-foreground block text-[11px]">Оцінки радості покупок</span>
                      <span className="font-semibold text-foreground">{preview.ratingsCount}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Вибір режиму відновлення */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground block">Оберіть режим відновлення:</label>
                <div className="space-y-2">
                  <div
                    onClick={() => setMode("merge")}
                    className={cn(
                      "p-3 rounded-2xl border text-xs cursor-pointer transition-colors flex items-start gap-3",
                      mode === "merge"
                        ? "bg-primary/10 border-primary text-foreground"
                        : "bg-background border-border/60 hover:bg-secondary/40 text-muted-foreground"
                    )}
                  >
                    <Layers className="size-4 mt-0.5 text-primary shrink-0" />
                    <div>
                      <div className="font-semibold text-foreground flex items-center gap-2">
                        Об'єднати з поточними даними (Merge)
                        <Badge variant="secondary" className="text-[10px] py-0">Рекомендовано</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Безпечно додає нові рахунки та операції, не видаляючи те, що ви вже внесли раніше (з автоматичною дедуплікацією повторів).
                      </p>
                    </div>
                  </div>

                  <div
                    onClick={() => setMode("replace")}
                    className={cn(
                      "p-3 rounded-2xl border text-xs cursor-pointer transition-colors flex items-start gap-3",
                      mode === "replace"
                        ? "bg-destructive/10 border-destructive text-foreground"
                        : "bg-background border-border/60 hover:bg-secondary/40 text-muted-foreground"
                    )}
                  >
                    <AlertCircle className="size-4 mt-0.5 text-destructive shrink-0" />
                    <div>
                      <div className="font-semibold text-foreground">Повністю замінити (Replace)</div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Повністю перезапише базу даних даними з файлу. Корисно при міграції з іншого пристрою або чистому відновленні.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {parseError && (
                <div className="flex items-center gap-2 p-3 rounded-2xl bg-destructive/10 text-destructive text-xs">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1 h-10 rounded-2xl text-xs" onClick={handleCloseModal}>
                  Скасувати
                </Button>
                <Button
                  className="flex-1 h-10 rounded-2xl text-xs font-semibold"
                  disabled={restoring}
                  onClick={handleRestoreConfirm}
                >
                  {restoring ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : null}
                  {restoring ? "Відновлення..." : "Підтвердити відновлення"}
                  {!restoring && <ArrowRight className="size-3.5 ml-1.5" />}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </Sheet>
    </>
  );
}
