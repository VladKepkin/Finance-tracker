import { describe, it, expect } from "vitest";
import { analyze, cashBalances, cashBalancesByAccount } from "@/lib/analytics";
import type { MonoStatementItem } from "@/lib/monobank";
import type { WalletEntry } from "@/lib/storage";

const DAY = 86_400;
const NOW = Date.UTC(2024, 6, 16) / 1000;

function tx(
  id: string,
  time: number,
  amount: number,
  opts: { mcc?: number; description?: string } = {}
): MonoStatementItem {
  return {
    id,
    time,
    description: opts.description ?? "Тест",
    mcc: opts.mcc ?? 5411,
    originalMcc: opts.mcc ?? 5411,
    hold: false,
    amount,
    operationAmount: amount,
    currencyCode: 980,
    commissionRate: 0,
    cashbackAmount: 0,
    balance: 0,
  };
}

const baseInput = {
  wallet: [],
  fakeIds: new Set<string>(),
  base: 980,
  accountCurrency: 980,
  rates: [],
  fromMs: (NOW - 30 * DAY) * 1000,
  toMs: NOW * 1000,
  salaries: [] as { paidOn: string; amount: number; currency: number }[] | null,
};

describe("analyze — перекази у власні банки (jars)", () => {
  it("переказ у свою банку (mcc 4829 + опис == назва jar) не рахується витратою", () => {
    const items = [
      tx("t1", NOW - DAY, -10_000, { mcc: 4829, description: "Накопичення" }),
      tx("t2", NOW - DAY, -500, { mcc: 5411, description: "АТБ" }),
    ];
    const withJars = analyze({ ...baseInput, items, jarTitles: ["Накопичення"] });
    expect(withJars.cardExpense).toBe(500);
    expect(withJars.totalExpense).toBe(500);
  });

  it("без переліку банок (jarTitles відсутній) — стара поведінка: 4829 рахується витратою", () => {
    const items = [tx("t1", NOW - DAY, -10_000, { mcc: 4829, description: "Накопичення" })];
    const noJars = analyze({ ...baseInput, items, jarTitles: null });
    expect(noJars.cardExpense).toBe(10_000);
  });

  it("mcc 4829 переказ ДРУГУ (опис не збігається з жодною банкою) лишається витратою", () => {
    const items = [tx("t1", NOW - DAY, -5_000, { mcc: 4829, description: "Іван Петренко" })];
    const out = analyze({ ...baseInput, items, jarTitles: ["Накопичення", "Друк"] });
    expect(out.cardExpense).toBe(5_000);
  });

  it("надходження з банки (amount > 0) і так не рахувались витратою — jarTitles цього не змінює", () => {
    const items = [tx("t1", NOW - DAY, 10_000, { mcc: 4829, description: "Накопичення" })];
    const out = analyze({ ...baseInput, items, jarTitles: ["Накопичення"] });
    expect(out.cardExpense).toBe(0);
    expect(out.totalIncome).toBe(0);
  });

  it("багато переказів у банку виключаються з витрат, а надходження з банки й так не рахувались", () => {
    const items: MonoStatementItem[] = [];
    for (let i = 0; i < 120; i++) {
      items.push(tx(`out${i}`, NOW - (i % 30) * DAY, -Math.round((30_000 * 100) / 120), {
        mcc: 4829,
        description: "Накопичення",
      }));
    }
    for (let i = 0; i < 20; i++) {
      items.push(tx(`in${i}`, NOW - (i % 30) * DAY, Math.round((28_000 * 100) / 20), {
        mcc: 4829,
        description: "Накопичення",
      }));
    }
    items.push(tx("groceries", NOW - DAY, -150_00, { mcc: 5411, description: "АТБ" }));

    const before = analyze({ ...baseInput, items, jarTitles: null });
    const after = analyze({ ...baseInput, items, jarTitles: ["Накопичення"] });

    expect(before.cardExpense).toBeGreaterThan(29_000_00);
    expect(after.cardExpense).toBe(150_00);
  });
});

describe("analyze — дохід рахується з історії зарплат, не з гаманця", () => {
  it("зарплата в періоді формує totalIncome; wallet income-запис у тому ж періоді на нього НЕ впливає", () => {
    const out = analyze({
      ...baseInput,
      items: [],
      wallet: [
        { id: "w1", kind: "income", date: new Date(NOW * 1000 - 2 * DAY * 1000).toISOString(), amount: 12_000_00, currency: 980 },
      ] as unknown as import("@/lib/storage").WalletEntry[],
      salaries: [{ paidOn: new Date(NOW * 1000 - 5 * DAY * 1000).toISOString().slice(0, 10), amount: 30_000_00, currency: 980 }],
    });
    expect(out.totalIncome).toBe(30_000_00);
  });

  it("зарплата поза періодом не враховується", () => {
    const out = analyze({
      ...baseInput,
      items: [],
      salaries: [{ paidOn: new Date((NOW - 60 * DAY) * 1000).toISOString().slice(0, 10), amount: 30_000_00, currency: 980 }],
    });
    expect(out.totalIncome).toBe(0);
  });

  it("salaries === null (ще завантажуються) → totalIncome null, incomeLoading true, net теж null", () => {
    const out = analyze({ ...baseInput, items: [], salaries: null });
    expect(out.totalIncome).toBeNull();
    expect(out.incomeLoading).toBe(true);
    expect(out.net).toBeNull();
  });

  it("курс зарплати в періоді невідомий → totalIncome null з причиною fx, а НЕ 0", () => {
    const out = analyze({
      ...baseInput,
      items: [],
      base: 980,
      rates: [],
      salaries: [{ paidOn: new Date(NOW * 1000 - 2 * DAY * 1000).toISOString().slice(0, 10), amount: 30_000, currency: 840 }],
    });
    expect(out.totalIncome).toBeNull();
    expect(out.incomeFxUnavailableCurrency).toBe(840);
    expect(out.incomeLoading).toBe(false);
  });

  it("net = totalIncome - totalExpense, коли дохід відомий", () => {
    const items = [tx("t1", NOW - DAY, -5_000, { mcc: 5411, description: "АТБ" })];
    const out = analyze({
      ...baseInput,
      items,
      salaries: [{ paidOn: new Date(NOW * 1000 - 2 * DAY * 1000).toISOString().slice(0, 10), amount: 30_000_00, currency: 980 }],
    });
    expect(out.totalExpense).toBe(5_000);
    expect(out.net).toBe(30_000_00 - 5_000);
  });
});

describe("analyze — курс витрати невідомий (fx debt: convertMinor(...) ?? рахунка більше немає)", () => {
  it("курс рахунку картки невідомий → totalExpense/cardExpense null з причиною fx, а НЕ сирі копійки видані за базову валюту", () => {
    const items = [tx("t1", NOW - DAY, -5_000, { mcc: 5411, description: "АТБ" })];
    const out = analyze({
      ...baseInput,
      items,
      base: 980,
      accountCurrency: 840,
      rates: [],
      salaries: [],
    });
    expect(out.totalExpense).toBeNull();
    expect(out.cardExpense).toBeNull();
    expect(out.cashExpense).toBeNull();
    expect(out.expenseFxUnavailableCurrency).toBe(840);
  });

  it("курс готівкової витрати невідомий → totalExpense null, картка (без fx-проблеми) на суму не впливає", () => {
    const out = analyze({
      ...baseInput,
      items: [],
      wallet: [
        {
          id: "w1",
          kind: "expense",
          date: new Date(NOW * 1000 - DAY * 1000).toISOString().slice(0, 10),
          amount: 1_000,
          currency: 978,
          category: "food",
        },
      ] as unknown as import("@/lib/storage").WalletEntry[],
      rates: [],
      salaries: [],
    });
    expect(out.totalExpense).toBeNull();
    expect(out.expenseFxUnavailableCurrency).toBe(978);
  });

  it("невідомий курс витрати → byCategory/daily/topMerchants порожні (не часткова структура)", () => {
    const items = [tx("t1", NOW - DAY, -5_000, { mcc: 5411, description: "АТБ" })];
    const out = analyze({
      ...baseInput,
      items,
      base: 980,
      accountCurrency: 840,
      rates: [],
      salaries: [],
    });
    expect(out.byCategory).toEqual([]);
    expect(out.daily).toEqual([]);
    expect(out.topMerchants).toEqual([]);
  });

  it("дохід відомий, витрата — ні → net null (не 30 000 - 0, і не сирі copійки)", () => {
    const items = [tx("t1", NOW - DAY, -5_000, { mcc: 5411, description: "АТБ" })];
    const out = analyze({
      ...baseInput,
      items,
      base: 980,
      accountCurrency: 840,
      rates: [],
      salaries: [{ paidOn: new Date(NOW * 1000 - 2 * DAY * 1000).toISOString().slice(0, 10), amount: 30_000_00, currency: 980 }],
    });
    expect(out.totalIncome).toBe(30_000_00);
    expect(out.totalExpense).toBeNull();
    expect(out.net).toBeNull();
  });
});

describe("cashBalances / cashBalancesByAccount — рахунки готівки не змінюють підсумок", () => {
  const ownerShapedWallet: WalletEntry[] = [
    { id: "w1", date: "2024-06-01", kind: "income", amount: 12_000_00, currency: 980, source: "Зарплата" },
    { id: "w2", date: "2024-06-05", kind: "expense", amount: 500_00, currency: 980, category: "food" },
    { id: "w3", date: "2024-06-10", kind: "topup", amount: 2_000_00, currency: 980 },
    { id: "w4", date: "2024-06-15", kind: "withdraw", amount: 1_000_00, currency: 980 },
    { id: "w5", date: "2024-06-20", kind: "income", amount: 300_00, currency: 840, source: "Фріланс" },
  ];

  it("власний гаманець (без accountId) дає той самий підсумок, що й до фічі рахунків", () => {
    expect(cashBalances(ownerShapedWallet)).toEqual({ 980: 12_000_00 - 500_00 - 2_000_00 + 1_000_00, 840: 300_00 });
  });

  it("додавання transfer лишає підсумок cashBalances незмінним (переказ нетується в нуль)", () => {
    const before = cashBalances(ownerShapedWallet);
    const withTransfer: WalletEntry[] = [
      ...ownerShapedWallet,
      {
        id: "t1",
        date: "2024-06-21",
        kind: "transfer",
        fromAccountId: "cash",
        toAccountId: "envelope",
        amount: 400_00,
        currency: 980,
      },
    ];
    expect(cashBalances(withTransfer)).toEqual(before);
  });

  it("сума cashBalancesByAccount по всіх рахунках дорівнює cashBalances (по кожній валюті)", () => {
    const wallet: WalletEntry[] = [
      ...ownerShapedWallet,
      {
        id: "t1",
        date: "2024-06-21",
        kind: "transfer",
        fromAccountId: "cash",
        toAccountId: "envelope",
        amount: 400_00,
        currency: 980,
      },
      { id: "w6", date: "2024-06-22", kind: "expense", amount: 50_00, currency: 980, accountId: "envelope" },
    ];
    const total = cashBalances(wallet);
    const byAccount = cashBalancesByAccount(wallet);
    const recombined: Record<number, number> = {};
    for (const bucket of Object.values(byAccount)) {
      for (const [cur, v] of Object.entries(bucket)) {
        recombined[Number(cur)] = (recombined[Number(cur)] ?? 0) + v;
      }
    }
    expect(recombined).toEqual(total);
  });

  it("записи без accountId зараховуються в дефолтний рахунок \"cash\"", () => {
    const byAccount = cashBalancesByAccount(ownerShapedWallet);
    expect(Object.keys(byAccount)).toEqual(["cash"]);
    expect(byAccount.cash).toEqual(cashBalances(ownerShapedWallet));
  });

  it("невідомий WalletKind у cashBalancesByAccount кидає помилку, а не мовчки провалюється в іншу гілку", () => {
    const bogus = [{ id: "x", date: "2024-06-01", kind: "bogus" }] as unknown as WalletEntry[];
    expect(() => cashBalancesByAccount(bogus)).toThrow();
  });
});
