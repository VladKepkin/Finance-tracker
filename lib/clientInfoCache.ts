import { MonoError, type MonoClientInfo } from "@/lib/monobank";

export const CLIENT_INFO_FRESH_MS = 60_000;

export interface CachedClientInfo<T> {
  data: T;
  fetchedAt: number;
}

export function createClientInfoCache<T>(freshMs = CLIENT_INFO_FRESH_MS) {
  const byUser = new Map<number, CachedClientInfo<T>>();

  return {
    async get(userId: number, nowMs: number, load: () => Promise<T>): Promise<CachedClientInfo<T>> {
      const cached = byUser.get(userId);
      if (cached && nowMs - cached.fetchedAt < freshMs) return cached;
      try {
        const fresh = { data: await load(), fetchedAt: nowMs };
        byUser.set(userId, fresh);
        return fresh;
      } catch (e) {
        if (cached && e instanceof MonoError && e.status === 429) return cached;
        throw e;
      }
    },
    forget(userId: number) {
      byUser.delete(userId);
    },
  };
}

type CacheGlobal = typeof globalThis & { __clientInfoCache?: ReturnType<typeof createClientInfoCache<MonoClientInfo>> };
const g = globalThis as CacheGlobal;
export const clientInfoCache = (g.__clientInfoCache ??= createClientInfoCache<MonoClientInfo>());
