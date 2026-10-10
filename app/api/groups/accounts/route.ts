import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  adapterShareAccount,
  adapterUnshareAccount,
  adapterGetSharedAccountsForUser,
} from "@/lib/data-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const accounts = await adapterGetSharedAccountsForUser(session.userId);
  return NextResponse.json({ accounts });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  try {
    const body = (await req.json()) as { accountId?: string; groupId?: number };
    if (!body.accountId || !body.groupId) {
      return NextResponse.json({ error: "Потрібно вказати accountId та groupId" }, { status: 400 });
    }

    await adapterShareAccount(body.accountId, session.userId, body.groupId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId");
    const groupId = Number(searchParams.get("groupId"));
    if (!accountId || !groupId) {
      return NextResponse.json({ error: "Потрібно вказати accountId та groupId" }, { status: 400 });
    }

    await adapterUnshareAccount(accountId, session.userId, groupId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
