import { describe, it, expect } from "vitest";
import { detectRecurring } from "@/lib/metrics/recurrence";

const DAY = 86_400;
const NOW = Date.UTC(2026, 6, 16) / 1000;

const tx = (time: number, amount: number, description: string) => ({
  time,
  amount,
  operation_amount: null,
  description,
  currency_code: 980,
});

function series(n: number, stepDays: number, amount: number, name: string, jitterDays = 0) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const j = jitterDays ? ((i % 2 === 0 ? 1 : -1) * jitterDays) : 0;
    out.push(tx(NOW - (i * stepDays + j) * DAY, amount, name));
  }
  return out;
}

describe("detectRecurring", () => {
  it("24 щомісячні списання по 299 → кандидат monthly", () => {
    const out = detectRecurring(series(24, 30, -29_900, "NETFLIX.COM"), NOW);
    expect(out).toHaveLength(1);
    expect(out[0].cadence).toBe("monthly");
    expect(out[0].amount).toBe(29_900);
    expect(out[0].occurrences).toBe(24);
    expect(out[0].currency).toBe(980);
  });

  it("тижневі списання → кандидат weekly", () => {
    const out = detectRecurring(series(20, 7, -15_000, "ПРАЛЬНЯ"), NOW);
    expect(out).toHaveLength(1);
    expect(out[0].cadence).toBe("weekly");
    expect(out[0].anchorDay).toBeGreaterThanOrEqual(0);
    expect(out[0].anchorDay).toBeLessThanOrEqual(6);
  });

  it("менше 3 операцій → не кандидат (за одним інтервалом судити не можна)", () => {
    expect(detectRecurring(series(2, 30, -29_900, "NETFLIX"), NOW)).toEqual([]);
  });

  it("улюблений магазин: надто короткий медіанний інтервал → не тижневий і не місячний", () => {
    const txs = [
      tx(NOW - 1 * DAY, -20_000, "СІЛЬПО"),
      tx(NOW - 3 * DAY, -20_000, "СІЛЬПО"),
      tx(NOW - 8 * DAY, -20_000, "СІЛЬПО"),
      tx(NOW - 9 * DAY, -20_000, "СІЛЬПО"),
      tx(NOW - 17 * DAY, -20_000, "СІЛЬПО"),
      tx(NOW - 18 * DAY, -20_000, "СІЛЬПО"),
    ];
    expect(detectRecurring(txs, NOW)).toEqual([]);
  });

  it("фіксована сума переказу тій самій людині в нерегулярні дати → відкинуто розкидом інтервалів", () => {
    const txs = [
      tx(NOW - 155 * DAY, -50_000, "ПЕРЕКАЗ ІВАН П."),
      tx(NOW - 135 * DAY, -50_000, "ПЕРЕКАЗ ІВАН П."),
      tx(NOW - 95 * DAY, -50_000, "ПЕРЕКАЗ ІВАН П."),
      tx(NOW - 75 * DAY, -50_000, "ПЕРЕКАЗ ІВАН П."),
      tx(NOW - 35 * DAY, -50_000, "ПЕРЕКАЗ ІВАН П."),
      tx(NOW - 5 * DAY, -50_000, "ПЕРЕКАЗ ІВАН П."),
    ];
    expect(detectRecurring(txs, NOW)).toEqual([]);
  });

  it("сума плаває → відкинуто (це покупки, не підписка)", () => {
    const txs = [];
    const amounts = [-10_000, -25_000, -14_000, -31_000, -9_000, -27_000];
    for (let i = 0; i < 6; i++) txs.push(tx(NOW - (i + 1) * 30 * DAY, amounts[i], "АТБ"));
    expect(detectRecurring(txs, NOW)).toEqual([]);
  });

  it("невеликий джитер дат не заважає (списання 30±1 день)", () => {
    const out = detectRecurring(series(12, 30, -29_900, "SPOTIFY", 1), NOW);
    expect(out).toHaveLength(1);
    expect(out[0].cadence).toBe("monthly");
  });

  it("надходження ігноруються", () => {
    const txs = [];
    for (let i = 1; i <= 6; i++) txs.push(tx(NOW - i * 30 * DAY, 50_000, "ЗАРПЛАТА"));
    expect(detectRecurring(txs, NOW)).toEqual([]);
  });

  it("nextDue у майбутньому або сьогодні", () => {
    const out = detectRecurring(series(24, 30, -29_900, "NETFLIX.COM"), NOW);
    expect(out[0].nextDue).toBeGreaterThanOrEqual(Math.floor(NOW / DAY) * DAY);
  });

  it("кілька сервісів → відсортовано за спаданням суми", () => {
    const txs = [
      ...series(12, 30, -29_900, "NETFLIX"),
      ...series(12, 30, -99_900, "ОРЕНДА"),
    ];
    const out = detectRecurring(txs, NOW);
    expect(out).toHaveLength(2);
    expect(out[0].name).toBe("ОРЕНДА");
    expect(out[1].name).toBe("NETFLIX");
  });

  it("порожній вхід → порожньо", () => {
    expect(detectRecurring([], NOW)).toEqual([]);
  });

  it("потік зупинився давно (3 щомісячні, останнє ~395д тому) → не кандидат", () => {
    const txs = [
      tx(NOW - 455 * DAY, -89_353, "OpenAI"),
      tx(NOW - 425 * DAY, -89_353, "OpenAI"),
      tx(NOW - 395 * DAY, -89_353, "OpenAI"),
    ];
    expect(detectRecurring(txs, NOW)).toEqual([]);
  });

  it("живий недавній потік лишається кандидатом (щасливий шлях)", () => {
    const out = detectRecurring(series(6, 30, -89_353, "Claude"), NOW);
    expect(out).toHaveLength(1);
  });

  it("реальний кейс Claude: amount у гривні дрейфує з курсом, currency_code — операції (USD) → кандидат за operation_amount/currency_code, не за amount", () => {
    const txs = [
      { time: NOW - 66 * DAY, amount: -440_393, operation_amount: -10_000, description: "Claude", currency_code: 840 },
      { time: NOW - 36 * DAY, amount: -452_407, operation_amount: -10_000, description: "Claude", currency_code: 840 },
      { time: NOW - 5 * DAY, amount: -446_907, operation_amount: -10_000, description: "Claude", currency_code: 840 },
    ];
    const out = detectRecurring(txs, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(10_000);
    expect(out[0].currency).toBe(840);
  });

  it("межа порогу: один крок ВСЕРЕДИНІ (2×medInterval) → ще кандидат", () => {
    const txs = [
      tx(NOW - 119 * DAY, -50_000, "МЕЖА"),
      tx(NOW - 89 * DAY, -50_000, "МЕЖА"),
      tx(NOW - 59 * DAY, -50_000, "МЕЖА"),
    ];
    expect(detectRecurring(txs, NOW)).toHaveLength(1);
  });

  it("межа порогу: один крок ЗА межею (>2×medInterval) → вже не кандидат", () => {
    const txs = [
      tx(NOW - 121 * DAY, -50_000, "МЕЖА2"),
      tx(NOW - 91 * DAY, -50_000, "МЕЖА2"),
      tx(NOW - 61 * DAY, -50_000, "МЕЖА2"),
    ];
    expect(detectRecurring(txs, NOW)).toEqual([]);
  });
});
