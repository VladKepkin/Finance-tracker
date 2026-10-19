import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { withTelemetry } from "@/lib/telemetry";
import { isAdminSession } from "@/lib/adminAuth";
import { adapterRecordUserActivity } from "@/lib/data-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withTelemetry("/api/auth/me", async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  adapterRecordUserActivity(session.userId).catch(() => {});
  return NextResponse.json({
    username: session.username,
    isAdmin: isAdminSession(session),
  });
});

