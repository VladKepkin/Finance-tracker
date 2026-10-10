import { getPgPool, queryPg, withPgTransaction } from "./pg";
import { hashPassword, verifyPassword, type UserRow } from "./db";
import type { TxRow } from "./repo/transactions";
import type { MonoStatementItem } from "./monobank";
import type { Cadence } from "./metrics/cadence";
import type { CommitmentRow } from "./repo/commitments";
import type { SalaryRow } from "./repo/salaries";
import type { CurrencyRate } from "./fx";
import type { SyncStateRow, SyncStatus } from "./repo/syncState";
import { randomBytes } from "crypto";

// --- Users & Auth ---

export async function getUserByUsernamePg(username: string): Promise<UserRow | undefined> {
  const res = await queryPg<UserRow>("SELECT * FROM users WHERE username = $1", [username]);
  return res.rows[0];
}

export async function getUserByIdPg(id: number): Promise<UserRow | undefined> {
  const res = await queryPg<UserRow>("SELECT * FROM users WHERE id = $1", [id]);
  return res.rows[0];
}

export async function getAllUsersWithTokenPg(): Promise<UserRow[]> {
  const res = await queryPg<UserRow>("SELECT * FROM users WHERE mono_token IS NOT NULL");
  return res.rows;
}

export async function createUserPg(username: string, password: string): Promise<UserRow> {
  const passwordHash = hashPassword(password);
  const now = Date.now();
  const res = await queryPg<UserRow>(
    "INSERT INTO users (username, password_hash, created_at) VALUES ($1, $2, $3) RETURNING *",
    [username, passwordHash, now]
  );
  return res.rows[0];
}

export async function getMonoTokenEncPg(userId: number): Promise<string | null> {
  const res = await queryPg<{ mono_token: string | null }>(
    "SELECT mono_token FROM users WHERE id = $1",
    [userId]
  );
  return res.rows[0]?.mono_token ?? null;
}

export async function setMonoTokenEncPg(userId: number, enc: string | null): Promise<void> {
  await queryPg("UPDATE users SET mono_token = $1 WHERE id = $2", [enc, userId]);
}

export async function seedSingleUserPg(): Promise<void> {
  const username = process.env.APP_USERNAME || "admin";
  const password = process.env.APP_PASSWORD;
  if (!password) return;

  const existing = await getUserByUsernamePg(username);
  if (!existing) {
    await createUserPg(username, password);
  } else if (!verifyPassword(password, existing.password_hash)) {
    await queryPg("UPDATE users SET password_hash = $1 WHERE id = $2", [
      hashPassword(password),
      existing.id,
    ]);
  }
}

// --- KV Store ---

export async function getAllKVPg(userId: number): Promise<Record<string, unknown>> {
  const res = await queryPg<{ key: string; value: string }>(
    "SELECT key, value FROM kv WHERE user_id = $1",
    [userId]
  );
  const out: Record<string, unknown> = {};
  for (const r of res.rows) {
    try {
      out[r.key] = JSON.parse(r.value);
    } catch {}
  }
  return out;
}

export async function setKVPg(userId: number, key: string, value: unknown): Promise<void> {
  await queryPg(
    `INSERT INTO kv (user_id, key, value) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value`,
    [userId, key, JSON.stringify(value)]
  );
}

// --- Transactions ---

export async function upsertManyTransactionsPg(
  userId: number,
  accountId: string,
  items: MonoStatementItem[],
  fetchedAt: number
): Promise<number> {
  if (items.length === 0) return 0;

  return withPgTransaction(async (client) => {
    for (const it of items) {
      await client.query(
        `INSERT INTO transactions (
          id, user_id, account_id, time, description, mcc, original_mcc, amount,
          operation_amount, currency_code, commission_rate, cashback_amount, balance,
          hold, comment, counter_name, fetched_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
        )
        ON CONFLICT(id) DO UPDATE SET
          amount           = excluded.amount,
          operation_amount = excluded.operation_amount,
          balance          = excluded.balance,
          hold             = excluded.hold,
          description      = excluded.description,
          comment          = excluded.comment,
          counter_name     = excluded.counter_name,
          fetched_at       = excluded.fetched_at`,
        [
          it.id,
          userId,
          accountId,
          it.time,
          it.description ?? null,
          it.mcc ?? null,
          it.originalMcc ?? null,
          it.amount,
          it.operationAmount ?? null,
          it.currencyCode,
          it.commissionRate ?? null,
          it.cashbackAmount ?? null,
          it.balance ?? null,
          it.hold ? 1 : 0,
          it.comment ?? null,
          it.counterName ?? null,
          fetchedAt,
        ]
      );
    }
    return items.length;
  });
}

export async function timeBoundsTransactionsPg(
  userId: number,
  accountId?: string,
  accessibleAccountIds: string[] = []
): Promise<{ minTime: number | null; maxTime: number | null; samples: number }> {
  if (accountId != null) {
    const isShared = accessibleAccountIds.includes(accountId);
    const sql = isShared
      ? `SELECT MIN(time) AS "minTime", MAX(time) AS "maxTime", COUNT(*)::int AS samples FROM transactions WHERE account_id = $1`
      : `SELECT MIN(time) AS "minTime", MAX(time) AS "maxTime", COUNT(*)::int AS samples FROM transactions WHERE user_id = $1 AND account_id = $2`;
    const params = isShared ? [accountId] : [userId, accountId];
    const res = await queryPg<{ minTime: number | null; maxTime: number | null; samples: number }>(sql, params);
    const row = res.rows[0];
    return { minTime: row?.minTime ?? null, maxTime: row?.maxTime ?? null, samples: Number(row?.samples ?? 0) };
  }

  if (accessibleAccountIds.length === 0) {
    const sql = `SELECT MIN(time) AS "minTime", MAX(time) AS "maxTime", COUNT(*)::int AS samples FROM transactions WHERE user_id = $1`;
    const res = await queryPg<{ minTime: number | null; maxTime: number | null; samples: number }>(sql, [userId]);
    const row = res.rows[0];
    return { minTime: row?.minTime ?? null, maxTime: row?.maxTime ?? null, samples: Number(row?.samples ?? 0) };
  }

  const placeholders = accessibleAccountIds.map((_, i) => `$${i + 2}`).join(",");
  const sql = `SELECT MIN(time) AS "minTime", MAX(time) AS "maxTime", COUNT(*)::int AS samples FROM transactions WHERE user_id = $1 OR account_id IN (${placeholders})`;
  const res = await queryPg<{ minTime: number | null; maxTime: number | null; samples: number }>(
    sql,
    [userId, ...accessibleAccountIds]
  );
  const row = res.rows[0];
  return { minTime: row?.minTime ?? null, maxTime: row?.maxTime ?? null, samples: Number(row?.samples ?? 0) };
}

export async function queryRangeTransactionsPg(
  userId: number,
  fromTime: number,
  toTime: number,
  accessibleAccountIds: string[] = []
): Promise<TxRow[]> {
  if (accessibleAccountIds.length === 0) {
    const res = await queryPg<TxRow>(
      "SELECT * FROM transactions WHERE user_id = $1 AND time >= $2 AND time <= $3 ORDER BY time ASC",
      [userId, fromTime, toTime]
    );
    return res.rows;
  }
  const placeholders = accessibleAccountIds.map((_, i) => `$${i + 2}`).join(",");
  const sql = `SELECT * FROM transactions
    WHERE (user_id = $1 OR account_id IN (${placeholders}))
      AND time >= $${accessibleAccountIds.length + 2} AND time <= $${accessibleAccountIds.length + 3}
    ORDER BY time ASC`;
  const res = await queryPg<TxRow>(sql, [userId, ...accessibleAccountIds, fromTime, toTime]);
  return res.rows;
}

export async function queryPageTransactionsPg(
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
  const accessible = opts.accessibleAccountIds ?? [];
  const byAccount = opts.accountId != null;

  if (byAccount) {
    const isShared = accessible.includes(opts.accountId!);
    const sql = isShared
      ? `SELECT * FROM transactions WHERE account_id = $1 AND time >= $2 AND time <= $3 ORDER BY time DESC LIMIT $4 OFFSET $5`
      : `SELECT * FROM transactions WHERE user_id = $1 AND account_id = $2 AND time >= $3 AND time <= $4 ORDER BY time DESC LIMIT $5 OFFSET $6`;
    const params = isShared
      ? [opts.accountId!, opts.fromTime, opts.toTime, opts.limit, opts.offset]
      : [userId, opts.accountId!, opts.fromTime, opts.toTime, opts.limit, opts.offset];
    const res = await queryPg<TxRow>(sql, params);
    return res.rows;
  }

  if (opts.scope === "family") {
    if (accessible.length === 0) return [];
    const placeholders = accessible.map((_, i) => `$${i + 1}`).join(",");
    const pLen = accessible.length;
    const sql = `SELECT * FROM transactions WHERE account_id IN (${placeholders}) AND time >= $${pLen + 1} AND time <= $${pLen + 2} ORDER BY time DESC LIMIT $${pLen + 3} OFFSET $${pLen + 4}`;
    const res = await queryPg<TxRow>(sql, [...accessible, opts.fromTime, opts.toTime, opts.limit, opts.offset]);
    return res.rows;
  }

  if (opts.scope === "personal") {
    const sql = `SELECT * FROM transactions WHERE user_id = $1 AND time >= $2 AND time <= $3 ORDER BY time DESC LIMIT $4 OFFSET $5`;
    const res = await queryPg<TxRow>(sql, [userId, opts.fromTime, opts.toTime, opts.limit, opts.offset]);
    return res.rows;
  }

  if (accessible.length === 0) {
    const sql = `SELECT * FROM transactions
       WHERE user_id = $1 AND time >= $2 AND time <= $3
       ORDER BY time DESC
       LIMIT $4 OFFSET $5`;
    const res = await queryPg<TxRow>(sql, [userId, opts.fromTime, opts.toTime, opts.limit, opts.offset]);
    return res.rows;
  }

  const placeholders = accessible.map((_, i) => `$${i + 2}`).join(",");
  const pLen = accessible.length;
  const sql = `SELECT * FROM transactions
     WHERE (user_id = $1 OR account_id IN (${placeholders})) AND time >= $${pLen + 2} AND time <= $${pLen + 3}
     ORDER BY time DESC
     LIMIT $${pLen + 4} OFFSET $${pLen + 5}`;
  const res = await queryPg<TxRow>(sql, [
    userId,
    ...accessible,
    opts.fromTime,
    opts.toTime,
    opts.limit,
    opts.offset,
  ]);
  return res.rows;
}

// --- Commitments ---

export async function listActiveCommitmentsPg(userId: number): Promise<CommitmentRow[]> {
  const res = await queryPg<CommitmentRow>(
    "SELECT * FROM commitments WHERE user_id = $1 AND active = 1 ORDER BY amount DESC",
    [userId]
  );
  return res.rows;
}

export async function insertCommitmentPg(
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
  const source = c.source === "cash" ? "cash" : "card";
  const res = await queryPg<{ id: number }>(
    `INSERT INTO commitments (user_id, name, amount, currency, cadence, anchor_day, matcher, active, created_at, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $9) RETURNING id`,
    [userId, c.name, c.amount, c.currency, c.cadence, c.anchorDay, c.matcher ?? null, nowSeconds, source]
  );
  return res.rows[0].id;
}

export async function getCommitmentByIdPg(userId: number, id: number): Promise<CommitmentRow | null> {
  const res = await queryPg<CommitmentRow>(
    "SELECT * FROM commitments WHERE id = $1 AND user_id = $2",
    [id, userId]
  );
  return res.rows[0] ?? null;
}

export async function updateCommitmentPg(
  userId: number,
  id: number,
  patch: { name?: string; amount?: number; cadence?: Cadence; anchorDay?: number; source?: "card" | "cash" }
): Promise<boolean> {
  const sets: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (patch.name !== undefined) {
    sets.push(`name = $${idx++}`);
    params.push(patch.name);
  }
  if (patch.amount !== undefined) {
    sets.push(`amount = $${idx++}`);
    params.push(patch.amount);
  }
  if (patch.cadence !== undefined) {
    sets.push(`cadence = $${idx++}`);
    params.push(patch.cadence);
  }
  if (patch.anchorDay !== undefined) {
    sets.push(`anchor_day = $${idx++}`);
    params.push(patch.anchorDay);
  }
  if (patch.source !== undefined) {
    sets.push(`source = $${idx++}`);
    params.push(patch.source);
  }
  if (sets.length === 0) return false;

  params.push(id, userId);
  const sql = `UPDATE commitments SET ${sets.join(", ")} WHERE id = $${idx++} AND user_id = $${idx++}`;
  const res = await queryPg(sql, params);
  return (res.rowCount ?? 0) > 0;
}

export async function deactivateCommitmentPg(userId: number, id: number): Promise<boolean> {
  const res = await queryPg("UPDATE commitments SET active = 0 WHERE id = $1 AND user_id = $2", [
    id,
    userId,
  ]);
  return (res.rowCount ?? 0) > 0;
}

export async function activeMatchersPg(userId: number): Promise<Set<string>> {
  const res = await queryPg<{ matcher: string }>(
    "SELECT matcher FROM commitments WHERE user_id = $1 AND active = 1 AND matcher IS NOT NULL",
    [userId]
  );
  return new Set(res.rows.map((r) => r.matcher));
}

// --- Salaries ---

export async function listSalariesPg(userId: number): Promise<SalaryRow[]> {
  const res = await queryPg<SalaryRow>(
    "SELECT * FROM salaries WHERE user_id = $1 ORDER BY paid_on DESC",
    [userId]
  );
  return res.rows;
}

export async function insertSalaryPg(
  userId: number,
  s: { paidOn: string; amount: number; currency: number; note?: string | null },
  nowSeconds: number
): Promise<number> {
  const res = await queryPg<{ id: number }>(
    `INSERT INTO salaries (user_id, paid_on, amount, currency, note, created_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [userId, s.paidOn, s.amount, s.currency, s.note ?? null, nowSeconds]
  );
  return res.rows[0].id;
}

export async function getSalaryByIdPg(userId: number, id: number): Promise<SalaryRow | null> {
  const res = await queryPg<SalaryRow>("SELECT * FROM salaries WHERE id = $1 AND user_id = $2", [
    id,
    userId,
  ]);
  return res.rows[0] ?? null;
}

export async function updateSalaryPg(
  userId: number,
  id: number,
  patch: { paidOn?: string; amount?: number; currency?: number; note?: string | null }
): Promise<boolean> {
  const sets: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (patch.paidOn !== undefined) {
    sets.push(`paid_on = $${idx++}`);
    params.push(patch.paidOn);
  }
  if (patch.amount !== undefined) {
    sets.push(`amount = $${idx++}`);
    params.push(patch.amount);
  }
  if (patch.currency !== undefined) {
    sets.push(`currency = $${idx++}`);
    params.push(patch.currency);
  }
  if (patch.note !== undefined) {
    sets.push(`note = $${idx++}`);
    params.push(patch.note);
  }
  if (sets.length === 0) return false;

  params.push(id, userId);
  const sql = `UPDATE salaries SET ${sets.join(", ")} WHERE id = $${idx++} AND user_id = $${idx++}`;
  const res = await queryPg(sql, params);
  return (res.rowCount ?? 0) > 0;
}

export async function removeSalaryPg(userId: number, id: number): Promise<boolean> {
  const res = await queryPg("DELETE FROM salaries WHERE id = $1 AND user_id = $2", [id, userId]);
  return (res.rowCount ?? 0) > 0;
}

// --- Ratings ---

export async function setRatingPg(
  userId: number,
  txId: string,
  score: number,
  nowSeconds: number
): Promise<void> {
  await queryPg(
    `INSERT INTO ratings (user_id, tx_id, score, created_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(user_id, tx_id) DO UPDATE SET score = excluded.score`,
    [userId, txId, score, nowSeconds]
  );
}

export async function getRatingsPg(userId: number, txIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (txIds.length === 0) return result;

  const res = await queryPg<{ tx_id: string; score: number }>(
    "SELECT tx_id, score FROM ratings WHERE user_id = $1 AND tx_id = ANY($2)",
    [userId, txIds]
  );
  for (const r of res.rows) result.set(r.tx_id, r.score);
  return result;
}

export async function clearRatingPg(userId: number, txId: string): Promise<boolean> {
  const res = await queryPg("DELETE FROM ratings WHERE user_id = $1 AND tx_id = $2", [userId, txId]);
  return (res.rowCount ?? 0) > 0;
}

// --- FX Rates ---

export async function upsertDailyFxRatesPg(date: string, rates: CurrencyRate[]): Promise<number> {
  if (rates.length === 0) return 0;
  return withPgTransaction(async (client) => {
    for (const r of rates) {
      await client.query(
        `INSERT INTO fx_rates (date, currency_a, currency_b, rate_sell, rate_buy, rate_cross)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT(date, currency_a, currency_b) DO UPDATE SET
           rate_sell = excluded.rate_sell,
           rate_buy  = excluded.rate_buy,
           rate_cross = excluded.rate_cross`,
        [date, r.currencyCodeA, r.currencyCodeB, r.rateSell ?? null, r.rateBuy ?? null, r.rateCross ?? null]
      );
    }
    return rates.length;
  });
}

export async function rateOnFxPg(
  date: string,
  currencyA: number,
  currencyB: number
): Promise<{ rate_sell: number | null; rate_buy: number | null; rate_cross: number | null } | undefined> {
  const res = await queryPg<{ rate_sell: number | null; rate_buy: number | null; rate_cross: number | null }>(
    "SELECT rate_sell, rate_buy, rate_cross FROM fx_rates WHERE date = $1 AND currency_a = $2 AND currency_b = $3",
    [date, currencyA, currencyB]
  );
  return res.rows[0];
}

export async function hasDateFxPg(date: string): Promise<boolean> {
  const res = await queryPg("SELECT 1 AS x FROM fx_rates WHERE date = $1 LIMIT 1", [date]);
  return res.rows.length > 0;
}

export async function latestRatesFxPg(): Promise<CurrencyRate[]> {
  const latestDateRes = await queryPg<{ date: string }>(
    "SELECT date FROM fx_rates ORDER BY date DESC LIMIT 1"
  );
  if (latestDateRes.rows.length === 0) return [];
  const latestDate = latestDateRes.rows[0].date;

  const res = await queryPg<{
    currency_a: number;
    currency_b: number;
    rate_sell: number | null;
    rate_buy: number | null;
    rate_cross: number | null;
  }>("SELECT * FROM fx_rates WHERE date = $1", [latestDate]);

  const dateSeconds = Math.floor(new Date(`${latestDate}T00:00:00Z`).getTime() / 1000);
  return res.rows.map((r) => ({
    currencyCodeA: r.currency_a,
    currencyCodeB: r.currency_b,
    date: dateSeconds,
    rateSell: r.rate_sell ?? undefined,
    rateBuy: r.rate_buy ?? undefined,
    rateCross: r.rate_cross ?? undefined,
  }));
}

// --- Sync State ---

export async function getSyncStatePg(userId: number, accountId: string): Promise<SyncStateRow | undefined> {
  const res = await queryPg<SyncStateRow>(
    "SELECT * FROM sync_state WHERE user_id = $1 AND account_id = $2",
    [userId, accountId]
  );
  return res.rows[0];
}

export async function ensureSyncStatePg(
  userId: number,
  accountId: string,
  nowSeconds: number
): Promise<SyncStateRow> {
  await queryPg(
    `INSERT INTO sync_state (user_id, account_id, covered_from, covered_to, backfill_done, last_run, status)
     VALUES ($1, $2, $3, $4, 0, $5, 'idle')
     ON CONFLICT(user_id, account_id) DO NOTHING`,
    [userId, accountId, nowSeconds, nowSeconds, nowSeconds]
  );
  return (await getSyncStatePg(userId, accountId))!;
}

export async function setSyncStateCoveredFromPg(userId: number, accountId: string, from: number): Promise<void> {
  await queryPg("UPDATE sync_state SET covered_from = $1 WHERE user_id = $2 AND account_id = $3", [
    from,
    userId,
    accountId,
  ]);
}

export async function setSyncStateCoveredToPg(userId: number, accountId: string, to: number): Promise<void> {
  await queryPg("UPDATE sync_state SET covered_to = $1 WHERE user_id = $2 AND account_id = $3", [
    to,
    userId,
    accountId,
  ]);
}

export async function markSyncStateBackfillDonePg(userId: number, accountId: string): Promise<void> {
  await queryPg("UPDATE sync_state SET backfill_done = 1 WHERE user_id = $2 AND account_id = $3", [
    userId,
    accountId,
  ]);
}

export async function setSyncStateStatusPg(
  userId: number,
  accountId: string,
  status: SyncStatus,
  error: string | null = null
): Promise<void> {
  await queryPg(
    "UPDATE sync_state SET status = $1, error = $2, last_run = $3 WHERE user_id = $4 AND account_id = $5",
    [status, error, Math.floor(Date.now() / 1000), userId, accountId]
  );
}

export async function listSyncStateForUserPg(userId: number): Promise<SyncStateRow[]> {
  const res = await queryPg<SyncStateRow>("SELECT * FROM sync_state WHERE user_id = $1", [userId]);
  return res.rows;
}

// --- Groups ---

export async function createGroupPg(name: string, ownerUserId: number): Promise<{ id: number; name: string }> {
  const now = Date.now();
  return withPgTransaction(async (client) => {
    const res = await client.query<{ id: number }>(
      "INSERT INTO groups (name, created_at) VALUES ($1, $2) RETURNING id",
      [name.trim(), now]
    );
    const groupId = res.rows[0].id;
    await client.query(
      "INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES ($1, $2, 'owner', $3)",
      [groupId, ownerUserId, now]
    );
    return { id: groupId, name: name.trim() };
  });
}

export async function getGroupsForUserPg(
  userId: number
): Promise<{ id: number; name: string; role: "owner" | "member"; memberCount: number }[]> {
  const sql = `
    SELECT g.id, g.name, gm.role,
      (SELECT COUNT(*)::int FROM group_members WHERE group_id = g.id) AS "memberCount"
    FROM groups g
    JOIN group_members gm ON gm.group_id = g.id
    WHERE gm.user_id = $1
    ORDER BY g.id ASC
  `;
  const res = await queryPg<{ id: number; name: string; role: "owner" | "member"; memberCount: number }>(
    sql,
    [userId]
  );
  return res.rows;
}

export async function getGroupMembersPg(
  groupId: number
): Promise<{ userId: number; username: string; role: "owner" | "member"; joinedAt: number }[]> {
  const sql = `
    SELECT u.id AS "userId", u.username, gm.role, gm.joined_at AS "joinedAt"
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = $1
    ORDER BY gm.joined_at ASC
  `;
  const res = await queryPg<{ userId: number; username: string; role: "owner" | "member"; joinedAt: number }>(
    sql,
    [groupId]
  );
  return res.rows;
}

export async function isUserInGroupPg(groupId: number, userId: number): Promise<boolean> {
  const res = await queryPg("SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2", [
    groupId,
    userId,
  ]);
  return res.rows.length > 0;
}

export async function shareAccountPg(
  accountId: string,
  ownerUserId: number,
  groupId: number
): Promise<void> {
  const inGroup = await isUserInGroupPg(groupId, ownerUserId);
  if (!inGroup) throw new Error("Користувач не є учасником цієї групи");
  const now = Date.now();
  await queryPg(
    `INSERT INTO shared_accounts (account_id, owner_user_id, group_id, created_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(account_id, group_id) DO UPDATE SET owner_user_id = excluded.owner_user_id`,
    [accountId, ownerUserId, groupId, now]
  );
}

export async function unshareAccountPg(
  accountId: string,
  ownerUserId: number,
  groupId: number
): Promise<void> {
  await queryPg(
    "DELETE FROM shared_accounts WHERE account_id = $1 AND group_id = $2 AND owner_user_id = $3",
    [accountId, groupId, ownerUserId]
  );
}

export async function getSharedAccountsForGroupPg(
  groupId: number
): Promise<{ accountId: string; ownerUserId: number; createdAt: number }[]> {
  const sql = `
    SELECT account_id AS "accountId", owner_user_id AS "ownerUserId", created_at AS "createdAt"
    FROM shared_accounts
    WHERE group_id = $1
  `;
  const res = await queryPg<{ accountId: string; ownerUserId: number; createdAt: number }>(sql, [groupId]);
  return res.rows;
}

export async function getSharedAccountsForUserPg(
  userId: number
): Promise<{ accountId: string; ownerUserId: number; groupId: number; groupName: string }[]> {
  const sql = `
    SELECT sa.account_id AS "accountId", sa.owner_user_id AS "ownerUserId", sa.group_id AS "groupId", g.name AS "groupName"
    FROM shared_accounts sa
    JOIN groups g ON g.id = sa.group_id
    JOIN group_members gm ON gm.group_id = sa.group_id
    WHERE gm.user_id = $1
  `;
  const res = await queryPg<{ accountId: string; ownerUserId: number; groupId: number; groupName: string }>(
    sql,
    [userId]
  );
  return res.rows;
}

export async function getAccessibleAccountIdsPg(userId: number): Promise<string[]> {
  const rows = await getSharedAccountsForUserPg(userId);
  return Array.from(new Set(rows.map((r) => r.accountId)));
}

export async function createInvitePg(
  groupId: number,
  createdByUserId: number,
  expiresInDays: number = 7
): Promise<string> {
  const inGroup = await isUserInGroupPg(groupId, createdByUserId);
  if (!inGroup) throw new Error("Тільки учасник групи може створити запрошення");
  const code = randomBytes(8).toString("hex").toUpperCase();
  const expiresAt = Date.now() + expiresInDays * 86_400_000;
  await queryPg("INSERT INTO group_invites (code, group_id, created_by, expires_at) VALUES ($1, $2, $3, $4)", [
    code,
    groupId,
    createdByUserId,
    expiresAt,
  ]);
  return code;
}

export async function acceptInvitePg(
  code: string,
  userId: number
): Promise<{ groupId: number; groupName: string }> {
  const cleanCode = code.trim().toUpperCase();
  const inviteRes = await queryPg<{ code: string; group_id: number; created_by: number; expires_at: number }>(
    "SELECT * FROM group_invites WHERE code = $1",
    [cleanCode]
  );
  const invite = inviteRes.rows[0];
  if (!invite) throw new Error("Недійсний код запрошення");
  if (Number(invite.expires_at) < Date.now()) {
    await queryPg("DELETE FROM group_invites WHERE code = $1", [cleanCode]);
    throw new Error("Термін дії запрошення закінчився");
  }

  const groupRes = await queryPg<{ name: string }>("SELECT name FROM groups WHERE id = $1", [invite.group_id]);
  const group = groupRes.rows[0];
  if (!group) throw new Error("Групу не знайдено");

  const existingMember = await isUserInGroupPg(invite.group_id, userId);
  if (!existingMember) {
    await queryPg(
      "INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES ($1, $2, 'member', $3)",
      [invite.group_id, userId, Date.now()]
    );
  }

  return { groupId: invite.group_id, groupName: group.name };
}
