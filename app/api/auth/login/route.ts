import { NextResponse } from "next/server";
import { verifyPasswordAsync } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { adapterGetUserByUsername, adapterRecordUserActivity } from "@/lib/data-adapter";
import { setSessionCookie } from "@/lib/session";
import { withTelemetry } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withTelemetry("/api/auth/login", async function POST(req: Request) {
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некоректний запит" }, { status: 400 });
  }

  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  if (!username || !password) {
    return NextResponse.json({ error: "Вкажіть логін і пароль" }, { status: 400 });
  }

  const rl = checkRateLimit(`login:${getClientIp(req)}:${username.toLowerCase()}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Забагато спроб входу. Спробуйте пізніше." }, { status: 429 });
  }

  const user = await adapterGetUserByUsername(username);
  if (!user || !(await verifyPasswordAsync(password, user.password_hash))) {
    return NextResponse.json({ error: "Невірний логін або пароль" }, { status: 401 });
  }

  adapterRecordUserActivity(user.id).catch(() => {});
  await setSessionCookie({ userId: user.id, username: user.username });
  return NextResponse.json({ username: user.username });
});
