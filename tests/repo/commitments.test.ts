import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { createSchema, type DB } from "@/lib/db";
import * as repo from "@/lib/repo/commitments";

function testDb(): DB {
  const d = new Database(":memory:");
  createSchema(d);
  return d;
}

const NOW = Date.UTC(2026, 6, 16) / 1000;
const netflix = {
  name: "Netflix",
  amount: 29_900,
  currency: 980,
  cadence: "monthly" as const,
  anchorDay: 14,
  matcher: "netflix.com",
};

describe("repo/commitments", () => {
  it("insert → listActive", () => {
    const d = testDb();
    const id = repo.insert(d, 1, netflix, NOW);
    expect(id).toBeGreaterThan(0);
    const list = repo.listActive(d, 1);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "Netflix", amount: 29_900, cadence: "monthly", anchor_day: 14 });
  });

  it("deactivate прибирає зі списку, але рядок лишається", () => {
    const d = testDb();
    const id = repo.insert(d, 1, netflix, NOW);
    expect(repo.deactivate(d, 1, id)).toBe(true);
    expect(repo.listActive(d, 1)).toEqual([]);
    const raw = d.prepare("SELECT active FROM commitments WHERE id = ?").get(id) as { active: number };
    expect(raw.active).toBe(0);
  });

  it("update змінює лише передані поля", () => {
    const d = testDb();
    const id = repo.insert(d, 1, netflix, NOW);
    expect(repo.update(d, 1, id, { amount: 34_900 })).toBe(true);
    const c = repo.listActive(d, 1)[0];
    expect(c.amount).toBe(34_900);
    expect(c.name).toBe("Netflix");
  });

  it("update без полів → false, нічого не змінює", () => {
    const d = testDb();
    const id = repo.insert(d, 1, netflix, NOW);
    expect(repo.update(d, 1, id, {})).toBe(false);
  });

  it("чужий користувач не бачить і не змінює", () => {
    const d = testDb();
    const id = repo.insert(d, 1, netflix, NOW);
    expect(repo.listActive(d, 2)).toEqual([]);
    expect(repo.deactivate(d, 2, id)).toBe(false);
    expect(repo.update(d, 2, id, { amount: 1 })).toBe(false);
  });

  it("activeMatchers віддає matcher'и лише активних", () => {
    const d = testDb();
    repo.insert(d, 1, netflix, NOW);
    const id2 = repo.insert(d, 1, { ...netflix, name: "Spotify", matcher: "spotify" }, NOW);
    repo.deactivate(d, 1, id2);
    expect([...repo.activeMatchers(d, 1)]).toEqual(["netflix.com"]);
  });

  it("зобов'язання без matcher (заведене вручну) не ламає activeMatchers", () => {
    const d = testDb();
    repo.insert(d, 1, { ...netflix, matcher: null }, NOW);
    expect([...repo.activeMatchers(d, 1)]).toEqual([]);
  });

  it("getById повертає рядок власника", () => {
    const d = testDb();
    const id = repo.insert(d, 1, netflix, NOW);
    const row = repo.getById(d, 1, id);
    expect(row).toMatchObject({ id, name: "Netflix", cadence: "monthly" });
  });

  it("getById не бачить чужий рядок і повертає null для неіснуючого", () => {
    const d = testDb();
    const id = repo.insert(d, 1, netflix, NOW);
    expect(repo.getById(d, 2, id)).toBeNull();
    expect(repo.getById(d, 1, id + 999)).toBeNull();
  });
});
