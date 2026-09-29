export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function isPlainBody(body: unknown): body is Record<string, unknown> {
  return typeof body === "object" && body !== null && !Array.isArray(body);
}

export function parseRating(body: unknown): ParseResult<{ txId: string; score: number }> {
  if (!isPlainBody(body)) return { ok: false, error: "Некоректний запит" };

  const txId = typeof body.txId === "string" ? body.txId.trim() : "";
  if (!txId) return { ok: false, error: "Порожній txId" };

  const score = body.score;
  if (typeof score !== "number" || !Number.isInteger(score) || score < 1 || score > 5) {
    return { ok: false, error: "Оцінка має бути цілим числом від 1 до 5" };
  }

  return { ok: true, value: { txId, score } };
}
