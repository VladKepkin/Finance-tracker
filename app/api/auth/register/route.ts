import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import {
  adapterGetUserByUsername,
  adapterCreateUser,
  adapterAcceptInvite,
  adapterRecordUserActivity,
} from "@/lib/data-adapter";
import { setSessionCookie } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = checkRateLimit(`register:${getClientIp(req)}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Забагато спроб реєстрації. Спробуйте пізніше." },
      { status: 429 }
    );
  }

  let body: { username?: string; password?: string; inviteCode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некоректний запит" }, { status: 400 });
  }

  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  const inviteCode = body.inviteCode?.trim();

  if (process.env.ALLOW_REGISTRATION === "false" && !inviteCode) {
    return NextResponse.json(
      { error: "Відкриту реєстрацію вимкнено адміністратором (потрібен код запрошення)" },
      { status: 403 }
    );
  }

  if (!username || username.length < 3) {
    return NextResponse.json({ error: "Логін повинен містити хоча б 3 символи" }, { status: 400 });
  }
  if (!password || password.length < 6) {
    return NextResponse.json({ error: "Пароль повинен містити хоча б 6 символів" }, { status: 400 });
  }

  const reservedAdmin = (process.env.APP_USERNAME || "admin").toLowerCase();
  if (process.env.APP_PASSWORD && username.toLowerCase() === reservedAdmin) {
    return NextResponse.json(
      { error: "Цей логін зарезервовано адміністратором" },
      { status: 403 }
    );
  }

  const existing = await adapterGetUserByUsername(username);
  if (existing) {
    return NextResponse.json({ error: "Користувач із таким логіном уже існує" }, { status: 409 });
  }

  const user = await adapterCreateUser(username, password);
  adapterRecordUserActivity(user.id).catch(() => {});

  let groupJoined: { groupId: number; groupName: string } | null = null;
  if (inviteCode) {
    try {
      groupJoined = await adapterAcceptInvite(inviteCode, user.id);
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
