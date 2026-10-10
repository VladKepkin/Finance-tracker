"use client";

import { useMemo, useState } from "react";
import { Search, EyeOff, Eye, Star, CreditCard, Banknote, X, SlidersHorizontal, ChevronDown, UploadCloud } from "lucide-react";
import type { MonoStatementItem, MonoAccount } from "@/lib/monobank";
import type { WalletEntry } from "@/lib/storage";
import { type CashAccount, accountDisplay } from "@/lib/cashAccounts";
import { mccToCategory, CATEGORIES } from "@/lib/mcc";
import { formatMoney, pluralUk } from "@/lib/format";
import type { Period } from "@/lib/useMono";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isOwnJarTransfer } from "@/lib/jarTransfers";
import {
  classifyTransaction,
  findPairedTransfers,
  type TxOverrideType,
} from "@/lib/transfers";
import { cn } from "@/lib/utils";
import {
  TransactionDetailsModal,
  type TransactionDetailData,
} from "@/components/TransactionDetailsModal";

export interface UnifiedItem {
  id: string;
  sourceType: "mono" | "cash";
  amount: number; // in minor units, signed: negative for expense, positive for income
  currency: number;
  time: number; // unix timestamp in seconds
  title: string;
  categoryKey: string;
  accountName: string;
  isFake: boolean;
  isHold?: boolean;
  isJarTransfer?: boolean;
  cashbackAmount?: number;
  balance?: number;
  operationAmount?: number;
  mcc?: number;
  originalMcc?: number;
  description?: string;
  rating?: number | null;
  note?: string;
  cashKind?: string;
  cashEntryId?: string;
  overrideType?: TxOverrideType | null;
  classificationKind?: "expense" | "income" | "internal_transfer" | "shared_transit" | "ignored";
  classificationBadge?: { label: string; variant: "default" | "secondary" | "warning" | "outline" | "success" };
  commitmentId?: number | null;
  commitmentName?: string | null;
}

function dayLabel(unix: number): string {
  const d = new Date(unix * 1000);
  const today = new Date();
  const yest = new Date(Date.now() - 86400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Сьогодні";
  if (same(d, yest)) return "Вчора";
  return d.toLocaleDateString("uk-UA", { day: "2-digit", month: "long", weekday: "short" });
}

export function Expenses({
  statement,
  accountCurrency,
  accountName,
  fakeIds,
  onToggleFake,
  ratings,
  onRate,
  jarTitles,
  wallet,
  cashAccounts,
  onDeleteCashEntry,
  txNotes,
  onSaveNote,
  txOverrides,
  onChangeOverride,
  partnerKeywords,
  excludedAccounts,
  commitments,
  txCommitments,
  onLinkCommitment,
  onOpenImport,
  period,
  onChangePeriod,
  selectedAccount,
  onSelectAccount,
  monoAccounts,
}: {
  statement: MonoStatementItem[];
  accountCurrency: number;
  accountName?: string;
  fakeIds: Set<string>;
  onToggleFake: (id: string) => void;
  ratings: Record<string, number> | null;
  onRate: (txId: string, score: number | null) => void;
  jarTitles: readonly string[] | null;
  wallet?: WalletEntry[];
  cashAccounts?: CashAccount[];
  onDeleteCashEntry?: (id: string) => void;
  txNotes?: Record<string, string>;
  onSaveNote?: (id: string, note: string) => void;
  txOverrides?: Record<string, TxOverrideType>;
  onChangeOverride?: (id: string, override: TxOverrideType | null) => void;
  partnerKeywords?: readonly string[];
  excludedAccounts?: readonly string[];
  commitments?: { id: number; name: string; amount: number; currency: number }[];
  txCommitments?: Record<string, number>;
  onLinkCommitment?: (id: string, commitmentId: number | null, sourceType: "mono" | "cash") => void;
  onOpenImport?: () => void;
  period?: Period;
  onChangePeriod?: (p: Period) => void;
  selectedAccount?: string;
  onSelectAccount?: (id: string) => void;
  monoAccounts?: MonoAccount[];
}) {
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "mono" | "cash">("all");
  const [directionFilter, setDirectionFilter] = useState<"all" | "expense" | "income">("expense");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<UnifiedItem | null>(null);

  const pairedIds = useMemo(() => findPairedTransfers(statement), [statement]);

  const monoItems = useMemo<UnifiedItem[]>(() => {
    const context = { fakeIds, txOverrides, jarTitles, excludedAccounts, partnerKeywords };
    return statement.map((it) => {
      const cat = mccToCategory(it.mcc, it.amount);
      const classification = classifyTransaction(it, context, pairedIds);
      const isJar = classification.isOwnJar;
      const isFake = classification.isExcluded;
      const rating = ratings ? (ratings[it.id] ?? null) : null;
      const note = txNotes ? txNotes[it.id] : undefined;
      return {
        id: it.id,
        sourceType: "mono",
        amount: it.amount,
        currency: accountCurrency,
        time: it.time,
        title: it.description || cat.label,
        description: it.description,
        categoryKey: cat.key,
        accountName: accountName || "Монобанк",
        isFake,
        isHold: it.hold,
        isJarTransfer: isJar,
        cashbackAmount: it.cashbackAmount,
        balance: it.balance,
        operationAmount: it.operationAmount,
        mcc: it.mcc,
        originalMcc: it.originalMcc,
        rating,
        note,
        overrideType: txOverrides?.[it.id] ?? null,
        classificationKind: classification.kind,
        classificationBadge: classification.badge,
        commitmentId: txCommitments?.[it.id] ?? null,
        commitmentName: txCommitments?.[it.id]
          ? commitments?.find((c) => c.id === txCommitments[it.id])?.name ?? null
          : null,
      };
    });
  }, [statement, accountCurrency, accountName, fakeIds, ratings, txNotes, jarTitles, txOverrides, excludedAccounts, partnerKeywords, pairedIds, txCommitments, commitments]);

  const cashItems = useMemo<UnifiedItem[]>(() => {
    if (!wallet || wallet.length === 0) return [];
    return wallet.map((e) => {
      const acc = accountDisplay(e.accountId, cashAccounts || []);
      let amt = 0;
      let title = e.source || "Готівкова операція";
      let catKey = e.category || "other";
      const cur = e.currency ?? accountCurrency;

      switch (e.kind) {
        case "expense":
          amt = -(e.amount ?? 0);
          title = e.source || "Готівкова витрата";
          catKey = e.category || "other";
          break;
        case "income":
          amt = +(e.amount ?? 0);
          title = e.source || "Готівковий дохід";
          catKey = "income";
          break;
        case "topup":
          amt = -(e.amount ?? 0);
          title = e.source || "Поповнення картки готівкою";
          catKey = "transfers";
          break;
        case "withdraw":
          amt = +(e.amount ?? 0);
          title = e.source || "Зняття готівки";
          catKey = "atm";
          break;
        case "convert":
          amt = +(e.toAmount ?? 0);
          title = "Обмін валют";
          catKey = "transfers";
          break;
        case "transfer": {
          const fromAcc = accountDisplay(e.fromAccountId, cashAccounts || []);
          const toAcc = accountDisplay(e.toAccountId, cashAccounts || []);
          amt = -(e.amount ?? 0);
          title = `${fromAcc.name} → ${toAcc.name}`;
          catKey = "transfers";
          break;
        }
      }

      const time = Math.floor(new Date(`${e.date}T12:00:00`).getTime() / 1000);
      const note = txNotes ? txNotes[e.id] : undefined;

      return {
        id: e.id,
        sourceType: "cash",
        amount: amt,
        currency: cur,
        time: Number.isNaN(time) ? Math.floor(Date.now() / 1000) : time,
        title,
        description: e.source,
        categoryKey: catKey,
        accountName: acc.name,
        isFake: false,
        rating: ratings ? (ratings[e.id] ?? null) : null,
        note,
        cashKind: e.kind,
        cashEntryId: e.id,
        commitmentId: e.commitmentId ?? null,
        commitmentName: e.commitmentId
          ? commitments?.find((c) => c.id === e.commitmentId)?.name ?? null
          : null,
      };
    });
  }, [wallet, cashAccounts, accountCurrency, ratings, txNotes, commitments]);

  const allItems = useMemo(() => {
    const list = [...monoItems, ...cashItems];
    return list.sort((a, b) => b.time - a.time);
  }, [monoItems, cashItems]);

  const usedCategories = useMemo(() => {
    const set = new Set<string>();
    for (const it of allItems) set.add(it.categoryKey);
    return [...set];
  }, [allItems]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allItems.filter((it) => {
      if (sourceFilter === "mono" && it.sourceType !== "mono") return false;
      if (sourceFilter === "cash" && it.sourceType !== "cash") return false;

      if (directionFilter === "expense" && it.amount >= 0) return false;
      if (directionFilter === "income" && it.amount < 0) return false;

      if (catFilter !== "all" && it.categoryKey !== catFilter) return false;

      if (q) {
        const catObj = CATEGORIES[it.categoryKey];
        const matchTitle = it.title.toLowerCase().includes(q);
        const matchDesc = it.description?.toLowerCase().includes(q);
        const matchCatLabel = catObj?.label.toLowerCase().includes(q);
        const matchCatKey = it.categoryKey.toLowerCase().includes(q);
        const matchAcc = it.accountName.toLowerCase().includes(q);
        const matchMcc = it.mcc ? String(it.mcc).includes(q) : false;
        const matchNote = it.note?.toLowerCase().includes(q);
        const matchAmt = (Math.abs(it.amount) / 100).toString().includes(q);

        if (!matchTitle && !matchDesc && !matchCatLabel && !matchCatKey && !matchAcc && !matchMcc && !matchNote && !matchAmt) {
          return false;
        }
      }

      return true;
    });
  }, [allItems, sourceFilter, directionFilter, catFilter, query]);

  const periodTotal = useMemo(() => {
    return filtered
      .filter((it) => it.amount < 0 && !it.isFake && !it.isJarTransfer)
      .reduce((sum, it) => sum + Math.abs(it.amount), 0);
  }, [filtered]);

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: UnifiedItem[]; total: number }>();
    for (const it of filtered) {
      const key = new Date(it.time * 1000).toDateString();
      let g = map.get(key);
      if (!g) {
        g = { label: dayLabel(it.time), items: [], total: 0 };
        map.set(key, g);
      }
      g.items.push(it);
      if (it.amount < 0 && !it.isFake && !it.isJarTransfer) {
        g.total += Math.abs(it.amount);
      }
    }
    return [...map.values()];
  }, [filtered]);

  const handleRowClick = (item: UnifiedItem) => {
    setSelectedTx(item);
  };

  const handleToggleFake = (id: string) => {
    onToggleFake(id);
    if (selectedTx && selectedTx.id === id) {
      setSelectedTx({ ...selectedTx, isFake: !selectedTx.isFake });
    }
  };

  const handleRate = (id: string, score: number | null) => {
    onRate(id, score);
    if (selectedTx && selectedTx.id === id) {
      setSelectedTx({ ...selectedTx, rating: score });
    }
  };

  const handleSaveNote = (id: string, note: string) => {
    if (onSaveNote) {
      onSaveNote(id, note);
      if (selectedTx && selectedTx.id === id) {
        setSelectedTx({ ...selectedTx, note });
      }
    }
  };

  const hasActiveFilters =
    sourceFilter !== "all" || directionFilter !== "expense" || catFilter !== "all";

  return (
    <div className="animate-in fade-in duration-300 space-y-4">
      {/* Фільтри та панель пошуку */}
      <Card className="border shadow-xs">
        <CardContent className="space-y-3 p-3.5 sm:p-4">
          {/* Верхній рядок: Пошук + Кнопка зі стрілочкою для фільтрів */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Пошук операцій, категорій, сум…"
                className="h-10 pl-10 pr-9 text-sm"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            <Button
              type="button"
              variant={hasActiveFilters ? "default" : "secondary"}
              onClick={() => setFiltersOpen(!filtersOpen)}
              className={cn(
                "h-10 px-3 rounded-xl gap-1.5 font-medium shrink-0 transition-all",
                filtersOpen && "ring-2 ring-primary/20"
              )}
              title={filtersOpen ? "Згорнути фільтри" : "Розгорнути фільтри"}
              aria-label={filtersOpen ? "Згорнути фільтри" : "Розгорнути фільтри"}
            >
              <SlidersHorizontal className="size-4 shrink-0" />
              <span className="hidden sm:inline text-xs">Фільтри</span>
              <ChevronDown
                className={cn(
                  "size-4 text-muted-foreground transition-transform duration-200 shrink-0",
                  filtersOpen && "rotate-180 text-foreground",
                  hasActiveFilters && !filtersOpen && "text-primary-foreground"
                )}
              />
              {hasActiveFilters && !filtersOpen && (
                <span className="flex size-2 rounded-full bg-primary ring-2 ring-background" />
              )}
            </Button>

            {onOpenImport && (
              <Button
                type="button"
                variant="outline"
                onClick={onOpenImport}
                className="h-10 px-3 rounded-xl gap-1.5 font-medium shrink-0 border-border/80 hover:bg-card"
                title="Імпорт банківської виписки CSV"
                aria-label="Імпорт банківської виписки CSV"
              >
                <UploadCloud className="size-4 text-primary shrink-0" />
                <span className="hidden sm:inline text-xs">Імпорт CSV</span>
              </Button>
            )}
          </div>

          {/* Якщо фільтри згорнуті, але є активні або пошук - показуємо компактні теги */}
          {!filtersOpen && (hasActiveFilters || query) && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5 animate-in fade-in duration-200">
              <span className="text-[11px] text-muted-foreground">Активно:</span>
              {sourceFilter !== "all" && (
                <Badge
                  variant="secondary"
                  className="cursor-pointer gap-1 text-[11px] hover:bg-destructive/15"
                  onClick={() => setSourceFilter("all")}
                >
                  {sourceFilter === "mono" ? "💳 Картка" : "💵 Готівка"} <X className="size-2.5" />
                </Badge>
              )}
              {directionFilter !== "expense" && (
                <Badge
                  variant="secondary"
                  className="cursor-pointer gap-1 text-[11px] hover:bg-destructive/15"
                  onClick={() => setDirectionFilter("expense")}
                >
                  {directionFilter === "income" ? "Надходження" : "Усі операції"} <X className="size-2.5" />
                </Badge>
              )}
              {catFilter !== "all" && (
                <Badge
                  variant="secondary"
                  className="cursor-pointer gap-1 text-[11px] hover:bg-destructive/15"
                  onClick={() => setCatFilter("all")}
                >
                  {CATEGORIES[catFilter]?.emoji} {CATEGORIES[catFilter]?.label ?? catFilter} <X className="size-2.5" />
                </Badge>
              )}
              {query && (
                <Badge
                  variant="secondary"
                  className="cursor-pointer gap-1 text-[11px] hover:bg-destructive/15"
                  onClick={() => setQuery("")}
                >
                  &ldquo;{query}&rdquo; <X className="size-2.5" />
                </Badge>
              )}
              <button
                type="button"
                onClick={() => {
                  setSourceFilter("all");
                  setDirectionFilter("expense");
                  setCatFilter("all");
                  setQuery("");
                }}
                className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-4 hover:underline ml-1"
              >
                Очистити
              </button>
            </div>
          )}

          {/* Розгорнута панель фільтрів */}
          {filtersOpen && (
            <div className="space-y-3 pt-2 border-t animate-in fade-in slide-in-from-top-2 duration-200">
              {/* Фільтри джерела та напрямку */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Джерело */}
                <div className="flex items-center gap-1 rounded-xl bg-secondary p-1">
                  <FilterChip
                    active={sourceFilter === "all"}
                    onClick={() => setSourceFilter("all")}
                  >
                    Всі рахунки
                  </FilterChip>
                  <FilterChip
                    active={sourceFilter === "mono"}
                    onClick={() => setSourceFilter("mono")}
                  >
                    <CreditCard className="size-3 text-primary shrink-0" /> Картка
                  </FilterChip>
                  <FilterChip
                    active={sourceFilter === "cash"}
                    onClick={() => setSourceFilter("cash")}
                  >
                    <Banknote className="size-3 text-success shrink-0" /> Готівка
                  </FilterChip>
                </div>

                <div className="hidden sm:block h-6 w-px bg-border" />

                {/* Напрямок */}
                <div className="flex items-center gap-1 rounded-xl bg-secondary p-1">
                  <FilterChip
                    active={directionFilter === "expense"}
                    onClick={() => setDirectionFilter("expense")}
                  >
                    Витрати
                  </FilterChip>
                  <FilterChip
                    active={directionFilter === "income"}
                    onClick={() => setDirectionFilter("income")}
                  >
                    Надходження
                  </FilterChip>
                  <FilterChip
                    active={directionFilter === "all"}
                    onClick={() => setDirectionFilter("all")}
                  >
                    Усі
                  </FilterChip>
                </div>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setSourceFilter("all");
                      setDirectionFilter("expense");
                      setCatFilter("all");
                    }}
                    className="ml-auto text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                  >
                    Скинути фільтри
                  </button>
                )}
              </div>

              {/* Горизонтальна стрічка категорій */}
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-muted-foreground">Категорії:</div>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
                  <button
                    type="button"
                    onClick={() => setCatFilter("all")}
                    className={cn(
                      "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all",
                      catFilter === "all"
                        ? "bg-foreground text-background font-semibold shadow-xs"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Всі категорії
                  </button>
                  {usedCategories.map((k) => {
                    const c = CATEGORIES[k];
                    const active = catFilter === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setCatFilter(k)}
                        className={cn(
                          "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all",
                          active
                            ? "bg-foreground text-background font-semibold shadow-xs"
                            : "bg-secondary text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <span>{c?.emoji ?? "📦"}</span>
                        <span>{c?.label ?? k}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Вибір періоду */}
              {onChangePeriod && (
                <div className="space-y-1.5 pt-1 border-t border-border/40">
                  <div className="text-[11px] font-medium text-muted-foreground">Період виписки:</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { key: "month", label: "Поточний місяць" },
                        { key: "prev", label: "Минулий" },
                        { key: "7d", label: "7 днів" },
                        { key: "year", label: "Цей рік" },
                        { key: "all", label: "Увесь час (всі операції)" },
                      ] as const
                    ).map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => onChangePeriod(p.key)}
                        className={cn(
                          "px-3 py-1 rounded-full text-xs font-medium transition-all",
                          period === p.key
                            ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                            : "bg-secondary text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Вибір картки Monobank */}
              {onSelectAccount && monoAccounts && monoAccounts.length > 1 && (
                <div className="space-y-1.5 pt-1 border-t border-border/40">
                  <div className="text-[11px] font-medium text-muted-foreground">Картка Monobank:</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onSelectAccount("all")}
                      className={cn(
                        "px-3 py-1 rounded-full text-xs font-medium transition-all",
                        selectedAccount === "all" || !selectedAccount
                          ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                          : "bg-secondary text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Усі картки разом
                    </button>
                    {monoAccounts.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => onSelectAccount(a.id)}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all",
                          selectedAccount === a.id
                            ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                            : "bg-secondary text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <CreditCard className="size-3" />
                        <span>{a.maskedPan?.[0] ? `•• ${a.maskedPan[0].slice(-4)}` : a.type}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Плашка підсумку за період */}
          <div className="flex items-center justify-between rounded-xl bg-secondary/70 px-3.5 py-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs sm:text-sm">
                Витрат за вибіркою ({filtered.length}{" "}
                {pluralUk(filtered.length, "операція", "операції", "операцій")}):
              </span>
              {onChangePeriod && period !== "all" && (
                <button
                  type="button"
                  onClick={() => onChangePeriod("all")}
                  className="text-[11px] text-primary hover:underline font-medium hidden sm:inline"
                >
                  (за весь час →)
                </button>
              )}
            </div>
            <span className="font-bold tabular-nums font-display tracking-tight text-foreground">
              −{formatMoney(periodTotal, accountCurrency)}
            </span>
          </div>

          {jarTitles === null && (
            <p className="text-[11px] text-muted-foreground">
              Список банок недоступний — перекази у власні банки пораховані як витрати.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Порожній стан */}
      {filtered.length === 0 && (
        <Card className="border border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground space-y-2">
            <div className="text-2xl">🔍</div>
            <div className="font-semibold text-foreground">Операцій не знайдено</div>
            <p className="text-xs max-w-xs mx-auto">
              Спробуйте змінити пошуковий запит або обрати іншу категорію чи тип рахунку.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Групований список за днями */}
      {groups.map((g) => (
        <div key={g.label} className="space-y-1.5">
          <div className="flex items-center justify-between px-2 text-xs">
            <span className="font-semibold text-muted-foreground">{g.label}</span>
            {g.total > 0 && (
              <span className="tabular-nums font-medium text-muted-foreground">
                −{formatMoney(g.total, accountCurrency)}
              </span>
            )}
          </div>

          <Card className="overflow-hidden border shadow-xs py-0 gap-0">
            <CardContent className="divide-y p-0">
              {g.items.map((it) => (
                <UnifiedRow
                  key={it.id}
                  it={it}
                  cc={accountCurrency}
                  onClick={() => handleRowClick(it)}
                  onToggleFake={() => handleToggleFake(it.id)}
                />
              ))}
            </CardContent>
          </Card>
        </div>
      ))}

      {/* Підказка внизу */}
      <div className="rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground flex items-start gap-2">
        <span className="text-base leading-none">💡</span>
        <p className="leading-relaxed">
          Натисніть на будь-яку транзакцію, щоб відкрити <strong>детальний чек</strong> у стилі Monobank/Дія,
          додати власну замітку, оцінити радість від покупки або виключити її з денного ліміту.
        </p>
      </div>

      {/* Модалка чека деталей транзакції */}
      <TransactionDetailsModal
        item={selectedTx}
        open={selectedTx !== null}
        onClose={() => setSelectedTx(null)}
        onToggleFake={handleToggleFake}
        onRate={handleRate}
        onSaveNote={handleSaveNote}
        onDeleteCashEntry={onDeleteCashEntry}
        onChangeOverride={onChangeOverride}
        commitments={commitments}
        onLinkCommitment={(id, cId, sType) => {
          if (onLinkCommitment) {
            onLinkCommitment(id, cId, sType);
            if (selectedTx && selectedTx.id === id) {
              const cName = cId ? commitments?.find((c) => c.id === cId)?.name ?? null : null;
              setSelectedTx({ ...selectedTx, commitmentId: cId, commitmentName: cName });
            }
          }
        }}
      />
    </div>
  );
}

function UnifiedRow({
  it,
  cc,
  onClick,
  onToggleFake,
}: {
  it: UnifiedItem;
  cc: number;
  onClick: () => void;
  onToggleFake: () => void;
}) {
  const c = CATEGORIES[it.categoryKey] ?? {
    key: "other",
    label: "Інше",
    emoji: "📦",
    color: "#9ca3af",
  };
  const isExpense = it.amount < 0;
  const time = new Date(it.time * 1000).toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className={cn(
        "group flex items-center gap-3 px-3.5 py-3 transition-colors cursor-pointer hover:bg-muted/40 active:bg-muted/60 text-left",
        it.isFake && "opacity-45"
      )}
    >
      {/* Іконка категорії */}
      <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-secondary text-lg shadow-xs group-hover:scale-105 transition-transform">
        {c.emoji}
      </div>

      {/* Опис та метаінформація */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "truncate text-sm font-semibold text-foreground",
              it.isFake && "line-through text-muted-foreground"
            )}
          >
            {it.title}
          </span>
          {it.rating ? (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-warning/15 px-1.5 py-0.2 text-[10px] font-semibold text-warning"
              title={`Оцінка радості: ${it.rating} з 5`}
            >
              <Star className="size-2.5 fill-warning text-warning" />
              {it.rating}
            </span>
          ) : null}
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">
            {c.label} · {time}
          </span>
          <span className="text-muted-foreground/50">•</span>
          <span className="inline-flex items-center gap-1 font-medium text-foreground/75">
            {it.sourceType === "mono" ? (
              <CreditCard className="size-3 text-primary shrink-0" />
            ) : (
              <Banknote className="size-3 text-success shrink-0" />
            )}
            <span className="truncate max-w-[120px]">{it.accountName}</span>
          </span>

          {it.isHold && (
            <Badge variant="outline" className="shrink-0 py-0 text-[10px]">
              hold
            </Badge>
          )}
          {it.classificationBadge ? (
            <Badge variant={it.classificationBadge.variant} className="shrink-0 py-0 text-[10px]">
              {it.classificationBadge.label}
            </Badge>
          ) : it.isFake ? (
            <Badge variant="warning" className="shrink-0 py-0 text-[10px] gap-1">
              <EyeOff className="size-2.5" /> фейк
            </Badge>
          ) : null}
          {it.isJarTransfer && !it.classificationBadge && (
            <Badge variant="secondary" className="shrink-0 py-0 text-[10px]">
              у банку
            </Badge>
          )}
          {it.commitmentName && (
            <Badge variant="outline" className="shrink-0 py-0 text-[10px] gap-1 border-primary/40 text-primary font-medium">
              🗓️ {it.commitmentName}
            </Badge>
          )}
          {it.note && (
            <span className="inline-flex items-center gap-1 truncate max-w-[130px] rounded-md bg-secondary/90 px-1.5 py-0.2 text-[10px] font-medium text-foreground">
              📝 {it.note}
            </span>
          )}
        </div>
      </div>

      {/* Сума та кешбек */}
      <div className="text-right shrink-0">
        <div
          className={cn(
            "text-sm font-bold tabular-nums tracking-tight font-display",
            it.isFake && "line-through opacity-70",
            !isExpense && !it.isFake && "text-success"
          )}
        >
          {isExpense ? "−" : "+"}
          {formatMoney(Math.abs(it.amount), it.currency || cc)}
        </div>
        {it.cashbackAmount && it.cashbackAmount > 0 && !it.isFake ? (
          <div className="text-[11px] font-medium text-success">
            +{formatMoney(it.cashbackAmount, it.currency || cc)} кб
          </div>
        ) : null}
      </div>

      {/* Швидка кнопка виключення з бюджету (для картки) */}
      {it.sourceType === "mono" && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFake();
          }}
          title={
            it.isFake
              ? "Повернути в підрахунки бюджету"
              : "Виключити з бюджету (зробити фейковою)"
          }
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-xl transition-colors",
            it.isFake
              ? "text-warning bg-warning/15 hover:bg-warning/25"
              : "text-muted-foreground/50 hover:text-foreground hover:bg-secondary"
          )}
        >
          {it.isFake ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all",
        active
          ? "bg-background text-foreground shadow-xs"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
