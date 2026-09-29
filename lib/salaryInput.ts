import { parseDeadline } from "./metrics/goals";

export interface CreateInput {
  paidOn: string;
  amount: number;
  currency: number;
  note: string | null;
}

export interface PatchInput {
  paidOn?: string;
  amount?: number;
  currency?: number;
  note?: string | null;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function isPlainBody(body: unknown): body is Record<string, unknown> {
  return typeof body === "object" && body !== null && !Array.isArray(body);
}

function validAmount(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

function validCurrency(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function validPaidOn(v: unknown): v is string {
  return typeof v === "string" && parseDeadline(v) !== null;
}

export function parseCreate(body: unknown): ParseResult<CreateInput> {
  if (!isPlainBody(body)) return { ok: false, error: "Некоректний запит" };

  if (!validPaidOn(body.paidOn)) return { ok: false, error: "Некоректна дата виплати" };
  if (!validAmount(body.amount)) return { ok: false, error: "Некоректна сума" };
  if (!validCurrency(body.currency)) return { ok: false, error: "Некоректна валюта" };

  return {
    ok: true,
    value: {
      paidOn: body.paidOn,
      amount: body.amount,
      currency: body.currency,
      note: typeof body.note === "string" ? body.note : null,
    },
  };
}

export function parsePatch(body: unknown): ParseResult<PatchInput> {
  if (!isPlainBody(body)) return { ok: false, error: "Некоректний запит" };

  const patch: PatchInput = {};

  if (body.paidOn !== undefined) {
    if (!validPaidOn(body.paidOn)) return { ok: false, error: "Некоректна дата виплати" };
    patch.paidOn = body.paidOn;
  }
  if (body.amount !== undefined) {
    if (!validAmount(body.amount)) return { ok: false, error: "Некоректна сума" };
    patch.amount = body.amount;
  }
  if (body.currency !== undefined) {
    if (!validCurrency(body.currency)) return { ok: false, error: "Некоректна валюта" };
    patch.currency = body.currency;
  }
  if (body.note !== undefined) {
    if (body.note !== null && typeof body.note !== "string") {
      return { ok: false, error: "Некоректна примітка" };
    }
    patch.note = body.note;
  }

  return { ok: true, value: patch };
}
