import { NextResponse } from "next/server";
import { getUserByUsername, verifyPassword } from "@/lib/db";
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

  const user = getUserByUsername(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return NextResponse.json({ error: "Невірний логін або пароль" }, { status: 401 });
  }

  await setSessionCookie({ userId: user.id, username: user.username });
  return NextResponse.json({ username: user.username });
});
