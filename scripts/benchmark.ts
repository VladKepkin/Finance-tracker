import autocannon from "autocannon";
import { existsSync, readFileSync } from "fs";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx > 0) {
        const k = trimmed.slice(0, idx).trim();
        const v = trimmed.slice(idx + 1).trim();
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
}

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const DURATION = Number(process.env.BENCH_DURATION) || 5; // seconds
const CONNECTIONS = Number(process.env.BENCH_CONNECTIONS) || 10;

async function checkServerAlive(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/login`, { method: "GET", signal: AbortSignal.timeout(5000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function loginAndGetCookie(url: string): Promise<string | null> {
  const username = process.env.APP_USERNAME || "admin";
  const password = process.env.APP_PASSWORD || "admin";

  try {
    const res = await fetch(`${url}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) return null;
    const cookie = res.headers.get("set-cookie");
    return cookie ? cookie.split(";")[0] : null;
  } catch {
    return null;
  }
}

async function runBenchmark(name: string, opts: autocannon.Options): Promise<autocannon.Result> {
  console.log(`\n==================================================`);
  console.log(`🚀 Запуск тесту: ${name}`);
  console.log(`🎯 URL: ${opts.url}`);
  console.log(`⚡ З'єднань: ${opts.connections || CONNECTIONS}, Тривалість: ${opts.duration || DURATION} сек`);
  console.log(`==================================================`);

  return new Promise((resolve, reject) => {
    autocannon(
      {
        ...opts,
        connections: opts.connections || CONNECTIONS,
        duration: opts.duration || DURATION,
      },
      (err, result) => {
        if (err) return reject(err);
        autocannon.printResult(result);
        resolve(result);
      }
    );
  });
}

async function fetchTelemetry(url: string, cookie: string | null): Promise<void> {
  try {
    const headers: Record<string, string> = {};
    if (cookie) headers["Cookie"] = cookie;

    const res = await fetch(`${url}/api/telemetry`, { headers });
    if (!res.ok) {
      console.log(`\n⚠️ Не вдалося отримати телеметрію (HTTP ${res.status})`);
      return;
    }

    const data = await res.json();
    console.log("\n📊 ====== ВНУТРІШНЯ ТЕЛЕМЕТРІЯ СЕРВЕРА (APM) ======");
    console.log(`⏱️ Uptime: ${data.uptimeSeconds} сек`);
    console.log(`🧠 Пам'ять (RSS): ${data.system.memoryMb.rss} MB | Heap: ${data.system.memoryMb.heapUsed} MB / ${data.system.memoryMb.heapTotal} MB`);
    console.log(`⏳ Event Loop Lag: mean=${data.system.eventLoopDelayMs.mean}ms | p50=${data.system.eventLoopDelayMs.p50}ms | p95=${data.system.eventLoopDelayMs.p95}ms | max=${data.system.eventLoopDelayMs.max}ms`);
    console.log(`🗄️ SQLite: ${data.database.totalQueries} запитів | p50=${data.database.p50Ms}ms | p95=${data.database.p95Ms}ms | повільних (>50ms)=${data.database.slowQueries}`);
    console.log(`🌐 HTTP Routes:`);
    for (const [route, stats] of Object.entries(data.http.routes)) {
      const s = stats as any;
      console.log(`   ${route.padEnd(30)} -> ${s.totalRequests} reqs | p50=${s.p50Ms}ms | p95=${s.p95Ms}ms | avg=${s.avgMs}ms | помилок=${s.errors}`);
    }
    console.log("==================================================\n");
  } catch (e) {
    console.log("Помилка отримання телеметрії:", (e as Error).message);
  }
}

async function main() {
  console.log(`\n🔎 Перевірка доступності сервера за адресою: ${BASE_URL}...`);
  const alive = await checkServerAlive(BASE_URL);

  if (!alive) {
    console.error(`\n❌ Сервер не відповідає на ${BASE_URL}.`);
    console.error(`👉 Запустіть додаток перед бенчмарком:`);
    console.error(`   npm run dev    (або npm run build && npm start)\n`);
    process.exit(1);
  }

  console.log(`✅ Сервер активний! Авторизація тестової сесії...`);
  const cookie = await loginAndGetCookie(BASE_URL);
  if (cookie) {
    console.log(`🔑 Отримано сесійну куку.`);
  } else {
    console.log(`⚠️ Не вдалося отримати куку (тестуватимуться публічні ендпоінти або з локальним доступом).`);
  }

  const headers: Record<string, string> = {};
  if (cookie) headers["Cookie"] = cookie;

  // 1. Тест телеметрії (JSON)
  await runBenchmark("GET /api/telemetry (Developer APM JSON)", {
    url: `${BASE_URL}/api/telemetry`,
    headers,
  });

  // 2. Тест Prometheus exporter
  await runBenchmark("GET /api/metrics/prometheus (OpenMetrics)", {
    url: `${BASE_URL}/api/metrics/prometheus`,
    headers,
  });

  // 3. Якщо авторизовані - тестуємо бізнес-ендпоінти
  if (cookie) {
    await runBenchmark("GET /api/commitments (Commitments API)", {
      url: `${BASE_URL}/api/commitments`,
      headers,
    });

    const now = Math.floor(Date.now() / 1000);
    const thirtyDaysAgo = now - 30 * 86400;
    await runBenchmark("GET /api/transactions (Transactions DB Query)", {
      url: `${BASE_URL}/api/transactions?from=${thirtyDaysAgo}&to=${now}&limit=50`,
      headers,
    });
  }

  // Зчитування внутрішньої телеметрії сервера після навантаження
  await fetchTelemetry(BASE_URL, cookie);
  console.log(`🎉 Тестування швидкості успішно завершено!\n`);
}

main().catch((err) => {
  console.error("Помилка виконання бенчмарку:", err);
  process.exit(1);
});
