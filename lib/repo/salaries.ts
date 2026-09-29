import type { DB } from "../db";

export interface SalaryRow {
  id: number;
  user_id: number;
  paid_on: string;
  amount: number;
  currency: number;
  note: string | null;
  created_at: number;
}

export function list(database: DB, userId: number): SalaryRow[] {
  return database
    .prepare("SELECT * FROM salaries WHERE user_id = ? ORDER BY paid_on DESC")
    .all(userId) as SalaryRow[];
}

export function insert(
  database: DB,
  userId: number,
  s: { paidOn: string; amount: number; currency: number; note?: string | null },
  nowSeconds: number
): number {
  const info = database
    .prepare(
      `INSERT INTO salaries (user_id, paid_on, amount, currency, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(userId, s.paidOn, s.amount, s.currency, s.note ?? null, nowSeconds);
  return Number(info.lastInsertRowid);
}

export function getById(database: DB, userId: number, id: number): SalaryRow | null {
  const row = database
    .prepare("SELECT * FROM salaries WHERE id = ? AND user_id = ?")
    .get(id, userId) as SalaryRow | undefined;
  return row ?? null;
}

export function update(
  database: DB,
  userId: number,
  id: number,
  patch: { paidOn?: string; amount?: number; currency?: number; note?: string | null }
): boolean {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  if (patch.paidOn !== undefined) {
    sets.push("paid_on = ?");
    params.push(patch.paidOn);
  }
  if (patch.amount !== undefined) {
    sets.push("amount = ?");
    params.push(patch.amount);
  }
  if (patch.currency !== undefined) {
    sets.push("currency = ?");
    params.push(patch.currency);
  }
  if (patch.note !== undefined) {
    sets.push("note = ?");
    params.push(patch.note);
  }
  if (sets.length === 0) return false;
  params.push(id, userId);
  const info = database
    .prepare(`UPDATE salaries SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`)
    .run(...params);
  return info.changes > 0;
}

export function remove(database: DB, userId: number, id: number): boolean {
  const info = database.prepare("DELETE FROM salaries WHERE id = ? AND user_id = ?").run(id, userId);
  return info.changes > 0;
}
