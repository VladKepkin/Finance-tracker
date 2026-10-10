import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { adapterLatestRates } from "@/lib/data-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  const rates = await adapterLatestRates();
  return NextResponse.json(rates);
}
