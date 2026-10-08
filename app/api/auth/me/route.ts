import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { withTelemetry } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withTelemetry("/api/auth/me", async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  return NextResponse.json({ username: session.username });
});
