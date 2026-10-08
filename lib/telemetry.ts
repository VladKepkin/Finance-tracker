import { monitorEventLoopDelay, type IntervalHistogram } from "perf_hooks";

/**
 * RingBuffer maintains a fixed-capacity circular buffer of numbers (e.g. durations in ms)
 * to compute accurate percentiles without unbound memory growth.
 */
export class RingBuffer {
  private buffer: Float64Array;
  private pointer = 0;
  private size = 0;
  private capacity: number;

  constructor(capacity = 1000) {
    this.capacity = capacity;
    this.buffer = new Float64Array(capacity);
  }

  push(value: number): void {
    this.buffer[this.pointer] = value;
    this.pointer = (this.pointer + 1) % this.capacity;
    if (this.size < this.capacity) {
      this.size++;
    }
  }

  getValues(): number[] {
    const arr = new Array<number>(this.size);
    for (let i = 0; i < this.size; i++) {
      arr[i] = this.buffer[i];
    }
    return arr;
  }

  percentile(p: number): number {
    if (this.size === 0) return 0;
    const sorted = this.getValues().sort((a, b) => a - b);
    const index = Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1);
    return Math.round(sorted[index] * 100) / 100;
  }

  count(): number {
    return this.size;
  }

  reset(): void {
    this.pointer = 0;
    this.size = 0;
    this.buffer.fill(0);
  }
}

export interface RouteMetrics {
  method: string;
  route: string;
  totalRequests: number;
  inFlight: number;
  errors: number;
  statusCodes: Record<number, number>;
  durations: RingBuffer;
  minMs: number;
  maxMs: number;
  totalDurationMs: number;
}

export interface DbMetrics {
  totalQueries: number;
  slowQueries: number;
  durations: RingBuffer;
  maxMs: number;
  totalDurationMs: number;
}

export interface MonobankMetrics {
  totalCalls: number;
  errors: number;
  rateLimitHits: number;
  lastCallAt: number | null;
  lastCallStatus: number | null;
  durations: RingBuffer;
  totalDurationMs: number;
}

export interface TelemetryState {
  routes: Map<string, RouteMetrics>;
  db: DbMetrics;
  monobank: MonobankMetrics;
  eldHistogram: IntervalHistogram | null;
  totalInFlight: number;
  startTime: number;
}

type GlobalWithTelemetry = typeof globalThis & { __moneyTelemetry?: TelemetryState };
const g = globalThis as GlobalWithTelemetry;

function getState(): TelemetryState {
  if (!g.__moneyTelemetry) {
    g.__moneyTelemetry = {
      routes: new Map(),
      db: {
        totalQueries: 0,
        slowQueries: 0,
        durations: new RingBuffer(1000),
        maxMs: 0,
        totalDurationMs: 0,
      },
      monobank: {
        totalCalls: 0,
        errors: 0,
        rateLimitHits: 0,
        lastCallAt: null,
        lastCallStatus: null,
        durations: new RingBuffer(500),
        totalDurationMs: 0,
      },
      eldHistogram: null,
      totalInFlight: 0,
      startTime: Date.now(),
    };
  }
  return g.__moneyTelemetry;
}

/**
 * Initializes telemetry system (starts event loop delay monitor).
 */
export function initTelemetry(): void {
  const state = getState();
  if (!state.eldHistogram && typeof monitorEventLoopDelay === "function") {
    try {
      state.eldHistogram = monitorEventLoopDelay({ resolution: 20 });
      state.eldHistogram.enable();
    } catch {
      // Event loop delay not supported in current environment
    }
  }
}

/**
 * Clears/resets all recorded telemetry data.
 */
export function resetTelemetry(): void {
  const state = getState();
  state.routes.clear();
  state.db = {
    totalQueries: 0,
    slowQueries: 0,
    durations: new RingBuffer(1000),
    maxMs: 0,
    totalDurationMs: 0,
  };
  state.monobank = {
    totalCalls: 0,
    errors: 0,
    rateLimitHits: 0,
    lastCallAt: null,
    lastCallStatus: null,
    durations: new RingBuffer(500),
    totalDurationMs: 0,
  };
  state.totalInFlight = 0;
  state.startTime = Date.now();
  if (state.eldHistogram) {
    state.eldHistogram.reset();
  }
}

function getOrCreateRoute(method: string, route: string): RouteMetrics {
  const state = getState();
  const key = `${method.toUpperCase()} ${route}`;
  let m = state.routes.get(key);
  if (!m) {
    m = {
      method: method.toUpperCase(),
      route,
      totalRequests: 0,
      inFlight: 0,
      errors: 0,
      statusCodes: {},
      durations: new RingBuffer(1000),
      minMs: Number.POSITIVE_INFINITY,
      maxMs: 0,
      totalDurationMs: 0,
    };
    state.routes.set(key, m);
  }
  return m;
}

export function startHttpRequest(method: string, route: string): () => void {
  const state = getState();
  state.totalInFlight++;
  const m = getOrCreateRoute(method, route);
  m.inFlight++;

  return () => {
    state.totalInFlight = Math.max(0, state.totalInFlight - 1);
    m.inFlight = Math.max(0, m.inFlight - 1);
  };
}

export function recordHttpRequest(
  method: string,
  route: string,
  statusCode: number,
  durationMs: number
): void {
  const m = getOrCreateRoute(method, route);
  m.totalRequests++;
  m.statusCodes[statusCode] = (m.statusCodes[statusCode] || 0) + 1;
  if (statusCode >= 400) {
    m.errors++;
  }
  m.durations.push(durationMs);
  m.totalDurationMs += durationMs;
  if (durationMs < m.minMs) m.minMs = Math.round(durationMs * 100) / 100;
  if (durationMs > m.maxMs) m.maxMs = Math.round(durationMs * 100) / 100;
}

export function recordDbQuery(durationMs: number): void {
  const state = getState();
  state.db.totalQueries++;
  state.db.totalDurationMs += durationMs;
  state.db.durations.push(durationMs);
  if (durationMs > 50) {
    state.db.slowQueries++;
  }
  if (durationMs > state.db.maxMs) {
    state.db.maxMs = Math.round(durationMs * 100) / 100;
  }
}

export function recordMonobankCall(
  status: number,
  durationMs: number,
  isError: boolean
): void {
  const state = getState();
  state.monobank.totalCalls++;
  state.monobank.lastCallAt = Date.now();
  state.monobank.lastCallStatus = status;
  state.monobank.totalDurationMs += durationMs;
  state.monobank.durations.push(durationMs);
  if (status === 429) {
    state.monobank.rateLimitHits++;
  }
  if (isError || status >= 400) {
    state.monobank.errors++;
  }
}

/**
 * HOF wrapper for API Route Handlers to automatically record metrics.
 */
export function withTelemetry<T extends (req: Request, ...args: any[]) => Promise<Response>>(
  route: string,
  handler: T
): T {
  return (async (req: Request, ...args: any[]) => {
    const method = req.method || "GET";
    const doneInFlight = startHttpRequest(method, route);
    const start = performance.now();
    let status = 500;
    try {
      const response = await handler(req, ...args);
      status = response.status;
      return response;
    } catch (err) {
      status = 500;
      throw err;
    } finally {
      doneInFlight();
      const durationMs = performance.now() - start;
      recordHttpRequest(method, route, status, durationMs);
    }
  }) as T;
}

export interface TelemetrySnapshot {
  uptimeSeconds: number;
  timestamp: string;
  system: {
    memoryMb: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
      arrayBuffers: number;
    };
    eventLoopDelayMs: {
      mean: number;
      p50: number;
      p95: number;
      p99: number;
      max: number;
    };
  };
  http: {
    summary: {
      totalRequests: number;
      inFlight: number;
      totalErrors: number;
      errorRatePct: number;
    };
    routes: Record<
      string,
      {
        method: string;
        route: string;
        totalRequests: number;
        inFlight: number;
        errors: number;
        p50Ms: number;
        p95Ms: number;
        p99Ms: number;
        avgMs: number;
        minMs: number;
        maxMs: number;
        statusCodes: Record<number, number>;
      }
    >;
  };
  database: {
    totalQueries: number;
    slowQueries: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    avgMs: number;
    maxMs: number;
  };
  monobank: {
    totalCalls: number;
    errors: number;
    rateLimitHits: number;
    lastCallAt: string | null;
    lastCallStatus: number | null;
    p50Ms: number;
    p95Ms: number;
    avgMs: number;
  };
}

export function getTelemetrySnapshot(): TelemetrySnapshot {
  const state = getState();
  const mem = process.memoryUsage();
  const toMb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 100) / 100;

  // Event loop delay
  let eld = { mean: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  if (state.eldHistogram) {
    eld = {
      mean: Math.round((state.eldHistogram.mean / 1e6) * 100) / 100,
      p50: Math.round((state.eldHistogram.percentile(50) / 1e6) * 100) / 100,
      p95: Math.round((state.eldHistogram.percentile(95) / 1e6) * 100) / 100,
      p99: Math.round((state.eldHistogram.percentile(99) / 1e6) * 100) / 100,
      max: Math.round((state.eldHistogram.max / 1e6) * 100) / 100,
    };
  }

  // HTTP Routes
  let totalRequests = 0;
  let totalErrors = 0;
  const routesObj: TelemetrySnapshot["http"]["routes"] = {};

  for (const [key, m] of state.routes.entries()) {
    totalRequests += m.totalRequests;
    totalErrors += m.errors;
    const avgMs = m.totalRequests > 0 ? Math.round((m.totalDurationMs / m.totalRequests) * 100) / 100 : 0;
    routesObj[key] = {
      method: m.method,
      route: m.route,
      totalRequests: m.totalRequests,
      inFlight: m.inFlight,
      errors: m.errors,
      p50Ms: m.durations.percentile(50),
      p95Ms: m.durations.percentile(95),
      p99Ms: m.durations.percentile(99),
      avgMs,
      minMs: m.minMs === Number.POSITIVE_INFINITY ? 0 : m.minMs,
      maxMs: m.maxMs,
      statusCodes: { ...m.statusCodes },
    };
  }

  const errorRatePct = totalRequests > 0 ? Math.round((totalErrors / totalRequests) * 10000) / 100 : 0;

  // DB
  const dbAvgMs =
    state.db.totalQueries > 0
      ? Math.round((state.db.totalDurationMs / state.db.totalQueries) * 100) / 100
      : 0;

  // Monobank
  const monoAvgMs =
    state.monobank.totalCalls > 0
      ? Math.round((state.monobank.totalDurationMs / state.monobank.totalCalls) * 100) / 100
      : 0;

  return {
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    system: {
      memoryMb: {
        rss: toMb(mem.rss),
        heapTotal: toMb(mem.heapTotal),
        heapUsed: toMb(mem.heapUsed),
        external: toMb(mem.external),
        arrayBuffers: toMb(mem.arrayBuffers || 0),
      },
      eventLoopDelayMs: eld,
    },
    http: {
      summary: {
        totalRequests,
        inFlight: state.totalInFlight,
        totalErrors,
        errorRatePct,
      },
      routes: routesObj,
    },
    database: {
      totalQueries: state.db.totalQueries,
      slowQueries: state.db.slowQueries,
      p50Ms: state.db.durations.percentile(50),
      p95Ms: state.db.durations.percentile(95),
      p99Ms: state.db.durations.percentile(99),
      avgMs: dbAvgMs,
      maxMs: state.db.maxMs,
    },
    monobank: {
      totalCalls: state.monobank.totalCalls,
      errors: state.monobank.errors,
      rateLimitHits: state.monobank.rateLimitHits,
      lastCallAt: state.monobank.lastCallAt ? new Date(state.monobank.lastCallAt).toISOString() : null,
      lastCallStatus: state.monobank.lastCallStatus,
      p50Ms: state.monobank.durations.percentile(50),
      p95Ms: state.monobank.durations.percentile(95),
      avgMs: monoAvgMs,
    },
  };
}

/**
 * Generates OpenMetrics / Prometheus scrape text.
 */
export function getPrometheusMetrics(): string {
  const snapshot = getTelemetrySnapshot();
  const mem = process.memoryUsage();
  const lines: string[] = [];

  const add = (line: string) => lines.push(line);

  // Uptime
  add("# HELP process_uptime_seconds The process uptime in seconds.");
  add("# TYPE process_uptime_seconds gauge");
  add(`process_uptime_seconds ${snapshot.uptimeSeconds}`);

  // Memory
  add("# HELP process_resident_memory_bytes Resident memory size in bytes.");
  add("# TYPE process_resident_memory_bytes gauge");
  add(`process_resident_memory_bytes ${mem.rss}`);

  add("# HELP nodejs_heap_size_total_bytes Process heap total size in bytes.");
  add("# TYPE nodejs_heap_size_total_bytes gauge");
  add(`nodejs_heap_size_total_bytes ${mem.heapTotal}`);

  add("# HELP nodejs_heap_size_used_bytes Process heap used size in bytes.");
  add("# TYPE nodejs_heap_size_used_bytes gauge");
  add(`nodejs_heap_size_used_bytes ${mem.heapUsed}`);

  add("# HELP nodejs_external_memory_bytes Nodejs external memory in bytes.");
  add("# TYPE nodejs_external_memory_bytes gauge");
  add(`nodejs_external_memory_bytes ${mem.external}`);

  // Event Loop Delay
  add("# HELP nodejs_eventloop_lag_seconds Event loop lag in seconds.");
  add("# TYPE nodejs_eventloop_lag_seconds gauge");
  add(`nodejs_eventloop_lag_seconds{quantile="0.5"} ${snapshot.system.eventLoopDelayMs.p50 / 1000}`);
  add(`nodejs_eventloop_lag_seconds{quantile="0.95"} ${snapshot.system.eventLoopDelayMs.p95 / 1000}`);
  add(`nodejs_eventloop_lag_seconds{quantile="0.99"} ${snapshot.system.eventLoopDelayMs.p99 / 1000}`);
  add(`nodejs_eventloop_lag_max_seconds ${snapshot.system.eventLoopDelayMs.max / 1000}`);
  add(`nodejs_eventloop_lag_mean_seconds ${snapshot.system.eventLoopDelayMs.mean / 1000}`);

  // HTTP
  add("# HELP http_requests_in_flight Current number of HTTP requests being processed.");
  add("# TYPE http_requests_in_flight gauge");
  add(`http_requests_in_flight ${snapshot.http.summary.inFlight}`);

  add("# HELP http_requests_total Total number of HTTP requests completed.");
  add("# TYPE http_requests_total counter");
  for (const r of Object.values(snapshot.http.routes)) {
    for (const [code, count] of Object.entries(r.statusCodes)) {
      add(`http_requests_total{method="${r.method}",route="${r.route}",status="${code}"} ${count}`);
    }
  }

  add("# HELP http_request_duration_seconds HTTP request duration quantiles in seconds.");
  add("# TYPE http_request_duration_seconds gauge");
  for (const r of Object.values(snapshot.http.routes)) {
    add(`http_request_duration_seconds{method="${r.method}",route="${r.route}",quantile="0.5"} ${r.p50Ms / 1000}`);
    add(`http_request_duration_seconds{method="${r.method}",route="${r.route}",quantile="0.95"} ${r.p95Ms / 1000}`);
    add(`http_request_duration_seconds{method="${r.method}",route="${r.route}",quantile="0.99"} ${r.p99Ms / 1000}`);
  }

  // SQLite DB
  add("# HELP sqlite_queries_total Total SQLite database queries executed.");
  add("# TYPE sqlite_queries_total counter");
  add(`sqlite_queries_total ${snapshot.database.totalQueries}`);

  add("# HELP sqlite_slow_queries_total Queries taking longer than 50ms.");
  add("# TYPE sqlite_slow_queries_total counter");
  add(`sqlite_slow_queries_total ${snapshot.database.slowQueries}`);

  add("# HELP sqlite_query_duration_seconds Database query duration in seconds.");
  add("# TYPE sqlite_query_duration_seconds gauge");
  add(`sqlite_query_duration_seconds{quantile="0.5"} ${snapshot.database.p50Ms / 1000}`);
  add(`sqlite_query_duration_seconds{quantile="0.95"} ${snapshot.database.p95Ms / 1000}`);
  add(`sqlite_query_duration_seconds{quantile="0.99"} ${snapshot.database.p99Ms / 1000}`);

  // Monobank
  add("# HELP monobank_requests_total External Monobank API calls total.");
  add("# TYPE monobank_requests_total counter");
  add(`monobank_requests_total ${snapshot.monobank.totalCalls}`);

  add("# HELP monobank_errors_total External Monobank API failed calls.");
  add("# TYPE monobank_errors_total counter");
  add(`monobank_errors_total ${snapshot.monobank.errors}`);

  add("# HELP monobank_rate_limit_hits_total Monobank 429 Too Many Requests responses.");
  add("# TYPE monobank_rate_limit_hits_total counter");
  add(`monobank_rate_limit_hits_total ${snapshot.monobank.rateLimitHits}`);

  add("# HELP monobank_request_duration_seconds Monobank API latency in seconds.");
  add("# TYPE monobank_request_duration_seconds gauge");
  add(`monobank_request_duration_seconds{quantile="0.5"} ${snapshot.monobank.p50Ms / 1000}`);
  add(`monobank_request_duration_seconds{quantile="0.95"} ${snapshot.monobank.p95Ms / 1000}`);

  if (snapshot.monobank.lastCallAt) {
    add("# HELP monobank_last_call_timestamp_seconds Timestamp of last Monobank API call.");
    add("# TYPE monobank_last_call_timestamp_seconds gauge");
    add(`monobank_last_call_timestamp_seconds ${Math.floor(new Date(snapshot.monobank.lastCallAt).getTime() / 1000)}`);
  }

  add("");
  return lines.join("\n");
}
