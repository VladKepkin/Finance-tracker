import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { createSchema, hashPassword, verifyPasswordAsync, type DB } from "../lib/db";
import { createGroup, shareAccount } from "../lib/repo/groups";
import { upsertMany, queryRange } from "../lib/repo/transactions";
import { checkRateLimit, resetRateLimits, getClientIp } from "../lib/rateLimit";
import { isAdminSession } from "../lib/adminAuth";

describe("Security Hardening Tests", () => {
  let db: DB;
  let user1Id: number;
  let user2Id: number;

  beforeEach(() => {
    resetRateLimits();
    db = new Database(":memory:");
    createSchema(db);
    const u1 = db
      .prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)")
      .run("vlad", "hash1", Date.now());
    user1Id = Number(u1.lastInsertRowid);

    const u2 = db
      .prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)")
      .run("attacker", "hash2", Date.now());
    user2Id = Number(u2.lastInsertRowid);
  });

  it("забороняє IDOR при спробі розшарити чужий рахунок у своїй групі", () => {
    const victimCardId = "mono_victim_card_999";
    // Картка належить user1 у sync_state
    db.prepare(
      "INSERT INTO sync_state (user_id, account_id, backfill_done, status) VALUES (?, ?, 1, 'idle')"
    ).run(user1Id, victimCardId);

    // user2 створює власну групу і намагається розшарити туди картку user1
    const attackerGroup = createGroup(db, "Attacker Group", user2Id);
    expect(() => {
      shareAccount(db, victimCardId, user2Id, attackerGroup.id);
    }).toThrow("Цей рахунок належить іншому користувачу");
  });

  it("забороняє міжкористувацький перезапис транзакцій за однаковим ID", () => {
    const now = 1710000000;
    upsertMany(
      db,
      user1Id,
      "acc_1",
      [
        {
          id: "tx_shared_id",
          time: now,
          description: "Справжня покупка Влада",
          mcc: 5411,
          originalMcc: 5411,
          hold: false,
          amount: -50000,
          operationAmount: -50000,
          currencyCode: 980,
          commissionRate: 0,
          cashbackAmount: 0,
          balance: 1000000,
        },
      ],
      now
    );

    // user2 намагається перезаписати транзакцію з тим самим ID
    upsertMany(
      db,
      user2Id,
      "acc_2",
      [
        {
          id: "tx_shared_id",
          time: now,
          description: "Підроблена транзакція",
          mcc: 5411,
          originalMcc: 5411,
          hold: false,
          amount: -99999999,
          operationAmount: -99999999,
          currencyCode: 980,
          commissionRate: 0,
          cashbackAmount: 0,
          balance: 0,
        },
      ],
      now + 10
    );

    const txs = queryRange(db, user1Id, now - 10, now + 10);
    expect(txs).toHaveLength(1);
    expect(txs[0].description).toBe("Справжня покупка Влада");
    expect(txs[0].amount).toBe(-50000);
    expect(txs[0].balance).toBe(1000000);
  });

  it("verifyPasswordAsync коректно перевіряє scrypt-хеш асинхронно", async () => {
    const hash = hashPassword("SuperSecret123!");
    expect(await verifyPasswordAsync("SuperSecret123!", hash)).toBe(true);
    expect(await verifyPasswordAsync("WrongPassword", hash)).toBe(false);
    expect(await verifyPasswordAsync("SuperSecret123!", "invalid_format")).toBe(false);
  });

  it("checkRateLimit обмежує перевищення ліміту запитів", () => {
    const key = "login:127.0.0.1:admin";
    expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true);
    expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true);
    expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true);

    const blocked = checkRateLimit(key, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("getClientIp коректно витягує перший IP із x-forwarded-for", () => {
    const req = new Request("http://localhost/api/auth/login", {
      headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" },
    });
    expect(getClientIp(req)).toBe("203.0.113.5");
  });

  it("isAdminSession не дає права адміна випадковому userId=1, якщо задано інший APP_USERNAME", () => {
    const prevAppUser = process.env.APP_USERNAME;
    try {
      process.env.APP_USERNAME = "vlad_admin";
      expect(isAdminSession({ userId: 1, username: "intruder" })).toBe(false);
      expect(isAdminSession({ userId: 1, username: "vlad_admin" })).toBe(true);
    } finally {
      if (prevAppUser === undefined) delete process.env.APP_USERNAME;
      else process.env.APP_USERNAME = prevAppUser;
    }
  });
});
