import type { DB } from "../db";
import type { MonoStatementItem } from "../monobank";

export interface TxRow {
  id: string;
  user_id: number;
  account_id: string;
  time: number;
  description: string | null;
  mcc: number | null;
  original_mcc: number | null;
  amount: number;
  operation_amount: number | null;
  currency_code: number;
  commission_rate: number | null;
  cashback_amount: number | null;
  balance: number | null;
  hold: number;
  comment: string | null;
  counter_name: string | null;
  fetched_at: number;
}

const UPSERT = `
  INSERT INTO transactions (
    id, user_id, account_id, time, description, mcc, original_mcc, amount,
    operation_amount, currency_code, commission_rate, cashback_amount, balance,
    hold, comment, counter_name, fetched_at
  ) VALUES (
    @id, @user_id, @account_id, @time, @description, @mcc, @original_mcc, @amount,
    @operation_amount, @currency_code, @commission_rate, @cashback_amount, @balance,
    @hold, @comment, @counter_name, @fetched_at
  )
  ON CONFLICT(id) DO UPDATE SET
    amount           = excluded.amount,
    operation_amount = excluded.operation_amount,
    balance          = excluded.balance,
    hold             = excluded.hold,
    description      = excluded.description,
    comment          = excluded.comment,
    counter_name     = excluded.counter_name,
    fetched_at       = excluded.fetched_at
`;

export function upsertMany(
  database: DB,
  userId: number,
  accountId: string,
  items: MonoStatementItem[],
  fetchedAt: number
): number {
  if (items.length === 0) return 0;
  const stmt = database.prepare(UPSERT);
  const run = database.transaction((rows: MonoStatementItem[]) => {
    for (const it of rows) {
      stmt.run({
        id: it.id,
        user_id: userId,
        account_id: accountId,
        time: it.time,
        description: it.description ?? null,
        mcc: it.mcc ?? null,
        original_mcc: it.originalMcc ?? null,
        amount: it.amount,
        operation_amount: it.operationAmount ?? null,
        currency_code: it.currencyCode,
        commission_rate: it.commissionRate ?? null,
        cashback_amount: it.cashbackAmount ?? null,
        balance: it.balance ?? null,
        hold: it.hold ? 1 : 0,
        comment: it.comment ?? null,
        counter_name: it.counterName ?? null,
        fetched_at: fetchedAt,
      });
    }
  });
  run(items);
  return items.length;
}

export function timeBounds(
  database: DB,
  userId: number,
  accountId?: string,
  accessibleAccountIds: string[] = []
): { minTime: number | null; maxTime: number | null; samples: number } {
  if (accountId != null) {
    const isShared = accessibleAccountIds.includes(accountId);
    const sql = isShared
      ? `SELECT MIN(time) AS minTime, MAX(time) AS maxTime, COUNT(*) AS samples FROM transactions WHERE account_id = ?`
      : `SELECT MIN(time) AS minTime, MAX(time) AS maxTime, COUNT(*) AS samples FROM transactions WHERE user_id = ? AND account_id = ?`;
    const params = isShared ? [accountId] : [userId, accountId];
    const row = database.prepare(sql).get(...params) as {
      minTime: number | null;
      maxTime: number | null;
      samples: number;
    };
    return { minTime: row.minTime, maxTime: row.maxTime, samples: row.samples };
  }

  if (accessibleAccountIds.length === 0) {
    const sql = `SELECT MIN(time) AS minTime, MAX(time) AS maxTime, COUNT(*) AS samples FROM transactions WHERE user_id = ?`;
    const row = database.prepare(sql).get(userId) as {
      minTime: number | null;
      maxTime: number | null;
      samples: number;
    };
    return { minTime: row.minTime, maxTime: row.maxTime, samples: row.samples };
  }

  const placeholders = accessibleAccountIds.map(() => "?").join(",");
  const sql = `SELECT MIN(time) AS minTime, MAX(time) AS maxTime, COUNT(*) AS samples FROM transactions WHERE user_id = ? OR account_id IN (${placeholders})`;
  const row = database.prepare(sql).get(userId, ...accessibleAccountIds) as {
    minTime: number | null;
    maxTime: number | null;
    samples: number;
  };
  return { minTime: row.minTime, maxTime: row.maxTime, samples: row.samples };
}

export function queryRange(
  database: DB,
  userId: number,
  fromTime: number,
  toTime: number,
  accessibleAccountIds: string[] = []
): TxRow[] {
  if (accessibleAccountIds.length === 0) {
    return database
      .prepare(
        "SELECT * FROM transactions WHERE user_id = ? AND time >= ? AND time <= ? ORDER BY time ASC"
      )
      .all(userId, fromTime, toTime) as TxRow[];
  }
  const placeholders = accessibleAccountIds.map(() => "?").join(",");
  const sql = `SELECT * FROM transactions
    WHERE (user_id = ? OR account_id IN (${placeholders}))
      AND time >= ? AND time <= ?
    ORDER BY time ASC`;
  return database.prepare(sql).all(userId, ...accessibleAccountIds, fromTime, toTime) as TxRow[];
}

export function queryPage(
  database: DB,
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
): TxRow[] {
  const accessible = opts.accessibleAccountIds ?? [];
  const byAccount = opts.accountId != null;

  if (byAccount) {
    const isShared = accessible.includes(opts.accountId!);
    const sql = isShared
      ? `SELECT * FROM transactions WHERE account_id = ? AND time >= ? AND time <= ? ORDER BY time DESC LIMIT ? OFFSET ?`
      : `SELECT * FROM transactions WHERE user_id = ? AND account_id = ? AND time >= ? AND time <= ? ORDER BY time DESC LIMIT ? OFFSET ?`;
    const params = isShared
      ? [opts.accountId!, opts.fromTime, opts.toTime, opts.limit, opts.offset]
      : [userId, opts.accountId!, opts.fromTime, opts.toTime, opts.limit, opts.offset];
    return database.prepare(sql).all(...params) as TxRow[];
  }

  if (opts.scope === "family") {
    if (accessible.length === 0) return [];
    const placeholders = accessible.map(() => "?").join(",");
    const sql = `SELECT * FROM transactions WHERE account_id IN (${placeholders}) AND time >= ? AND time <= ? ORDER BY time DESC LIMIT ? OFFSET ?`;
    return database
      .prepare(sql)
      .all(...accessible, opts.fromTime, opts.toTime, opts.limit, opts.offset) as TxRow[];
  }

  if (opts.scope === "personal") {
    const sql = `SELECT * FROM transactions WHERE user_id = ? AND time >= ? AND time <= ? ORDER BY time DESC LIMIT ? OFFSET ?`;
    return database
      .prepare(sql)
      .all(userId, opts.fromTime, opts.toTime, opts.limit, opts.offset) as TxRow[];
  }

  if (accessible.length === 0) {
    const sql = `SELECT * FROM transactions
       WHERE user_id = ? AND time >= ? AND time <= ?
       ORDER BY time DESC
       LIMIT ? OFFSET ?`;
    return database
      .prepare(sql)
      .all(userId, opts.fromTime, opts.toTime, opts.limit, opts.offset) as TxRow[];
  }

  const placeholders = accessible.map(() => "?").join(",");
  const sql = `SELECT * FROM transactions
     WHERE (user_id = ? OR account_id IN (${placeholders})) AND time >= ? AND time <= ?
     ORDER BY time DESC
     LIMIT ? OFFSET ?`;
  return database
    .prepare(sql)
    .all(userId, ...accessible, opts.fromTime, opts.toTime, opts.limit, opts.offset) as TxRow[];
}
