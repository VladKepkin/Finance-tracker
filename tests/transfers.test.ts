import { describe, it, expect } from "vitest";
import {
  classifyTransaction,
  findPairedTransfers,
  isEffectiveExpense,
  isEffectiveIncome,
  isInternalDescription,
  isSharedTransitMatch,
} from "@/lib/transfers";
import type { MonoStatementItem } from "@/lib/monobank";

function makeItem(partial: Partial<MonoStatementItem>): MonoStatementItem {
  return {
    id: "tx-1",
    time: 1700000000,
    description: "Сільпо",
    mcc: 5411,
    originalMcc: 5411,
    hold: false,
    amount: -15000,
    operationAmount: -15000,
    currencyCode: 980,
    commissionRate: 0,
    cashbackAmount: 0,
    balance: 500000,
    ...partial,
  };
}

describe("lib/transfers.ts", () => {
  describe("isInternalDescription", () => {
    it("recognizes Ukrainian descriptions for transfers between own cards", () => {
      expect(isInternalDescription("Переказ на свою картку")).toBe(true);
      expect(isInternalDescription("Переказ зі своєї картки")).toBe(true);
      expect(isInternalDescription("З власної картки")).toBe(true);
      expect(isInternalDescription("На власну картку")).toBe(true);
      expect(isInternalDescription("Переказ між своїми картками")).toBe(true);
      expect(isInternalDescription("Поповнення своєї картки")).toBe(true);
    });

    it("rejects non-internal descriptions", () => {
      expect(isInternalDescription("Сільпо")).toBe(false);
      expect(isInternalDescription("Переказ від Івана Іванова")).toBe(false);
      expect(isInternalDescription("Оплата хостингу")).toBe(false);
      expect(isInternalDescription(null)).toBe(false);
    });
  });

  describe("isSharedTransitMatch", () => {
    it("matches shared budget keywords in comments or descriptions", () => {
      const item = makeItem({
        mcc: 4829,
        description: "Переказ на картку",
        comment: "на спільне господарство",
      });
      expect(isSharedTransitMatch(item)).toBe(true);
    });

    it("matches custom partner keywords", () => {
      const item = makeItem({
        mcc: 4829,
        description: "Переказ Катерині",
        counterName: "Катерина С.",
      });
      expect(isSharedTransitMatch(item, ["катерина"])).toBe(true);
    });
  });

  describe("findPairedTransfers", () => {
    it("matches paired debits and credits within 30 minutes", () => {
      const t1 = makeItem({
        id: "tx-out",
        accountId: "acc-black",
        amount: -500000,
        time: 1700000100,
        mcc: 4829,
        description: "Переказ",
      });
      const t2 = makeItem({
        id: "tx-in",
        accountId: "acc-white",
        amount: 500000,
        time: 1700000160,
        mcc: 4829,
        description: "Поповнення картки",
      });

      const paired = findPairedTransfers([t1, t2]);
      expect(paired.has("tx-out")).toBe(true);
      expect(paired.has("tx-in")).toBe(true);
    });

    it("does not match if timestamps are hours apart", () => {
      const t1 = makeItem({
        id: "tx-out",
        accountId: "acc-black",
        amount: -500000,
        time: 1700000000,
        mcc: 4829,
      });
      const t2 = makeItem({
        id: "tx-in",
        accountId: "acc-white",
        amount: 500000,
        time: 1700010000, // 10,000s later (>30m)
        mcc: 4829,
      });

      const paired = findPairedTransfers([t1, t2]);
      expect(paired.size).toBe(0);
    });
  });

  describe("classifyTransaction and isEffectiveExpense", () => {
    it("treats normal purchase as effective expense", () => {
      const item = makeItem({ amount: -25000, description: "АТБ", mcc: 5411 });
      const c = classifyTransaction(item);
      expect(c.kind).toBe("expense");
      expect(c.isInternalTransfer).toBe(false);
      expect(c.isExcluded).toBe(false);
      expect(isEffectiveExpense(item)).toBe(true);
    });

    it("excludes internal card transfers from expenses", () => {
      const item = makeItem({
        amount: -500000,
        description: "Переказ на свою картку",
        mcc: 4829,
      });
      const c = classifyTransaction(item);
      expect(c.kind).toBe("internal_transfer");
      expect(c.isInternalTransfer).toBe(true);
      expect(isEffectiveExpense(item)).toBe(false);
    });

    it("excludes transfers to own jars from expenses", () => {
      const item = makeItem({
        amount: -100000,
        description: "Поповнення «Накопичення»",
        mcc: 4829,
      });
      const c = classifyTransaction(item, { jarTitles: ["Накопичення"] });
      expect(c.kind).toBe("internal_transfer");
      expect(c.isOwnJar).toBe(true);
      expect(isEffectiveExpense(item, { jarTitles: ["Накопичення"] })).toBe(false);
    });

    it("excludes operations from excluded accounts (e.g. FOP)", () => {
      const item = makeItem({
        accountId: "acc-fop",
        amount: -120000,
        description: "Податок ФОП",
      });
      const c = classifyTransaction(item, { excludedAccounts: ["acc-fop"] });
      expect(c.isExcluded).toBe(true);
      expect(c.badge?.label).toBe("💼 ФОП");
      expect(isEffectiveExpense(item, { excludedAccounts: ["acc-fop"] })).toBe(false);
    });

    it("respects manual user overrides", () => {
      const item = makeItem({ id: "tx-custom", amount: -20000, description: "Сільпо" });

      // Override to internal_transfer
      expect(
        classifyTransaction(item, { txOverrides: { "tx-custom": "internal_transfer" } }).kind
      ).toBe("internal_transfer");
      expect(
        isEffectiveExpense(item, { txOverrides: { "tx-custom": "internal_transfer" } })
      ).toBe(false);

      // Override to shared_transit
      expect(
        classifyTransaction(item, { txOverrides: { "tx-custom": "shared_transit" } }).kind
      ).toBe("shared_transit");
      expect(
        isEffectiveExpense(item, { txOverrides: { "tx-custom": "shared_transit" } })
      ).toBe(false);

      // Override to ignored
      expect(
        classifyTransaction(item, { txOverrides: { "tx-custom": "ignored" } }).kind
      ).toBe("ignored");
      expect(
        isEffectiveExpense(item, { txOverrides: { "tx-custom": "ignored" } })
      ).toBe(false);

      // Override to expense
      const transferItem = makeItem({
        id: "tx-override-exp",
        amount: -50000,
        description: "Переказ на свою картку",
      });
      expect(
        classifyTransaction(transferItem, { txOverrides: { "tx-override-exp": "expense" } }).kind
      ).toBe("expense");
      expect(
        isEffectiveExpense(transferItem, { txOverrides: { "tx-override-exp": "expense" } })
      ).toBe(true);
    });

    it("excludes internal incoming transfers from effective income", () => {
      const inTransfer = makeItem({
        amount: 500000,
        description: "Переказ зі своєї картки",
        mcc: 4829,
      });
      expect(isEffectiveIncome(inTransfer)).toBe(false);

      const realSalary = makeItem({
        amount: 6000000,
        description: "Зарахування зарплати",
        mcc: 0,
      });
      expect(isEffectiveIncome(realSalary)).toBe(true);
    });
  });
});
