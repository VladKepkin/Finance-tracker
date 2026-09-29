import type { DB } from "../db";

export type SyncStatus = "idle" | "backfilling" | "syncing" | "error";

export interface SyncStateRow {
  user_id: number;
  account_id: string;
  covered_from: number | null;
  covered_to: number | null;
  backfill_done: number;
  last_run: number | null;
  status: SyncStatus;
  error: string | null;
}

export function get(database: DB, userId: number, accountId: string): SyncStateRow | undefined {
  return database
    .prepare("SELECT * FROM sync_state WHERE user_id = ? AND account_id = ?")
    .get(userId, accountId) as SyncStateRow | undefined;
}

export function ensure(
  database: DB,
  userId: number,
  accountId: string,
  nowSeconds: number
): SyncStateRow {
  database
    .prepare(
      `INSERT INTO sync_state (user_id, account_id, covered_from, covered_to, backfill_done, last_run, status)
       VALUES (?, ?, ?, ?, 0, ?, 'idle')
       ON CONFLICT(user_id, account_id) DO NOTHING`
    )
    .run(userId, accountId, nowSeconds, nowSeconds, nowSeconds);
  return get(database, userId, accountId)!;
}

export function setCoveredFrom(database: DB, userId: number, accountId: string, from: number): void {
  database
    .prepare("UPDATE sync_state SET covered_from = ? WHERE user_id = ? AND account_id = ?")
    .run(from, userId, accountId);
}

export function setCoveredTo(database: DB, userId: number, accountId: string, to: number): void {
  database
    .prepare("UPDATE sync_state SET covered_to = ? WHERE user_id = ? AND account_id = ?")
    .run(to, userId, accountId);
}

export function markBackfillDone(database: DB, userId: number, accountId: string): void {
  database
    .prepare("UPDATE sync_state SET backfill_done = 1 WHERE user_id = ? AND account_id = ?")
    .run(userId, accountId);
}

export function setStatus(
  database: DB,
  userId: number,
  accountId: string,
  status: SyncStatus,
  error: string | null = null
): void {
  database
    .prepare(
      "UPDATE sync_state SET status = ?, error = ?, last_run = ? WHERE user_id = ? AND account_id = ?"
    )
    .run(status, error, Math.floor(Date.now() / 1000), userId, accountId);
}

export function listForUser(database: DB, userId: number): SyncStateRow[] {
  return database
    .prepare("SELECT * FROM sync_state WHERE user_id = ?")
    .all(userId) as SyncStateRow[];
}
