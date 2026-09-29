import { describe, it, expect } from "vitest";
import { buildStrategies, type StrategyContext } from "@/lib/strategies";

const BASE_CTX: StrategyContext = {
  monthlyIncome: 100_000,
  incomeFxUnavailable: null,
  incomeUnavailableReason: null,
  monthlyExpense: 50_000,
  liquid: 200_000,
  liquidFxUnavailable: null,
  recurringMonthly: 10_000,
  recurringFxUnavailable: null,
  recurringError: null,
  byCategory: [],
  fmt: (m) => String(m),
};

describe("buildStrategies — чесна деградація при невідомому курсі", () => {
  it("liquidFxUnavailable !== null → попередження замість подушки/FIRE, вигаданого числа немає", () => {
    const out = buildStrategies({ ...BASE_CTX, liquid: null, liquidFxUnavailable: 840 });
    const emergency = out.filter((s) => s.id === "emergency");
    expect(emergency).toHaveLength(1);
    expect(emergency[0].detail).toContain("USD");
    expect(out.find((s) => s.id === "fire")).toBeUndefined();
  });

  it("liquid відомий → подушка і FIRE рахуються як раніше", () => {
    const out = buildStrategies(BASE_CTX);
    expect(out.some((s) => s.id === "emergency")).toBe(true);
    expect(out.find((s) => s.id === "fire")).toBeDefined();
  });

  it("recurringError !== null → картка «Регулярні платежі» лишається, з поясненням, а не зникає", () => {
    const out = buildStrategies({ ...BASE_CTX, recurringMonthly: 0, recurringError: "Статус 503" });
    const recurring = out.filter((s) => s.id === "recurring");
    expect(recurring).toHaveLength(1);
    expect(recurring[0].detail).toContain("503");
  });

  it("recurringFxUnavailable має пріоритет над recurringError", () => {
    const out = buildStrategies({
      ...BASE_CTX,
      recurringMonthly: 0,
      recurringFxUnavailable: 978,
      recurringError: "Статус 503",
    });
    const recurring = out.filter((s) => s.id === "recurring");
    expect(recurring).toHaveLength(1);
    expect(recurring[0].detail).toContain("EUR");
  });

  it("incomeFxUnavailable !== null → картка про курс, а не «Внеси свій дохід»", () => {
    const out = buildStrategies({ ...BASE_CTX, monthlyIncome: 0, incomeFxUnavailable: 840 });
    const income = out.filter((s) => s.id === "income");
    expect(income).toHaveLength(1);
    expect(income[0].detail).toContain("USD");
    expect(income[0].title).not.toBe("Внеси свій дохід");
  });

  it("дохід відомий і додатний → картки про відсутність доходу немає взагалі", () => {
    const out = buildStrategies(BASE_CTX);
    expect(out.find((s) => s.id === "income")).toBeUndefined();
  });

  it("incomeUnavailableReason !== null (не курс) → картка з причиною, savingsRate не рахується як вигаданий", () => {
    const out = buildStrategies({
      ...BASE_CTX,
      monthlyIncome: null,
      incomeUnavailableReason: "Додай хоч одну зарплату — без неї дохід невідомий.",
    });
    const income = out.filter((s) => s.id === "income");
    expect(income).toHaveLength(1);
    expect(income[0].detail).toContain("Додай хоч одну зарплату");
    expect(out.find((s) => s.id === "savings")).toBeUndefined();
  });
});
