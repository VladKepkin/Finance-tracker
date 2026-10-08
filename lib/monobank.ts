import { recordMonobankCall } from "./telemetry";

export const MONOBANK_BASE = "https://api.monobank.ua";

export interface MonoAccount {
  id: string;
  sendId: string;
  balance: number;
  creditLimit: number;
  type: string;
  currencyCode: number;
  cashbackType: string;
  maskedPan: string[];
  iban: string;
  isShared?: boolean;
  sharedOwnerId?: number;
  groupName?: string;
}

export interface MonoJar {
  id: string;
  sendId: string;
  title: string;
  description: string;
  currencyCode: number;
  balance: number;
  goal: number;
}

export interface MonoClientInfo {
  clientId: string;
  name: string;
  webHookUrl: string;
  permissions: string;
  accounts: MonoAccount[];
  jars?: MonoJar[];
}

export interface MonoStatementItem {
  id: string;
  time: number;
  description: string;
  mcc: number;
  originalMcc: number;
  hold: boolean;
  amount: number;
  operationAmount: number;
  currencyCode: number;
  commissionRate: number;
  cashbackAmount: number;
  balance: number;
  comment?: string;
  receiptId?: string;
  counterName?: string;
}

export const CURRENCY: Record<number, { code: string; symbol: string }> = {
  980: { code: "UAH", symbol: "₴" },
  840: { code: "USD", symbol: "$" },
  978: { code: "EUR", symbol: "€" },
  826: { code: "GBP", symbol: "£" },
  985: { code: "PLN", symbol: "zł" },
};

export function currencyMeta(code: number) {
  return CURRENCY[code] ?? { code: String(code), symbol: "" };
}

export async function monoFetch<T>(token: string, path: string): Promise<T> {
  const start = performance.now();
  let status = 0;
  let isError = false;

  try {
    const res = await fetch(`${MONOBANK_BASE}${path}`, {
      headers: { "X-Token": token },
      cache: "no-store",
    });
    status = res.status;

    if (res.status === 429) {
      isError = true;
      throw new MonoError(
        "Перевищено ліміт запитів до Monobank. Зачекайте 60 секунд і спробуйте ще раз.",
        429
      );
    }
    if (res.status === 403) {
      isError = true;
      throw new MonoError("Невірний або недійсний токен Monobank.", 403);
    }
    if (!res.ok) {
      isError = true;
      let detail = "";
      try {
        const body = (await res.json()) as { errorDescription?: string };
        detail = body?.errorDescription ?? "";
      } catch {
      }
      throw new MonoError(
        `Помилка Monobank (${res.status})${detail ? `: ${detail}` : ""}`,
        res.status
      );
    }

    return (await res.json()) as T;
  } catch (err) {
    isError = true;
    throw err;
  } finally {
    const durationMs = performance.now() - start;
    recordMonobankCall(status, durationMs, isError);
  }
}

export class MonoError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "MonoError";
  }
}
