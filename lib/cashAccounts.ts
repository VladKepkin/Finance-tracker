export type AccountType = "card" | "cash" | "bank_account";

export interface CashAccount {
  id: string;
  name: string;
  type?: AccountType;
  maskedPan?: string;
  currencyCode?: number;
  bankName?: string;
}

export const DEFAULT_CASH_ACCOUNT_ID = "cash";
export const DEFAULT_CASH_ACCOUNT_NAME = "Готівка";

export function isValidCashAccount(v: unknown): v is CashAccount {
  if (v === null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === "string" && o.id.length > 0 && typeof o.name === "string" && o.name.trim().length > 0;
}

export function parseCashAccounts(raw: unknown): CashAccount[] {
  const stored = Array.isArray(raw) ? raw.filter(isValidCashAccount) : [];
  return stored.some((a) => a.id === DEFAULT_CASH_ACCOUNT_ID)
    ? stored
    : [{ id: DEFAULT_CASH_ACCOUNT_ID, name: DEFAULT_CASH_ACCOUNT_NAME }, ...stored];
}

export function resolveAccountId(accountId: string | undefined, knownIds: ReadonlySet<string>): string {
  if (accountId === undefined) return DEFAULT_CASH_ACCOUNT_ID;
  return knownIds.has(accountId) ? accountId : DEFAULT_CASH_ACCOUNT_ID;
}

export function accountDisplay(
  accountId: string | undefined,
  accounts: readonly CashAccount[]
): {
  name: string;
  orphaned: boolean;
  type: AccountType;
  maskedPan?: string;
  bankName?: string;
} {
  const knownIds = new Set(accounts.map((a) => a.id));
  const resolvedId = resolveAccountId(accountId, knownIds);
  const account = accounts.find((a) => a.id === resolvedId);
  const name = account?.name ?? DEFAULT_CASH_ACCOUNT_NAME;
  const orphaned = accountId !== undefined && !knownIds.has(accountId);
  const type: AccountType = account?.type ?? (resolvedId === DEFAULT_CASH_ACCOUNT_ID ? "cash" : "card");
  return {
    name,
    orphaned,
    type,
    maskedPan: account?.maskedPan,
    bankName: account?.bankName,
  };
}
