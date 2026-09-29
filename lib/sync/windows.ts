export const DAY = 86_400;

export interface TimeWindow {
  from: number;
  to: number;
}

export function backwardWindows(from: number, to: number, maxDays: number): TimeWindow[] {
  if (to < from) return [];
  const span = maxDays * DAY;
  const out: TimeWindow[] = [];
  let cursor = to;
  while (cursor >= from) {
    const start = Math.max(from, cursor - span + 1);
    out.push({ from: start, to: cursor });
    if (start === from) break;
    cursor = start - 1;
  }
  return out;
}
