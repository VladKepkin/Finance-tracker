import type { Cadence } from "./metrics/cadence";

export interface CreateInput {
  name: string;
  amount: number;
  currency: number;
  cadence: Cadence;
  anchorDay: number;
  matcher: string | null;
}

export interface PatchInput {
  name?: string;
  amount?: number;
  cadence?: Cadence;
  anchorDay?: number;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function validCadence(v: unknown): v is Cadence {
  return v === "weekly" || v === "monthly";
}

function validAnchor(cadence: Cadence, anchorDay: unknown): anchorDay is number {
  if (typeof anchorDay !== "number" || !Number.isInteger(anchorDay)) return false;
  return cadence === "weekly" ? anchorDay >= 0 && anchorDay <= 6 : anchorDay >= 1 && anchorDay <= 31;
}

function isPlainBody(body: unknown): body is Record<string, unknown> {
  return typeof body === "object" && body !== null && !Array.isArray(body);
}

export function parseCreate(body: unknown): ParseResult<CreateInput> {
  if (!isPlainBody(body)) return { ok: false, error: "Некоректний запит" };

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return { ok: false, error: "Порожня назва" };

  const amount = body.amount;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
    return { ok: false, error: "Некоректна сума" };
  }

  const currency = body.currency;
  if (typeof currency !== "number") {
    return { ok: false, error: "Некоректна валюта" };
  }

  if (!validCadence(body.cadence)) {
    return { ok: false, error: "Некоректна періодичність" };
  }

  if (!validAnchor(body.cadence, body.anchorDay)) {
    return { ok: false, error: "Некоректний день" };
  }

  return {
    ok: true,
    value: {
      name,
      amount,
      currency,
      cadence: body.cadence,
      anchorDay: body.anchorDay,
      matcher: typeof body.matcher === "string" ? body.matcher : null,
    },
  };
}

export function parsePatch(body: unknown, storedCadence: Cadence): ParseResult<PatchInput> {
  if (!isPlainBody(body)) return { ok: false, error: "Некоректний запит" };

  const patch: PatchInput = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return { ok: false, error: "Порожня назва" };
    }
    patch.name = body.name.trim();
  }

  if (body.amount !== undefined) {
    if (typeof body.amount !== "number" || !Number.isInteger(body.amount) || body.amount <= 0) {
      return { ok: false, error: "Некоректна сума" };
    }
    patch.amount = body.amount;
  }

  if (body.cadence !== undefined) {
    if (!validCadence(body.cadence)) {
      return { ok: false, error: "Некоректна періодичність" };
    }
    patch.cadence = body.cadence;
  }

  if (body.anchorDay !== undefined) {
    const effectiveCadence = patch.cadence ?? storedCadence;
    if (!validAnchor(effectiveCadence, body.anchorDay)) {
      return { ok: false, error: "Некоректний день" };
    }
    patch.anchorDay = body.anchorDay;
  }

  return { ok: true, value: patch };
}
