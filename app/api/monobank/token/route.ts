import { NextResponse } from "next/server";
import { monoFetch, MonoError, type MonoClientInfo } from "@/lib/monobank";
import { getSession } from "@/lib/session";
import { setMonoTokenEnc } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { clientInfoCache } from "@/lib/clientInfoCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некоректний запит" }, { status: 400 });
  }
  const token = (body.token ?? "").trim();
  if (!token) return NextResponse.json({ error: "Відсутній токен" }, { status: 400 });

  try {
    const info = await monoFetch<MonoClientInfo>(token, "/personal/client-info");
    setMonoTokenEnc(session.userId, encrypt(token));
    clientInfoCache.forget(session.userId);
    return NextResponse.json(info);
  } catch (e) {
    const err = e as MonoError;
    return NextResponse.json(
      { error: err.message ?? "Невірний токен" },
      { status: err.status ?? 500 }
    );
  }
}

export async function DELETE() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  setMonoTokenEnc(session.userId, null);
  clientInfoCache.forget(session.userId);
  return NextResponse.json({ ok: true });
}
