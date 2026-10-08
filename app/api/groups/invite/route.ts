import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { createInvite, acceptInvite } from "@/lib/repo/groups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  try {
    const body = (await req.json()) as { groupId?: number; expiresInDays?: number };
    if (!body.groupId) {
      return NextResponse.json({ error: "Не вказано groupId" }, { status: 400 });
    }

    const code = createInvite(db(), body.groupId, session.userId, body.expiresInDays ?? 7);
    return NextResponse.json({ code });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  try {
    const body = (await req.json()) as { code?: string };
    if (!body.code) {
      return NextResponse.json({ error: "Не вказано код запрошення" }, { status: 400 });
    }

    const result = acceptInvite(db(), body.code, session.userId);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
