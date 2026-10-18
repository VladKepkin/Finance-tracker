import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { createSchema, type DB } from "../../lib/db";
import {
  recordUserActivity,
  buildAdminAnalyticsPayload,
} from "../../lib/adminAnalytics";
import { isAdminSession } from "../../lib/adminAuth";

describe("adminAnalytics & adminAuth", () => {
  let db: DB;
  const NOW = new Date("2026-10-18T12:00:00.000Z").getTime();
  const DAY_MS = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    db = new Database(":memory:");
    createSchema(db);
  });

  describe("Admin Authorization (isAdminSession)", () => {
    it("recognizes userId = 1 as admin by default", () => {
      expect(isAdminSession({ userId: 1, username: "regular_name" })).toBe(true);
    });

    it("recognizes APP_USERNAME match as admin", () => {
      const orig = process.env.APP_USERNAME;
      process.env.APP_USERNAME = "master_chief";
      try {
        expect(isAdminSession({ userId: 99, username: "master_chief" })).toBe(true);
        expect(isAdminSession({ userId: 99, username: "MASTER_CHIEF" })).toBe(true);
        expect(isAdminSession({ userId: 99, username: "other_user" })).toBe(false);
      } finally {
        process.env.APP_USERNAME = orig;
      }
    });

    it("recognizes ADMIN_USERS comma-separated list", () => {
      const orig = process.env.ADMIN_USERS;
      process.env.ADMIN_USERS = "alice, bob , Charlie";
      try {
        expect(isAdminSession({ userId: 10, username: "alice" })).toBe(true);
        expect(isAdminSession({ userId: 11, username: "BOB" })).toBe(true);
        expect(isAdminSession({ userId: 12, username: "charlie" })).toBe(true);
        expect(isAdminSession({ userId: 13, username: "dan" })).toBe(false);
      } finally {
        process.env.ADMIN_USERS = orig;
      }
    });

    it("rejects unauthenticated sessions", () => {
      expect(isAdminSession(null)).toBe(false);
      expect(isAdminSession(undefined)).toBe(false);
    });
  });

  describe("User Activity Tracking", () => {
    it("records daily activity and increments count on repeated requests", () => {
      const u = db
        .prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)")
        .run("user1", "hash", NOW - 5 * DAY_MS);
      const userId = Number(u.lastInsertRowid);

      recordUserActivity(db, userId, NOW);
      let row = db
        .prepare("SELECT * FROM user_activity_days WHERE user_id = ? AND day_date = ?")
        .get(userId, "2026-10-18") as any;
      expect(row).toBeDefined();
      expect(row.request_count).toBe(1);
      expect(row.last_seen_at).toBe(NOW);

      // Second activity on same day
      recordUserActivity(db, userId, NOW + 1000);
      row = db
        .prepare("SELECT * FROM user_activity_days WHERE user_id = ? AND day_date = ?")
        .get(userId, "2026-10-18") as any;
      expect(row.request_count).toBe(2);
      expect(row.last_seen_at).toBe(NOW + 1000);
    });
  });

  describe("DAU, WAU, MAU and True Retention vs Background Sync", () => {
    it("background Monobank transactions alone do NOT inflate DAU if user hasn't visited", () => {
      // User registered 20 days ago
      const u = db
        .prepare("INSERT INTO users (username, password_hash, mono_token, created_at) VALUES (?, ?, ?, ?)")
        .run("mono_ghost_user", "hash", "enc_token", NOW - 20 * DAY_MS);
      const userId = Number(u.lastInsertRowid);

      // Background Monobank sync pulls statements today and inserts transactions and sync state
      db.prepare(
        `INSERT INTO sync_state (user_id, account_id, covered_from, covered_to, backfill_done, last_run, status)
         VALUES (?, ?, ?, ?, 1, ?, 'idle')`
      ).run(userId, "acc_123", NOW - 1000, NOW, NOW);

      db.prepare(
        `INSERT INTO transactions (id, user_id, account_id, time, description, amount, currency_code, hold, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, 980, 0, ?)`
      ).run("tx_bg_1", userId, "acc_123", Math.floor(NOW / 1000), "Background Sync Groceries", -50000, NOW);

      // User did NOT interact with the app today (no recordUserActivity)
      const payload = buildAdminAnalyticsPayload(db, NOW);

      // DAU today must be 0!
      expect(payload.activityAndRetention.dau).toBe(0);
      // Because user only was active on signup day 20 days ago, they are NOT in WAU
      expect(payload.activityAndRetention.wau).toBe(0);
      // But they are in MAU because signup day was 20 days ago (< 30d)
      expect(payload.activityAndRetention.mau).toBe(1);
    });

    it("correctly calculates DAU, WAU, MAU and Stickiness when users are active", () => {
      // User 1 active today
      const u1 = db
        .prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)")
        .run("u1", "h", NOW - 10 * DAY_MS);
      const user1Id = Number(u1.lastInsertRowid);
      recordUserActivity(db, user1Id, NOW);

      // User 2 active 3 days ago
      const u2 = db
        .prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)")
        .run("u2", "h", NOW - 15 * DAY_MS);
      const user2Id = Number(u2.lastInsertRowid);
      recordUserActivity(db, user2Id, NOW - 3 * DAY_MS);

      // User 3 active 20 days ago
      const u3 = db
        .prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)")
        .run("u3", "h", NOW - 25 * DAY_MS);
      const user3Id = Number(u3.lastInsertRowid);
      recordUserActivity(db, user3Id, NOW - 20 * DAY_MS);

      // User 4 registered 45 days ago, active 40 days ago (churned)
      const u4 = db
        .prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)")
        .run("u4", "h", NOW - 45 * DAY_MS);
      const user4Id = Number(u4.lastInsertRowid);
      recordUserActivity(db, user4Id, NOW - 40 * DAY_MS);

      const payload = buildAdminAnalyticsPayload(db, NOW);

      expect(payload.usersOverview.totalUsers).toBe(4);
      expect(payload.activityAndRetention.dau).toBe(1); // User 1
      expect(payload.activityAndRetention.wau).toBe(2); // User 1, User 2
      expect(payload.activityAndRetention.mau).toBe(3); // User 1, User 2, User 3
      expect(payload.activityAndRetention.stickinessPct).toBe(33.3); // 1 / 3 * 100

      // Churn
      expect(payload.activityAndRetention.churn.activeUsersCount).toBe(2); // u1 (0d ago), u2 (3d ago)
      expect(payload.activityAndRetention.churn.atRiskUsersCount).toBe(1); // u3 (20d ago)
      expect(payload.activityAndRetention.churn.churnedUsersCount).toBe(1); // u4 (40d ago)
      expect(payload.activityAndRetention.churn.churnRatePct).toBe(25); // 1 / 4 * 100
    });
  });

  describe("Feature Adoption Counters", () => {
    it("accurately computes adoption counts and percentages without leakage", () => {
      // User 1: Monobank token, Manual mode kv, in a group
      const u1 = db
        .prepare("INSERT INTO users (username, password_hash, mono_token, created_at) VALUES (?, ?, ?, ?)")
        .run("user_one", "hash", "secret_token_123", NOW - 10 * DAY_MS);
      const u1Id = Number(u1.lastInsertRowid);

      db.prepare("INSERT INTO kv (user_id, key, value) VALUES (?, ?, ?)").run(
        u1Id,
        "manualMode",
        "true"
      );

      // User 2: Cash accounts kv, wishlist, commitment, rating, salary
      const u2 = db
        .prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)")
        .run("user_two", "hash", NOW - 10 * DAY_MS);
      const u2Id = Number(u2.lastInsertRowid);

      db.prepare("INSERT INTO kv (user_id, key, value) VALUES (?, ?, ?)").run(
        u2Id,
        "cashAccounts",
        JSON.stringify([{ id: "cash_1", name: "Wallet" }])
      );
      db.prepare("INSERT INTO kv (user_id, key, value) VALUES (?, ?, ?)").run(
        u2Id,
        "wishlist",
        JSON.stringify([{ id: "w1", title: "Guitar", amount: 500000 }])
      );

      // Group
      const g = db.prepare("INSERT INTO groups (name, created_at) VALUES (?, ?)").run("Family", NOW);
      const groupId = Number(g.lastInsertRowid);
      db.prepare("INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)").run(
        groupId,
        u1Id,
        NOW
      );

      // Commitment
      db.prepare(
        `INSERT INTO commitments (user_id, name, amount, currency, cadence, anchor_day, active, created_at)
         VALUES (?, 'Netflix', 40000, 980, 'monthly', 15, 1, ?)`
      ).run(u2Id, Math.floor(NOW / 1000));

      // Rating
      db.prepare(
        "INSERT INTO ratings (user_id, tx_id, score, created_at) VALUES (?, 'tx_99', 5, ?)"
      ).run(u2Id, Math.floor(NOW / 1000));

      // Salary
      db.prepare(
        "INSERT INTO salaries (user_id, paid_on, amount, currency, created_at) VALUES (?, '2026-10-01', 5000000, 980, ?)"
      ).run(u2Id, Math.floor(NOW / 1000));

      const payload = buildAdminAnalyticsPayload(db, NOW);

      expect(payload.featureAdoption.monobankConnectedCount).toBe(1);
      expect(payload.featureAdoption.monobankConnectedPct).toBe(50);

      expect(payload.featureAdoption.manualModeOrCashCount).toBe(2); // u1 has manualMode, u2 has cashAccounts
      expect(payload.featureAdoption.manualModeOrCashPct).toBe(100);

      expect(payload.featureAdoption.familyGroupsCount).toBe(1);
      expect(payload.featureAdoption.usersInGroupsCount).toBe(1);
      expect(payload.featureAdoption.usersInGroupsPct).toBe(50);

      expect(payload.featureAdoption.commitmentsUsersCount).toBe(1);
      expect(payload.featureAdoption.totalActiveCommitments).toBe(1);

      expect(payload.featureAdoption.wishlistOrGoalsUsersCount).toBe(1);
      expect(payload.featureAdoption.wishlistOrGoalsUsersPct).toBe(50);

      expect(payload.featureAdoption.ratingsUsersCount).toBe(1);
      expect(payload.featureAdoption.totalRatingsCount).toBe(1);

      expect(payload.featureAdoption.salariesUsersCount).toBe(1);
      expect(payload.featureAdoption.salariesUsersPct).toBe(50);
    });
  });

  describe("Zero-PII Compliance", () => {
    it("guarantees payload contains NO usernames, descriptions, amounts, or personal data", () => {
      const u = db
        .prepare("INSERT INTO users (username, password_hash, mono_token, created_at) VALUES (?, ?, ?, ?)")
        .run("confidential_user_name_xyz", "hash", "super_secret_mono_token_abc", NOW - 5 * DAY_MS);
      const userId = Number(u.lastInsertRowid);

      db.prepare(
        `INSERT INTO transactions (id, user_id, account_id, time, description, amount, currency_code, hold, comment, fetched_at)
         VALUES (?, ?, 'acc_secret', ?, 'Personal sensitive medical transaction description', -1234567, 980, 0, 'Sensitive doctor notes', ?)`
      ).run("tx_confidential", userId, Math.floor(NOW / 1000), NOW);

      db.prepare(
        `INSERT INTO commitments (user_id, name, amount, currency, cadence, anchor_day, active, created_at)
         VALUES (?, 'Private Mortgage Payment', 9876543, 980, 'monthly', 1, 1, ?)`
      ).run(userId, Math.floor(NOW / 1000));

      const payload = buildAdminAnalyticsPayload(db, NOW);
      const json = JSON.stringify(payload);

      // PII & sensitive strings must NEVER appear in the payload
      expect(json).not.toContain("confidential_user_name_xyz");
      expect(json).not.toContain("super_secret_mono_token_abc");
      expect(json).not.toContain("Personal sensitive medical");
      expect(json).not.toContain("Sensitive doctor notes");
      expect(json).not.toContain("Private Mortgage Payment");
      expect(json).not.toContain("1234567");
      expect(json).not.toContain("9876543");
      expect(json).not.toContain("acc_secret");
      expect(json).not.toContain("username");
      expect(json).not.toContain("userId");

      // Verify structure completeness
      expect(payload.usersOverview.signupsByDay).toHaveLength(30);
      expect(payload.usersOverview.signupsByWeek).toHaveLength(12);
      expect(payload.activityAndRetention.dailyActiveSeries).toHaveLength(30);
      expect(payload.activityAndRetention.cohortMatrix).toHaveLength(8);
      expect(payload.systemHealth.syncStatusBreakdown).toBeDefined();
      expect(payload.systemHealth.httpApi).toBeDefined();
      expect(payload.systemHealth.database).toBeDefined();
      expect(payload.systemHealth.monobankApi).toBeDefined();
    });
  });
});
