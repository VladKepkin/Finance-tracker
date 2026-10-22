import { NextResponse } from "next/server";
import { parseMonoWebhookPayload } from "@/lib/monobankWebhook";
import { adapterFindUserByAccountId, adapterUpsertManyTransactions } from "@/lib/data-adapter";
import { clientInfoCache } from "@/lib/clientInfoCache";
import { withTelemetry } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withTelemetry("/api/monobank/webhook", async function GET() {
  return NextResponse.json({ ok: true, status: "webhook_ready" }, { status: 200 });
});

export const POST = withTelemetry("/api/monobank/webhook", async function POST(req: Request) {
  const url = new URL(req.url);
  const secretEnv = process.env.MONO_WEBHOOK_SECRET?.trim();
  const querySecret = url.searchParams.get("secret");
  const headerSecret = req.headers.get("x-webhook-secret");
  const isSecretValid = Boolean(secretEnv && (querySecret === secretEnv || headerSecret === secretEnv));

  if (secretEnv && !isSecretValid) {
    return NextResponse.json({ error: "Невірний секрет" }, { status: 403 });
  }

  if (!secretEnv && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Вебхук не налаштовано (відсутній MONO_WEBHOOK_SECRET)" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некоректний JSON" }, { status: 400 });
  }

  const parsed = parseMonoWebhookPayload(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  let userId: number | null = null;
  if (isSecretValid) {
    const queryUserIdStr = url.searchParams.get("userId");
    const parsedQueryUserId = queryUserIdStr ? parseInt(queryUserIdStr, 10) : null;
    if (parsedQueryUserId && !isNaN(parsedQueryUserId)) {
      userId = parsedQueryUserId;
    }
  }

  if (!userId) {
    userId = await adapterFindUserByAccountId(parsed.accountId);
  }

  if (userId) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    await adapterUpsertManyTransactions(userId, parsed.accountId, [parsed.item], nowSeconds);
    clientInfoCache.forget(userId);
  }

  return NextResponse.json({ ok: true, saved: userId ? 1 : 0 });
});
