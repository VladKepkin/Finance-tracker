export interface RateLimiter {
  schedule<T>(fn: () => Promise<T>): Promise<T>;
  penalize(): void;
  reset(): void;
}

export function createRateLimiter(opts: {
  minIntervalMs: number;
  maxIntervalMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): RateLimiter {
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  let interval = opts.minIntervalMs;
  let last = Number.NEGATIVE_INFINITY;
  let chain: Promise<unknown> = Promise.resolve();

  function schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const wait = last + interval - now();
      if (wait > 0) await sleep(wait);
      last = now();
      return fn();
    };
    const result = chain.then(run, run);
    chain = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  return {
    schedule,
    penalize() {
      interval = Math.min(opts.maxIntervalMs, interval * 2);
    },
    reset() {
      interval = opts.minIntervalMs;
    },
  };
}
