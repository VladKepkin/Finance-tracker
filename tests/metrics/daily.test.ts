import { describe, it, expect } from "vitest";
import { dailyTotals, weekdayBaselines } from "@/lib/metrics/daily";

const DAY = 86_400;
const T = Date.UTC(2024, 6, 16) / 1000;

const tx = (time: number, amount: number) => ({ time, amount });

describe("dailyTotals", () => {
  it("сумує витрати по днях, надходження ігнорує", () => {
    const out = dailyTotals([tx(T, -1000), tx(T + 100, -500), tx(T + 200, 9999)], T, T);
    expect(out).toEqual([{ date: "2024-07-16", expense: 1500 }]);
  });

  it("день без витрат = 0, а не пропуск (інакше медіана завищена)", () => {
    const out = dailyTotals([tx(T, -1000)], T, T + 2 * DAY);
    expect(out).toEqual([
      { date: "2024-07-16", expense: 1000 },
      { date: "2024-07-17", expense: 0 },
      { date: "2024-07-18", expense: 0 },
    ]);
  });

  it("порожня історія → нулі за весь діапазон", () => {
    expect(dailyTotals([], T, T + DAY)).toEqual([
      { date: "2024-07-16", expense: 0 },
      { date: "2024-07-17", expense: 0 },
    ]);
  });

  it("транзакції поза діапазоном ігноруються", () => {
    const out = dailyTotals([tx(T - DAY, -9999), tx(T, -100)], T, T);
    expect(out).toEqual([{ date: "2024-07-16", expense: 100 }]);
  });

  it("to < from → порожньо", () => {
    expect(dailyTotals([], T + DAY, T)).toEqual([]);
  });
});

describe("weekdayBaselines", () => {
  it("завжди 7 елементів, від неділі", () => {
    const out = weekdayBaselines([{ date: "2024-07-16", expense: 100 }]);
    expect(out).toHaveLength(7);
    expect(out.map((w) => w.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("ловить, що вихідні дорожчі за будні", () => {
    const days: { date: string; expense: number }[] = [];
    for (let i = 0; i < 28; i++) {
      const d = new Date(Date.UTC(2024, 6, 15) + i * DAY * 1000);
      const wd = d.getUTCDay();
      const weekend = wd === 0 || wd === 6;
      days.push({ date: d.toISOString().slice(0, 10), expense: weekend ? 1400 : 1000 });
    }
    const out = weekdayBaselines(days);
    expect(out[6].median).toBe(1400);
    expect(out[0].median).toBe(1400);
    expect(out[1].median).toBe(1000);
    expect(out[1].samples).toBe(4);
  });

  it("день без спостережень → median null, samples 0", () => {
    const out = weekdayBaselines([{ date: "2024-07-16", expense: 100 }]);
    expect(out[2].samples).toBe(1);
    expect(out[3].samples).toBe(0);
    expect(out[3].median).toBeNull();
  });
});
