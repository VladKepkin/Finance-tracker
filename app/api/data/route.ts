import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAllowedKey } from "@/lib/db";
import { adapterGetAllKV, adapterSetKV } from "@/lib/data-adapter";
import { withTelemetry } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withTelemetry("/api/data", async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  const data = await adapterGetAllKV(session.userId);
  return NextResponse.json(data);
});

export const PUT = withTelemetry("/api/data", async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  let body: { key?: string; value?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некоректний запит" }, { status: 400 });
  }

  const key = body.key;
  if (!key || !isAllowedKey(key)) {
    return NextResponse.json({ error: "Недозволений ключ" }, { status: 400 });
  }

  await adapterSetKV(session.userId, key, body.value ?? null);
  return NextResponse.json({ ok: true });
});
