import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAllKV, setKV, isAllowedKey } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  return NextResponse.json(getAllKV(session.userId));
}

export async function PUT(req: Request) {
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

  setKV(session.userId, key, body.value ?? null);
  return NextResponse.json({ ok: true });
}
