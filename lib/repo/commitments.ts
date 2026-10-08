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
}

export function listActive(database: DB, userId: number): CommitmentRow[] {
  return database
    .prepare("SELECT * FROM commitments WHERE user_id = ? AND active = 1 ORDER BY amount DESC")
    .all(userId) as CommitmentRow[];
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
  },
  nowSeconds: number
): number {
  const source = c.source === "cash" ? "cash" : "card";
  const info = database
    .prepare(
      `INSERT INTO commitments (user_id, name, amount, currency, cadence, anchor_day, matcher, active, created_at, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
    .run(userId, c.name, c.amount, c.currency, c.cadence, c.anchorDay, c.matcher ?? null, nowSeconds, source);
  return Number(info.lastInsertRowid);
}

export function getById(database: DB, userId: number, id: number): CommitmentRow | null {
  const row = database
    .prepare("SELECT * FROM commitments WHERE id = ? AND user_id = ?")
    .get(id, userId) as CommitmentRow | undefined;
  return row ?? null;
}

export function update(
  database: DB,
  userId: number,
  id: number,
  patch: { name?: string; amount?: number; cadence?: Cadence; anchorDay?: number; source?: "card" | "cash" }
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
  if (sets.length === 0) return false;
  params.push(id, userId);
  const info = database
    .prepare(`UPDATE commitments SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`)
    .run(...params);
  return info.changes > 0;
}

export function deactivate(database: DB, userId: number, id: number): boolean {
  const info = database
    .prepare("UPDATE commitments SET active = 0 WHERE id = ? AND user_id = ?")
    .run(id, userId);
  return info.changes > 0;
}

export function activeMatchers(database: DB, userId: number): Set<string> {
  const rows = database
    .prepare("SELECT matcher FROM commitments WHERE user_id = ? AND active = 1 AND matcher IS NOT NULL")
    .all(userId) as { matcher: string }[];
  return new Set(rows.map((r) => r.matcher));
}
