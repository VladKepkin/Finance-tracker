import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { buildSuggestions } from "@/lib/commitmentSuggestions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  return NextResponse.json({
    items: buildSuggestions(db(), session.userId, Math.floor(Date.now() / 1000)),
  });
}
