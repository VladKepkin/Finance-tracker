import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { createSchema } from "@/lib/db";
import { parseCreate, parsePatch } from "@/lib/commitmentInput";
import {
  insert as insertCommitment,
  listActive as listActiveCommitments,
  getById as getCommitmentById,
  update as updateCommitment,
  deactivate as deactivateCommitment,
  activeMatchers,
} from "@/lib/repo/commitments";
import { findUserByAccountId } from "@/lib/repo/syncState";
import { applyAtomicDataPatch, type AtomicPatchPayload } from "@/lib/atomicPatch";
import { parseMonoWebhookPayload } from "@/lib/monobankWebhook";
import type { WalletEntry } from "@/lib/storage";

describe("Stage 2 Architecture Tests", () => {
  describe("1. Commitment Input Validation (Scope & Source)", () => {
    it("parseCreate should default scope to 'personal' and source to 'card'", () => {
      const result = parseCreate({
        name: "Netflix",
        amount: 250,
        currency: 980,
        cadence: "monthly",
        anchorDay: 15,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.scope).toBe("personal");
        expect(result.value.source).toBe("card");
        expect(result.value.name).toBe("Netflix");
        expect(result.value.amount).toBe(250);
      }
    });

    it("parseCreate should accept explicit scope 'family' and source 'cash'", () => {
      const result = parseCreate({
        name: "Rent",
        amount: 15000,
        currency: 980,
        cadence: "monthly",
        anchorDay: 1,
        source: "cash",
        scope: "family",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.scope).toBe("family");
        expect(result.value.source).toBe("cash");
      }
    });

    it("parseCreate should sanitize unknown scope to 'personal'", () => {
      const result = parseCreate({
        name: "Gym",
        amount: 1200,
        currency: 980,
        cadence: "monthly",
        anchorDay: 10,
        scope: "invalid_scope" as unknown as "personal",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.scope).toBe("personal");
      }
    });

    it("parseCreate should reject invalid inputs", () => {
      expect(parseCreate(null).ok).toBe(false);
      expect(parseCreate({ name: "", amount: 100, currency: 980, cadence: "monthly", anchorDay: 1 }).ok).toBe(false);
      expect(parseCreate({ name: "Bad", amount: -5, currency: 980, cadence: "monthly", anchorDay: 1 }).ok).toBe(false);
      expect(parseCreate({ name: "Bad", amount: 100, currency: 980, cadence: "daily", anchorDay: 1 }).ok).toBe(false);
      expect(parseCreate({ name: "Bad", amount: 100, currency: 980, cadence: "weekly", anchorDay: 7 }).ok).toBe(false);
      expect(parseCreate({ name: "Bad", amount: 100, currency: 980, cadence: "monthly", anchorDay: 32 }).ok).toBe(false);
    });

    it("parsePatch should validate and accept valid scope", () => {
      const resFamily = parsePatch({ scope: "family" }, "monthly");
      expect(resFamily.ok).toBe(true);
      if (resFamily.ok) {
        expect(resFamily.value.scope).toBe("family");
      }

      const resPersonal = parsePatch({ scope: "personal" }, "monthly");
      expect(resPersonal.ok).toBe(true);
      if (resPersonal.ok) {
        expect(resPersonal.value.scope).toBe("personal");
      }
    });

    it("parsePatch should reject invalid scope and invalid fields", () => {
      const resInvalid = parsePatch({ scope: "wrong" }, "monthly");
      expect(resInvalid.ok).toBe(false);
      if (!resInvalid.ok) {
        expect(resInvalid.error).toBe("Некоректний простір платежу");
      }

      const resBadSource = parsePatch({ source: "crypto" }, "monthly");
      expect(resBadSource.ok).toBe(false);
    });
  });

  describe("2. Commitments Family Group Sharing & Isolation (SQLite)", () => {
    function setupTestDb() {
      const db = new Database(":memory:");
      createSchema(db);

      // Create users
      db.prepare("INSERT INTO users (id, username, password_hash, created_at) VALUES (1, 'alice', 'hash', 1000)").run();
      db.prepare("INSERT INTO users (id, username, password_hash, created_at) VALUES (2, 'bob', 'hash', 1000)").run();
      db.prepare("INSERT INTO users (id, username, password_hash, created_at) VALUES (3, 'charlie', 'hash', 1000)").run();

      // Create family group with Alice and Bob
      db.prepare("INSERT INTO groups (id, name, created_at) VALUES (1, 'Alice & Bob Family', 1000)").run();
      db.prepare("INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (1, 1, 'owner', 1000)").run();
      db.prepare("INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (1, 2, 'member', 1000)").run();

      return db;
    }

    it("should allow group members to see shared family commitments while isolating personal ones", () => {
      const db = setupTestDb();
      const now = 1000;

      // Alice commitments
      const aliceGymId = insertCommitment(
        db,
        1,
        { name: "Alice Gym", amount: 1500, currency: 980, cadence: "monthly", anchorDay: 1, scope: "personal" },
        now
      );
      const apartmentRentId = insertCommitment(
        db,
        1,
        {
          name: "Apartment Rent",
          amount: 20000,
          currency: 980,
          cadence: "monthly",
          anchorDay: 5,
          scope: "family",
          matcher: "Rent",
        },
        now
      );

      // Bob commitments
      const bobSpotifyId = insertCommitment(
        db,
        2,
        { name: "Bob Spotify", amount: 150, currency: 980, cadence: "monthly", anchorDay: 10, scope: "personal" },
        now
      );
      const groceriesId = insertCommitment(
        db,
        2,
        {
          name: "Groceries",
          amount: 8000,
          currency: 980,
          cadence: "weekly",
          anchorDay: 1,
          scope: "family",
          matcher: "Silpo",
        },
        now
      );

      // Charlie commitments (unrelated user)
      const charlieRentId = insertCommitment(
        db,
        3,
        { name: "Charlie Rent", amount: 12000, currency: 980, cadence: "monthly", anchorDay: 5, scope: "family" },
        now
      );

      // 1. Alice's view: Alice's personal + Alice's family + Bob's family
      const aliceList = listActiveCommitments(db, 1);
      const aliceListIds = aliceList.map((c) => c.id);
      expect(aliceListIds).toContain(aliceGymId);
      expect(aliceListIds).toContain(apartmentRentId);
      expect(aliceListIds).toContain(groceriesId);
      expect(aliceListIds).not.toContain(bobSpotifyId); // Bob's personal is hidden from Alice
      expect(aliceListIds).not.toContain(charlieRentId); // Charlie is outside the group

      // 2. Bob's view: Bob's personal + Bob's family + Alice's family
      const bobList = listActiveCommitments(db, 2);
      const bobListIds = bobList.map((c) => c.id);
      expect(bobListIds).toContain(bobSpotifyId);
      expect(bobListIds).toContain(groceriesId);
      expect(bobListIds).toContain(apartmentRentId);
      expect(bobListIds).not.toContain(aliceGymId); // Alice's personal is hidden from Bob
      expect(bobListIds).not.toContain(charlieRentId);

      // 3. Charlie's view: Only Charlie's own commitments
      const charlieList = listActiveCommitments(db, 3);
      const charlieListIds = charlieList.map((c) => c.id);
      expect(charlieListIds).toEqual([charlieRentId]);

      // 4. activeMatchers should include group family matchers
      const aliceMatchers = activeMatchers(db, 1);
      expect(aliceMatchers.has("Rent")).toBe(true);
      expect(aliceMatchers.has("Silpo")).toBe(true);

      // 5. Cross-member update on family commitments
      expect(getCommitmentById(db, 2, apartmentRentId)).not.toBeNull();
      const bobUpdateSuccess = updateCommitment(db, 2, apartmentRentId, { amount: 22000 });
      expect(bobUpdateSuccess).toBe(true);
      expect(getCommitmentById(db, 1, apartmentRentId)?.amount).toBe(22000);

      // Bob CANNOT update Alice's personal commitment
      const bobIllegalUpdate = updateCommitment(db, 2, aliceGymId, { amount: 3000 });
      expect(bobIllegalUpdate).toBe(false);
      expect(getCommitmentById(db, 1, aliceGymId)?.amount).toBe(1500);

      // 6. Cross-member deactivation on family commitments
      const bobDeactivateFamily = deactivateCommitment(db, 2, apartmentRentId);
      expect(bobDeactivateFamily).toBe(true);
      expect(listActiveCommitments(db, 1).map((c) => c.id)).not.toContain(apartmentRentId);

      // Bob CANNOT deactivate Alice's personal commitment
      const bobIllegalDeactivate = deactivateCommitment(db, 2, aliceGymId);
      expect(bobIllegalDeactivate).toBe(false);
      expect(getCommitmentById(db, 1, aliceGymId)?.active).toBe(1);

      db.close();
    });
  });

  describe("3. Atomic Data Patching (lib/atomicPatch.ts)", () => {
    it("wallet_append should append new entries and deduplicate existing ones", () => {
      const initialEntry: WalletEntry = {
        id: "w-1",
        date: "2026-03-01",
        kind: "income",
        amount: 5000,
        currency: 980,
      };
      const currentKv = { wallet: [initialEntry] };

      const patch: AtomicPatchPayload = {
        action: "wallet_append",
        entries: [
          { id: "w-1", date: "2026-03-01", kind: "income", amount: 5000, currency: 980 }, // Duplicate
          { id: "w-2", date: "2026-03-02", kind: "expense", amount: 200, currency: 980 }, // New
        ],
      };

      const result = applyAtomicDataPatch(currentKv, patch);
      expect(result.key).toBe("wallet");
      const nextWallet = result.value as WalletEntry[];
      expect(nextWallet).toHaveLength(2);
      expect(nextWallet[0].id).toBe("w-1");
      expect(nextWallet[1].id).toBe("w-2");
    });

    it("wallet_remove should remove entry by id", () => {
      const e1: WalletEntry = { id: "w-1", date: "2026-03-01", kind: "income", amount: 1000 };
      const e2: WalletEntry = { id: "w-2", date: "2026-03-02", kind: "expense", amount: 200 };
      const currentKv = { wallet: [e1, e2] };

      const result = applyAtomicDataPatch(currentKv, {
        action: "wallet_remove",
        entryId: "w-1",
      });

      expect(result.key).toBe("wallet");
      const nextWallet = result.value as WalletEntry[];
      expect(nextWallet).toEqual([e2]);
    });

    it("wallet_update should update fields of an entry by id", () => {
      const e1: WalletEntry = { id: "w-1", date: "2026-03-01", kind: "income", amount: 1000 };
      const currentKv = { wallet: [e1] };

      const result = applyAtomicDataPatch(currentKv, {
        action: "wallet_update",
        entryId: "w-1",
        patch: { amount: 1500, category: "Freelance" },
      });

      expect(result.key).toBe("wallet");
      const nextWallet = result.value as WalletEntry[];
      expect(nextWallet[0]).toEqual({
        id: "w-1",
        date: "2026-03-01",
        kind: "income",
        amount: 1500,
        category: "Freelance",
      });
    });

    it("map_set should set and delete dictionary entries for allowed keys", () => {
      const currentKv = {
        txNotes: { "tx-1": "Coffee" },
      };

      // Set new item
      const resSet = applyAtomicDataPatch(currentKv, {
        action: "map_set",
        key: "txNotes",
        itemKey: "tx-2",
        itemValue: "Lunch",
      });
      expect(resSet.key).toBe("txNotes");
      expect(resSet.value).toEqual({ "tx-1": "Coffee", "tx-2": "Lunch" });

      // Delete item with null
      const resDelete = applyAtomicDataPatch({ txNotes: resSet.value }, {
        action: "map_set",
        key: "txNotes",
        itemKey: "tx-1",
        itemValue: null,
      });
      expect(resDelete.value).toEqual({ "tx-2": "Lunch" });

      // Disallowed key should throw
      expect(() => {
        applyAtomicDataPatch(currentKv, {
          action: "map_set",
          // @ts-expect-error Testing invalid key
          key: "forbiddenKey",
          itemKey: "a",
          itemValue: "b",
        });
      }).toThrow("Недозволений ключ словника");
    });
  });

  describe("4. Monobank Webhook Parser (lib/monobankWebhook.ts)", () => {
    it("should successfully parse valid Monobank StatementItem webhook payload", () => {
      const validPayload = {
        type: "StatementItem",
        data: {
          account: "mono_acc_123",
          statementItem: {
            id: "stmt_abc_999",
            time: 1710500000,
            description: "Silpo Supermarket",
            mcc: 5411,
            originalMcc: 5411,
            hold: false,
            amount: -45000,
            operationAmount: -45000,
            currencyCode: 980,
            commissionRate: 0,
            cashbackAmount: 900,
            balance: 5500000,
            comment: "Weekly groceries",
            counterName: "Silpo Kyiv",
            receiptId: "rcpt_445",
          },
        },
      };

      const result = parseMonoWebhookPayload(validPayload);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.accountId).toBe("mono_acc_123");
        expect(result.item.id).toBe("stmt_abc_999");
        expect(result.item.time).toBe(1710500000);
        expect(result.item.amount).toBe(-45000);
        expect(result.item.currencyCode).toBe(980);
        expect(result.item.hold).toBe(false);
        expect(result.item.description).toBe("Silpo Supermarket");
        expect(result.item.counterName).toBe("Silpo Kyiv");
        expect(result.item.comment).toBe("Weekly groceries");
        expect(result.item.receiptId).toBe("rcpt_445");
      }
    });

    it("should reject invalid webhook payloads", () => {
      expect(parseMonoWebhookPayload(null).ok).toBe(false);
      expect(parseMonoWebhookPayload({ type: "WrongType", data: {} }).ok).toBe(false);
      expect(parseMonoWebhookPayload({ type: "StatementItem", data: { account: "" } }).ok).toBe(false);
      expect(
        parseMonoWebhookPayload({
          type: "StatementItem",
          data: { account: "acc1", statementItem: { id: "" } },
        }).ok
      ).toBe(false);
      expect(
        parseMonoWebhookPayload({
          type: "StatementItem",
          data: { account: "acc1", statementItem: { id: "item1", time: "not_a_time" } },
        }).ok
      ).toBe(false);
    });
  });

  describe("5. Account to User Resolution (findUserByAccountId)", () => {
    it("should resolve userId via sync_state, shared_accounts, or transactions", () => {
      const db = new Database(":memory:");
      createSchema(db);

      // 1. sync_state resolution
      db.prepare("INSERT INTO users (id, username, password_hash, created_at) VALUES (10, 'u10', 'h', 1)").run();
      db.prepare(
        "INSERT INTO sync_state (user_id, account_id, backfill_done, status) VALUES (10, 'acc_sync', 1, 'idle')"
      ).run();
      expect(findUserByAccountId(db, "acc_sync")).toBe(10);

      // 2. shared_accounts resolution
      db.prepare("INSERT INTO users (id, username, password_hash, created_at) VALUES (20, 'u20', 'h', 1)").run();
      db.prepare("INSERT INTO groups (id, name, created_at) VALUES (5, 'Group 5', 1)").run();
      db.prepare(
        "INSERT INTO shared_accounts (account_id, owner_user_id, group_id, created_at) VALUES ('acc_shared', 20, 5, 1)"
      ).run();
      expect(findUserByAccountId(db, "acc_shared")).toBe(20);

      // 3. transactions resolution
      db.prepare("INSERT INTO users (id, username, password_hash, created_at) VALUES (30, 'u30', 'h', 1)").run();
      db.prepare(
        `INSERT INTO transactions (id, user_id, account_id, time, amount, currency_code, hold, fetched_at)
         VALUES ('tx_find_1', 30, 'acc_tx', 1000, -100, 980, 0, 1000)`
      ).run();
      expect(findUserByAccountId(db, "acc_tx")).toBe(30);

      // 4. Non-existent account
      expect(findUserByAccountId(db, "non_existent_acc")).toBeNull();

      db.close();
    });
  });
});
