export interface CurrencyRate {
  currencyCodeA: number;
  currencyCodeB: number;
  date: number;
  rateSell?: number;
  rateBuy?: number;
  rateCross?: number;
}

function directRate(rates: readonly CurrencyRate[], a: number, b: number): number | null {
  const r = rates.find((x) => x.currencyCodeA === a && x.currencyCodeB === b);
  if (!r) return null;
  if (r.rateCross && r.rateCross > 0) return r.rateCross;
  if (r.rateBuy && r.rateSell) return (r.rateBuy + r.rateSell) / 2;
  return r.rateSell ?? r.rateBuy ?? null;
}

export function rateBetween(
  rates: readonly CurrencyRate[],
  from: number,
  to: number
): number | null {
  if (from === to) return 1;
  const dir = directRate(rates, from, to);
  if (dir) return dir;
  const inv = directRate(rates, to, from);
  if (inv && inv > 0) return 1 / inv;
  return null;
}

export function convertMinor(
  minor: number,
  from: number,
  to: number,
  rates: readonly CurrencyRate[]
): number | null {
  if (from === to) return minor;
  const rate = rateBetween(rates, from, to);
  if (rate === null) return null;
  return Math.round(minor * rate);
}
