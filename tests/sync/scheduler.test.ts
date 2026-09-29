import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("scheduler", () => {
  it("startScheduler ідемпотентний", async () => {
    process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "money-test-")), "test.db");
    const { startScheduler, isSchedulerStarted } = await import("@/lib/sync/scheduler");

    expect(isSchedulerStarted()).toBe(false);
    startScheduler();
    expect(isSchedulerStarted()).toBe(true);
    startScheduler();
    expect(isSchedulerStarted()).toBe(true);
  });
});
