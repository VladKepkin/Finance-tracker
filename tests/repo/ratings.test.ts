import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { createSchema, type DB } from "@/lib/db";
import * as repo from "@/lib/repo/ratings";

function testDb(): DB {
  const d = new Database(":memory:");
  createSchema(d);
  return d;
}

const NOW = Date.UTC(2026, 6, 16) / 1000;
const LATER = NOW + 3600;

describe("repo/ratings", () => {
  it("setRating → getRatings повертає оцінку", () => {
    const d = testDb();
    repo.setRating(d, 1, "tx1", 4, NOW);
    expect(repo.getRatings(d, 1, ["tx1"])).toEqual(new Map([["tx1", 4]]));
  });

  it("повторний setRating перезаписує score, не дублює рядок", () => {
    const d = testDb();
    repo.setRating(d, 1, "tx1", 2, NOW);
    repo.setRating(d, 1, "tx1", 5, LATER);
    expect(repo.getRatings(d, 1, ["tx1"])).toEqual(new Map([["tx1", 5]]));
    const rows = d.prepare("SELECT * FROM ratings WHERE user_id = 1 AND tx_id = 'tx1'").all();
    expect(rows).toHaveLength(1);
  });

  it("переоцінка не змінює created_at — питання «як тобі зараз», не історія", () => {
    const d = testDb();
    repo.setRating(d, 1, "tx1", 2, NOW);
    repo.setRating(d, 1, "tx1", 5, LATER);
    const row = d.prepare("SELECT created_at FROM ratings WHERE user_id = 1 AND tx_id = 'tx1'").get() as {
      created_at: number;
    };
    expect(row.created_at).toBe(NOW);
  });

  it("порожній txIds → порожня Map, без звернення до БД", () => {
    const d = testDb();
    expect(repo.getRatings(d, 1, [])).toEqual(new Map());
  });

  it("чужий користувач не бачить і не змінює оцінку", () => {
    const d = testDb();
    repo.setRating(d, 1, "tx1", 3, NOW);
    expect(repo.getRatings(d, 2, ["tx1"])).toEqual(new Map());
    expect(repo.clearRating(d, 2, "tx1")).toBe(false);
    expect(repo.getRatings(d, 1, ["tx1"])).toEqual(new Map([["tx1", 3]]));
  });

  it("clearRating видаляє оцінку власника", () => {
    const d = testDb();
    repo.setRating(d, 1, "tx1", 3, NOW);
    expect(repo.clearRating(d, 1, "tx1")).toBe(true);
    expect(repo.getRatings(d, 1, ["tx1"])).toEqual(new Map());
  });

  it("clearRating неіснуючого рядка → false", () => {
    const d = testDb();
    expect(repo.clearRating(d, 1, "nope")).toBe(false);
  });

  it("getRatings повертає лише запитані id, ігноруючи чужі/неіснуючі", () => {
    const d = testDb();
    repo.setRating(d, 1, "tx1", 1, NOW);
    repo.setRating(d, 1, "tx2", 2, NOW);
    expect(repo.getRatings(d, 1, ["tx1", "tx3"])).toEqual(new Map([["tx1", 1]]));
  });

  it("велика кількість txIds (понад один chunk) не валить запит", () => {
    const d = testDb();
    const ids = Array.from({ length: 1200 }, (_, i) => `tx${i}`);
    repo.setRating(d, 1, "tx500", 4, NOW);
    repo.setRating(d, 1, "tx1199", 1, NOW);
    const result = repo.getRatings(d, 1, ids);
    expect(result.get("tx500")).toBe(4);
    expect(result.get("tx1199")).toBe(1);
    expect(result.size).toBe(2);
  });
});
