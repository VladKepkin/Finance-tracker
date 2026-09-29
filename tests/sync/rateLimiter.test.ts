import { describe, it, expect } from "vitest";
import { createRateLimiter } from "@/lib/sync/rateLimiter";

function fakeClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

describe("createRateLimiter", () => {
  it("витримує мінімальний інтервал між запитами", async () => {
    const clock = fakeClock();
    const lim = createRateLimiter({
      minIntervalMs: 60_000,
      maxIntervalMs: 900_000,
      now: clock.now,
      sleep: clock.sleep,
    });
    const times: number[] = [];
    await Promise.all([
      lim.schedule(async () => times.push(clock.now())),
      lim.schedule(async () => times.push(clock.now())),
      lim.schedule(async () => times.push(clock.now())),
    ]);
    expect(times).toEqual([0, 60_000, 120_000]);
  });

  it("повертає значення функції", async () => {
    const clock = fakeClock();
    const lim = createRateLimiter({
      minIntervalMs: 1000,
      maxIntervalMs: 9000,
      now: clock.now,
      sleep: clock.sleep,
    });
    await expect(lim.schedule(async () => 42)).resolves.toBe(42);
  });

  it("penalize подвоює інтервал, reset повертає базовий", async () => {
    const clock = fakeClock();
    const lim = createRateLimiter({
      minIntervalMs: 60_000,
      maxIntervalMs: 900_000,
      now: clock.now,
      sleep: clock.sleep,
    });
    await lim.schedule(async () => 0);
    lim.penalize();
    await lim.schedule(async () => 0);
    expect(clock.now()).toBe(120_000);
    lim.reset();
    await lim.schedule(async () => 0);
    expect(clock.now()).toBe(180_000);
  });

  it("не перевищує стелю інтервалу", async () => {
    const clock = fakeClock();
    const lim = createRateLimiter({
      minIntervalMs: 60_000,
      maxIntervalMs: 100_000,
      now: clock.now,
      sleep: clock.sleep,
    });
    await lim.schedule(async () => 0);
    lim.penalize();
    lim.penalize();
    lim.penalize();
    await lim.schedule(async () => 0);
    expect(clock.now()).toBe(100_000);
  });

  it("помилка однієї задачі не ламає чергу", async () => {
    const clock = fakeClock();
    const lim = createRateLimiter({
      minIntervalMs: 1000,
      maxIntervalMs: 9000,
      now: clock.now,
      sleep: clock.sleep,
    });
    const failed = lim.schedule(async () => {
      throw new Error("boom");
    });
    await expect(failed).rejects.toThrow("boom");
    await expect(lim.schedule(async () => "ok")).resolves.toBe("ok");
  });
});
