import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { createSchema, type DB } from "@/lib/db";
import * as repo from "@/lib/repo/salaries";

function testDb(): DB {
  const d = new Database(":memory:");
  createSchema(d);
  return d;
}

const NOW = Date.UTC(2026, 6, 16) / 1000;
const june = { paidOn: "2026-06-15", amount: 20_000_00, currency: 980 };

describe("repo/salaries", () => {
  it("insert → list, найновіші першими", () => {
    const d = testDb();
    repo.insert(d, 1, june, NOW);
    repo.insert(d, 1, { ...june, paidOn: "2026-07-15" }, NOW);
    const list = repo.list(d, 1);
    expect(list).toHaveLength(2);
    expect(list[0].paid_on).toBe("2026-07-15");
  });

  it("update змінює лише передані поля", () => {
    const d = testDb();
    const id = repo.insert(d, 1, june, NOW);
    expect(repo.update(d, 1, id, { amount: 21_000_00 })).toBe(true);
    const row = repo.getById(d, 1, id)!;
    expect(row.amount).toBe(21_000_00);
    expect(row.paid_on).toBe("2026-06-15");
  });

  it("update без полів → false, нічого не змінює", () => {
    const d = testDb();
    const id = repo.insert(d, 1, june, NOW);
    expect(repo.update(d, 1, id, {})).toBe(false);
  });

  it("remove — жорстке видалення: рядок зникає повністю", () => {
    const d = testDb();
    const id = repo.insert(d, 1, june, NOW);
    expect(repo.remove(d, 1, id)).toBe(true);
    expect(repo.getById(d, 1, id)).toBeNull();
    const raw = d.prepare("SELECT COUNT(*) as n FROM salaries WHERE id = ?").get(id) as { n: number };
    expect(raw.n).toBe(0);
  });

  it("чужий користувач не бачить і не змінює", () => {
    const d = testDb();
    const id = repo.insert(d, 1, june, NOW);
    expect(repo.list(d, 2)).toEqual([]);
    expect(repo.getById(d, 2, id)).toBeNull();
    expect(repo.update(d, 2, id, { amount: 1 })).toBe(false);
    expect(repo.remove(d, 2, id)).toBe(false);
    expect(repo.getById(d, 1, id)).not.toBeNull();
  });

  it("getById повертає null для неіснуючого", () => {
    const d = testDb();
    expect(repo.getById(d, 1, 999)).toBeNull();
  });
});
