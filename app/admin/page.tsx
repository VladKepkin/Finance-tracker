"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Users,
  Activity,
  TrendingUp,
  UserX,
  ShieldCheck,
  RefreshCw,
  ArrowLeft,
  Server,
  Database,
  Cpu,
  Layers,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Clock,
  Radio,
  Flame,
  PieChart as PieIcon,
  BarChart3,
  Sparkles,
  Zap,
  Lock,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { AdminAnalyticsPayload } from "@/lib/adminAnalytics";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export default function AdminAnalyticsDashboard() {
  const [data, setData] = useState<AdminAnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [chartView, setChartView] = useState<"dau" | "signupsDay" | "signupsWeek">("dau");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/analytics");
      if (res.status === 401) {
        setUnauthorized(true);
        return;
      }
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok) {
        throw new Error(`Помилка сервера: ${res.status}`);
      }
      const json: AdminAnalyticsPayload = await res.json();
      setData(json);
    } catch (err) {
      setError((err as Error).message || "Не вдалося завантажити аналітику");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    loadData();
  }, [loadData]);

  if (unauthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="max-w-md w-full text-center p-6 space-y-4">
          <div className="mx-auto size-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center">
            <Lock className="size-6" />
          </div>
          <h1 className="text-xl font-bold">Необхідна авторизація</h1>
          <p className="text-sm text-muted-foreground">
            Будь ласка, увійдіть у свій обліковий запис, щоб отримати доступ до адмін-панелі.
          </p>
          <div className="pt-2">
            <Link href="/login">
              <Button className="w-full">Увійти</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="max-w-md w-full text-center p-6 space-y-4">
          <div className="mx-auto size-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center">
            <AlertOctagon className="size-6" />
          </div>
          <h1 className="text-xl font-bold">Доступ заборонено</h1>
          <p className="text-sm text-muted-foreground">
            Цей розділ доступний виключно адміністраторам системи.
          </p>
          <div className="pt-2">
            <Link href="/">
              <Button variant="secondary" className="w-full">
                Повернутися до трекера
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const tooltipStyle = {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    color: "var(--foreground)",
    fontSize: "12px",
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}д ${hours}год ${mins}хв`;
    if (hours > 0) return `${hours}год ${mins}хв`;
    return `${mins} хв`;
  };

  const getHeatmapClass = (pct: number, cohortSize: number) => {
    if (cohortSize === 0) return "bg-muted/20 text-muted-foreground/30";
    if (pct === 0) return "bg-muted/40 text-muted-foreground";
    if (pct < 20) return "bg-violet-500/15 text-violet-700 dark:text-violet-300 font-medium";
    if (pct < 40) return "bg-violet-500/30 text-violet-800 dark:text-violet-200 font-semibold";
    if (pct < 70) return "bg-violet-600/60 text-white font-semibold";
    return "bg-violet-600 text-white font-bold";
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-16">
      {/* Top Header */}
      <header className="border-b border-border/80 bg-card/60 backdrop-blur sticky top-0 z-30 px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeft className="size-3.5" />
                <span>Трекер</span>
              </Button>
            </Link>
            <div className="h-4 w-px bg-border hidden sm:block" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight">
                  Дашборд продуктової та системної аналітики
                </h1>
                <Badge variant="secondary" className="gap-1 text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <ShieldCheck className="size-3 text-emerald-500" />
                  Zero-PII
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Агреговані метрові дані без імен, балансів, описів чи фінансових подробиць
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={loading}
              className="h-8 text-xs gap-1.5"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Оновити</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 pt-6 space-y-6">
        {error && (
          <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Section 1: KPI Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Users */}
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium uppercase tracking-wider">Усього користувачів</span>
              <div className="p-2 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
                <Users className="size-4" />
              </div>
            </div>
            <div>
              <div className="text-3xl font-extrabold tracking-tight">
                {data ? data.usersOverview.totalUsers : "—"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {data ? (
                  <>
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      +{data.usersOverview.newUsersLast7d}
                    </span>{" "}
                    за 7д •{" "}
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      +{data.usersOverview.newUsersLast30d}
                    </span>{" "}
                    за 30д
                  </>
                ) : (
                  "Завантаження..."
                )}
              </p>
            </div>
          </Card>

          {/* Card 2: Activity (DAU / WAU / MAU) */}
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium uppercase tracking-wider">Активність (DAU)</span>
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Activity className="size-4" />
              </div>
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tracking-tight">
                  {data ? data.activityAndRetention.dau : "—"}
                </span>
                {data && (
                  <Badge variant="outline" className="text-[11px] font-medium border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    Stickiness {data.activityAndRetention.stickinessPct}%
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {data ? (
                  <>
                    WAU: <span className="font-semibold text-foreground">{data.activityAndRetention.wau}</span> •{" "}
                    MAU: <span className="font-semibold text-foreground">{data.activityAndRetention.mau}</span>
                  </>
                ) : (
                  "Завантаження..."
                )}
              </p>
            </div>
          </Card>

          {/* Card 3: Retention */}
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium uppercase tracking-wider">Утримання (D1 / D7 / D30)</span>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="size-4" />
              </div>
            </div>
            <div>
              <div className="text-3xl font-extrabold tracking-tight">
                {data ? `${data.activityAndRetention.retention.d1Pct}%` : "—"}
                <span className="text-xs font-normal text-muted-foreground ml-1">D1</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {data ? (
                  <>
                    D7: <span className="font-semibold text-foreground">{data.activityAndRetention.retention.d7Pct}%</span> •{" "}
                    D30: <span className="font-semibold text-foreground">{data.activityAndRetention.retention.d30Pct}%</span>
                  </>
                ) : (
                  "Завантаження..."
                )}
              </p>
            </div>
          </Card>

          {/* Card 4: Churn */}
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium uppercase tracking-wider">Відтік (Churn Rate)</span>
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <UserX className="size-4" />
              </div>
            </div>
            <div>
              <div className="text-3xl font-extrabold tracking-tight">
                {data ? `${data.activityAndRetention.churn.churnRatePct}%` : "—"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {data ? (
                  <>
                    Активні: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{data.activityAndRetention.churn.activeUsersCount}</span> •{" "}
                    Ризик: <span className="font-semibold text-amber-600 dark:text-amber-400">{data.activityAndRetention.churn.atRiskUsersCount}</span> •{" "}
                    Відтік: <span className="font-semibold text-destructive">{data.activityAndRetention.churn.churnedUsersCount}</span>
                  </>
                ) : (
                  "Завантаження..."
                )}
              </p>
            </div>
          </Card>
        </section>

        {/* Section 2: Charts & Feature Adoption */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Chart (2 cols) */}
          <Card className="lg:col-span-2 p-5 flex flex-col justify-between">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <CardTitle className="text-base font-bold">Динаміка залученості та реєстрацій</CardTitle>
                  <CardDescription className="text-xs">
                    {chartView === "dau" && "Щоденна кількість активних користувачів (останні 30 днів)"}
                    {chartView === "signupsDay" && "Нові реєстрації по днях (останні 30 днів)"}
                    {chartView === "signupsWeek" && "Нові реєстрації по тижнях (останні 12 тижнів)"}
                  </CardDescription>
                </div>
                <div className="flex items-center rounded-lg bg-muted p-0.5 border border-border text-xs">
                  <button
                    onClick={() => setChartView("dau")}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      chartView === "dau" ? "bg-card text-foreground font-semibold shadow-xs" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    DAU (30д)
                  </button>
                  <button
                    onClick={() => setChartView("signupsDay")}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      chartView === "signupsDay" ? "bg-card text-foreground font-semibold shadow-xs" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Реєстрації/день
                  </button>
                  <button
                    onClick={() => setChartView("signupsWeek")}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      chartView === "signupsWeek" ? "bg-card text-foreground font-semibold shadow-xs" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Реєстрації/тиждень
                  </button>
                </div>
              </div>

              {mounted && data && (
                <div className="h-[260px] w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    {chartView === "dau" ? (
                      <AreaChart
                        data={data.activityAndRetention.dailyActiveSeries.map((d) => ({
                          date: d.date.slice(5),
                          activeUsers: d.activeUsers,
                        }))}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="dauGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="date" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(val: number) => [`${val} користувачів`, "Активні"]} />
                        <Area
                          type="monotone"
                          dataKey="activeUsers"
                          stroke="#8b5cf6"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#dauGradient)"
                        />
                      </AreaChart>
                    ) : chartView === "signupsDay" ? (
                      <BarChart
                        data={data.usersOverview.signupsByDay.map((d) => ({
                          date: d.date.slice(5),
                          count: d.count,
                        }))}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="date" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(val: number) => [`${val} нових`, "Реєстрацій"]} />
                        <Bar dataKey="count" fill="#16a34a" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    ) : (
                      <BarChart
                        data={data.usersOverview.signupsByWeek.map((w) => ({
                          week: w.weekStart.slice(5),
                          count: w.count,
                        }))}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="week" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(val: number) => [`${val} нових`, "Реєстрацій"]} />
                        <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>Відстеження активності ведеться виключно за запитами користувача</span>
              <span className="font-medium text-foreground">
                Всього за 30д: {data?.usersOverview.newUsersLast30d || 0} реєстрацій
              </span>
            </div>
          </Card>

          {/* Feature Adoption (1 col) */}
          <Card className="p-5 flex flex-col justify-between space-y-4">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Sparkles className="size-4 text-violet-500" />
                Використання фіч (Adoption)
              </CardTitle>
              <CardDescription className="text-xs">
                Відсоток та кількість користувачів, які підключили ключові функції
              </CardDescription>
            </div>

            {data && (
              <div className="space-y-3.5 text-xs">
                {/* Monobank */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Monobank Token</span>
                    <span className="text-muted-foreground">
                      <strong className="text-foreground">{data.featureAdoption.monobankConnectedCount}</strong> (
                      {data.featureAdoption.monobankConnectedPct}%)
                    </span>
                  </div>
                  <Progress value={data.featureAdoption.monobankConnectedPct} className="h-2" />
                </div>

                {/* Manual mode or Cash */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Ручний режим / Готівка</span>
                    <span className="text-muted-foreground">
                      <strong className="text-foreground">{data.featureAdoption.manualModeOrCashCount}</strong> (
                      {data.featureAdoption.manualModeOrCashPct}%)
                    </span>
                  </div>
                  <Progress value={data.featureAdoption.manualModeOrCashPct} className="h-2" />
                </div>

                {/* Family Groups */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Сімейні групи</span>
                    <span className="text-muted-foreground">
                      <strong className="text-foreground">{data.featureAdoption.usersInGroupsCount}</strong> (
                      {data.featureAdoption.usersInGroupsPct}%) • {data.featureAdoption.familyGroupsCount} груп
                    </span>
                  </div>
                  <Progress value={data.featureAdoption.usersInGroupsPct} className="h-2" />
                </div>

                {/* Commitments */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Регулярні платежі</span>
                    <span className="text-muted-foreground">
                      <strong className="text-foreground">{data.featureAdoption.commitmentsUsersCount}</strong> (
                      {data.featureAdoption.commitmentsUsersPct}%) • {data.featureAdoption.totalActiveCommitments} правил
                    </span>
                  </div>
                  <Progress value={data.featureAdoption.commitmentsUsersPct} className="h-2" />
                </div>

                {/* Goals & Wishlist */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Цілі, мрії та бюджети</span>
                    <span className="text-muted-foreground">
                      <strong className="text-foreground">{data.featureAdoption.wishlistOrGoalsUsersCount}</strong> (
                      {data.featureAdoption.wishlistOrGoalsUsersPct}%)
                    </span>
                  </div>
                  <Progress value={data.featureAdoption.wishlistOrGoalsUsersPct} className="h-2" />
                </div>

                {/* Ratings (Joy) */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Оцінки покупок (Радість)</span>
                    <span className="text-muted-foreground">
                      <strong className="text-foreground">{data.featureAdoption.ratingsUsersCount}</strong> (
                      {data.featureAdoption.ratingsUsersPct}%) • {data.featureAdoption.totalRatingsCount} оцінок
                    </span>
                  </div>
                  <Progress value={data.featureAdoption.ratingsUsersPct} className="h-2" />
                </div>

                {/* Salaries */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Облік зарплат</span>
                    <span className="text-muted-foreground">
                      <strong className="text-foreground">{data.featureAdoption.salariesUsersCount}</strong> (
                      {data.featureAdoption.salariesUsersPct}%)
                    </span>
                  </div>
                  <Progress value={data.featureAdoption.salariesUsersPct} className="h-2" />
                </div>
              </div>
            )}
          </Card>
        </section>

        {/* Section 3: Cohort Retention Matrix */}
        <section>
          <Card className="p-5 space-y-4">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Layers className="size-4 text-violet-500" />
                Когортна матриця утримання (Weekly Cohorts)
              </CardTitle>
              <CardDescription className="text-xs">
                Відсоток активних користувачів по тижнях після реєстрації (без урахування фонового синку Monobank)
              </CardDescription>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-border/80 text-muted-foreground">
                    <th className="py-2.5 px-3 font-semibold">Когорта (Тиждень)</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Розмір</th>
                    <th className="py-2.5 px-3 font-semibold text-center">W0 (Реєстрація)</th>
                    <th className="py-2.5 px-3 font-semibold text-center">W1 (+1 тиждень)</th>
                    <th className="py-2.5 px-3 font-semibold text-center">W2 (+2 тижні)</th>
                    <th className="py-2.5 px-3 font-semibold text-center">W3 (+3 тижні)</th>
                    <th className="py-2.5 px-3 font-semibold text-center">W4 (+4 тижні)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {data?.activityAndRetention.cohortMatrix.map((cohort, idx) => (
                    <tr key={idx} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-3 font-medium whitespace-nowrap text-foreground">
                        {cohort.weekLabel}
                      </td>
                      <td className="py-2 px-3 text-center font-bold text-foreground">
                        {cohort.cohortSize}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span
                          className={`inline-block w-16 py-1 rounded text-center ${getHeatmapClass(
                            cohort.w0Pct,
                            cohort.cohortSize
                          )}`}
                        >
                          {cohort.cohortSize > 0 ? `${cohort.w0Pct}%` : "—"}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span
                          className={`inline-block w-16 py-1 rounded text-center ${getHeatmapClass(
                            cohort.w1Pct,
                            cohort.cohortSize
                          )}`}
                        >
                          {cohort.cohortSize > 0 ? `${cohort.w1Pct}%` : "—"}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span
                          className={`inline-block w-16 py-1 rounded text-center ${getHeatmapClass(
                            cohort.w2Pct,
                            cohort.cohortSize
                          )}`}
                        >
                          {cohort.cohortSize > 0 ? `${cohort.w2Pct}%` : "—"}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span
                          className={`inline-block w-16 py-1 rounded text-center ${getHeatmapClass(
                            cohort.w3Pct,
                            cohort.cohortSize
                          )}`}
                        >
                          {cohort.cohortSize > 0 ? `${cohort.w3Pct}%` : "—"}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span
                          className={`inline-block w-16 py-1 rounded text-center ${getHeatmapClass(
                            cohort.w4Pct,
                            cohort.cohortSize
                          )}`}
                        >
                          {cohort.cohortSize > 0 ? `${cohort.w4Pct}%` : "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </section>

        {/* Section 4: System Health & Monobank */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Server className="size-5 text-primary" />
            <h2 className="text-base font-bold">Технічний стан та телеметрія</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Monobank Sync Card */}
            <Card className="p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
                <span>Синхронізація рахунків</span>
                <Radio className="size-4 text-violet-500" />
              </div>
              {data && (
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Усього акаунтів:</span>
                    <span className="font-bold">{data.systemHealth.syncStatusBreakdown.totalAccounts}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Очікують (Idle):</span>
                    <span className="font-semibold text-foreground">{data.systemHealth.syncStatusBreakdown.idle}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">В процесі (Running):</span>
                    <span className="font-semibold text-blue-500">{data.systemHealth.syncStatusBreakdown.running}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Помилки (Error):</span>
                    <span className={`font-semibold ${data.systemHealth.syncStatusBreakdown.error > 0 ? "text-destructive" : "text-emerald-500"}`}>
                      {data.systemHealth.syncStatusBreakdown.error}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1">
                    <span className="text-muted-foreground">Завершено Backfill:</span>
                    <span className="font-semibold text-foreground">{data.systemHealth.syncStatusBreakdown.backfillDoneCount}</span>
                  </div>
                </div>
              )}
            </Card>

            {/* Monobank API Card */}
            <Card className="p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
                <span>Monobank API</span>
                <Zap className="size-4 text-amber-500" />
              </div>
              {data && (
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Викликів:</span>
                    <span className="font-bold">{data.systemHealth.monobankApi.totalCalls}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Помилок:</span>
                    <span className={`font-semibold ${data.systemHealth.monobankApi.errors > 0 ? "text-destructive" : "text-emerald-500"}`}>
                      {data.systemHealth.monobankApi.errors}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ліміти 429:</span>
                    <span className={`font-semibold ${data.systemHealth.monobankApi.rateLimitHits > 0 ? "text-amber-500" : "text-foreground"}`}>
                      {data.systemHealth.monobankApi.rateLimitHits}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Затримка p50 / p95:</span>
                    <span className="font-semibold text-foreground">
                      {data.systemHealth.monobankApi.p50Ms} / {data.systemHealth.monobankApi.p95Ms} мс
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1">
                    <span className="text-muted-foreground">Останній статус:</span>
                    <span className="font-semibold">{data.systemHealth.monobankApi.lastCallStatus || "—"}</span>
                  </div>
                </div>
              )}
            </Card>

            {/* Database Card */}
            <Card className="p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
                <span>База даних</span>
                <Database className="size-4 text-emerald-500" />
              </div>
              {data && (
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Усього запитів:</span>
                    <span className="font-bold">{data.systemHealth.database.totalQueries}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Повільних (&gt;50мс):</span>
                    <span className={`font-semibold ${data.systemHealth.database.slowQueries > 0 ? "text-amber-500" : "text-emerald-500"}`}>
                      {data.systemHealth.database.slowQueries}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Затримка p50:</span>
                    <span className="font-semibold text-foreground">{data.systemHealth.database.p50Ms} мс</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Затримка p95:</span>
                    <span className="font-semibold text-foreground">{data.systemHealth.database.p95Ms} мс</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1">
                    <span className="text-muted-foreground">Середня:</span>
                    <span className="font-semibold text-foreground">{data.systemHealth.database.avgMs} мс</span>
                  </div>
                </div>
              )}
            </Card>

            {/* Node.js System Card */}
            <Card className="p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
                <span>Node.js Сервер</span>
                <Cpu className="size-4 text-blue-500" />
              </div>
              {data && (
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Аптайм:</span>
                    <span className="font-bold">{formatUptime(data.systemHealth.system.uptimeSeconds)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Пам&apos;ять RSS:</span>
                    <span className="font-semibold text-foreground">{data.systemHealth.system.memoryMb.rss} МБ</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Heap Used:</span>
                    <span className="font-semibold text-foreground">
                      {data.systemHealth.system.memoryMb.heapUsed} / {data.systemHealth.system.memoryMb.heapTotal} МБ
                    </span>
                  </div>
                  {data.systemHealth.system.eventLoopDelayMs && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Event Loop p95:</span>
                      <span className="font-semibold text-foreground">
                        {data.systemHealth.system.eventLoopDelayMs.p95} мс
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-border pt-1">
                    <span className="text-muted-foreground">API Error Rate:</span>
                    <span className={`font-semibold ${data.systemHealth.httpApi.errorRatePct > 1 ? "text-amber-500" : "text-emerald-500"}`}>
                      {data.systemHealth.httpApi.errorRatePct}%
                    </span>
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Sync Errors Categories & Top HTTP Routes */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Sync Error Categories */}
            <Card className="p-4 space-y-3">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Категорії помилок синхронізації
              </CardTitle>
              {data && (
                <div className="space-y-2 text-xs">
                  {data.systemHealth.syncErrorCategories.map((cat, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/40 border border-border">
                      <span className="font-medium">{cat.category}</span>
                      <Badge variant={cat.count > 0 ? "destructive" : "secondary"} className="text-[11px]">
                        {cat.count}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Top HTTP Routes */}
            <Card className="lg:col-span-2 p-4 space-y-3">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Топ API роутів за навантаженням
              </CardTitle>
              {data && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-border/80 text-muted-foreground">
                        <th className="py-1.5 px-2">Метод</th>
                        <th className="py-1.5 px-2">Роут</th>
                        <th className="py-1.5 px-2 text-right">Запитів</th>
                        <th className="py-1.5 px-2 text-right">Помилок</th>
                        <th className="py-1.5 px-2 text-right">p50</th>
                        <th className="py-1.5 px-2 text-right">p95</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {data.systemHealth.httpApi.topRoutes.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-4 text-center text-muted-foreground">
                            Немає зареєстрованих запитів після рестарту сервера
                          </td>
                        </tr>
                      ) : (
                        data.systemHealth.httpApi.topRoutes.map((r, i) => (
                          <tr key={i} className="hover:bg-muted/30">
                            <td className="py-1.5 px-2">
                              <Badge variant="outline" className="text-[10px] uppercase font-mono px-1.5 py-0">
                                {r.method}
                              </Badge>
                            </td>
                            <td className="py-1.5 px-2 font-mono text-[11px] text-foreground font-medium">
                              {r.route}
                            </td>
                            <td className="py-1.5 px-2 text-right font-semibold">{r.requests}</td>
                            <td className="py-1.5 px-2 text-right">
                              <span className={r.errors > 0 ? "text-destructive font-semibold" : "text-muted-foreground"}>
                                {r.errors}
                              </span>
                            </td>
                            <td className="py-1.5 px-2 text-right text-muted-foreground">{r.p50Ms} мс</td>
                            <td className="py-1.5 px-2 text-right text-muted-foreground">{r.p95Ms} мс</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}
