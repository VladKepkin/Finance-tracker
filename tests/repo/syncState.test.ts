import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { createSchema, type DB } from "@/lib/db";
import * as state from "@/lib/repo/syncState";

function testDb(): DB {
  const d = new Database(":memory:");
  createSchema(d);
  return d;
}

describe("repo/syncState", () => {
  it("ensure створює рядок із покриттям у поточному моменті", () => {
    const d = testDb();
    const row = state.ensure(d, 1, "acc1", 5000);
    expect(row.covered_from).toBe(5000);
    expect(row.covered_to).toBe(5000);
    expect(row.backfill_done).toBe(0);
    expect(row.status).toBe("idle");
  });

  it("ensure не перезаписує наявний рядок", () => {
    const d = testDb();
    state.ensure(d, 1, "acc1", 5000);
    state.setCoveredFrom(d, 1, "acc1", 1000);
    const row = state.ensure(d, 1, "acc1", 9999);
    expect(row.covered_from).toBe(1000);
  });

  it("оновлює межі, прапорець бекфілу і статус", () => {
    const d = testDb();
    state.ensure(d, 1, "acc1", 5000);
    state.setCoveredFrom(d, 1, "acc1", 100);
    state.setCoveredTo(d, 1, "acc1", 8000);
    state.markBackfillDone(d, 1, "acc1");
    state.setStatus(d, 1, "acc1", "error", "403");
    const row = state.get(d, 1, "acc1")!;
    expect(row.covered_from).toBe(100);
    expect(row.covered_to).toBe(8000);
    expect(row.backfill_done).toBe(1);
    expect(row.status).toBe("error");
    expect(row.error).toBe("403");
  });

  it("setStatus без помилки чистить попередню", () => {
    const d = testDb();
    state.ensure(d, 1, "acc1", 5000);
    state.setStatus(d, 1, "acc1", "error", "боом");
    state.setStatus(d, 1, "acc1", "idle");
    expect(state.get(d, 1, "acc1")!.error).toBeNull();
  });

  it("get для невідомого рахунку → undefined", () => {
    const d = testDb();
    expect(state.get(d, 1, "nope")).toBeUndefined();
  });

  it("listForUser віддає всі рахунки користувача", () => {
    const d = testDb();
    state.ensure(d, 1, "a", 1);
    state.ensure(d, 1, "b", 1);
    state.ensure(d, 2, "c", 1);
    expect(state.listForUser(d, 1).map((r) => r.account_id).sort()).toEqual(["a", "b"]);
  });
});
