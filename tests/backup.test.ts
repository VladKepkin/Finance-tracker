import { describe, it, expect } from "vitest";
import { parseCashAccounts, isValidCashAccount, type CashAccount } from "@/lib/cashAccounts";
import type { WalletEntry } from "@/lib/storage";

describe("backup & restore data structures", () => {
  it("merges cash accounts without duplicates by name or id", () => {
    const existingAccounts: CashAccount[] = [
      { id: "cash", name: "Готівка", type: "cash" },
      { id: "acc_mono", name: "Monobank Black", type: "card", bankName: "Monobank" },
    ];

    const backupAccounts: unknown[] = [
      { id: "cash", name: "Готівка", type: "cash" },
      { id: "acc_mono_old", name: "monobank black", type: "card" }, // duplicate by lowercase name
      { id: "acc_privat", name: "Приват24", type: "card", bankName: "ПриватБанк" },
    ];

    const merged = [...existingAccounts];
    const knownNames = new Set(merged.map((a) => a.name.toLowerCase().trim()));
    const knownIds = new Set(merged.map((a) => a.id));

    for (const raw of backupAccounts) {
      if (isValidCashAccount(raw)) {
        if (!knownIds.has(raw.id) && !knownNames.has(raw.name.toLowerCase().trim())) {
          merged.push(raw);
          knownNames.add(raw.name.toLowerCase().trim());
          knownIds.add(raw.id);
        }
      }
    }

    expect(merged.length).toBe(3);
    expect(merged.map((a) => a.name)).toEqual(["Готівка", "Monobank Black", "Приват24"]);
  });

  it("merges wallet entries safely with deduplication", () => {
    const currentWallet: WalletEntry[] = [
      {
        id: "w1",
        date: "2026-10-12",
        amount: 25000,
        kind: "expense",
        accountId: "cash",
        source: "Сільпо",
      },
    ];

    const backupWallet: WalletEntry[] = [
      {
        id: "w_dup",
        date: "2026-10-12",
        amount: 25000,
        kind: "expense",
        accountId: "cash",
        source: "Сільпо", // duplicate
      },
      {
        id: "w2",
        date: "2026-10-12",
        amount: 5000,
        kind: "expense",
        accountId: "cash",
        source: "Кава", // new
      },
    ];

    const existingKeys = new Set(
      currentWallet.map((w) => `${w.accountId || "cash"}_${w.date}_${w.amount || 0}_${w.kind}_${w.source || ""}`)
    );
    const merged = [...currentWallet];

    for (const w of backupWallet) {
      const key = `${w.accountId || "cash"}_${w.date}_${w.amount || 0}_${w.kind}_${w.source || ""}`;
      if (!existingKeys.has(key)) {
        merged.push(w);
        existingKeys.add(key);
      }
    }

    expect(merged.length).toBe(2);
    expect(merged[0].source).toBe("Сільпо");
    expect(merged[1].source).toBe("Кава");
  });

  it("merges ratings safely with deduplication", () => {
    const currentRatings = [
      { tx_id: "tx_1", score: 5, created_at: 1000 },
      { tx_id: "tx_2", score: 3, created_at: 1001 },
    ];
    const backupRatings = [
      { txId: "tx_2", score: 4 },
      { txId: "tx_3", score: 5 },
      { txId: "invalid", score: 10 },
    ];

    const existingRatings = new Set(currentRatings.map((r) => r.tx_id));
    const merged = [...currentRatings];
    for (const r of backupRatings) {
      if (
        r &&
        typeof r.txId === "string" &&
        typeof r.score === "number" &&
        r.score >= 1 &&
        r.score <= 5 &&
        !existingRatings.has(r.txId)
      ) {
        merged.push({ tx_id: r.txId, score: r.score, created_at: 1002 });
        existingRatings.add(r.txId);
      }
    }

    expect(merged.length).toBe(3);
    expect(merged.map((r) => r.tx_id)).toEqual(["tx_1", "tx_2", "tx_3"]);
    expect(merged.find((r) => r.tx_id === "tx_2")?.score).toBe(3);
  });
});
