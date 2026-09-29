import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { toStatusPayload } from "@/lib/syncStatus";
import { runOnce } from "@/lib/sync/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  return NextResponse.json(toStatusPayload(db(), session.userId));
}

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  void runOnce(db(), session.userId).catch((e) =>
    console.error("[sync] ручний запуск:", (e as Error).message)
  );
  return NextResponse.json({ ok: true });
}
