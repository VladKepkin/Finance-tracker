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
  accountId?: string
): { minTime: number | null; maxTime: number | null; samples: number } {
  const sql = `SELECT MIN(time) AS minTime, MAX(time) AS maxTime, COUNT(*) AS samples FROM transactions WHERE user_id = ?${
    accountId != null ? " AND account_id = ?" : ""
  }`;
  const params: (string | number)[] = accountId != null ? [userId, accountId] : [userId];
  const row = database.prepare(sql).get(...params) as {
    minTime: number | null;
    maxTime: number | null;
    samples: number;
  };
  return { minTime: row.minTime, maxTime: row.maxTime, samples: row.samples };
}

export function queryRange(database: DB, userId: number, fromTime: number, toTime: number): TxRow[] {
  return database
    .prepare(
      "SELECT * FROM transactions WHERE user_id = ? AND time >= ? AND time <= ? ORDER BY time ASC"
    )
    .all(userId, fromTime, toTime) as TxRow[];
}

export function queryPage(
  database: DB,
  userId: number,
  opts: { accountId?: string; fromTime: number; toTime: number; limit: number; offset: number }
): TxRow[] {
  const byAccount = opts.accountId != null;
  const sql = `SELECT * FROM transactions
     WHERE user_id = ? AND time >= ? AND time <= ?${byAccount ? " AND account_id = ?" : ""}
     ORDER BY time DESC
     LIMIT ? OFFSET ?`;
  const params: (string | number)[] = [userId, opts.fromTime, opts.toTime];
  if (byAccount) params.push(opts.accountId!);
  params.push(opts.limit, opts.offset);
  return database.prepare(sql).all(...params) as TxRow[];
}
