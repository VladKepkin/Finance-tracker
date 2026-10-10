import { describe, it, expect } from "vitest";
import { detectAndParseStatement, parseMonobankCsv } from "@/lib/statementImport";

describe("statementImport", () => {
  it("parses Monobank CSV format with Ukrainian headers and commas/quotes", () => {
    const csv = `Дата і час,Опис,MCC,Сума в валюті картки (UAH),Сума в валюті операції,Валюта операції,Комісія (UAH),Кешбек (UAH),Залишок
09.10.2026 13:53:36,"McDonald’s",5814,-220.00,-220.00,UAH,0.00,0.00,12500.00
10.10.2026 06:31:47,"Нова пошта",5411,-100.00,-100.00,UAH,0.00,0.00,12400.00
10.10.2026 10:00:00,"Зарплата",0,50000.00,50000.00,UAH,0.00,0.00,62400.00
`;
    const res = detectAndParseStatement(csv);
    expect(res.bank).toBe("monobank");
    expect(res.items.length).toBe(3);

    expect(res.items[0]).toMatchObject({
      description: "McDonald’s",
      amount: 22000,
      kind: "expense",
      date: "2026-10-09",
      mcc: 5814,
      currencyCode: 980,
    });

    expect(res.items[1]).toMatchObject({
      description: "Нова пошта",
      amount: 10000,
      kind: "expense",
      date: "2026-10-10",
      mcc: 5411,
    });

    expect(res.items[2]).toMatchObject({
      description: "Зарплата",
      amount: 5000000,
      kind: "income",
      date: "2026-10-10",
    });
  });

  it("parses PrivatBank CSV format with semicolon separators", () => {
    const csv = `Дата;Час;Категорія;Картка;Опис операції;Сума в валюті картки;Валюта картки
08.10.2026;15:30;Продукти;4149***1234;Сільпо;-350,50;UAH
09.10.2026;11:00;Переказ;4149***1234;Поповнення картки;1000,00;UAH
`;
    const res = detectAndParseStatement(csv);
    expect(res.bank).toBe("privatbank");
    expect(res.items.length).toBe(2);

    expect(res.items[0]).toMatchObject({
      description: "Сільпо",
      amount: 35050,
      kind: "expense",
      date: "2026-10-08",
    });

    expect(res.items[1]).toMatchObject({
      description: "Поповнення картки",
      amount: 100000,
      kind: "income",
      date: "2026-10-09",
    });
  });

  it("handles generic CSV with date and amount", () => {
    const csv = `Date,Description,Amount
2026-10-01,Coffee,-45.00
2026-10-02,Salary,1500.00
`;
    const res = detectAndParseStatement(csv);
    expect(res.items.length).toBe(2);
    expect(res.items[0].amount).toBe(4500);
    expect(res.items[0].kind).toBe("expense");
    expect(res.items[1].amount).toBe(150000);
    expect(res.items[1].kind).toBe("income");
  });
});
