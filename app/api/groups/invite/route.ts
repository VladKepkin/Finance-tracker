import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { adapterCreateInvite, adapterAcceptInvite } from "@/lib/data-adapter";

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

    const code = await adapterCreateInvite(body.groupId, session.userId, body.expiresInDays ?? 7);
    return NextResponse.json({ code });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const rl = checkRateLimit(`invite:${getClientIp(req)}:${session.userId}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Забагато спроб. Спробуйте пізніше." }, { status: 429 });
  }

  try {
    const body = (await req.json()) as { code?: string };
    if (!body.code) {
      return NextResponse.json({ error: "Не вказано код запрошення" }, { status: 400 });
    }

    const result = await adapterAcceptInvite(body.code, session.userId);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
