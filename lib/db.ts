import Database from "better-sqlite3";
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";
import { mkdirSync } from "fs";
import { dirname } from "path";

const DB_PATH = process.env.DATABASE_PATH || "./data/money.db";

export type DB = Database.Database;

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  mono_token: string | null;
  created_at: number;
}

function hashPassword(password: string, salt: Buffer = randomBytes(16)): string {
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, 64);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

type Global = typeof globalThis & { __moneyDb?: DB };
const g = globalThis as Global;

export function createSchema(database: DB): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      mono_token    TEXT,
      created_at    INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kv (
      user_id INTEGER NOT NULL,
      key     TEXT NOT NULL,
      value   TEXT NOT NULL,
      PRIMARY KEY (user_id, key)
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id               TEXT PRIMARY KEY,
      user_id          INTEGER NOT NULL,
      account_id       TEXT NOT NULL,
      time             INTEGER NOT NULL,
      description      TEXT,
      mcc              INTEGER,
      original_mcc     INTEGER,
      amount           INTEGER NOT NULL,
      operation_amount INTEGER,
      currency_code    INTEGER NOT NULL,
      commission_rate  INTEGER,
      cashback_amount  INTEGER,
      balance          INTEGER,
      hold             INTEGER NOT NULL DEFAULT 0,
      comment          TEXT,
      counter_name     TEXT,
      fetched_at       INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tx_user_time      ON transactions(user_id, time);
    CREATE INDEX IF NOT EXISTS idx_tx_user_acct_time ON transactions(user_id, account_id, time);
    CREATE TABLE IF NOT EXISTS fx_rates (
      date        TEXT NOT NULL,
      currency_a  INTEGER NOT NULL,
      currency_b  INTEGER NOT NULL,
      rate_sell   REAL,
      rate_buy    REAL,
      rate_cross  REAL,
      PRIMARY KEY (date, currency_a, currency_b)
    );
    CREATE TABLE IF NOT EXISTS sync_state (
      user_id       INTEGER NOT NULL,
      account_id    TEXT NOT NULL,
      covered_from  INTEGER,
      covered_to    INTEGER,
      backfill_done INTEGER NOT NULL DEFAULT 0,
      last_run      INTEGER,
      status        TEXT NOT NULL DEFAULT 'idle',
      error         TEXT,
      PRIMARY KEY (user_id, account_id)
    );
    CREATE TABLE IF NOT EXISTS commitments (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      name       TEXT NOT NULL,
      amount     INTEGER NOT NULL,
      currency   INTEGER NOT NULL,
      cadence    TEXT NOT NULL,
      anchor_day INTEGER NOT NULL,
      matcher    TEXT,
      active     INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_commit_user ON commitments(user_id, active);
    CREATE TABLE IF NOT EXISTS ratings (
      user_id    INTEGER NOT NULL,
      tx_id      TEXT    NOT NULL,
      score      INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, tx_id)
    );
    CREATE TABLE IF NOT EXISTS salaries (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      paid_on    TEXT    NOT NULL,
      amount     INTEGER NOT NULL,
      currency   INTEGER NOT NULL,
      note       TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_salary_user ON salaries(user_id, paid_on);
  `);
}

function init(): DB {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const database = new Database(DB_PATH);
  database.pragma("journal_mode = WAL");
  createSchema(database);
  seedSingleUser(database);
  return database;
}

function seedSingleUser(database: DB): void {
  const username = process.env.APP_USERNAME || "admin";
  const password = process.env.APP_PASSWORD;
  if (!password) return;

  const row = database
    .prepare("SELECT id, password_hash FROM users WHERE username = ?")
    .get(username) as Pick<UserRow, "id" | "password_hash"> | undefined;

  if (!row) {
    database
      .prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)")
      .run(username, hashPassword(password), Date.now());
  } else if (!verifyPassword(password, row.password_hash)) {
    database
      .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
      .run(hashPassword(password), row.id);
  }
}

export function db(): DB {
  return (g.__moneyDb ??= init());
}

export function getUserByUsername(username: string): UserRow | undefined {
  return db().prepare("SELECT * FROM users WHERE username = ?").get(username) as
    | UserRow
    | undefined;
}

export function getMonoTokenEnc(userId: number): string | null {
  const row = db().prepare("SELECT mono_token FROM users WHERE id = ?").get(userId) as
    | Pick<UserRow, "mono_token">
    | undefined;
  return row?.mono_token ?? null;
}

export function setMonoTokenEnc(userId: number, enc: string | null): void {
  db().prepare("UPDATE users SET mono_token = ? WHERE id = ?").run(enc, userId);
}

const ALLOWED_KEYS = new Set([
  "wallet",
  "budgets",
  "fake",
  "wishlist",
  "baseCurrency",
  "selectedAccount",
  "incomeSchedule",
  "buffer",
  "savingsPlan",
  "workSchedule",
  "cashAccounts",
]);

export function isAllowedKey(key: string): boolean {
  return ALLOWED_KEYS.has(key);
}

export function getAllKV(userId: number): Record<string, unknown> {
  const rows = db().prepare("SELECT key, value FROM kv WHERE user_id = ?").all(userId) as {
    key: string;
    value: string;
  }[];
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      out[r.key] = JSON.parse(r.value);
    } catch {
    }
  }
  return out;
}

export function setKV(userId: number, key: string, value: unknown): void {
  db()
    .prepare(
      `INSERT INTO kv (user_id, key, value) VALUES (?, ?, ?)
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`
    )
    .run(userId, key, JSON.stringify(value));
}
