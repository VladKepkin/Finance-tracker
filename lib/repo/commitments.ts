import type { DB } from "../db";
import type { Cadence } from "../metrics/cadence";

export interface CommitmentRow {
  id: number;
  user_id: number;
  name: string;
  amount: number;
  currency: number;
  cadence: Cadence;
  anchor_day: number;
  matcher: string | null;
  active: number;
  created_at: number;
  source: "card" | "cash";
  scope?: "personal" | "family";
}

export function listActive(database: DB, userId: number): CommitmentRow[] {
  return database
    .prepare(
      `SELECT * FROM commitments
       WHERE active = 1 AND (
         user_id = ?
         OR (
           scope = 'family' AND user_id IN (
             SELECT gm2.user_id FROM group_members gm1
             JOIN group_members gm2 ON gm1.group_id = gm2.group_id
             WHERE gm1.user_id = ?
           )
         )
       )
       ORDER BY amount DESC`
    )
    .all(userId, userId) as CommitmentRow[];
}

export function insert(
  database: DB,
  userId: number,
  c: {
    name: string;
    amount: number;
    currency: number;
    cadence: Cadence;
    anchorDay: number;
    matcher?: string | null;
    source?: "card" | "cash";
    scope?: "personal" | "family";
  },
  nowSeconds: number
): number {
  const source = c.source === "cash" ? "cash" : "card";
  const scope = c.scope === "family" ? "family" : "personal";
  const info = database
    .prepare(
      `INSERT INTO commitments (user_id, name, amount, currency, cadence, anchor_day, matcher, active, created_at, source, scope)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
    )
    .run(userId, c.name, c.amount, c.currency, c.cadence, c.anchorDay, c.matcher ?? null, nowSeconds, source, scope);
  return Number(info.lastInsertRowid);
}

export function getById(database: DB, userId: number, id: number): CommitmentRow | null {
  const row = database
    .prepare(
      `SELECT * FROM commitments
       WHERE id = ? AND (
         user_id = ?
         OR (
           scope = 'family' AND user_id IN (
             SELECT gm2.user_id FROM group_members gm1
             JOIN group_members gm2 ON gm1.group_id = gm2.group_id
             WHERE gm1.user_id = ?
           )
         )
       )`
    )
    .get(id, userId, userId) as CommitmentRow | undefined;
  return row ?? null;
}

export function update(
  database: DB,
  userId: number,
  id: number,
  patch: {
    name?: string;
    amount?: number;
    cadence?: Cadence;
    anchorDay?: number;
    source?: "card" | "cash";
    scope?: "personal" | "family";
  }
): boolean {
  const sets: string[] = [];
  const params: (string | number)[] = [];
  if (patch.name !== undefined) {
    sets.push("name = ?");
    params.push(patch.name);
  }
  if (patch.amount !== undefined) {
    sets.push("amount = ?");
    params.push(patch.amount);
  }
  if (patch.cadence !== undefined) {
    sets.push("cadence = ?");
    params.push(patch.cadence);
  }
  if (patch.anchorDay !== undefined) {
    sets.push("anchor_day = ?");
    params.push(patch.anchorDay);
  }
  if (patch.source !== undefined) {
    sets.push("source = ?");
    params.push(patch.source);
  }
  if (patch.scope !== undefined) {
    sets.push("scope = ?");
    params.push(patch.scope);
  }
  if (sets.length === 0) return false;
  params.push(id, userId, userId);
  const info = database
    .prepare(
      `UPDATE commitments SET ${sets.join(", ")}
       WHERE id = ? AND (
         user_id = ?
         OR (
           scope = 'family' AND user_id IN (
             SELECT gm2.user_id FROM group_members gm1
             JOIN group_members gm2 ON gm1.group_id = gm2.group_id
             WHERE gm1.user_id = ?
           )
         )
       )`
    )
    .run(...params);
  return info.changes > 0;
}

export function deactivate(database: DB, userId: number, id: number): boolean {
  const info = database
    .prepare(
      `UPDATE commitments SET active = 0
       WHERE id = ? AND (
         user_id = ?
         OR (
           scope = 'family' AND user_id IN (
             SELECT gm2.user_id FROM group_members gm1
             JOIN group_members gm2 ON gm1.group_id = gm2.group_id
             WHERE gm1.user_id = ?
           )
         )
       )`
    )
    .run(id, userId, userId);
  return info.changes > 0;
}

export function activeMatchers(database: DB, userId: number): Set<string> {
  const rows = database
    .prepare(
      `SELECT matcher FROM commitments
       WHERE active = 1 AND matcher IS NOT NULL AND (
         user_id = ?
         OR (
           scope = 'family' AND user_id IN (
             SELECT gm2.user_id FROM group_members gm1
             JOIN group_members gm2 ON gm1.group_id = gm2.group_id
             WHERE gm1.user_id = ?
           )
         )
       )`
    )
    .all(userId, userId) as { matcher: string }[];
  return new Set(rows.map((r) => r.matcher));
}
