import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { withTelemetry } from "@/lib/telemetry";
import { isAdminSession } from "@/lib/adminAuth";
import { adapterGetAdminAnalytics } from "@/lib/data-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withTelemetry("/api/admin/analytics", async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  if (!isAdminSession(session)) {
    return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });
  }

  const payload = await adapterGetAdminAnalytics();
  return NextResponse.json(payload);
});
