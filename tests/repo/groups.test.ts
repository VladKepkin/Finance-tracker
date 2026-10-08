import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { createSchema, createUser, type DB } from "../../lib/db";
import {
  createGroup,
  getGroupsForUser,
  getGroupMembers,
  shareAccount,
  unshareAccount,
  getSharedAccountsForGroup,
  getSharedAccountsForUser,
  getAccessibleAccountIds,
  isAccountAccessible,
  createInvite,
  acceptInvite,
} from "../../lib/repo/groups";

describe("repo/groups", () => {
  let db: DB;
  let user1Id: number;
  let user2Id: number;

  beforeEach(() => {
    db = new Database(":memory:");
    createSchema(db);
    // Create two test users
    const u1 = db
      .prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)")
      .run("vlad", "hash1", Date.now());
    user1Id = Number(u1.lastInsertRowid);

    const u2 = db
      .prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)")
      .run("partner", "hash2", Date.now());
    user2Id = Number(u2.lastInsertRowid);
  });

  it("створює групу і додає власника як owner", () => {
    const group = createGroup(db, "Сім'я", user1Id);
    expect(group.id).toBeGreaterThan(0);
    expect(group.name).toBe("Сім'я");

    const groups1 = getGroupsForUser(db, user1Id);
    expect(groups1).toHaveLength(1);
    expect(groups1[0].name).toBe("Сім'я");
    expect(groups1[0].role).toBe("owner");
    expect(groups1[0].memberCount).toBe(1);

    const groups2 = getGroupsForUser(db, user2Id);
    expect(groups2).toHaveLength(0);
  });

  it("запрошення та приєднання за інвайт-кодом", () => {
    const group = createGroup(db, "Сім'я", user1Id);
    const code = createInvite(db, group.id, user1Id);
    expect(code).toBeDefined();

    const accepted = acceptInvite(db, code, user2Id);
    expect(accepted.groupId).toBe(group.id);
    expect(accepted.groupName).toBe("Сім'я");

    const members = getGroupMembers(db, group.id);
    expect(members).toHaveLength(2);
    expect(members.map((m) => m.username)).toEqual(["vlad", "partner"]);
    expect(members.find((m) => m.userId === user2Id)?.role).toBe("member");
  });

  it("розшарювання картки та перевірка доступності", () => {
    const group = createGroup(db, "Сім'я", user1Id);
    const code = createInvite(db, group.id, user1Id);
    acceptInvite(db, code, user2Id);

    const cardId = "mono_card_shared_123";
    shareAccount(db, cardId, user1Id, group.id);

    // user2 тепер має доступ до цієї картки
    expect(isAccountAccessible(db, cardId, user2Id)).toBe(true);
    expect(getAccessibleAccountIds(db, user2Id)).toContain(cardId);

    // Приватна картка user1 не доступна user2
    expect(isAccountAccessible(db, "mono_card_private_456", user2Id)).toBe(false);

    // Unshare видаляє доступ
    unshareAccount(db, cardId, user1Id, group.id);
    expect(isAccountAccessible(db, cardId, user2Id)).toBe(false);
  });
});
