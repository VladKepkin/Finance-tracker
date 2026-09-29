import { describe, it, expect } from "vitest";
import { backwardWindows, DAY } from "@/lib/sync/windows";

describe("backwardWindows", () => {
  it("повертає порожній масив, якщо to < from", () => {
    expect(backwardWindows(100, 50, 30)).toEqual([]);
  });

  it("один момент часу → одне вікно", () => {
    expect(backwardWindows(0, 0, 30)).toEqual([{ from: 0, to: 0 }]);
  });

  it("рівно 30 днів → одне вікно", () => {
    const to = 30 * DAY - 1;
    expect(backwardWindows(0, to, 30)).toEqual([{ from: 0, to }]);
  });

  it("30 днів + 1 секунда → два вікна, від найновішого до найстарішого", () => {
    const to = 30 * DAY;
    expect(backwardWindows(0, to, 30)).toEqual([
      { from: 1, to: 30 * DAY },
      { from: 0, to: 0 },
    ]);
  });

  it("вікна не перекриваються і покривають увесь діапазон", () => {
    const from = 0;
    const to = 95 * DAY;
    const w = backwardWindows(from, to, 30);
    expect(w[0].to).toBe(to);
    expect(w[w.length - 1].from).toBe(from);
    for (const x of w) {
      expect(x.to - x.from + 1).toBeLessThanOrEqual(30 * DAY);
    }
    for (let i = 1; i < w.length; i++) {
      expect(w[i].to + 1).toBe(w[i - 1].from);
    }
  });
});
