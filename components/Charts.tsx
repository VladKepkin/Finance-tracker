"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import type { CategorySpend, DailyPoint } from "@/lib/analytics";
import { formatMoney, formatMoneyShort } from "@/lib/format";

export function CategoryPie({ data, base }: { data: CategorySpend[]; base: number }) {
  if (data.length === 0) return <Empty text="Немає витрат за період" />;
  const chartData = data.slice(0, 8).map((c) => ({
    name: c.category.label,
    value: c.total,
    color: c.category.color,
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
        >
          {chartData.map((d, i) => (
            <Cell key={i} fill={d.color} stroke="transparent" />
          ))}
        </Pie>
        <Tooltip
          formatter={(v: number) => formatMoney(v, base)}
          contentStyle={tooltipStyle}
          itemStyle={{ color: "var(--foreground)" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function IncomeExpenseBars({ data, base }: { data: DailyPoint[]; base: number }) {
  if (data.length === 0) return <Empty text="Немає даних за період" />;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis tickFormatter={(v) => formatMoneyShort(v, base)} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} width={76} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(v: number, name) => [formatMoney(v, base), name === "income" ? "Дохід" : "Витрати"]}
          contentStyle={tooltipStyle}
          cursor={{ fill: "rgba(139,92,246,0.08)" }}
        />
        <Legend
          formatter={(v) => (v === "income" ? "Дохід" : "Витрати")}
          wrapperStyle={{ color: "var(--muted-foreground)", fontSize: 12 }}
        />
        <Bar dataKey="income" fill="var(--success)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="expense" fill="var(--destructive)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  color: "var(--foreground)",
};
