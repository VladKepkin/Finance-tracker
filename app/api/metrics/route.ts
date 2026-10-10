import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { buildMetricsPayloadAsync } from "@/lib/metricsPayload";
import { withTelemetry } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withTelemetry("/api/metrics", async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const account = searchParams.get("account");
  if (!account) return NextResponse.json({ error: "Не вказано рахунок" }, { status: 400 });

  const jarTitles = searchParams.getAll("jarTitle");

  const payload = await buildMetricsPayloadAsync(
    session.userId,
    account,
    Math.floor(Date.now() / 1000),
    jarTitles.length > 0 ? jarTitles : null
  );

  return NextResponse.json(payload);
});
