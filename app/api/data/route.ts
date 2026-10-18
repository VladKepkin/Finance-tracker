import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAllowedKey } from "@/lib/db";
import { adapterGetAllKV, adapterSetKV, adapterRecordUserActivity } from "@/lib/data-adapter";
import { applyAtomicDataPatch, type AtomicPatchPayload } from "@/lib/atomicPatch";
import { withTelemetry } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withTelemetry("/api/data", async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  adapterRecordUserActivity(session.userId).catch(() => {});
  const data = await adapterGetAllKV(session.userId);
  return NextResponse.json(data);
});

export const PUT = withTelemetry("/api/data", async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  adapterRecordUserActivity(session.userId).catch(() => {});

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

export const PATCH = withTelemetry("/api/data", async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  adapterRecordUserActivity(session.userId).catch(() => {});

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некоректний JSON" }, { status: 400 });
  }

  try {
    const currentKv = await adapterGetAllKV(session.userId);
    const result = applyAtomicDataPatch(currentKv, body as AtomicPatchPayload);
    await adapterSetKV(session.userId, result.key, result.value);
    return NextResponse.json({ ok: true, key: result.key });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || "Помилка патчу" }, { status: 400 });
  }
});
