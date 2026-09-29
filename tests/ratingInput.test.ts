import { describe, it, expect } from "vitest";
import { parseRating } from "@/lib/ratingInput";

describe("parseRating", () => {
  it("приймає межі шкали 1 і 5", () => {
    expect(parseRating({ txId: "tx1", score: 1 })).toEqual({ ok: true, value: { txId: "tx1", score: 1 } });
    expect(parseRating({ txId: "tx1", score: 5 })).toEqual({ ok: true, value: { txId: "tx1", score: 5 } });
  });

  it("відхиляє 0 і 6 — поза межами, без клампу", () => {
    expect(parseRating({ txId: "tx1", score: 0 }).ok).toBe(false);
    expect(parseRating({ txId: "tx1", score: 6 }).ok).toBe(false);
  });

  it("відхиляє дробове значення", () => {
    expect(parseRating({ txId: "tx1", score: 3.5 }).ok).toBe(false);
  });

  it("відхиляє рядок замість числа", () => {
    expect(parseRating({ txId: "tx1", score: "4" }).ok).toBe(false);
  });

  it("відхиляє NaN і Infinity", () => {
    expect(parseRating({ txId: "tx1", score: NaN }).ok).toBe(false);
    expect(parseRating({ txId: "tx1", score: Infinity }).ok).toBe(false);
  });

  it("відхиляє порожній txId", () => {
    expect(parseRating({ txId: "", score: 3 }).ok).toBe(false);
    expect(parseRating({ txId: "   ", score: 3 }).ok).toBe(false);
  });

  it("не кидає на null, масиві чи примітиві — повертає помилку", () => {
    expect(parseRating(null).ok).toBe(false);
    expect(parseRating([1, 2, 3]).ok).toBe(false);
    expect(parseRating("hello").ok).toBe(false);
    expect(parseRating(42).ok).toBe(false);
    expect(parseRating(undefined).ok).toBe(false);
  });

  it("відхиляє тіло без txId чи score", () => {
    expect(parseRating({}).ok).toBe(false);
    expect(parseRating({ txId: "tx1" }).ok).toBe(false);
    expect(parseRating({ score: 3 }).ok).toBe(false);
  });
});
