import type { DB } from "../db";
import { randomBytes } from "crypto";

export interface GroupRow {
  id: number;
  name: string;
  created_at: number;
}

export interface GroupMemberRow {
  group_id: number;
  user_id: number;
  role: "owner" | "member";
  joined_at: number;
}

export interface SharedAccountRow {
  account_id: string;
  owner_user_id: number;
  group_id: number;
  created_at: number;
}

export function createGroup(database: DB, name: string, ownerUserId: number): { id: number; name: string } {
  const now = Date.now();
  const tx = database.transaction(() => {
    const res = database
      .prepare("INSERT INTO groups (name, created_at) VALUES (?, ?)")
      .run(name.trim(), now);
    const groupId = Number(res.lastInsertRowid);
    database
      .prepare("INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)")
      .run(groupId, ownerUserId, now);
    return { id: groupId, name: name.trim() };
  });
  return tx();
}

export function getGroupsForUser(
  database: DB,
  userId: number
): { id: number; name: string; role: "owner" | "member"; memberCount: number }[] {
  const sql = `
    SELECT g.id, g.name, gm.role,
      (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS memberCount
    FROM groups g
    JOIN group_members gm ON gm.group_id = g.id
    WHERE gm.user_id = ?
    ORDER BY g.id ASC
  `;
  return database.prepare(sql).all(userId) as {
    id: number;
    name: string;
    role: "owner" | "member";
    memberCount: number;
  }[];
}

export function getGroupMembers(
  database: DB,
  groupId: number
): { userId: number; username: string; role: "owner" | "member"; joinedAt: number }[] {
  const sql = `
    SELECT u.id AS userId, u.username, gm.role, gm.joined_at AS joinedAt
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
    ORDER BY gm.joined_at ASC
  `;
  return database.prepare(sql).all(groupId) as {
    userId: number;
    username: string;
    role: "owner" | "member";
    joinedAt: number;
  }[];
}

export function isUserInGroup(database: DB, groupId: number, userId: number): boolean {
  const row = database
    .prepare("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?")
    .get(groupId, userId);
  return Boolean(row);
}

export function shareAccount(
  database: DB,
  accountId: string,
  ownerUserId: number,
  groupId: number
): void {
  if (!isUserInGroup(database, groupId, ownerUserId)) {
    throw new Error("Користувач не є учасником цієї групи");
  }
  const now = Date.now();
  database
    .prepare(
      `INSERT INTO shared_accounts (account_id, owner_user_id, group_id, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(account_id, group_id) DO UPDATE SET owner_user_id = excluded.owner_user_id`
    )
    .run(accountId, ownerUserId, groupId, now);
}

export function unshareAccount(
  database: DB,
  accountId: string,
  ownerUserId: number,
  groupId: number
): void {
  database
    .prepare("DELETE FROM shared_accounts WHERE account_id = ? AND group_id = ? AND owner_user_id = ?")
    .run(accountId, groupId, ownerUserId);
}

export function getSharedAccountsForGroup(
  database: DB,
  groupId: number
): { accountId: string; ownerUserId: number; createdAt: number }[] {
  const sql = `
    SELECT account_id AS accountId, owner_user_id AS ownerUserId, created_at AS createdAt
    FROM shared_accounts
    WHERE group_id = ?
  `;
  return database.prepare(sql).all(groupId) as {
    accountId: string;
    ownerUserId: number;
    createdAt: number;
  }[];
}

export function getSharedAccountsForUser(
  database: DB,
  userId: number
): { accountId: string; ownerUserId: number; groupId: number; groupName: string }[] {
  const sql = `
    SELECT sa.account_id AS accountId, sa.owner_user_id AS ownerUserId, sa.group_id AS groupId, g.name AS groupName
    FROM shared_accounts sa
    JOIN groups g ON g.id = sa.group_id
    JOIN group_members gm ON gm.group_id = sa.group_id
    WHERE gm.user_id = ?
  `;
  return database.prepare(sql).all(userId) as {
    accountId: string;
    ownerUserId: number;
    groupId: number;
    groupName: string;
  }[];
}

export function getAccessibleAccountIds(database: DB, userId: number): string[] {
  const rows = getSharedAccountsForUser(database, userId);
  return Array.from(new Set(rows.map((r) => r.accountId)));
}

export function isAccountAccessible(database: DB, accountId: string, userId: number): boolean {
  // Checks if account is owned by user in DB or shared with user via any of their groups
  const shared = database
    .prepare(
      `SELECT 1 FROM shared_accounts sa
       JOIN group_members gm ON gm.group_id = sa.group_id
       WHERE sa.account_id = ? AND gm.user_id = ?`
    )
    .get(accountId, userId);
  return Boolean(shared);
}

export function createInvite(
  database: DB,
  groupId: number,
  createdByUserId: number,
  expiresInDays: number = 7
): string {
  if (!isUserInGroup(database, groupId, createdByUserId)) {
    throw new Error("Тільки учасник групи може створити запрошення");
  }
  const code = randomBytes(8).toString("hex").toUpperCase();
  const expiresAt = Date.now() + expiresInDays * 86_400_000;
  database
    .prepare("INSERT INTO group_invites (code, group_id, created_by, expires_at) VALUES (?, ?, ?, ?)")
    .run(code, groupId, createdByUserId, expiresAt);
  return code;
}

export function acceptInvite(
  database: DB,
  code: string,
  userId: number
): { groupId: number; groupName: string } {
  const cleanCode = code.trim().toUpperCase();
  const invite = database
    .prepare("SELECT * FROM group_invites WHERE code = ?")
    .get(cleanCode) as { code: string; group_id: number; created_by: number; expires_at: number } | undefined;

  if (!invite) {
    throw new Error("Недійсний код запрошення");
  }
  if (invite.expires_at < Date.now()) {
    database.prepare("DELETE FROM group_invites WHERE code = ?").run(cleanCode);
    throw new Error("Термін дії запрошення закінчився");
  }

  const group = database.prepare("SELECT name FROM groups WHERE id = ?").get(invite.group_id) as
    | { name: string }
    | undefined;
  if (!group) {
    throw new Error("Групу не знайдено");
  }

  const existingMember = database
    .prepare("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?")
    .get(invite.group_id, userId);

  if (!existingMember) {
    database
      .prepare("INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)")
      .run(invite.group_id, userId, Date.now());
  }

  return { groupId: invite.group_id, groupName: group.name };
}
