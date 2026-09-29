import { describe, it, expect } from "vitest";
import { parseCreate, parsePatch } from "@/lib/salaryInput";

const validBody = { paidOn: "2026-06-15", amount: 20_000_00, currency: 980 };

describe("salaryInput.parseCreate", () => {
  it("валідний ввід приймається", () => {
    const r = parseCreate(validBody);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toMatchObject({ paidOn: "2026-06-15", amount: 20_000_00, currency: 980, note: null });
    }
  });

  it("невалідний yyyy-mm-dd відхиляється (перевикористовує parseDeadline)", () => {
    expect(parseCreate({ ...validBody, paidOn: "2026-13-40" })).toEqual({ ok: false, error: "Некоректна дата виплати" });
    expect(parseCreate({ ...validBody, paidOn: "15.06.2026" })).toEqual({ ok: false, error: "Некоректна дата виплати" });
    expect(parseCreate({ ...validBody, paidOn: 20260615 })).toEqual({ ok: false, error: "Некоректна дата виплати" });
  });

  it("нецілу суму відхиляє", () => {
    expect(parseCreate({ ...validBody, amount: 29.5 })).toEqual({ ok: false, error: "Некоректна сума" });
  });

  it("нульову й від'ємну суму відхиляє", () => {
    expect(parseCreate({ ...validBody, amount: 0 })).toEqual({ ok: false, error: "Некоректна сума" });
    expect(parseCreate({ ...validBody, amount: -100 })).toEqual({ ok: false, error: "Некоректна сума" });
  });

  it("NaN/Infinity суму відхиляє (Number.isInteger сам їх ловить)", () => {
    expect(parseCreate({ ...validBody, amount: NaN })).toEqual({ ok: false, error: "Некоректна сума" });
    expect(parseCreate({ ...validBody, amount: Infinity })).toEqual({ ok: false, error: "Некоректна сума" });
  });

  it("некоректну валюту (не число, NaN) відхиляє", () => {
    expect(parseCreate({ ...validBody, currency: "980" })).toEqual({ ok: false, error: "Некоректна валюта" });
    expect(parseCreate({ ...validBody, currency: NaN })).toEqual({ ok: false, error: "Некоректна валюта" });
  });

  it("не-об'єкт, null і масив не кидають виняток", () => {
    expect(parseCreate(null).ok).toBe(false);
    expect(parseCreate(undefined).ok).toBe(false);
    expect(parseCreate("string").ok).toBe(false);
    expect(parseCreate([1, 2]).ok).toBe(false);
  });

  it("note-рядок приймається, відсутність note → null", () => {
    const r = parseCreate({ ...validBody, note: "аванс" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.note).toBe("аванс");
  });
});

describe("salaryInput.parsePatch", () => {
  it("патч без полів приймається (нема що міняти)", () => {
    expect(parsePatch({})).toEqual({ ok: true, value: {} });
  });

  it("не-об'єкт, null і масив не кидають виняток", () => {
    expect(parsePatch(null).ok).toBe(false);
    expect(parsePatch(undefined).ok).toBe(false);
    expect(parsePatch("x").ok).toBe(false);
    expect(parsePatch([1]).ok).toBe(false);
  });

  it("некоректну дату в патчі відхиляє", () => {
    expect(parsePatch({ paidOn: "не-дата" })).toEqual({ ok: false, error: "Некоректна дата виплати" });
  });

  it("нецілу/нульову/від'ємну суму в патчі відхиляє", () => {
    expect(parsePatch({ amount: 1.5 }).ok).toBe(false);
    expect(parsePatch({ amount: 0 }).ok).toBe(false);
    expect(parsePatch({ amount: -5 }).ok).toBe(false);
  });

  it("некоректну примітку (не рядок і не null) відхиляє", () => {
    expect(parsePatch({ note: 42 })).toEqual({ ok: false, error: "Некоректна примітка" });
  });

  it("note: null дозволено — прибирає примітку", () => {
    expect(parsePatch({ note: null })).toEqual({ ok: true, value: { note: null } });
  });

  it("валідний патч однієї суми", () => {
    expect(parsePatch({ amount: 21_000_00 })).toEqual({ ok: true, value: { amount: 21_000_00 } });
  });
});
