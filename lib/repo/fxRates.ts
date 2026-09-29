import type { DB } from "../db";
import type { CurrencyRate } from "../fx";

export function upsertDaily(database: DB, date: string, rates: CurrencyRate[]): number {
  if (rates.length === 0) return 0;
  const stmt = database.prepare(
    `INSERT INTO fx_rates (date, currency_a, currency_b, rate_sell, rate_buy, rate_cross)
     VALUES (@date, @a, @b, @sell, @buy, @cross)
     ON CONFLICT(date, currency_a, currency_b) DO UPDATE SET
       rate_sell = excluded.rate_sell,
       rate_buy  = excluded.rate_buy,
       rate_cross = excluded.rate_cross`
  );
  const run = database.transaction((rows: CurrencyRate[]) => {
    for (const r of rows) {
      stmt.run({
        date,
        a: r.currencyCodeA,
        b: r.currencyCodeB,
        sell: r.rateSell ?? null,
        buy: r.rateBuy ?? null,
        cross: r.rateCross ?? null,
      });
    }
  });
  run(rates);
  return rates.length;
}

export function rateOn(
  database: DB,
  date: string,
  currencyA: number,
  currencyB: number
): { rate_sell: number | null; rate_buy: number | null; rate_cross: number | null } | undefined {
  return database
    .prepare(
      "SELECT rate_sell, rate_buy, rate_cross FROM fx_rates WHERE date = ? AND currency_a = ? AND currency_b = ?"
    )
    .get(date, currencyA, currencyB) as
    | { rate_sell: number | null; rate_buy: number | null; rate_cross: number | null }
    | undefined;
}

export function hasDate(database: DB, date: string): boolean {
  const row = database.prepare("SELECT 1 AS x FROM fx_rates WHERE date = ? LIMIT 1").get(date) as
    | { x: number }
    | undefined;
  return row !== undefined;
}

export function latestRates(database: DB): CurrencyRate[] {
  const row = database.prepare("SELECT date FROM fx_rates ORDER BY date DESC LIMIT 1").get() as
    | { date: string }
    | undefined;
  if (!row) return [];
  const rows = database
    .prepare("SELECT * FROM fx_rates WHERE date = ?")
    .all(row.date) as {
    currency_a: number;
    currency_b: number;
    rate_sell: number | null;
    rate_buy: number | null;
    rate_cross: number | null;
  }[];
  const dateSeconds = Math.floor(new Date(`${row.date}T00:00:00Z`).getTime() / 1000);
  return rows.map((r) => ({
    currencyCodeA: r.currency_a,
    currencyCodeB: r.currency_b,
    date: dateSeconds,
    rateSell: r.rate_sell ?? undefined,
    rateBuy: r.rate_buy ?? undefined,
    rateCross: r.rate_cross ?? undefined,
  }));
}
