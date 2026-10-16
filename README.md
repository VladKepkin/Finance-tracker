# Money: Multi-User & Family Finance Tracker for Monobank

![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57?logo=sqlite&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Multi--stage-2496ED?logo=docker&logoColor=white)
![Vitest](https://img.shields.io/badge/tested_with-Vitest-6E9F18?logo=vitest&logoColor=white)

A modern, self-hosted **multi-user and family finance tracker** that pulls accounts and statements from the [Monobank API](https://api.monobank.ua/docs/), unifies them with cash wallets and salary schedules, and answers the single most important question every day: **«How much can I spend today?»**

The application is built for personal and family use, features strict privacy boundaries between partners, and is localized in Ukrainian with a mobile-first, responsive interface.

---

## 🌟 What's New & Key Architectural Highlights

### 1. Multi-User & Family Budget (Zero-Leak Privacy)
- **Independent Accounts**: Each person (e.g. Vlad and his partner) registers an independent account with their own Monobank API token and private cards.
- **Family Groups & Invite Codes**: Users can create a family space and invite members via cryptographically secure invitation codes.
- **Shared vs Private Accounts**: Select specific cards (e.g. a joint grocery card) to share with the family. Shared transactions display author tags, while **private cards, balances, and transaction histories remain 100% invisible to others**.
- **Dual Spending Limit Modes**: Switch between your personal daily allowance and the combined family budget.

### 2. Dual Database Architecture (PostgreSQL 16 + SQLite)
- **Production Storage**: High-concurrency **PostgreSQL 16** with automatic zero-configuration schema generation (`ensurePgSchema`), optimized indices, and `BIGINT` micro-unit precision for minor currency values.
- **Local & Test Engine**: Fully operational with **SQLite** (`better-sqlite3`) for quick local development and offline unit tests.
- **Unified Data Adapter**: Clean abstraction layer (`lib/data-adapter.ts`) ensuring seamless switching between engines without modifying application routes.

### 3. Monobank Jars Integration in Goals
- Native synchronization of Monobank Jars (`MonoJar`) directly into wishlist targets.
- Real-time balances, target completion percentages, and direct deposit links (`send.monobank.ua`).
- Explicit saved amounts per goal, priority reordering, and completion celebrations.

### 4. Cash Commitments & Unified Transaction Ledger
- Track regular commitments with source distinction: **[ 💳 Card ]** vs **[ 💵 Cash ]** (e.g. cash rent vs card subscriptions).
- Merged activity feed uniting bank card statements, cash entries, currency conversions, and transfers.
- Full transaction receipt modal with original MCC, cashback, commissions, and persistent user notes.

### 5. Telemetry & OpenMetrics for Prometheus / Grafana
- Internal latency ring buffer monitoring HTTP endpoints, SQL queries, and Monobank API health.
- Standard OpenMetrics / Prometheus exporter at `GET /api/metrics/prometheus` for homelab monitoring.
- Developer diagnostics endpoint at `GET /api/telemetry`.

### 6. Automated CI/CD & Two-Stage Staging/Prod Deployment
- Powered by GitHub Actions self-hosted runners on Proxmox.
- **Staging (`dev` branch)**: Automated deployment to Dev VM (`[self-hosted, dev]`) on port **3001** via `docker-compose.dev.yml`.
- **Production (`main` branch)**: Automated deployment to Prod VM (`[self-hosted, prod]`) on port **3000** via `docker-compose.yml` with automated daily PostgreSQL backups on persistent HDD storage.
- **Strict Quality Gate**: 624 unit & integration tests run on every Pull Request before merge.

---

## 📐 Core Philosophy: Real Numbers Only

The application never invents numbers. When a calculation lacks inputs (no exchange rate, no salary schedule, insufficient transaction history), it states exactly what is missing rather than falling back to `0` or arbitrary averages:
- Missing financial values are explicit `null` with concrete reasons (never `?? 0`).
- Missing currency rates explicitly identify the unresolved currency (`fxUnavailableCurrency`).
- Limits and forecasts rely on medians and percentiles from your actual historical data.

---

## 🛠 Tech Stack

- **Framework**: Next.js 15 (App Router, Standalone Output), React 19, TypeScript 5.7
- **Styling & UI**: Tailwind CSS v4, shadcn/ui (Radix Primitives), Lucide Icons, Recharts
- **Databases**: PostgreSQL 16 (Primary Production) / SQLite via `better-sqlite3` (Local & Testing)
- **Authentication**: JWT sessions with `httpOnly` secure cookies (`jose`)
- **Testing & Benchmarks**: Vitest (624 tests), Autocannon load testing
- **Containers & Orchestration**: Multi-stage Docker, Docker Compose, Proxmox VE

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- Docker & Docker Compose (optional, for containerized run)

### Local Development

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/VladKepkin/Finance-tracker.git
   cd Finance-tracker
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   Generate secrets using `openssl`:
   ```bash
   # SESSION_SECRET (min 32 chars)
   openssl rand -hex 32
   # ENCRYPTION_KEY (strictly 64 hex characters)
   openssl rand -hex 32
   ```

3. **Start local dev server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) and sign in.

---

## ⚙️ Environment Variables

| Variable | Required | Description |
|:---|:---:|:---|
| `SESSION_SECRET` | **Yes** | Secret for signing JWT sessions (32+ chars). Generate with `openssl rand -hex 32`. |
| `ENCRYPTION_KEY` | **Yes** | AES-256-GCM key for encrypting Monobank tokens (strictly 64 hex chars). |
| `APP_USERNAME` | No | Initial admin login created on fresh database start (default: `admin`). |
| `APP_PASSWORD` | No | Initial admin password created on fresh database start. |
| `DATABASE_URL` | No | PostgreSQL connection string (`postgresql://user:pass@host:5432/db`). If unset, uses SQLite. |
| `DATABASE_PATH` | No | Path to SQLite file when running without Postgres (default: `/app/data/money.db`). |
| `POSTGRES_USER` | No | PostgreSQL user for docker-compose (default: `postgres`). |
| `POSTGRES_PASSWORD` | No | PostgreSQL password for docker-compose (default: `postgres`). |
| `POSTGRES_DB` | No | PostgreSQL database name (default: `finance_tracker`). |
| `PORT` | No | HTTP port for the application (default: `3000` for prod, `3001` for dev). |
| `METRICS_TOKEN` | No | Optional bearer token for Prometheus metrics (`/api/metrics/prometheus?token=...`). |

---

## 🐳 Docker Deployment

### Production (Default, Port 3000)
```bash
docker compose up -d --build
```

### Staging / Dev (Port 3001)
```bash
docker compose -f docker-compose.dev.yml up -d --build
```

---

## 🧪 Testing & Quality Assurance

Run the Vitest test suite and static analysis:

```bash
# Run 624 unit and integration tests
npm test

# Run TypeScript typecheck
npx tsc --noEmit

# Run performance micro-benchmarks
npm run bench:unit
```

---

## 🔄 Branching & Pull Request Workflow

We strictly follow a **Two-Stage Pull Request Workflow** to guarantee production stability:

1. **Never push directly to `main`!**
2. **Feature Development**: Branch off `dev` (`feature/<name>` or `fix/<name>`).
3. **Stage 1 (Staging PR)**: Open a PR into `dev` $\rightarrow$ review & merge $\rightarrow$ automated deployment to Dev Staging (port 3001).
4. **Stage 2 (Production PR)**: After validating on staging, open a PR from `dev` into `main` $\rightarrow$ review & merge $\rightarrow$ automated deployment to Production (port 3000).
