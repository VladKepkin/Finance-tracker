import type { MonoStatementItem } from "./monobank";

export interface MonoWebhookPayload {
  type: "StatementItem";
  data: {
    account: string;
    statementItem: MonoStatementItem;
  };
}

export function parseMonoWebhookPayload(
  body: unknown
): { ok: true; accountId: string; item: MonoStatementItem } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Тіло запиту має бути JSON-об'єктом" };
  }

  const obj = body as Record<string, unknown>;
  if (obj.type !== "StatementItem") {
    return { ok: false, error: "Очікується type: 'StatementItem'" };
  }

  if (typeof obj.data !== "object" || obj.data === null || Array.isArray(obj.data)) {
    return { ok: false, error: "Поле data має бути об'єктом" };
  }

  const data = obj.data as Record<string, unknown>;
  const account = typeof data.account === "string" ? data.account.trim() : "";
  if (!account) {
    return { ok: false, error: "Відсутній або порожній data.account" };
  }

  const raw = data.statementItem as Record<string, unknown> | undefined;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Відсутній data.statementItem" };
  }

  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) {
    return { ok: false, error: "Некоректний statementItem.id" };
  }

  const time = typeof raw.time === "number" && Number.isFinite(raw.time) ? raw.time : 0;
  if (!time) {
    return { ok: false, error: "Некоректний statementItem.time" };
  }

  const amount = typeof raw.amount === "number" && Number.isFinite(raw.amount) ? raw.amount : 0;
  const operationAmount =
    typeof raw.operationAmount === "number" && Number.isFinite(raw.operationAmount)
      ? raw.operationAmount
      : amount;
  const currencyCode =
    typeof raw.currencyCode === "number" && Number.isFinite(raw.currencyCode)
      ? raw.currencyCode
      : 980;
  const mcc = typeof raw.mcc === "number" && Number.isFinite(raw.mcc) ? raw.mcc : 0;
  const originalMcc =
    typeof raw.originalMcc === "number" && Number.isFinite(raw.originalMcc) ? raw.originalMcc : mcc;
  const commissionRate =
    typeof raw.commissionRate === "number" && Number.isFinite(raw.commissionRate)
      ? raw.commissionRate
      : 0;
  const cashbackAmount =
    typeof raw.cashbackAmount === "number" && Number.isFinite(raw.cashbackAmount)
      ? raw.cashbackAmount
      : 0;
  const balance =
    typeof raw.balance === "number" && Number.isFinite(raw.balance) ? raw.balance : 0;
  const hold = Boolean(raw.hold);
  const description = typeof raw.description === "string" ? raw.description : "";
  const comment = typeof raw.comment === "string" ? raw.comment : undefined;
  const counterName = typeof raw.counterName === "string" ? raw.counterName : undefined;
  const receiptId = typeof raw.receiptId === "string" ? raw.receiptId : undefined;

  const item: MonoStatementItem = {
    id,
    time,
    description,
    mcc,
    originalMcc,
    hold,
    amount,
    operationAmount,
    currencyCode,
    commissionRate,
    cashbackAmount,
    balance,
    comment,
    counterName,
    receiptId,
  };

  return { ok: true, accountId: account, item };
}
