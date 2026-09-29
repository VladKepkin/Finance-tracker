import type { DB } from "./db";
import { timeBounds } from "./repo/transactions";
import { listForUser } from "./repo/syncState";
import { coverageFromSyncState, type Coverage } from "./coverage";

export interface SyncStatusPayload {
  coverage: Coverage;
  accounts: {
    accountId: string;
    coveredFrom: string | null;
    coveredTo: string | null;
    backfillDone: boolean;
    status: string;
    error: string | null;
  }[];
}

const toDate = (unix: number | null): string | null =>
  unix == null ? null : new Date(unix * 1000).toISOString().slice(0, 10);

export function toStatusPayload(database: DB, userId: number): SyncStatusPayload {
  return {
    coverage: coverageFromSyncState(listForUser(database, userId), timeBounds(database, userId).samples),
    accounts: listForUser(database, userId).map((r) => ({
      accountId: r.account_id,
      coveredFrom: toDate(r.covered_from),
      coveredTo: toDate(r.covered_to),
      backfillDone: r.backfill_done === 1,
      status: r.status,
      error: r.error,
    })),
  };
}
