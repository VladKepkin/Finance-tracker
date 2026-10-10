import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  adapterGetGroupsForUser,
  adapterGetGroupMembers,
  adapterCreateGroup,
  adapterGetSharedAccountsForGroup,
} from "@/lib/data-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const groups = await adapterGetGroupsForUser(session.userId);

  const groupsWithDetails = await Promise.all(
    groups.map(async (g) => {
      const members = await adapterGetGroupMembers(g.id);
      const sharedAccounts = await adapterGetSharedAccountsForGroup(g.id);
      return {
        ...g,
        members,
        sharedAccounts,
      };
    })
  );

  return NextResponse.json({ groups: groupsWithDetails });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  try {
    const body = (await req.json()) as { name?: string };
    const name = body.name?.trim();
    if (!name || name.length < 2) {
      return NextResponse.json({ error: "Назва групи повинна містити мінімум 2 символи" }, { status: 400 });
    }

    const group = await adapterCreateGroup(name, session.userId);
    return NextResponse.json({ group });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
