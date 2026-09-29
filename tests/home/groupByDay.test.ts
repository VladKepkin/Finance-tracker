import { describe, it, expect } from "vitest";
import { groupByDay, dayLabel } from "@/lib/home/groupByDay";
import { greeting } from "@/lib/home/greeting";

describe("dayLabel", () => {
  it("today and yesterday get words", () => {
    expect(dayLabel("2026-09-27", "2026-09-27")).toBe("Сьогодні");
    expect(dayLabel("2026-09-26", "2026-09-27")).toBe("Вчора");
  });

  it("yesterday across a month boundary", () => {
    expect(dayLabel("2026-08-31", "2026-09-01")).toBe("Вчора");
  });

  it("older days in the same year omit the year", () => {
    expect(dayLabel("2026-09-20", "2026-09-27")).toBe("20 вересня");
  });

  it("days of another year keep the year", () => {
    expect(dayLabel("2025-12-30", "2026-01-02")).toMatch(/2025/);
  });
});

describe("groupByDay", () => {
  it("keeps order and starts a new group when the day changes", () => {
    const rows = [
      { day: "2026-09-27", id: "a" },
      { day: "2026-09-27", id: "b" },
      { day: "2026-09-26", id: "c" },
    ];
    const groups = groupByDay(rows, "2026-09-27");
    expect(groups.map((g) => [g.label, g.rows.map((r) => r.id)])).toEqual([
      ["Сьогодні", ["a", "b"]],
      ["Вчора", ["c"]],
    ]);
  });

  it("empty input gives no groups", () => {
    expect(groupByDay([], "2026-09-27")).toEqual([]);
  });
});

describe("greeting", () => {
  it.each([
    [4, "Доброї ночі"],
    [5, "Доброго ранку"],
    [11, "Доброго ранку"],
    [12, "Добрий день"],
    [17, "Добрий день"],
    [18, "Добрий вечір"],
    [22, "Добрий вечір"],
    [23, "Доброї ночі"],
  ])("hour %i → %s", (hour, text) => {
    expect(greeting(hour)).toBe(text);
  });
});
