# Money: a personal finance tracker for Monobank

![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57?logo=sqlite&logoColor=white)
![Vitest](https://img.shields.io/badge/tested_with-Vitest-6E9F18?logo=vitest&logoColor=white)

A single-user web app that pulls accounts and statements from the [Monobank API](https://api.monobank.ua/docs/), combines them with cash and salary history, and answers one question every day: **how much can I spend today?** The answer accounts for recurring payments, savings goals and an emergency fund.

The interface is in Ukrainian and designed mobile-first.

## Core principle: real numbers only

The app never shows an invented number. When a calculation lacks data (no exchange rate, no salary schedule, not enough history), it says exactly what is missing instead of substituting `0` or an average.

- A missing value is `null` with a concrete reason, never `?? 0` on money.
- A missing exchange rate produces a reason naming the currency (`fxUnavailableCurrency`).
- Statistics are medians and percentiles of your own history, with a `confidence` level that depends on how much data exists.

## Features

- **Home**: remaining daily limit, four quick actions (expense, income, transfer between accounts, currency exchange), Monobank and cash accounts, recent transactions. Tapping the limit opens details: yesterday / today / tomorrow gauges, month and week views, and a breakdown of why the limit is what it is.
- **Transactions**: card statement with search, filters, a "joy" rating per purchase and a "fake transaction" flag. Cash accounts and entries.
- **Goals**: wishlist with deadlines (reserves money from the daily limit), purchase evaluator, emergency fund, investment calculator and a sole-proprietor (FOP) tax calculator.
- **Analytics**: typical day, monthly forecast (P10 / P50 / P90), joy per money spent, one-off expenses, charts, category budgets and insights.
- **Menu**: Monobank cards, salary history and work schedule (price of things in working hours), payday dates, recurring payments, monthly report export for LLMs.

## Tech stack

- Next.js 15 (App Router), React 19, TypeScript
- Tailwind CSS v4, shadcn/ui (Radix), lucide-react, Recharts
- SQLite via better-sqlite3 for user data and the transaction cache
- jose for JWT sessions in an httpOnly cookie
- Vitest for tests

## How data flows

- Monobank allows **1 request per 60 seconds per token**. Only a background scheduler (`instrumentation.ts` and `lib/sync/scheduler.ts`) pulls the statement and stores it in SQLite; the UI reads from the database.
- The `client-info` response (accounts and balances) is cached in server memory for a minute. If Monobank rate-limits, the last response is returned together with the time it was fetched.
- The Monobank token is stored on the server, encrypted with AES-256-GCM, and is never sent to the browser.
- Settings and cash data are key-value records in the `kv` table.

## Project structure

```
app/            pages and API routes (auth, data, monobank, transactions, metrics,
                salaries, commitments, ratings, sync, export)
components/     UI; components/ui holds the shadcn primitives
lib/
  metrics/      pure calculation functions: limit, medians, goals, emergency fund
  home/         home screen logic
  sync/         background scheduler that loads the statement into SQLite
  repo/         SQLite table access
  export/       monthly LLM report
tests/          Vitest tests mirroring lib/
```

Calculations in `lib/` are pure functions with no clock or network access; time is passed in as a parameter (unix seconds, UTC), which keeps them easy to test.

## Getting started

Requires Node.js 20.

```bash
npm install
cp .env.example .env
```

Fill in the secrets in `.env` (see the table below). For local development over plain http, remove `NODE_ENV=production` from `.env`, otherwise the session cookie is sent with the `Secure` flag and login will not stick.

```bash
npm run dev
```

Open http://localhost:3000, sign in with the `APP_USERNAME` and `APP_PASSWORD` from `.env`, then paste your personal Monobank token.

### Getting a Monobank token

1. Open [api.monobank.ua](https://api.monobank.ua/).
2. Sign in with the Monobank mobile app (QR code).
3. Copy your personal token and paste it on the connection screen.

### Environment variables

| Variable | Description |
|---|---|
| `SESSION_SECRET` | Session signing secret, at least 32 characters. Generate with `openssl rand -base64 48`. |
| `ENCRYPTION_KEY` | Token encryption key, 64 hex characters. Generate with `openssl rand -hex 32`. |
| `APP_USERNAME` | Login of the single user. Example value: `admin`. |
| `APP_PASSWORD` | Password of the single user; synced to the database on every start. |
| `DATABASE_PATH` | Path to the SQLite file. Defaults to `./data/money.db`. |
| `NODE_ENV` | Remove `production` for local http development. |

## Tests and build

```bash
npm test          # Vitest
npx tsc --noEmit  # type check
npm run build
```

CI (`.github/workflows/ci.yml`) builds the project on every push and pull request.

## Docker

```bash
cp .env.example .env   # fill in the secrets
docker compose up -d --build
```

The app listens on port 3000 and stores the database in `./data` on the host, so it survives rebuilds. SQLite needs a persistent disk, so serverless platforms without a persistent volume are not suitable.
