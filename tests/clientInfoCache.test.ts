import { describe, it, expect, vi } from "vitest";
import { createClientInfoCache } from "@/lib/clientInfoCache";
import { MonoError } from "@/lib/monobank";

describe("client-info cache", () => {
  it("serves a fresh copy without calling Monobank again", async () => {
    const cache = createClientInfoCache<string>(60_000);
    const load = vi.fn().mockResolvedValue("v1");
    await cache.get(1, 0, load);
    const second = await cache.get(1, 59_999, load);
    expect(second).toEqual({ data: "v1", fetchedAt: 0 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reloads once the copy is a minute old", async () => {
    const cache = createClientInfoCache<string>(60_000);
    await cache.get(1, 0, async () => "v1");
    const next = await cache.get(1, 60_000, async () => "v2");
    expect(next).toEqual({ data: "v2", fetchedAt: 60_000 });
  });

  it("falls back to the last copy, with its real time, when Monobank rate-limits", async () => {
    const cache = createClientInfoCache<string>(60_000);
    await cache.get(1, 0, async () => "v1");
    const r = await cache.get(1, 120_000, async () => {
      throw new MonoError("limit", 429);
    });
    expect(r).toEqual({ data: "v1", fetchedAt: 0 });
  });

  it("rate limit with nothing cached still fails", async () => {
    const cache = createClientInfoCache<string>(60_000);
    await expect(
      cache.get(1, 0, async () => {
        throw new MonoError("limit", 429);
      })
    ).rejects.toThrow("limit");
  });

  it("an invalid token is never hidden behind an old copy", async () => {
    const cache = createClientInfoCache<string>(60_000);
    await cache.get(1, 0, async () => "v1");
    await expect(
      cache.get(1, 120_000, async () => {
        throw new MonoError("bad token", 403);
      })
    ).rejects.toThrow("bad token");
  });

  it("keeps users apart and can forget one", async () => {
    const cache = createClientInfoCache<string>(60_000);
    await cache.get(1, 0, async () => "a");
    await cache.get(2, 0, async () => "b");
    cache.forget(1);
    const load = vi.fn().mockResolvedValue("a2");
    expect((await cache.get(1, 10, load)).data).toBe("a2");
    expect((await cache.get(2, 10, load)).data).toBe("b");
  });
});
