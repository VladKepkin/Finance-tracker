"use client";

import { useState, useRef } from "react";
import { UploadCloud, FileText, CheckCircle2, AlertCircle, Plus, CreditCard, ArrowRight, Loader2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { uid, type WalletEntry } from "@/lib/storage";
import type { CashAccount } from "@/lib/cashAccounts";
import { detectAndParseStatement, type ParsedTransaction } from "@/lib/statementImport";
import { cn } from "@/lib/utils";

export function StatementImportModal({
  open,
  onClose,
  accounts,
  onAccountsChange,
  wallet,
  onWalletChange,
  initialAccountId,
}: {
  open: boolean;
  onClose: () => void;
  accounts: CashAccount[];
  onAccountsChange: (list: CashAccount[]) => void;
  wallet: WalletEntry[];
  onWalletChange: (list: WalletEntry[]) => void;
  initialAccountId?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [bankType, setBankType] = useState<"monobank" | "privatbank" | "generic">("generic");
  const [parsedItems, setParsedItems] = useState<ParsedTransaction[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    initialAccountId || accounts[0]?.id || "cash"
  );
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [successCount, setSuccessCount] = useState<number | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setSuccessCount(null);
    setParsing(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text || text.trim().length === 0) {
          setError("Файл порожній");
          setParsing(false);
          return;
        }

        const res = detectAndParseStatement(text);
        if (res.items.length === 0) {
          setError("Не вдалося розпізнати операції у файлі. Перевірте формат CSV.");
          setParsing(false);
          return;
        }

        setBankType(res.bank);
        setParsedItems(res.items);

        // Pre-fill suggested account name if needed
        if (res.bank === "monobank") {
          setNewAccountName("Monobank (Імпорт)");
        } else if (res.bank === "privatbank") {
          setNewAccountName("ПриватБанк (Імпорт)");
        } else {
          setNewAccountName(file.name.replace(/\.[^/.]+$/, ""));
        }
      } catch (err) {
        setError(`Помилка читання файлу: ${(err as Error).message}`);
      } finally {
        setParsing(false);
      }
    };
    reader.onerror = () => {
      setError("Не вдалося прочитати файл");
      setParsing(false);
    };
    reader.readAsText(file, "UTF-8");
  };

  const totalExpense = parsedItems
    .filter((it) => it.kind === "expense")
    .reduce((sum, it) => sum + it.amount, 0);
  const totalIncome = parsedItems
    .filter((it) => it.kind === "income")
    .reduce((sum, it) => sum + it.amount, 0);

  const dates = parsedItems.map((it) => it.date).sort();
  const minDate = dates[0] ?? "";
  const maxDate = dates[dates.length - 1] ?? "";

  const handleImport = () => {
    let targetId = selectedAccountId;

    let updatedAccounts = accounts;
    if (isCreatingAccount) {
      const name = newAccountName.trim() || "Імпортована картка";
      const newAcc: CashAccount = {
        id: uid(),
        name,
        type: "card",
        bankName: bankType === "monobank" ? "Monobank" : bankType === "privatbank" ? "ПриватБанк" : undefined,
        currencyCode: 980,
      };
      targetId = newAcc.id;
      updatedAccounts = [...accounts, newAcc];
      onAccountsChange(updatedAccounts);
    }

    // Deduplication key set: accountId + date + amount + kind + description/source
    const existingKeys = new Set(
      wallet.map((w) => `${w.accountId || "cash"}_${w.date}_${w.amount || 0}_${w.kind}_${w.source || ""}`)
    );

    const newEntries: WalletEntry[] = [];
    for (const it of parsedItems) {
      const key = `${targetId}_${it.date}_${it.amount}_${it.kind}_${it.description}`;
      if (existingKeys.has(key)) continue; // skip duplicates

      newEntries.push({
        id: it.id || uid(),
        date: it.date,
        kind: it.kind,
        amount: it.amount,
        currency: it.currencyCode,
        accountId: targetId,
        source: it.description,
        category: it.categoryKey,
      });
      existingKeys.add(key);
    }

    onWalletChange([...wallet, ...newEntries]);
    setSuccessCount(newEntries.length);
    setParsedItems([]);
    setFileName("");
    setIsCreatingAccount(false);
  };

  const handleClose = () => {
    setError(null);
    setParsedItems([]);
    setFileName("");
    setSuccessCount(null);
    setIsCreatingAccount(false);
    onClose();
  };

  return (
    <Sheet open={open} onClose={handleClose} title="Імпорт банківської виписки">
      <div className="space-y-4">
        {successCount !== null ? (
          <div className="rounded-3xl bg-card p-6 text-center space-y-3 soft-shadow border border-success/30">
            <CheckCircle2 className="size-12 mx-auto text-success" />
            <h3 className="font-display text-lg font-semibold text-foreground">Успішно імпортовано!</h3>
            <p className="text-sm text-muted-foreground">
              Додано <span className="font-bold text-foreground">{successCount}</span> операцій. Баланс та історія оновлені.
            </p>
            <Button className="h-10 rounded-2xl w-full" onClick={handleClose}>
              Готово
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {parsedItems.length === 0 ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-3 bg-secondary/20 hover:bg-secondary/40 hover:border-primary/50",
                  parsing && "opacity-60 pointer-events-none"
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <div className="size-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                  {parsing ? <Loader2 className="size-6 animate-spin" /> : <UploadCloud className="size-6" />}
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Виберіть або перетягніть CSV-файл виписки</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Підтримуються виписки <span className="font-medium text-foreground">Monobank</span>,{" "}
                    <span className="font-medium text-foreground">Приват24</span> та стандартні банківські CSV
                  </p>
                </div>
                <Button variant="outline" size="sm" className="rounded-xl mt-1 pointer-events-none">
                  Обрати файл з пристрою
                </Button>
              </div>
            ) : (
              <div className="space-y-4 rounded-3xl bg-card p-5 soft-shadow border border-border/50">
                <div className="flex items-center justify-between pb-3 border-b border-border/50">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className="size-5 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate text-foreground">{fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {minDate} — {maxDate}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="capitalize text-xs shrink-0">
                    {bankType === "monobank" ? "Monobank" : bankType === "privatbank" ? "ПриватБанк" : "CSV"}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center p-3 rounded-2xl bg-secondary/40">
                  <div>
                    <span className="text-[11px] text-muted-foreground block">Операцій</span>
                    <span className="font-display font-semibold text-sm tabular-nums">{parsedItems.length}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground block">Витрати</span>
                    <span className="font-display font-semibold text-sm text-destructive tabular-nums">
                      -{formatMoney(totalExpense, 980)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground block">Доходи</span>
                    <span className="font-display font-semibold text-sm text-success tabular-nums">
                      +{formatMoney(totalIncome, 980)}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <label className="text-xs font-medium text-foreground block">Зарахувати операції на рахунок:</label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={!isCreatingAccount ? "default" : "outline"}
                      size="sm"
                      className="flex-1 rounded-xl text-xs h-9"
                      onClick={() => setIsCreatingAccount(false)}
                    >
                      Існуючий рахунок
                    </Button>
                    <Button
                      type="button"
                      variant={isCreatingAccount ? "default" : "outline"}
                      size="sm"
                      className="flex-1 rounded-xl text-xs h-9"
                      onClick={() => setIsCreatingAccount(true)}
                    >
                      <Plus className="size-3.5 mr-1" /> Створити нову картку
                    </Button>
                  </div>

                  {!isCreatingAccount ? (
                    <select
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-border bg-background text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.type === "card" ? "💳 " : "💵 "}
                          {acc.name} {acc.maskedPan ? `(•• ${acc.maskedPan})` : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="space-y-1.5 pt-1">
                      <Input
                        value={newAccountName}
                        onChange={(e) => setNewAccountName(e.target.value)}
                        placeholder="Назва нової картки (напр. Чорна Моно)"
                        className="h-10 text-xs rounded-xl"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Буде створено нову картку в списку ваших рахунків з цими операціями.
                      </p>
                    </div>
                  )}
                </div>

                <div className="pt-2 flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 h-11 rounded-2xl text-xs"
                    onClick={() => {
                      setParsedItems([]);
                      setFileName("");
                    }}
                  >
                    Змінити файл
                  </Button>
                  <Button className="flex-1 h-11 rounded-2xl text-xs font-semibold" onClick={handleImport}>
                    Імпортувати <ArrowRight className="size-4 ml-1.5" />
                  </Button>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-2xl bg-destructive/10 text-destructive text-xs">
                <AlertCircle className="size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
