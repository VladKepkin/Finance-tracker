import { isPostgresConfigured } from "./pg";
import { db, getUserById, getUserByUsername, createUser, getMonoTokenEnc, setMonoTokenEnc, getAllKV, setKV } from "./db";
import * as pgRepo from "./pg-repo";
import * as txRepo from "./repo/transactions";
import * as commitRepo from "./repo/commitments";
import * as salRepo from "./repo/salaries";
import * as ratRepo from "./repo/ratings";
import * as fxRepo from "./repo/fxRates";
import * as syncRepo from "./repo/syncState";
import * as grpRepo from "./repo/groups";
import type { TxRow } from "./repo/transactions";
import type { UserRow } from "./db";
import type { CommitmentRow } from "./repo/commitments";
import type { SalaryRow } from "./repo/salaries";
import type { CurrencyRate } from "./fx";
import type { SyncStateRow, SyncStatus } from "./repo/syncState";
import type { Cadence } from "./metrics/cadence";
import type { MonoStatementItem } from "./monobank";

// --- Users ---

export async function adapterGetUserByUsername(username: string): Promise<UserRow | undefined> {
  if (isPostgresConfigured()) {
    return pgRepo.getUserByUsernamePg(username);
  }
  return getUserByUsername(username);
}

export async function adapterGetUserById(id: number): Promise<UserRow | undefined> {
  if (isPostgresConfigured()) {
    return pgRepo.getUserByIdPg(id);
  }
  return getUserById(id);
}

export async function adapterCreateUser(username: string, password: string): Promise<UserRow> {
  if (isPostgresConfigured()) {
    return pgRepo.createUserPg(username, password);
  }
  return createUser(username, password);
}

export async function adapterGetMonoTokenEnc(userId: number): Promise<string | null> {
  if (isPostgresConfigured()) {
    return pgRepo.getMonoTokenEncPg(userId);
  }
  return getMonoTokenEnc(userId);
}

export async function adapterSetMonoTokenEnc(userId: number, enc: string | null): Promise<void> {
  if (isPostgresConfigured()) {
    return pgRepo.setMonoTokenEncPg(userId, enc);
  }
  setMonoTokenEnc(userId, enc);
}

// --- KV ---

export async function adapterGetAllKV(userId: number): Promise<Record<string, unknown>> {
  if (isPostgresConfigured()) {
    return pgRepo.getAllKVPg(userId);
  }
  return getAllKV(userId);
}

export async function adapterSetKV(userId: number, key: string, value: unknown): Promise<void> {
  if (isPostgresConfigured()) {
    return pgRepo.setKVPg(userId, key, value);
  }
  setKV(userId, key, value);
}

// --- Transactions ---

export async function adapterQueryPageTransactions(
  userId: number,
  opts: {
    accountId?: string;
    fromTime: number;
    toTime: number;
    limit: number;
    offset: number;
    accessibleAccountIds?: string[];
    scope?: "all" | "personal" | "family";
  }
): Promise<TxRow[]> {
  if (isPostgresConfigured()) {
    return pgRepo.queryPageTransactionsPg(userId, opts);
  }
  return txRepo.queryPage(db(), userId, opts);
}

export async function adapterQueryRangeTransactions(
  userId: number,
  fromTime: number,
  toTime: number,
  accessibleAccountIds: string[] = []
): Promise<TxRow[]> {
  if (isPostgresConfigured()) {
    return pgRepo.queryRangeTransactionsPg(userId, fromTime, toTime, accessibleAccountIds);
  }
  return txRepo.queryRange(db(), userId, fromTime, toTime, accessibleAccountIds);
}

export async function adapterTimeBoundsTransactions(
  userId: number,
  accountId?: string,
  accessibleAccountIds: string[] = []
): Promise<{ minTime: number | null; maxTime: number | null; samples: number }> {
  if (isPostgresConfigured()) {
    return pgRepo.timeBoundsTransactionsPg(userId, accountId, accessibleAccountIds);
  }
  return txRepo.timeBounds(db(), userId, accountId, accessibleAccountIds);
}

export async function adapterGetLatestTxForAccount(
  accountId: string
): Promise<{ balance: number; currency_code: number } | undefined> {
  if (isPostgresConfigured()) {
    const res = await (await import("./pg")).queryPg<{ balance: number; currency_code: number }>(
      "SELECT balance, currency_code FROM transactions WHERE account_id = $1 ORDER BY time DESC LIMIT 1",
      [accountId]
    );
    return res.rows[0];
  }
  return db()
    .prepare("SELECT balance, currency_code FROM transactions WHERE account_id = ? ORDER BY time DESC LIMIT 1")
    .get(accountId) as { balance: number; currency_code: number } | undefined;
}

export async function adapterUpsertManyTransactions(
  userId: number,
  accountId: string,
  items: MonoStatementItem[],
  fetchedAt: number
): Promise<number> {
  if (isPostgresConfigured()) {
    return pgRepo.upsertManyTransactionsPg(userId, accountId, items, fetchedAt);
  }
  return txRepo.upsertMany(db(), userId, accountId, items, fetchedAt);
}

// --- Commitments ---

export async function adapterListActiveCommitments(userId: number): Promise<CommitmentRow[]> {
  if (isPostgresConfigured()) {
    return pgRepo.listActiveCommitmentsPg(userId);
  }
  return commitRepo.listActive(db(), userId);
}

export async function adapterInsertCommitment(
  userId: number,
  c: {
    name: string;
    amount: number;
    currency: number;
    cadence: Cadence;
    anchorDay: number;
    matcher?: string | null;
    source?: "card" | "cash";
  },
  nowSeconds: number
): Promise<number> {
  if (isPostgresConfigured()) {
    return pgRepo.insertCommitmentPg(userId, c, nowSeconds);
  }
  return commitRepo.insert(db(), userId, c, nowSeconds);
}

export async function adapterGetCommitmentById(userId: number, id: number): Promise<CommitmentRow | null> {
  if (isPostgresConfigured()) {
    return pgRepo.getCommitmentByIdPg(userId, id);
  }
  return commitRepo.getById(db(), userId, id);
}

export async function adapterUpdateCommitment(
  userId: number,
  id: number,
  patch: { name?: string; amount?: number; cadence?: Cadence; anchorDay?: number; source?: "card" | "cash" }
): Promise<boolean> {
  if (isPostgresConfigured()) {
    return pgRepo.updateCommitmentPg(userId, id, patch);
  }
  return commitRepo.update(db(), userId, id, patch);
}

export async function adapterDeactivateCommitment(userId: number, id: number): Promise<boolean> {
  if (isPostgresConfigured()) {
    return pgRepo.deactivateCommitmentPg(userId, id);
  }
  return commitRepo.deactivate(db(), userId, id);
}

// --- Salaries ---

export async function adapterListSalaries(userId: number): Promise<SalaryRow[]> {
  if (isPostgresConfigured()) {
    return pgRepo.listSalariesPg(userId);
  }
  return salRepo.list(db(), userId);
}

export async function adapterInsertSalary(
  userId: number,
  s: { paidOn: string; amount: number; currency: number; note?: string | null },
  nowSeconds: number
): Promise<number> {
  if (isPostgresConfigured()) {
    return pgRepo.insertSalaryPg(userId, s, nowSeconds);
  }
  return salRepo.insert(db(), userId, s, nowSeconds);
}

export async function adapterGetSalaryById(userId: number, id: number): Promise<SalaryRow | null> {
  if (isPostgresConfigured()) {
    return pgRepo.getSalaryByIdPg(userId, id);
  }
  return salRepo.getById(db(), userId, id);
}

export async function adapterUpdateSalary(
  userId: number,
  id: number,
  patch: { paidOn?: string; amount?: number; currency?: number; note?: string | null }
): Promise<boolean> {
  if (isPostgresConfigured()) {
    return pgRepo.updateSalaryPg(userId, id, patch);
  }
  return salRepo.update(db(), userId, id, patch);
}

export async function adapterRemoveSalary(userId: number, id: number): Promise<boolean> {
  if (isPostgresConfigured()) {
    return pgRepo.removeSalaryPg(userId, id);
  }
  return salRepo.remove(db(), userId, id);
}

// --- Ratings ---

export async function adapterSetRating(
  userId: number,
  txId: string,
  score: number,
  nowSeconds: number
): Promise<void> {
  if (isPostgresConfigured()) {
    return pgRepo.setRatingPg(userId, txId, score, nowSeconds);
  }
  ratRepo.setRating(db(), userId, txId, score, nowSeconds);
}

export async function adapterGetRatings(userId: number, txIds: string[]): Promise<Map<string, number>> {
  if (isPostgresConfigured()) {
    return pgRepo.getRatingsPg(userId, txIds);
  }
  return ratRepo.getRatings(db(), userId, txIds);
}

export async function adapterClearRating(userId: number, txId: string): Promise<boolean> {
  if (isPostgresConfigured()) {
    return pgRepo.clearRatingPg(userId, txId);
  }
  return ratRepo.clearRating(db(), userId, txId);
}

// --- FX Rates ---

export async function adapterLatestRates(): Promise<CurrencyRate[]> {
  if (isPostgresConfigured()) {
    return pgRepo.latestRatesFxPg();
  }
  return fxRepo.latestRates(db());
}

export async function adapterUpsertDailyFxRates(date: string, rates: CurrencyRate[]): Promise<number> {
  if (isPostgresConfigured()) {
    return pgRepo.upsertDailyFxRatesPg(date, rates);
  }
  return fxRepo.upsertDaily(db(), date, rates);
}

// --- Sync State ---

export async function adapterGetSyncState(userId: number, accountId: string): Promise<SyncStateRow | undefined> {
  if (isPostgresConfigured()) {
    return pgRepo.getSyncStatePg(userId, accountId);
  }
  return syncRepo.get(db(), userId, accountId);
}

export async function adapterEnsureSyncState(
  userId: number,
  accountId: string,
  nowSeconds: number
): Promise<SyncStateRow> {
  if (isPostgresConfigured()) {
    return pgRepo.ensureSyncStatePg(userId, accountId, nowSeconds);
  }
  return syncRepo.ensure(db(), userId, accountId, nowSeconds);
}

export async function adapterListSyncStateForUser(userId: number): Promise<SyncStateRow[]> {
  if (isPostgresConfigured()) {
    return pgRepo.listSyncStateForUserPg(userId);
  }
  return syncRepo.listForUser(db(), userId);
}

// --- Groups ---

export async function adapterCreateGroup(
  name: string,
  ownerUserId: number
): Promise<{ id: number; name: string }> {
  if (isPostgresConfigured()) {
    return pgRepo.createGroupPg(name, ownerUserId);
  }
  return grpRepo.createGroup(db(), name, ownerUserId);
}

export async function adapterGetGroupsForUser(
  userId: number
): Promise<{ id: number; name: string; role: "owner" | "member"; memberCount: number }[]> {
  if (isPostgresConfigured()) {
    return pgRepo.getGroupsForUserPg(userId);
  }
  return grpRepo.getGroupsForUser(db(), userId);
}

export async function adapterGetGroupMembers(
  groupId: number
): Promise<{ userId: number; username: string; role: "owner" | "member"; joinedAt: number }[]> {
  if (isPostgresConfigured()) {
    return pgRepo.getGroupMembersPg(groupId);
  }
  return grpRepo.getGroupMembers(db(), groupId);
}

export async function adapterShareAccount(
  accountId: string,
  ownerUserId: number,
  groupId: number
): Promise<void> {
  if (isPostgresConfigured()) {
    return pgRepo.shareAccountPg(accountId, ownerUserId, groupId);
  }
  grpRepo.shareAccount(db(), accountId, ownerUserId, groupId);
}

export async function adapterUnshareAccount(
  accountId: string,
  ownerUserId: number,
  groupId: number
): Promise<void> {
  if (isPostgresConfigured()) {
    return pgRepo.unshareAccountPg(accountId, ownerUserId, groupId);
  }
  grpRepo.unshareAccount(db(), accountId, ownerUserId, groupId);
}

export async function adapterGetSharedAccountsForGroup(
  groupId: number
): Promise<{ accountId: string; ownerUserId: number; createdAt: number }[]> {
  if (isPostgresConfigured()) {
    return pgRepo.getSharedAccountsForGroupPg(groupId);
  }
  return grpRepo.getSharedAccountsForGroup(db(), groupId);
}

export async function adapterGetSharedAccountsForUser(
  userId: number
): Promise<{ accountId: string; ownerUserId: number; groupId: number; groupName: string }[]> {
  if (isPostgresConfigured()) {
    return pgRepo.getSharedAccountsForUserPg(userId);
  }
  return grpRepo.getSharedAccountsForUser(db(), userId);
}

export async function adapterGetAccessibleAccountIds(userId: number): Promise<string[]> {
  if (isPostgresConfigured()) {
    return pgRepo.getAccessibleAccountIdsPg(userId);
  }
  return grpRepo.getAccessibleAccountIds(db(), userId);
}

export async function adapterCreateInvite(
  groupId: number,
  createdByUserId: number,
  expiresInDays?: number
): Promise<string> {
  if (isPostgresConfigured()) {
    return pgRepo.createInvitePg(groupId, createdByUserId, expiresInDays);
  }
  return grpRepo.createInvite(db(), groupId, createdByUserId, expiresInDays);
}

export async function adapterAcceptInvite(
  code: string,
  userId: number
): Promise<{ groupId: number; groupName: string }> {
  if (isPostgresConfigured()) {
    return pgRepo.acceptInvitePg(code, userId);
  }
  return grpRepo.acceptInvite(db(), code, userId);
}
