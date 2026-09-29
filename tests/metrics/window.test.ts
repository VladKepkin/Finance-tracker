import { describe, it, expect } from "vitest";
import { metricsWindow } from "@/lib/metrics/window";

const DAY = 86_400;
const at = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 1000;

describe("metricsWindow", () => {
  it("null-межі покриття → null", () => {
    expect(
      metricsWindow({ coveredFrom: null, coveredTo: at(2024, 1, 10), nowSeconds: at(2024, 1, 20) })
    ).toBeNull();
    expect(
      metricsWindow({ coveredFrom: at(2024, 1, 1), coveredTo: null, nowSeconds: at(2024, 1, 20) })
    ).toBeNull();
  });

  it("сьогоднішня доба виключена — to не пізніше вчорашньої", () => {
    const now = at(2024, 7, 16) + 12 * 3600;
    const w = metricsWindow({ coveredFrom: at(2023, 1, 1), coveredTo: now, nowSeconds: now });
    expect(w!.to).toBe(at(2024, 7, 16) - 1);
  });

  it("покриття вужче за maxDays → обрізає по покриттю", () => {
    const now = at(2024, 7, 16);
    const coveredFrom = at(2024, 6, 1);
    const coveredTo = at(2024, 7, 15);
    const w = metricsWindow({ coveredFrom, coveredTo, nowSeconds: now });
    expect(w!.from).toBe(coveredFrom);
    expect(w!.to).toBe(coveredTo);
  });

  it("покриття ширше за maxDays → обрізає по maxDays", () => {
    const now = at(2024, 7, 16);
    const coveredFrom = at(2020, 1, 1);
    const coveredTo = at(2024, 7, 15);
    const w = metricsWindow({ coveredFrom, coveredTo, nowSeconds: now, maxDays: 365 });
    expect(w!.to).toBe(coveredTo);
    expect(w!.from).toBe(coveredTo - 365 * DAY + 1);
  });

  it("покриття повністю в межах сьогоднішньої доби → порожньо → null", () => {
    const now = at(2024, 7, 16) + 3600;
    const coveredFrom = at(2024, 7, 16);
    const coveredTo = now;
    const w = metricsWindow({ coveredFrom, coveredTo, nowSeconds: now });
    expect(w).toBeNull();
  });
});
