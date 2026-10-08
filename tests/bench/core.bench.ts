import { bench, describe } from "vitest";
import { RingBuffer } from "../../lib/telemetry";
import { spendableLiquid } from "../../lib/metrics/spendableLiquid";
import { dailyTotals, type TxLike } from "../../lib/metrics/daily";
import { computeAllowance } from "../../lib/metrics/allowance";
import Database from "better-sqlite3";
import { createSchema } from "../../lib/db";

describe("Core Micro-Benchmarks", () => {
  // 1. Telemetry RingBuffer
  const rb = new RingBuffer(1000);
  for (let i = 0; i < 1000; i++) {
    rb.push(Math.random() * 50);
  }

  bench("RingBuffer push & percentile calculation", () => {
    rb.push(Math.random() * 50);
    rb.percentile(95);
  });

  // 2. Financial Metrics Calculations
  bench("spendableLiquid calculation", () => {
    spendableLiquid({
      actualLiquid: 5000000,
      monthlyIncome: 4000000,
      spendablePct: 0.8,
    });
  });

  const now = 1728000000;
  const mockTxs: TxLike[] = Array.from({ length: 100 }, (_, i) => ({
    time: now - i * 3600,
    amount: -15000,
  }));

  bench("dailyTotals aggregation over 100 txs", () => {
    dailyTotals(mockTxs, now - 30 * 86400, now);
  });

  bench("computeAllowance with schedule", () => {
    computeAllowance({
      liquid: 4500000,
      schedule: { kind: "semimonthly", days: [7, 22] },
      nowSeconds: now,
      commitments: [
        {
          name: "Оренда",
          amountBase: 1500000,
          cadence: "monthly",
          anchorDay: 1,
          source: "cash",
        },
      ],
      buffer: 500000,
      goals: [],
    });
  });

  // 3. SQLite In-Memory Query Performance
  const memDb = new Database(":memory:");
  createSchema(memDb);
  memDb
    .prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)")
    .run("bench_user", "hash", Date.now());

  const selectUserStmt = memDb.prepare("SELECT * FROM users WHERE username = ?");

  bench("SQLite in-memory SELECT", () => {
    selectUserStmt.get("bench_user");
  });
});
