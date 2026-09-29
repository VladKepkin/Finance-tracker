import type { DB } from "../db";

const CHUNK_SIZE = 500;

export function setRating(
  database: DB,
  userId: number,
  txId: string,
  score: number,
  nowSeconds: number
): void {
  database
    .prepare(
      `INSERT INTO ratings (user_id, tx_id, score, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, tx_id) DO UPDATE SET score = excluded.score`
    )
    .run(userId, txId, score, nowSeconds);
}

export function getRatings(database: DB, userId: number, txIds: string[]): Map<string, number> {
  const result = new Map<string, number>();
  if (txIds.length === 0) return result;

  for (let i = 0; i < txIds.length; i += CHUNK_SIZE) {
    const chunk = txIds.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(", ");
    const rows = database
      .prepare(`SELECT tx_id, score FROM ratings WHERE user_id = ? AND tx_id IN (${placeholders})`)
      .all(userId, ...chunk) as { tx_id: string; score: number }[];
    for (const r of rows) result.set(r.tx_id, r.score);
  }
  return result;
}

export function clearRating(database: DB, userId: number, txId: string): boolean {
  const info = database
    .prepare("DELETE FROM ratings WHERE user_id = ? AND tx_id = ?")
    .run(userId, txId);
  return info.changes > 0;
}
