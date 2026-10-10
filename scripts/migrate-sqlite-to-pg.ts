import Database from "better-sqlite3";
import { Pool } from "pg";
import { createPgSchema } from "../lib/pg";
import { existsSync } from "fs";
import { resolve } from "path";

/**
 * Migration script: SQLite -> PostgreSQL
 * Usage:
 *   npx tsx scripts/migrate-sqlite-to-pg.ts [sqlitePath] [postgresUrl]
 * Or via env:
 *   DATABASE_PATH=./data/money.db DATABASE_URL=postgresql://postgres:postgres@localhost:5432/finance_tracker npx tsx scripts/migrate-sqlite-to-pg.ts
 */

const sqlitePath = resolve(process.argv[2] || process.env.DATABASE_PATH || "./data/money.db");
const pgUrl =
  process.argv[3] ||
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/finance_tracker";

if (!existsSync(sqlitePath)) {
  console.error(`❌ SQLite database file not found at: ${sqlitePath}`);
  process.exit(1);
}

console.log(`🚀 Starting migration from SQLite (${sqlitePath}) to PostgreSQL...`);
console.log(`🎯 Target PostgreSQL: ${pgUrl.replace(/:[^:@]+@/, ":****@")}`);

const sqlite = new Database(sqlitePath, { readonly: true });
const pool = new Pool({ connectionString: pgUrl });

async function migrateTable<T extends Record<string, any>>(
  tableName: string,
  columns: string[],
  client: any
): Promise<number> {
  const rows = sqlite.prepare(`SELECT * FROM "${tableName}"`).all() as T[];
  if (rows.length === 0) {
    console.log(`  ⚪ ${tableName}: 0 rows (skipped)`);
    return 0;
  }

  // Insert in chunks of 200 rows to avoid parameter limits
  const CHUNK_SIZE = 200;
  let totalInserted = 0;

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const valuePlaceholders: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const row of chunk) {
      const rowPlaceholders: string[] = [];
      for (const col of columns) {
        rowPlaceholders.push(`$${paramIndex++}`);
        values.push(row[col] ?? null);
      }
      valuePlaceholders.push(`(${rowPlaceholders.join(", ")})`);
    }

    const query = `
      INSERT INTO "${tableName}" (${columns.map((c) => `"${c}"`).join(", ")})
      VALUES ${valuePlaceholders.join(", ")}
      ON CONFLICT DO NOTHING
    `;

    await client.query(query, values);
    totalInserted += chunk.length;
  }

  console.log(`  ✅ ${tableName}: ${totalInserted} rows migrated`);
  return totalInserted;
}

async function main() {
  const client = await pool.connect();
  try {
    console.log("📦 Creating PostgreSQL schema if not exists...");
    await createPgSchema(pool);
    console.log("✨ Schema ready.");

    await client.query("BEGIN");

    console.log("⏳ Migrating tables...");

    // 1. users
    await migrateTable("users", ["id", "username", "password_hash", "mono_token", "created_at"], client);

    // 2. groups
    await migrateTable("groups", ["id", "name", "created_at"], client);

    // 3. group_members
    await migrateTable("group_members", ["group_id", "user_id", "role", "joined_at"], client);

    // 4. shared_accounts
    await migrateTable("shared_accounts", ["account_id", "owner_user_id", "group_id", "created_at"], client);

    // 5. group_invites
    await migrateTable("group_invites", ["code", "group_id", "created_by", "expires_at"], client);

    // 6. kv
    await migrateTable("kv", ["user_id", "key", "value"], client);

    // 7. transactions
    await migrateTable(
      "transactions",
      [
        "id",
        "user_id",
        "account_id",
        "time",
        "description",
        "mcc",
        "original_mcc",
        "amount",
        "operation_amount",
        "currency_code",
        "commission_rate",
        "cashback_amount",
        "balance",
        "hold",
        "comment",
        "counter_name",
        "fetched_at",
      ],
      client
    );

    // 8. fx_rates
    await migrateTable(
      "fx_rates",
      ["date", "currency_a", "currency_b", "rate_sell", "rate_buy", "rate_cross"],
      client
    );

    // 9. sync_state
    await migrateTable(
      "sync_state",
      ["user_id", "account_id", "covered_from", "covered_to", "backfill_done", "last_run", "status", "error"],
      client
    );

    // 10. commitments
    await migrateTable(
      "commitments",
      ["id", "user_id", "name", "amount", "currency", "cadence", "anchor_day", "matcher", "active", "created_at", "source"],
      client
    );

    // 11. ratings
    await migrateTable("ratings", ["user_id", "tx_id", "score", "created_at"], client);

    // 12. salaries
    await migrateTable("salaries", ["id", "user_id", "paid_on", "amount", "currency", "note", "created_at"], client);

    console.log("🔄 Resetting primary key sequences...");
    await client.query("SELECT setval('users_id_seq', COALESCE((SELECT MAX(id) FROM users), 1));");
    await client.query("SELECT setval('groups_id_seq', COALESCE((SELECT MAX(id) FROM groups), 1));");
    await client.query("SELECT setval('commitments_id_seq', COALESCE((SELECT MAX(id) FROM commitments), 1));");
    await client.query("SELECT setval('salaries_id_seq', COALESCE((SELECT MAX(id) FROM salaries), 1));");

    await client.query("COMMIT");
    console.log("🎉 All data successfully migrated from SQLite to PostgreSQL!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed, transaction rolled back:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    sqlite.close();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
