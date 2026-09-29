import { describe, it, expect } from "vitest";
import { accountBalances, entriesForAccount } from "@/lib/home/accountEntries";
import { moneyParts } from "@/lib/format";
import type { WalletEntry } from "@/lib/storage";
import type { CashAccount } from "@/lib/cashAccounts";

const accounts: CashAccount[] = [
  { id: "cash", name: "Готівка" },
  { id: "home", name: "Вдома" },
];

const wallet: WalletEntry[] = [
  { id: "1", date: "2026-09-01", kind: "income", amount: 500_000, currency: 980 },
  { id: "2", date: "2026-09-03", kind: "transfer", amount: 200_000, currency: 980, fromAccountId: "cash", toAccountId: "home" },
  { id: "3", date: "2026-09-02", kind: "expense", amount: 10_000, currency: 980, accountId: "home" },
  { id: "4", date: "2026-09-04", kind: "income", amount: 5_000, currency: 840, accountId: "gone" },
];

describe("accountBalances", () => {
  it("splits balances per account and moves transfers between them", () => {
    const { byAccount } = accountBalances(wallet, accounts);
    expect(byAccount.home).toEqual({ 980: 190_000 });
    expect(byAccount.cash[980]).toBe(300_000);
  });

  it("folds entries of a deleted account into the default one and says so", () => {
    const r = accountBalances(wallet, accounts);
    expect(r.byAccount.cash[840]).toBe(5_000);
    expect(r.byAccount.gone).toBeUndefined();
    expect(r.orphansFolded).toBe(true);
  });

  it("reports no folding when every account is known", () => {
    expect(accountBalances(wallet.slice(0, 3), accounts).orphansFolded).toBe(false);
  });
});

describe("entriesForAccount", () => {
  it("includes transfers on both sides, newest first", () => {
    expect(entriesForAccount(wallet, "home", accounts).map((e) => e.id)).toEqual(["2", "3"]);
  });

  it("default account also lists entries of deleted accounts", () => {
    expect(entriesForAccount(wallet, "cash", accounts).map((e) => e.id)).toEqual(["4", "2", "1"]);
  });
});

describe("moneyParts", () => {
  it("splits whole part and kopecks", () => {
    const p = moneyParts(124_005, 980);
    expect(p.whole.replace(/\s/g, " ")).toBe("1 240");
    expect(p).toMatchObject({ fraction: ",05", symbol: "₴", negative: false });
  });

  it("marks negative amounts without a minus inside the digits", () => {
    const p = moneyParts(-30_000, 840);
    expect(p).toMatchObject({ negative: true, whole: "300", fraction: ",00", symbol: "$" });
  });
});
