import { NextResponse } from "next/server";
import { monoFetch, MonoError, type MonoClientInfo } from "@/lib/monobank";
import { getSession } from "@/lib/session";
import { getMonoTokenEnc } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { clientInfoCache } from "@/lib/clientInfoCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const enc = getMonoTokenEnc(session.userId);
  if (!enc) return NextResponse.json({ error: "NO_TOKEN" }, { status: 400 });

  try {
    const { data, fetchedAt } = await clientInfoCache.get(session.userId, Date.now(), () =>
      monoFetch<MonoClientInfo>(decrypt(enc), "/personal/client-info")
    );
    return NextResponse.json(data, { headers: { "X-Fetched-At": String(fetchedAt) } });
  } catch (e) {
    const err = e as MonoError;
    return NextResponse.json(
      { error: err.message ?? "Помилка запиту" },
      { status: err.status ?? 500 }
    );
  }
}
