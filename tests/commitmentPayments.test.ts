import { describe, it, expect } from "vitest";
import { computeCommitmentSettlements } from "@/lib/commitmentPayments";
import type { MonoStatementItem } from "@/lib/monobank";
import type { WalletEntry } from "@/lib/storage";

const makeTx = (id: string, amount: number, time: number, desc = "Платіж"): MonoStatementItem => ({
  id,
  time,
  description: desc,
  mcc: 4829,
  originalMcc: 4829,
  amount,
  operationAmount: amount,
  currencyCode: 980,
  commissionRate: 0,
  cashbackAmount: 0,
  balance: 50_000_00,
  hold: false,
});

describe("computeCommitmentSettlements", () => {
  const commitments = [
    { id: 1, name: "Оренда квартири", amount: 10_000_00, currency: 980, cadence: "monthly" as const, anchorDay: 1 },
    { id: 2, name: "Комуналка", amount: 3_000_00, currency: 980, cadence: "monthly" as const, anchorDay: 15 },
  ];

  it("порожні транзакції → всі зобов'язання очікують (не сплачені)", () => {
    const result = computeCommitmentSettlements({
      commitments,
      statement: [],
      wallet: [],
      txCommitments: {},
      periodStart: 1000,
      periodEnd: 5000,
      base: 980,
      rates: [],
      accountCurrency: 980,
    });

    expect(result.settlements.get(1)?.isPaid).toBe(false);
    expect(result.settlements.get(1)?.paidBase).toBe(0);
    expect(result.settlements.get(2)?.isPaid).toBe(false);
    expect(result.commitmentTxIds.size).toBe(0);
    expect(result.commitmentWalletIds.size).toBe(0);
  });

  it("прив'язана транзакція картки в межах періоду → позначає сплаченим", () => {
    // Оплата оренди на 10 400 грн (трохи більше через курс)
    const tx = makeTx("tx_rent_1", -10_400_00, 2000, "Оренда за жовтень");
    const result = computeCommitmentSettlements({
      commitments,
      statement: [tx],
      wallet: [],
      txCommitments: { tx_rent_1: 1 },
      periodStart: 1000,
      periodEnd: 5000,
      base: 980,
      rates: [],
      accountCurrency: 980,
    });

    const rent = result.settlements.get(1);
    expect(rent?.isPaid).toBe(true);
    expect(rent?.paidBase).toBe(10_400_00);
    expect(rent?.paidCount).toBe(1);
    expect(result.commitmentTxIds.has("tx_rent_1")).toBe(true);

    // Комуналка не оплачена
    expect(result.settlements.get(2)?.isPaid).toBe(false);
  });

  it("прив'язаний готівковий запис гаманця → позначає сплаченим", () => {
    const entry: WalletEntry = {
      id: "cash_util_1",
      date: "2026-10-05",
      kind: "expense",
      amount: 2_450_00,
      currency: 980,
      source: "Комуналка за лічильниками",
      commitmentId: 2,
    };

    const periodStart = Math.floor(new Date("2026-10-01T00:00:00Z").getTime() / 1000);
    const periodEnd = Math.floor(new Date("2026-10-31T23:59:59Z").getTime() / 1000);

    const result = computeCommitmentSettlements({
      commitments,
      statement: [],
      wallet: [entry],
      txCommitments: {},
      periodStart,
      periodEnd,
      base: 980,
      rates: [],
      accountCurrency: 980,
    });

    const util = result.settlements.get(2);
    expect(util?.isPaid).toBe(true);
    expect(util?.paidBase).toBe(2_450_00);
    expect(result.commitmentWalletIds.has("cash_util_1")).toBe(true);
  });

  it("транзакція поза межами періоду не вважається оплатою поточного періоду", () => {
    const txOld = makeTx("tx_rent_old", -10_000_00, 500, "Оренда за минулий місяць");
    const result = computeCommitmentSettlements({
      commitments,
      statement: [txOld],
      wallet: [],
      txCommitments: { tx_rent_old: 1 },
      periodStart: 1000,
      periodEnd: 5000,
      base: 980,
      rates: [],
      accountCurrency: 980,
    });

    expect(result.settlements.get(1)?.isPaid).toBe(false);
    expect(result.commitmentTxIds.has("tx_rent_old")).toBe(true); // Still recognized as a commitment tx
  });

  it("хтось інший оплатив (settled_externally) → 0 витрат, але платіж закрито на період", () => {
    const result = computeCommitmentSettlements({
      commitments,
      statement: [],
      wallet: [],
      txCommitments: {},
      commitmentOverrides: {
        1: { periodStart: 1000, status: "settled_externally", note: "Оплатив роботодавець" },
      },
      periodStart: 1000,
      periodEnd: 5000,
      base: 980,
      rates: [],
      accountCurrency: 980,
    });

    const rent = result.settlements.get(1);
    expect(rent?.isPaid).toBe(true);
    expect(rent?.settledExternally).toBe(true);
    expect(rent?.paidBase).toBe(0);
    expect(rent?.remainingReserve).toBe(0);
    expect(rent?.note).toBe("Оплатив роботодавець");
  });

  it("оплата меншою сумою (мобільний 120 замість 320, бо 200 вже було) → закриває зобов'язання і обнуляє резерв", () => {
    const mobile = [{ id: 3, name: "Мобільний зв'язок", amount: 320_00, currency: 980, cadence: "monthly" as const, anchorDay: 10 }];
    const tx = makeTx("tx_mob", -120_00, 2000, "Lifecell 120 грн");

    const result = computeCommitmentSettlements({
      commitments: mobile,
      statement: [tx],
      wallet: [],
      txCommitments: { tx_mob: 3 },
      periodStart: 1000,
      periodEnd: 5000,
      base: 980,
      rates: [],
      accountCurrency: 980,
    });

    const mob = result.settlements.get(3);
    expect(mob?.isPaid).toBe(true);
    expect(mob?.paidBase).toBe(120_00);
    expect(mob?.remainingReserve).toBe(0); // Залишок 200 грн не резервується
  });

  it("оплата частинами (partial_pending) → резервує залишок (10 000 - 3 000 = 7 000)", () => {
    const tx = makeTx("tx_part", -3_000_00, 2000, "Завдаток за оренду");

    const result = computeCommitmentSettlements({
      commitments,
      statement: [tx],
      wallet: [],
      txCommitments: { tx_part: 1 },
      commitmentOverrides: {
        1: { periodStart: 1000, status: "partial_pending" },
      },
      periodStart: 1000,
      periodEnd: 5000,
      base: 980,
      rates: [],
      accountCurrency: 980,
    });

    const rent = result.settlements.get(1);
    expect(rent?.isPaid).toBe(false);
    expect(rent?.paidBase).toBe(3_000_00);
    expect(rent?.remainingReserve).toBe(7_000_00); // 7 000 грн залишається в резерві
  });
});
