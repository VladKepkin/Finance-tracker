import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { adapterGetRatings, adapterSetRating, adapterClearRating } from "@/lib/data-adapter";
import { parseRating } from "@/lib/ratingInput";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const idsParam = new URL(req.url).searchParams.get("ids");
  const txIds = idsParam ? idsParam.split(",").filter((id) => id.length > 0) : [];

  const ratings = await adapterGetRatings(session.userId, txIds);
  return NextResponse.json({ ratings: Object.fromEntries(ratings) });
}

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некоректний запит" }, { status: 400 });
  }

  const parsed = parseRating(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  await adapterSetRating(session.userId, parsed.value.txId, parsed.value.score, Math.floor(Date.now() / 1000));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const txId = new URL(req.url).searchParams.get("txId");
  if (!txId) return NextResponse.json({ error: "Не вказано txId" }, { status: 400 });

  const ok = await adapterClearRating(session.userId, txId);
  if (!ok) {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
