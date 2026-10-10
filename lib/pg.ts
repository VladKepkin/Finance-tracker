import { Pool, types, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { recordDbQuery } from "./telemetry";

// Parse PostgreSQL BIGINT (int8, oid 20) as JavaScript Number
types.setTypeParser(20, (val: string) => (val === null ? null : Number(val)));
// Parse PostgreSQL NUMERIC (oid 1700) as JavaScript Number
types.setTypeParser(1700, (val: string) => (val === null ? null : Number(val)));

const DATABASE_URL = process.env.DATABASE_URL;

export function isPostgresConfigured(): boolean {
  if (!DATABASE_URL) return false;
  return DATABASE_URL.startsWith("postgres://") || DATABASE_URL.startsWith("postgresql://");
}

let poolInstance: Pool | null = null;

export function getPgPool(): Pool {
  if (!poolInstance) {
    if (!DATABASE_URL) {
      throw new Error("DATABASE_URL is not configured for PostgreSQL");
    }
    poolInstance = new Pool({
      connectionString: DATABASE_URL,
      max: Number(process.env.PG_MAX_CONNECTIONS) || 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    poolInstance.on("error", (err) => {
      console.error("Unexpected error on idle PostgreSQL client", err);
    });
  }
  return poolInstance;
}

export async function queryPg<R extends QueryResultRow = any>(
  sql: string,
  params: any[] = []
): Promise<QueryResult<R>> {
  const pool = getPgPool();
  const start = performance.now();
  try {
    const res = await pool.query<R>(sql, params);
    return res;
  } finally {
    recordDbQuery(performance.now() - start);
  }
}

export async function withPgClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function withPgTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withPgClient(async (client) => {
    await client.query("BEGIN");
    try {
      const res = await fn(client);
      await client.query("COMMIT");
      return res;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
}

export async function createPgSchema(pool: Pool = getPgPool()): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      mono_token    TEXT,
      created_at    BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kv (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key     TEXT NOT NULL,
      value   TEXT NOT NULL,
      PRIMARY KEY (user_id, key)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id               TEXT PRIMARY KEY,
      user_id          INTEGER NOT NULL,
      account_id       TEXT NOT NULL,
      time             BIGINT NOT NULL,
      description      TEXT,
      mcc              INTEGER,
      original_mcc     INTEGER,
      amount           BIGINT NOT NULL,
      operation_amount BIGINT,
      currency_code    INTEGER NOT NULL,
      commission_rate  INTEGER,
      cashback_amount  INTEGER,
      balance          BIGINT,
      hold             INTEGER NOT NULL DEFAULT 0,
      comment          TEXT,
      counter_name     TEXT,
      fetched_at       BIGINT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tx_user_time ON transactions(user_id, time);
    CREATE INDEX IF NOT EXISTS idx_tx_user_acct_time ON transactions(user_id, account_id, time);

    CREATE TABLE IF NOT EXISTS fx_rates (
      date        TEXT NOT NULL,
      currency_a  INTEGER NOT NULL,
      currency_b  INTEGER NOT NULL,
      rate_sell   DOUBLE PRECISION,
      rate_buy    DOUBLE PRECISION,
      rate_cross  DOUBLE PRECISION,
      PRIMARY KEY (date, currency_a, currency_b)
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      user_id       INTEGER NOT NULL,
      account_id    TEXT NOT NULL,
      covered_from  BIGINT,
      covered_to    BIGINT,
      backfill_done INTEGER NOT NULL DEFAULT 0,
      last_run      BIGINT,
      status        TEXT NOT NULL DEFAULT 'idle',
      error         TEXT,
      PRIMARY KEY (user_id, account_id)
    );

    CREATE TABLE IF NOT EXISTS commitments (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL,
      name       TEXT NOT NULL,
      amount     BIGINT NOT NULL,
      currency   INTEGER NOT NULL,
      cadence    TEXT NOT NULL,
      anchor_day INTEGER NOT NULL,
      matcher    TEXT,
      active     INTEGER NOT NULL DEFAULT 1,
      created_at BIGINT NOT NULL,
      source     TEXT NOT NULL DEFAULT 'card'
    );

    CREATE INDEX IF NOT EXISTS idx_commit_user ON commitments(user_id, active);

    CREATE TABLE IF NOT EXISTS ratings (
      user_id    INTEGER NOT NULL,
      tx_id      TEXT NOT NULL,
      score      INTEGER NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (user_id, tx_id)
    );

    CREATE TABLE IF NOT EXISTS salaries (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL,
      paid_on    TEXT NOT NULL,
      amount     BIGINT NOT NULL,
      currency   INTEGER NOT NULL,
      note       TEXT,
      created_at BIGINT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_salary_user ON salaries(user_id, paid_on);

    CREATE TABLE IF NOT EXISTS groups (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS group_members (
      group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role       TEXT NOT NULL DEFAULT 'member',
      joined_at  BIGINT NOT NULL,
      PRIMARY KEY (group_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);

    CREATE TABLE IF NOT EXISTS shared_accounts (
      account_id    TEXT NOT NULL,
      owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      group_id      INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      created_at    BIGINT NOT NULL,
      PRIMARY KEY (account_id, group_id)
    );

    CREATE INDEX IF NOT EXISTS idx_shared_accounts_group ON shared_accounts(group_id);
    CREATE INDEX IF NOT EXISTS idx_shared_accounts_owner ON shared_accounts(owner_user_id);

    CREATE TABLE IF NOT EXISTS group_invites (
      code       TEXT PRIMARY KEY,
      group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at BIGINT NOT NULL
    );
  `);
}
