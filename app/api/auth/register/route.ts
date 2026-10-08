import { NextResponse } from "next/server";
import { getUserByUsername, createUser, db } from "@/lib/db";
import { setSessionCookie } from "@/lib/session";
import { acceptInvite } from "@/lib/repo/groups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { username?: string; password?: string; inviteCode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некоректний запит" }, { status: 400 });
  }

  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  const inviteCode = body.inviteCode?.trim();

  if (!username || username.length < 3) {
    return NextResponse.json({ error: "Логін повинен містити хоча б 3 символи" }, { status: 400 });
  }
  if (!password || password.length < 6) {
    return NextResponse.json({ error: "Пароль повинен містити хоча б 6 символів" }, { status: 400 });
  }

  const existing = getUserByUsername(username);
  if (existing) {
    return NextResponse.json({ error: "Користувач із таким логіном уже існує" }, { status: 409 });
  }

  const user = createUser(username, password);

  let groupJoined: { groupId: number; groupName: string } | null = null;
  if (inviteCode) {
    try {
      groupJoined = acceptInvite(db(), inviteCode, user.id);
    } catch (e) {
      console.warn(`[register] не вдалося приєднатися за кодом ${inviteCode}:`, (e as Error).message);
    }
  }

  await setSessionCookie({ userId: user.id, username: user.username });
  return NextResponse.json({
    username: user.username,
    groupJoined,
  });
}
