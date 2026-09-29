import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { generateMonthlyReport } from "@/lib/export/exportPayload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const account = searchParams.get("account");
  if (!account) return NextResponse.json({ error: "Не вказано рахунок" }, { status: 400 });

  const accountCurrencyRaw = searchParams.get("accountCurrency");
  const accountCurrency = accountCurrencyRaw ? Number(accountCurrencyRaw) : NaN;
  if (!Number.isInteger(accountCurrency)) {
    return NextResponse.json({ error: "Не вказано валюту рахунку" }, { status: 400 });
  }

  const month = searchParams.get("month");
  if (month && !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Некоректний місяць" }, { status: 400 });
  }

  const jarTitles = searchParams.getAll("jarTitle");

  const markdown = generateMonthlyReport(db(), {
    userId: session.userId,
    accountId: account,
    accountCurrency,
    jarTitles: jarTitles.length > 0 ? jarTitles : null,
    month,
    nowSeconds: Math.floor(Date.now() / 1000),
  });

  const filename = month ?? new Date().toISOString().slice(0, 7);
  return new NextResponse(markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="money-${filename}.md"`,
    },
  });
}
