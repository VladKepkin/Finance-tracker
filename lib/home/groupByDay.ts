export interface DayGroup<T> {
  day: string;
  label: string;
  rows: T[];
}

function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function localDay(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function dayLabel(day: string, today: string): string {
  if (day === today) return "Сьогодні";
  if (day === shiftDay(today, -1)) return "Вчора";
  const d = new Date(`${day}T00:00:00Z`);
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return d.toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "long",
    year: sameYear ? undefined : "numeric",
    timeZone: "UTC",
  });
}

export function groupByDay<T extends { day: string }>(rows: readonly T[], today: string): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.day === row.day) last.rows.push(row);
    else groups.push({ day: row.day, label: dayLabel(row.day, today), rows: [row] });
  }
  return groups;
}
