import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { listActive, insert, update, deactivate, getById } from "@/lib/repo/commitments";
import { parseCreate, parsePatch } from "@/lib/commitmentInput";
import { withTelemetry } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withTelemetry("/api/commitments", async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  return NextResponse.json({ items: listActive(db(), session.userId) });
});

export const POST = withTelemetry("/api/commitments", async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некоректний запит" }, { status: 400 });
  }

  const parsed = parseCreate(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const id = insert(db(), session.userId, parsed.value, Math.floor(Date.now() / 1000));
  return NextResponse.json({ id });
});

export const PATCH = withTelemetry("/api/commitments", async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некоректний запит" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body) || typeof (body as { id?: unknown }).id !== "number") {
    return NextResponse.json({ error: "Не вказано id" }, { status: 400 });
  }
  const id = (body as { id: number }).id;

  const existing = getById(db(), session.userId, id);
  if (!existing) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const parsed = parsePatch(body, existing.cadence);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const ok = update(db(), session.userId, id, parsed.value);
  if (!ok) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  return NextResponse.json({ ok: true });
});

export const DELETE = withTelemetry("/api/commitments", async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Не вказано id" }, { status: 400 });
  }
  if (!deactivate(db(), session.userId, id)) {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
});
