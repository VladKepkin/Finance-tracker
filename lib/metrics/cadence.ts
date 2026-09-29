export type Cadence = "weekly" | "monthly";

const DAY = 86_400;

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

function dayStart(unix: number): number {
  return Math.floor(unix / DAY) * DAY;
}

function monthlyOn(year: number, month0: number, anchorDay: number): number {
  const day = Math.min(anchorDay, daysInMonth(year, month0));
  return Date.UTC(year, month0, day) / 1000;
}

export function nextDue(cadence: Cadence, anchorDay: number, fromTime: number): number {
  const from = dayStart(fromTime);

  if (cadence === "weekly") {
    const wd = new Date(from * 1000).getUTCDay();
    const ahead = (anchorDay - wd + 7) % 7;
    return from + ahead * DAY;
  }

  const d = new Date(from * 1000);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const thisMonth = monthlyOn(y, m, anchorDay);
  if (thisMonth >= from) return thisMonth;
  return monthlyOn(y, m + 1, anchorDay);
}

export function occurrencesBetween(
  cadence: Cadence,
  anchorDay: number,
  fromTime: number,
  toTime: number
): number {
  const to = dayStart(toTime);
  let cursor = nextDue(cadence, anchorDay, fromTime);
  let count = 0;
  while (cursor <= to) {
    count++;
    cursor = nextDue(cadence, anchorDay, cursor + DAY);
  }
  return count;
}
