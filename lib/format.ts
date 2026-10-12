import { currencyMeta } from "./monobank";

const ukMoneyFormatter = new Intl.NumberFormat("uk-UA", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const ukWholeFormatter = new Intl.NumberFormat("uk-UA", {
  maximumFractionDigits: 0,
});

const ukShort1 = new Intl.NumberFormat("uk-UA", {
  maximumFractionDigits: 1,
});

const ukShort0 = new Intl.NumberFormat("uk-UA", {
  maximumFractionDigits: 0,
});

const ukDateFormatter = new Intl.DateTimeFormat("uk-UA", {
  day: "2-digit",
  month: "short",
});

const ukDateTimeFormatter = new Intl.DateTimeFormat("uk-UA", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatMoney(minor: number, currencyCode = 980): string {
  const { symbol, code } = currencyMeta(currencyCode);
  const value = minor / 100;
  const formatted = ukMoneyFormatter.format(value);
  return symbol ? `${formatted} ${symbol}` : `${formatted} ${code}`;
}

export function formatMoneyShort(minor: number, currencyCode = 980): string {
  const { symbol } = currencyMeta(currencyCode);
  const value = Math.abs(minor) / 100;
  let out: string;
  if (value >= 1_000_000) out = `${ukShort1.format(value / 1_000_000)} млн`;
  else if (value >= 1_000) out = `${ukShort1.format(value / 1_000)} тис`;
  else out = ukShort0.format(value);
  return `${out} ${symbol}`;
}

export function formatDate(unixSeconds: number): string {
  return ukDateFormatter.format(new Date(unixSeconds * 1000));
}

export function formatDateTime(unixSeconds: number): string {
  return ukDateTimeFormatter.format(new Date(unixSeconds * 1000));
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? "" : ""}${value.toFixed(0)}%`;
}

export function pluralUk(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function moneyParts(
  minor: number,
  currencyCode = 980
): { negative: boolean; whole: string; fraction: string; symbol: string } {
  const { symbol, code } = currencyMeta(currencyCode);
  const abs = Math.abs(minor);
  const whole = ukWholeFormatter.format(Math.floor(abs / 100));
  const fraction = `,${String(abs % 100).padStart(2, "0")}`;
  return { negative: minor < 0, whole, fraction, symbol: symbol || code };
}

