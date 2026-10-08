import { describe, it, expect, beforeEach } from "vitest";
import {
  RingBuffer,
  initTelemetry,
  resetTelemetry,
  recordHttpRequest,
  recordDbQuery,
  recordMonobankCall,
  withTelemetry,
  getTelemetrySnapshot,
  getPrometheusMetrics,
} from "../lib/telemetry";

describe("telemetry engine", () => {
  beforeEach(() => {
    resetTelemetry();
  });

  describe("RingBuffer", () => {
    it("computes percentiles and rolls over capacity cleanly", () => {
      const rb = new RingBuffer(5);
      expect(rb.percentile(50)).toBe(0);
      expect(rb.count()).toBe(0);

      rb.push(10);
      rb.push(20);
      rb.push(30);
      rb.push(40);
      rb.push(50);
      expect(rb.count()).toBe(5);
      expect(rb.percentile(50)).toBe(30);

      // Overwrite oldest items
      rb.push(100);
      rb.push(200);
      expect(rb.count()).toBe(5);
      const vals = rb.getValues();
      expect(vals).toContain(100);
      expect(vals).toContain(200);
    });
  });

  describe("HTTP tracking", () => {
    it("tracks requests, in-flight, status codes, and latencies", () => {
      recordHttpRequest("GET", "/api/transactions", 200, 15.5);
      recordHttpRequest("GET", "/api/transactions", 200, 25.0);
      recordHttpRequest("GET", "/api/transactions", 400, 10.0);

      const snap = getTelemetrySnapshot();
      expect(snap.http.summary.totalRequests).toBe(3);
      expect(snap.http.summary.totalErrors).toBe(1);

      const route = snap.http.routes["GET /api/transactions"];
      expect(route).toBeDefined();
      expect(route.totalRequests).toBe(3);
      expect(route.statusCodes[200]).toBe(2);
      expect(route.statusCodes[400]).toBe(1);
      expect(route.p50Ms).toBeGreaterThan(0);
    });

    it("works with withTelemetry wrapper", async () => {
      const mockHandler = async (_req: Request) => {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      };

      const wrapped = withTelemetry("/api/test-route", mockHandler);
      const res = await wrapped(new Request("https://test.local/api/test-route"));
      expect(res.status).toBe(200);

      const snap = getTelemetrySnapshot();
      expect(snap.http.summary.totalRequests).toBe(1);
      expect(snap.http.routes["GET /api/test-route"].totalRequests).toBe(1);
    });
  });

  describe("Database metrics tracking", () => {
    it("records query counts, duration, and slow queries", () => {
      recordDbQuery(5);
      recordDbQuery(60); // slow query > 50ms

      const snap = getTelemetrySnapshot();
      expect(snap.database.totalQueries).toBe(2);
      expect(snap.database.slowQueries).toBe(1);
      expect(snap.database.maxMs).toBe(60);
    });
  });

  describe("Monobank metrics tracking", () => {
    it("records calls, rate limits, and errors", () => {
      recordMonobankCall(200, 120, false);
      recordMonobankCall(429, 50, true);

      const snap = getTelemetrySnapshot();
      expect(snap.monobank.totalCalls).toBe(2);
      expect(snap.monobank.rateLimitHits).toBe(1);
      expect(snap.monobank.errors).toBe(1);
      expect(snap.monobank.lastCallStatus).toBe(429);
      expect(snap.monobank.lastCallAt).not.toBeNull();
    });
  });

  describe("Prometheus export", () => {
    it("outputs valid OpenMetrics / Prometheus text lines", () => {
      initTelemetry();
      recordHttpRequest("GET", "/api/metrics", 200, 8.4);
      recordDbQuery(2.1);
      recordMonobankCall(200, 95.0, false);

      const output = getPrometheusMetrics();
      expect(output).toContain("# HELP process_uptime_seconds");
      expect(output).toContain("nodejs_heap_size_used_bytes");
      expect(output).toContain('http_requests_total{method="GET",route="/api/metrics",status="200"} 1');
      expect(output).toContain("sqlite_queries_total 1");
      expect(output).toContain("monobank_requests_total 1");
    });
  });
});
