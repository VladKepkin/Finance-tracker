import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { adapterQueryPageTransactions, adapterGetAccessibleAccountIds } from "@/lib/data-adapter";
import { withTelemetry } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = 500;

export const GET = withTelemetry("/api/transactions", async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = Number(searchParams.get("from"));
  const to = Number(searchParams.get("to"));
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) {
    return NextResponse.json({ error: "Некоректний період" }, { status: 400 });
  }
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(searchParams.get("limit")) || MAX_LIMIT));
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);
  const account = searchParams.get("account") ?? undefined;
  const scope = (searchParams.get("scope") as "all" | "personal" | "family") ?? "all";

  const accessibleAccountIds = await adapterGetAccessibleAccountIds(session.userId);

  const items = await adapterQueryPageTransactions(session.userId, {
    accountId: account && account !== "all" ? account : undefined,
    fromTime: from,
    toTime: to,
    limit,
    offset,
    accessibleAccountIds,
    scope,
  });
  return NextResponse.json({ items });
});
