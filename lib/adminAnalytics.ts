import type { DB } from "./db";
import { getTelemetrySnapshot, type TelemetrySnapshot } from "./telemetry";

export interface AdminAnalyticsPayload {
  usersOverview: {
    totalUsers: number;
    newUsersLast7d: number;
    newUsersLast30d: number;
    signupsByDay: { date: string; count: number }[];
    signupsByWeek: { weekStart: string; count: number }[];
  };
  activityAndRetention: {
    dau: number;
    wau: number;
    mau: number;
    stickinessPct: number;
    retention: {
      d1Pct: number;
      d7Pct: number;
      d30Pct: number;
    };
    churn: {
      activeUsersCount: number;
      atRiskUsersCount: number;
      churnedUsersCount: number;
      churnRatePct: number;
    };
    dailyActiveSeries: { date: string; activeUsers: number }[];
    cohortMatrix: {
      weekLabel: string;
      cohortSize: number;
      w0Pct: number;
      w1Pct: number;
      w2Pct: number;
      w3Pct: number;
      w4Pct: number;
    }[];
  };
  featureAdoption: {
    monobankConnectedCount: number;
    monobankConnectedPct: number;
    manualModeOrCashCount: number;
    manualModeOrCashPct: number;
    familyGroupsCount: number;
    usersInGroupsCount: number;
    usersInGroupsPct: number;
    commitmentsUsersCount: number;
    commitmentsUsersPct: number;
    totalActiveCommitments: number;
    wishlistOrGoalsUsersCount: number;
    wishlistOrGoalsUsersPct: number;
    ratingsUsersCount: number;
    ratingsUsersPct: number;
    totalRatingsCount: number;
    salariesUsersCount: number;
    salariesUsersPct: number;
  };
  systemHealth: {
    syncStatusBreakdown: {
      idle: number;
      running: number;
      error: number;
      totalAccounts: number;
      backfillDoneCount: number;
    };
    syncErrorCategories: { category: string; count: number }[];
    monobankApi: {
      totalCalls: number;
      errors: number;
      rateLimitHits: number;
      p50Ms: number;
      p95Ms: number;
      avgMs: number;
      lastCallStatus: number | null;
    };
    httpApi: {
      totalRequests: number;
      totalErrors: number;
      errorRatePct: number;
      inFlight: number;
      topRoutes: {
        route: string;
        method: string;
        requests: number;
        errors: number;
        p50Ms: number;
        p95Ms: number;
      }[];
    };
    database: {
      totalQueries: number;
      slowQueries: number;
      p50Ms: number;
      p95Ms: number;
      avgMs: number;
    };
    system: {
      uptimeSeconds: number;
      memoryMb: {
        rss: number;
        heapTotal: number;
        heapUsed: number;
      };
      eventLoopDelayMs?: {
        p50: number;
        p95: number;
        max: number;
      };
    };
  };
}

export interface AnalyticsRawData {
  users: { id: number; created_at: number; mono_token: string | null }[];
  activityDays: { user_id: number; day_date: string }[];
  ratingsCreatedAt: { user_id: number; created_at: number }[];
  commitmentsCreatedAt: { user_id: number; created_at: number }[];
  salariesCreatedAt: { user_id: number; created_at: number }[];
  kvItems: { user_id: number; key: string; value: string }[];
  groupsCount: number;
  groupMembersUserIds: number[];
  activeCommitments: { user_id: number; id: number }[];
  ratingsCount: number;
  salariesUserIds: number[];
  syncStates: { status: string; error: string | null; backfill_done: number }[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeToMs(ts: number): number {
  return ts < 1e11 ? ts * 1000 : ts;
}

export function toDayDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export function getMondayMidnight(ts: number): number {
  const d = new Date(ts);
  const day = d.getUTCDay(); // 0 is Sun, 1 is Mon...
  const diffDays = (day === 0 ? -6 : 1) - day;
  const mondayDateStr = new Date(d.getTime() + diffDays * DAY_MS).toISOString().slice(0, 10);
  return new Date(mondayDateStr + "T00:00:00.000Z").getTime();
}

function pct(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

function safeParseJson(raw: string): any {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function formatDayMonth(ts: number): string {
  const d = new Date(ts);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}.${month}`;
}

/**
 * Record a user activity day (SQLite)
 */
export function recordUserActivity(database: DB, userId: number, nowMs?: number): void {
  const now = nowMs ?? Date.now();
  const dayDate = toDayDate(now);
  database
    .prepare(
      `INSERT INTO user_activity_days (user_id, day_date, request_count, last_seen_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(user_id, day_date) DO UPDATE SET
         request_count = user_activity_days.request_count + 1,
         last_seen_at = excluded.last_seen_at`
    )
    .run(userId, dayDate, now);
}

/**
 * Pure aggregation function calculating AdminAnalyticsPayload from raw inputs.
 * Ensures 100% mathematical consistency across SQLite and PostgreSQL.
 */
export function computeAdminAnalytics(
  data: AnalyticsRawData,
  telemetry: TelemetrySnapshot,
  nowMs?: number
): AdminAnalyticsPayload {
  const now = nowMs ?? Date.now();
  const todayUtcMidnight = new Date(toDayDate(now) + "T00:00:00.000Z").getTime();

  // 1. Users overview
  const totalUsers = data.users.length;
  const newUsersLast7d = data.users.filter((u) => normalizeToMs(u.created_at) >= now - 7 * DAY_MS).length;
  const newUsersLast30d = data.users.filter((u) => normalizeToMs(u.created_at) >= now - 30 * DAY_MS).length;

  // Signups by Day (last 30 days)
  const last30Days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    last30Days.push(toDayDate(todayUtcMidnight - i * DAY_MS));
  }
  const signupCountByDay = new Map<string, number>();
  for (const u of data.users) {
    const d = toDayDate(normalizeToMs(u.created_at));
    signupCountByDay.set(d, (signupCountByDay.get(d) || 0) + 1);
  }
  const signupsByDay = last30Days.map((date) => ({
    date,
    count: signupCountByDay.get(date) || 0,
  }));

  // Signups by Week (last 12 weeks)
  const currentMonday = getMondayMidnight(now);
  const last12Weeks: { startTs: number; weekStart: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const startTs = currentMonday - i * 7 * DAY_MS;
    last12Weeks.push({ startTs, weekStart: toDayDate(startTs) });
  }
  const signupCountByWeek = new Map<number, number>();
  for (const u of data.users) {
    const m = getMondayMidnight(normalizeToMs(u.created_at));
    signupCountByWeek.set(m, (signupCountByWeek.get(m) || 0) + 1);
  }
  const signupsByWeek = last12Weeks.map(({ startTs, weekStart }) => ({
    weekStart,
    count: signupCountByWeek.get(startTs) || 0,
  }));

  // 2. Activity & Retention (Zero fake retention: user_activity_days + manual fallback)
  const userDaysMap = new Map<number, Set<string>>();
  for (const u of data.users) {
    const set = new Set<string>();
    // Signup day counts as activity
    set.add(toDayDate(normalizeToMs(u.created_at)));
    userDaysMap.set(u.id, set);
  }

  // user_activity_days table entries
  for (const act of data.activityDays) {
    let set = userDaysMap.get(act.user_id);
    if (!set) {
      set = new Set<string>();
      userDaysMap.set(act.user_id, set);
    }
    set.add(act.day_date);
  }

  // Fallback manual user actions (ratings, commitments, salaries)
  for (const r of data.ratingsCreatedAt) {
    userDaysMap.get(r.user_id)?.add(toDayDate(normalizeToMs(r.created_at)));
  }
  for (const c of data.commitmentsCreatedAt) {
    userDaysMap.get(c.user_id)?.add(toDayDate(normalizeToMs(c.created_at)));
  }
  for (const s of data.salariesCreatedAt) {
    userDaysMap.get(s.user_id)?.add(toDayDate(normalizeToMs(s.created_at)));
  }

  // Daily active series (last 30 days)
  const dailyActiveSeries = last30Days.map((date) => {
    let activeUsers = 0;
    for (const u of data.users) {
      if (userDaysMap.get(u.id)?.has(date)) {
        activeUsers++;
      }
    }
    return { date, activeUsers };
  });

  const dau = dailyActiveSeries[dailyActiveSeries.length - 1]?.activeUsers || 0;

  // WAU: active in last 7 calendar days
  const last7Dates = last30Days.slice(-7);
  let wau = 0;
  // MAU: active in last 30 calendar days
  let mau = 0;
  for (const u of data.users) {
    const set = userDaysMap.get(u.id);
    if (!set) continue;
    if (last7Dates.some((d) => set.has(d))) {
      wau++;
    }
    if (last30Days.some((d) => set.has(d))) {
      mau++;
    }
  }

  const stickinessPct = mau > 0 ? Math.round((dau / mau) * 1000) / 10 : 0;

  // Retention: D1, D7, D30
  // Eligible: registered at least N days ago
  // Retained: active on any day >= registration day + N days
  let eligibleD1 = 0;
  let retainedD1 = 0;
  let eligibleD7 = 0;
  let retainedD7 = 0;
  let eligibleD30 = 0;
  let retainedD30 = 0;

  for (const u of data.users) {
    const regDateStr = toDayDate(normalizeToMs(u.created_at));
    const regMidnight = new Date(regDateStr + "T00:00:00.000Z").getTime();
    const ageDays = Math.floor((todayUtcMidnight - regMidnight) / DAY_MS);

    const userDates = Array.from(userDaysMap.get(u.id) || []);
    const diffs = userDates.map((d) =>
      Math.floor((new Date(d + "T00:00:00.000Z").getTime() - regMidnight) / DAY_MS)
    );

    if (ageDays >= 1) {
      eligibleD1++;
      if (diffs.some((diff) => diff >= 1)) retainedD1++;
    }
    if (ageDays >= 7) {
      eligibleD7++;
      if (diffs.some((diff) => diff >= 7)) retainedD7++;
    }
    if (ageDays >= 30) {
      eligibleD30++;
      if (diffs.some((diff) => diff >= 30)) retainedD30++;
    }
  }

  const retention = {
    d1Pct: eligibleD1 > 0 ? Math.round((retainedD1 / eligibleD1) * 1000) / 10 : 0,
    d7Pct: eligibleD7 > 0 ? Math.round((retainedD7 / eligibleD7) * 1000) / 10 : 0,
    d30Pct: eligibleD30 > 0 ? Math.round((retainedD30 / eligibleD30) * 1000) / 10 : 0,
  };

  // Churn: active in last 14d, at risk (14-30d), churned (>30d)
  let activeUsersCount = 0;
  let atRiskUsersCount = 0;

  for (const u of data.users) {
    const set = userDaysMap.get(u.id);
    if (!set || set.size === 0) continue;

    let minDaysAgo = Number.POSITIVE_INFINITY;
    for (const d of set) {
      const dt = new Date(d + "T00:00:00.000Z").getTime();
      const daysAgo = Math.floor((todayUtcMidnight - dt) / DAY_MS);
      if (daysAgo < minDaysAgo) {
        minDaysAgo = daysAgo;
      }
    }

    if (minDaysAgo < 14) {
      activeUsersCount++;
    } else if (minDaysAgo < 30) {
      atRiskUsersCount++;
    }
  }

  const churnedUsersCount = Math.max(0, totalUsers - activeUsersCount - atRiskUsersCount);
  const churnRatePct = totalUsers > 0 ? Math.round((churnedUsersCount / totalUsers) * 1000) / 10 : 0;

  // Cohort Retention Matrix (last 8 weeks)
  const cohortMatrix: AdminAnalyticsPayload["activityAndRetention"]["cohortMatrix"] = [];
  for (let w = 7; w >= 0; w--) {
    const cohortMondayTs = currentMonday - w * 7 * DAY_MS;
    const cohortSundayTs = cohortMondayTs + 6 * DAY_MS;
    const weekLabel = `${formatDayMonth(cohortMondayTs)} – ${formatDayMonth(cohortSundayTs)}`;

    const cohortUsers = data.users.filter(
      (u) => getMondayMidnight(normalizeToMs(u.created_at)) === cohortMondayTs
    );
    const cohortSize = cohortUsers.length;

    if (cohortSize === 0) {
      cohortMatrix.push({
        weekLabel,
        cohortSize: 0,
        w0Pct: 100,
        w1Pct: 0,
        w2Pct: 0,
        w3Pct: 0,
        w4Pct: 0,
      });
      continue;
    }

    const calcWeekPct = (offsetWeeks: number): number => {
      const targetStart = cohortMondayTs + offsetWeeks * 7 * DAY_MS;
      const targetEnd = targetStart + 6 * DAY_MS;
      if (targetStart > todayUtcMidnight) return 0; // future week

      let activeCount = 0;
      for (const u of cohortUsers) {
        const set = userDaysMap.get(u.id);
        if (!set) continue;
        let activeInTarget = false;
        for (const d of set) {
          const dt = new Date(d + "T00:00:00.000Z").getTime();
          if (dt >= targetStart && dt <= targetEnd) {
            activeInTarget = true;
            break;
          }
        }
        if (activeInTarget) activeCount++;
      }
      return Math.round((activeCount / cohortSize) * 1000) / 10;
    };

    cohortMatrix.push({
      weekLabel,
      cohortSize,
      w0Pct: 100,
      w1Pct: calcWeekPct(1),
      w2Pct: calcWeekPct(2),
      w3Pct: calcWeekPct(3),
      w4Pct: calcWeekPct(4),
    });
  }

  // 3. Feature Adoption
  const monobankConnectedCount = data.users.filter((u) => Boolean(u.mono_token)).length;
  const monobankConnectedPct = pct(monobankConnectedCount, totalUsers);

  // Manual mode or Cash users
  const manualModeOrCashUserIds = new Set<number>();
  const wishlistOrGoalsUserIds = new Set<number>();

  for (const item of data.kvItems) {
    const parsed = safeParseJson(item.value);
    if (item.key === "manualMode" && parsed === true) {
      manualModeOrCashUserIds.add(item.user_id);
    }
    if (item.key === "cashAccounts") {
      if (Array.isArray(parsed) && parsed.length > 0) {
        manualModeOrCashUserIds.add(item.user_id);
      }
    }
    if (item.key === "wishlist") {
      if (Array.isArray(parsed) && parsed.length > 0) {
        wishlistOrGoalsUserIds.add(item.user_id);
      }
    }
    if (item.key === "budgets") {
      if (Array.isArray(parsed) && parsed.length > 0) {
        wishlistOrGoalsUserIds.add(item.user_id);
      } else if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
        wishlistOrGoalsUserIds.add(item.user_id);
      }
    }
    if (item.key === "savingsPlan") {
      if (
        parsed &&
        typeof parsed === "object" &&
        (parsed.emergencyMonths != null ||
          parsed.monthlyContribution != null ||
          parsed.spendablePct != null)
      ) {
        wishlistOrGoalsUserIds.add(item.user_id);
      }
    }
  }

  const manualModeOrCashCount = manualModeOrCashUserIds.size;
  const manualModeOrCashPct = pct(manualModeOrCashCount, totalUsers);

  const familyGroupsCount = data.groupsCount;
  const usersInGroupsCount = new Set(data.groupMembersUserIds).size;
  const usersInGroupsPct = pct(usersInGroupsCount, totalUsers);

  const commitmentsUsersCount = new Set(data.activeCommitments.map((c) => c.user_id)).size;
  const commitmentsUsersPct = pct(commitmentsUsersCount, totalUsers);
  const totalActiveCommitments = data.activeCommitments.length;

  const wishlistOrGoalsUsersCount = wishlistOrGoalsUserIds.size;
  const wishlistOrGoalsUsersPct = pct(wishlistOrGoalsUsersCount, totalUsers);

  const ratingsUsersCount = new Set(data.ratingsCreatedAt.map((r) => r.user_id)).size;
  const ratingsUsersPct = pct(ratingsUsersCount, totalUsers);
  const totalRatingsCount = data.ratingsCount;

  const salariesUsersCount = new Set(data.salariesUserIds).size;
  const salariesUsersPct = pct(salariesUsersCount, totalUsers);

  // 4. System Health
  const totalAccounts = data.syncStates.length;
  const idle = data.syncStates.filter((s) => s.status === "idle").length;
  const running = data.syncStates.filter((s) => s.status === "syncing" || s.status === "backfilling").length;
  const error = data.syncStates.filter((s) => s.status === "error").length;
  const backfillDoneCount = data.syncStates.filter((s) => s.backfill_done === 1).length;

  // Sync error categories
  const catCounts: Record<string, number> = {
    "Rate Limit (429)": 0,
    "Invalid/Expired Token": 0,
    "Network/Timeout": 0,
    Other: 0,
  };
  for (const s of data.syncStates) {
    if (s.status === "error" || (s.error && s.error.trim().length > 0)) {
      const err = (s.error || "").toLowerCase();
      if (err.includes("429") || err.includes("rate limit") || err.includes("too many requests")) {
        catCounts["Rate Limit (429)"]++;
      } else if (
        err.includes("403") ||
        err.includes("401") ||
        err.includes("token") ||
        err.includes("unauthorized") ||
        err.includes("forbidden")
      ) {
        catCounts["Invalid/Expired Token"]++;
      } else if (
        err.includes("timeout") ||
        err.includes("etimedout") ||
        err.includes("econnreset") ||
        err.includes("network") ||
        err.includes("fetch failed") ||
        err.includes("502") ||
        err.includes("503") ||
        err.includes("504")
      ) {
        catCounts["Network/Timeout"]++;
      } else {
        catCounts["Other"]++;
      }
    }
  }
  const syncErrorCategories = Object.entries(catCounts).map(([category, count]) => ({
    category,
    count,
  }));

  // Map HTTP routes
  const topRoutes = Object.values(telemetry.http.routes)
    .sort((a, b) => b.totalRequests - a.totalRequests)
    .slice(0, 10)
    .map((r) => ({
      route: r.route,
      method: r.method,
      requests: r.totalRequests,
      errors: r.errors,
      p50Ms: r.p50Ms,
      p95Ms: r.p95Ms,
    }));

  return {
    usersOverview: {
      totalUsers,
      newUsersLast7d,
      newUsersLast30d,
      signupsByDay,
      signupsByWeek,
    },
    activityAndRetention: {
      dau,
      wau,
      mau,
      stickinessPct,
      retention,
      churn: {
        activeUsersCount,
        atRiskUsersCount,
        churnedUsersCount,
        churnRatePct,
      },
      dailyActiveSeries,
      cohortMatrix,
    },
    featureAdoption: {
      monobankConnectedCount,
      monobankConnectedPct,
      manualModeOrCashCount,
      manualModeOrCashPct,
      familyGroupsCount,
      usersInGroupsCount,
      usersInGroupsPct,
      commitmentsUsersCount,
      commitmentsUsersPct,
      totalActiveCommitments,
      wishlistOrGoalsUsersCount,
      wishlistOrGoalsUsersPct,
      ratingsUsersCount,
      ratingsUsersPct,
      totalRatingsCount,
      salariesUsersCount,
      salariesUsersPct,
    },
    systemHealth: {
      syncStatusBreakdown: {
        idle,
        running,
        error,
        totalAccounts,
        backfillDoneCount,
      },
      syncErrorCategories,
      monobankApi: {
        totalCalls: telemetry.monobank.totalCalls,
        errors: telemetry.monobank.errors,
        rateLimitHits: telemetry.monobank.rateLimitHits,
        p50Ms: telemetry.monobank.p50Ms,
        p95Ms: telemetry.monobank.p95Ms,
        avgMs: telemetry.monobank.avgMs,
        lastCallStatus: telemetry.monobank.lastCallStatus,
      },
      httpApi: {
        totalRequests: telemetry.http.summary.totalRequests,
        totalErrors: telemetry.http.summary.totalErrors,
        errorRatePct: telemetry.http.summary.errorRatePct,
        inFlight: telemetry.http.summary.inFlight,
        topRoutes,
      },
      database: {
        totalQueries: telemetry.database.totalQueries,
        slowQueries: telemetry.database.slowQueries,
        p50Ms: telemetry.database.p50Ms,
        p95Ms: telemetry.database.p95Ms,
        avgMs: telemetry.database.avgMs,
      },
      system: {
        uptimeSeconds: telemetry.uptimeSeconds,
        memoryMb: {
          rss: telemetry.system.memoryMb.rss,
          heapTotal: telemetry.system.memoryMb.heapTotal,
          heapUsed: telemetry.system.memoryMb.heapUsed,
        },
        eventLoopDelayMs: telemetry.system.eventLoopDelayMs
          ? {
              p50: telemetry.system.eventLoopDelayMs.p50,
              p95: telemetry.system.eventLoopDelayMs.p95,
              max: telemetry.system.eventLoopDelayMs.max,
            }
          : undefined,
      },
    },
  };
}

/**
 * Build AdminAnalyticsPayload from SQLite database
 */
export function buildAdminAnalyticsPayload(
  database: DB,
  nowMs?: number
): AdminAnalyticsPayload {
  const users = database
    .prepare("SELECT id, created_at, mono_token FROM users")
    .all() as { id: number; created_at: number; mono_token: string | null }[];

  const activityDays = database
    .prepare("SELECT user_id, day_date FROM user_activity_days")
    .all() as { user_id: number; day_date: string }[];

  const ratingsCreatedAt = database
    .prepare("SELECT user_id, created_at FROM ratings")
    .all() as { user_id: number; created_at: number }[];

  const commitmentsCreatedAt = database
    .prepare("SELECT user_id, created_at FROM commitments")
    .all() as { user_id: number; created_at: number }[];

  const salariesCreatedAt = database
    .prepare("SELECT user_id, created_at FROM salaries")
    .all() as { user_id: number; created_at: number }[];

  const kvItems = database
    .prepare(
      "SELECT user_id, key, value FROM kv WHERE key IN ('cashAccounts', 'manualMode', 'wishlist', 'savingsPlan', 'budgets')"
    )
    .all() as { user_id: number; key: string; value: string }[];

  const groupsCountRow = database
    .prepare("SELECT COUNT(*) as count FROM groups")
    .get() as { count: number } | undefined;
  const groupsCount = groupsCountRow ? groupsCountRow.count : 0;

  const groupMembersUserIds = (
    database.prepare("SELECT DISTINCT user_id FROM group_members").all() as { user_id: number }[]
  ).map((r) => r.user_id);

  const activeCommitments = database
    .prepare("SELECT user_id, id FROM commitments WHERE active = 1")
    .all() as { user_id: number; id: number }[];

  const ratingsCountRow = database
    .prepare("SELECT COUNT(*) as count FROM ratings")
    .get() as { count: number } | undefined;
  const ratingsCount = ratingsCountRow ? ratingsCountRow.count : 0;

  const salariesUserIds = (
    database.prepare("SELECT DISTINCT user_id FROM salaries").all() as { user_id: number }[]
  ).map((r) => r.user_id);

  const syncStates = database
    .prepare("SELECT status, error, backfill_done FROM sync_state")
    .all() as { status: string; error: string | null; backfill_done: number }[];

  const rawData: AnalyticsRawData = {
    users,
    activityDays,
    ratingsCreatedAt,
    commitmentsCreatedAt,
    salariesCreatedAt,
    kvItems,
    groupsCount,
    groupMembersUserIds,
    activeCommitments,
    ratingsCount,
    salariesUserIds,
    syncStates,
  };

  return computeAdminAnalytics(rawData, getTelemetrySnapshot(), nowMs);
}
