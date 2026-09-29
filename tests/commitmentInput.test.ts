import { describe, it, expect } from "vitest";
import { parseCreate, parsePatch } from "@/lib/commitmentInput";

const validBody = {
  name: "Netflix",
  amount: 29_900,
  currency: 980,
  cadence: "monthly",
  anchorDay: 14,
};

describe("commitmentInput.parseCreate", () => {
  it("валідний ввід приймається", () => {
    const r = parseCreate(validBody);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toMatchObject({ name: "Netflix", amount: 29_900, currency: 980, cadence: "monthly", anchorDay: 14, matcher: null });
    }
  });

  it("порожнє ім'я відхиляється", () => {
    expect(parseCreate({ ...validBody, name: "" })).toEqual({ ok: false, error: "Порожня назва" });
  });

  it("ім'я з самих пробілів відхиляється", () => {
    expect(parseCreate({ ...validBody, name: "   " })).toEqual({ ok: false, error: "Порожня назва" });
  });

  it("нецілу суму відхиляє", () => {
    expect(parseCreate({ ...validBody, amount: 29.5 })).toEqual({ ok: false, error: "Некоректна сума" });
  });

  it("нульову суму відхиляє", () => {
    expect(parseCreate({ ...validBody, amount: 0 })).toEqual({ ok: false, error: "Некоректна сума" });
  });

  it("від'ємну суму відхиляє", () => {
    expect(parseCreate({ ...validBody, amount: -100 })).toEqual({ ok: false, error: "Некоректна сума" });
  });

  it("некоректну валюту відхиляє", () => {
    expect(parseCreate({ ...validBody, currency: "980" })).toEqual({ ok: false, error: "Некоректна валюта" });
  });

  it("некоректну періодичність відхиляє", () => {
    expect(parseCreate({ ...validBody, cadence: "daily" })).toEqual({ ok: false, error: "Некоректна періодичність" });
  });

  it("weekly: anchorDay 0 приймається, 7 відхиляється", () => {
    expect(parseCreate({ ...validBody, cadence: "weekly", anchorDay: 0 }).ok).toBe(true);
    expect(parseCreate({ ...validBody, cadence: "weekly", anchorDay: 7 })).toEqual({ ok: false, error: "Некоректний день" });
  });

  it("monthly: anchorDay 1 і 31 приймаються, 0 і 32 відхиляються", () => {
    expect(parseCreate({ ...validBody, cadence: "monthly", anchorDay: 1 }).ok).toBe(true);
    expect(parseCreate({ ...validBody, cadence: "monthly", anchorDay: 31 }).ok).toBe(true);
    expect(parseCreate({ ...validBody, cadence: "monthly", anchorDay: 0 })).toEqual({ ok: false, error: "Некоректний день" });
    expect(parseCreate({ ...validBody, cadence: "monthly", anchorDay: 32 })).toEqual({ ok: false, error: "Некоректний день" });
  });

  it("не-об'єкт, null і масив не кидають виняток", () => {
    expect(parseCreate(null).ok).toBe(false);
    expect(parseCreate(undefined).ok).toBe(false);
    expect(parseCreate("string").ok).toBe(false);
    expect(parseCreate([1, 2]).ok).toBe(false);
  });
});

describe("commitmentInput.parsePatch", () => {
  it("патч без полів приймається (нема що міняти)", () => {
    const r = parsePatch({}, "monthly");
    expect(r).toEqual({ ok: true, value: {} });
  });

  it("не-об'єкт, null і масив не кидають виняток", () => {
    expect(parsePatch(null, "monthly").ok).toBe(false);
    expect(parsePatch(undefined, "monthly").ok).toBe(false);
    expect(parsePatch("x", "monthly").ok).toBe(false);
    expect(parsePatch([1], "monthly").ok).toBe(false);
  });

  it("Problem 1 regression: weekly-збережений рядок, патчиться лише anchorDay=31 → відхилено", () => {
    const r = parsePatch({ anchorDay: 31 }, "weekly");
    expect(r).toEqual({ ok: false, error: "Некоректний день" });
  });

  it("weekly stored: anchorDay=0 приймається без зміни cadence", () => {
    const r = parsePatch({ anchorDay: 0 }, "weekly");
    expect(r).toEqual({ ok: true, value: { anchorDay: 0 } });
  });

  it("патч, що одночасно міняє cadence на weekly, валідує anchor проти нової", () => {
    expect(parsePatch({ cadence: "weekly", anchorDay: 31 }, "monthly")).toEqual({ ok: false, error: "Некоректний день" });
    expect(parsePatch({ cadence: "weekly", anchorDay: 6 }, "monthly")).toEqual({ ok: true, value: { cadence: "weekly", anchorDay: 6 } });
  });

  it("порожнє ім'я в патчі відхиляється", () => {
    expect(parsePatch({ name: "  " }, "monthly")).toEqual({ ok: false, error: "Порожня назва" });
  });

  it("нецілу/нульову/від'ємну суму в патчі відхиляє", () => {
    expect(parsePatch({ amount: 1.5 }, "monthly").ok).toBe(false);
    expect(parsePatch({ amount: 0 }, "monthly").ok).toBe(false);
    expect(parsePatch({ amount: -5 }, "monthly").ok).toBe(false);
  });

  it("некоректну періодичність у патчі відхиляє", () => {
    expect(parsePatch({ cadence: "yearly" }, "monthly")).toEqual({ ok: false, error: "Некоректна періодичність" });
  });
});
