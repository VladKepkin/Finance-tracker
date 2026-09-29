import { describe, it, expect } from "vitest";
import { computeCoverage } from "@/lib/coverage";
import { confidenceFor, coverageFromSyncState } from "@/lib/coverage";

const DAY = 86_400;

describe("computeCoverage", () => {
  it("порожня історія → нулі й null-дати", () => {
    expect(computeCoverage({ minTime: null, maxTime: null, samples: 0 })).toEqual({
      days: 0,
      samples: 0,
      from: null,
      to: null,
    });
  });

  it("є межі, але нуль операцій → нулі (даних немає)", () => {
    expect(computeCoverage({ minTime: 0, maxTime: 10 * DAY, samples: 0 })).toEqual({
      days: 0,
      samples: 0,
      from: null,
      to: null,
    });
  });

  it("один день → days = 1", () => {
    const t = Date.UTC(2026, 0, 15) / 1000;
    const c = computeCoverage({ minTime: t, maxTime: t, samples: 3 });
    expect(c.days).toBe(1);
    expect(c.samples).toBe(3);
    expect(c.from).toBe("2026-01-15");
    expect(c.to).toBe("2026-01-15");
  });

  it("90 діб між крайніми операціями → days = 90", () => {
    const t = Date.UTC(2026, 0, 1) / 1000;
    const c = computeCoverage({ minTime: t, maxTime: t + 89 * DAY, samples: 500 });
    expect(c.days).toBe(90);
    expect(c.from).toBe("2026-01-01");
    expect(c.to).toBe("2026-03-31");
  });
});

describe("confidenceFor", () => {
  const t = { low: 14, high: 60 };

  it("нижче low → insufficient", () => {
    expect(confidenceFor(13, t)).toBe("insufficient");
    expect(confidenceFor(0, t)).toBe("insufficient");
  });

  it("від low до high → low", () => {
    expect(confidenceFor(14, t)).toBe("low");
    expect(confidenceFor(59, t)).toBe("low");
  });

  it("від high → high", () => {
    expect(confidenceFor(60, t)).toBe("high");
    expect(confidenceFor(730, t)).toBe("high");
  });
});

describe("coverageFromSyncState", () => {
  const DAY = 86_400;
  const T = Date.UTC(2024, 6, 16) / 1000;

  it("порожній список → нулі", () => {
    expect(coverageFromSyncState([], 0)).toEqual({
      days: 0,
      samples: 0,
      from: null,
      to: null,
    });
  });

  it("один рахунок → його межі", () => {
    const c = coverageFromSyncState([{ covered_from: T, covered_to: T + 729 * DAY }], 3067);
    expect(c.days).toBe(730);
    expect(c.samples).toBe(3067);
    expect(c.from).toBe("2024-07-16");
  });

  it("кілька рахунків → ПЕРЕТИН (беремо те, що покрито скрізь)", () => {
    const c = coverageFromSyncState(
      [
        { covered_from: T, covered_to: T + 729 * DAY },
        { covered_from: T + 100 * DAY, covered_to: T + 700 * DAY },
      ],
      100
    );
    expect(c.from).toBe(new Date((T + 100 * DAY) * 1000).toISOString().slice(0, 10));
    expect(c.days).toBe(601);
  });

  it("рахунок без меж ігнорується", () => {
    const c = coverageFromSyncState(
      [{ covered_from: T, covered_to: T + 9 * DAY }, { covered_from: null, covered_to: null }],
      5
    );
    expect(c.days).toBe(10);
  });

  it("нуль операцій → порожнє покриття, навіть якщо межі є", () => {
    expect(coverageFromSyncState([{ covered_from: T, covered_to: T + 100 * DAY }], 0)).toEqual({
      days: 0,
      samples: 0,
      from: null,
      to: null,
    });
  });

  it("два рахунки без перетину → порожнє покриття (to < from)", () => {
    const c = coverageFromSyncState(
      [
        { covered_from: T, covered_to: T + 90 * DAY },
        { covered_from: T + 180 * DAY, covered_to: T + 270 * DAY },
      ],
      100
    );
    expect(c).toEqual({
      days: 0,
      samples: 0,
      from: null,
      to: null,
    });
  });

  it("рахунок із partial null (одна межа) ігнорується", () => {
    const c = coverageFromSyncState(
      [
        { covered_from: T, covered_to: T + 9 * DAY },
        { covered_from: T + 5 * DAY, covered_to: null },
      ],
      5
    );
    expect(c.days).toBe(10);
    expect(c.from).toBe("2024-07-16");
  });
});
