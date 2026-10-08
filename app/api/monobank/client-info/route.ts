import { NextResponse } from "next/server";
import { monoFetch, MonoError, type MonoClientInfo, type MonoAccount } from "@/lib/monobank";
import { getSession } from "@/lib/session";
import { getMonoTokenEnc, db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { clientInfoCache } from "@/lib/clientInfoCache";
import { getSharedAccountsForUser } from "@/lib/repo/groups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const database = db();
  const enc = getMonoTokenEnc(session.userId);
  const sharedAccounts = getSharedAccountsForUser(database, session.userId);

  if (!enc) {
    if (sharedAccounts.length === 0) {
      return NextResponse.json({ error: "NO_TOKEN" }, { status: 400 });
    }
    // Користувач без власного токена, але має доступ до спільних карток групи
    const accounts: MonoAccount[] = [];
    for (const s of sharedAccounts) {
      const ownerCache = clientInfoCache.peek(s.ownerUserId);
      const foundInCache = ownerCache?.data.accounts.find((a) => a.id === s.accountId);
      if (foundInCache) {
        accounts.push({
          ...foundInCache,
          isShared: true,
          sharedOwnerId: s.ownerUserId,
          groupName: s.groupName,
        });
      } else {
        const latestTx = database
          .prepare("SELECT balance, currency_code FROM transactions WHERE account_id = ? ORDER BY time DESC LIMIT 1")
          .get(s.accountId) as { balance: number; currency_code: number } | undefined;
        accounts.push({
          id: s.accountId,
          sendId: "",
          balance: latestTx?.balance ?? 0,
          creditLimit: 0,
          type: "black",
          currencyCode: latestTx?.currency_code ?? 980,
          cashbackType: "None",
          maskedPan: ["*Спільна*"],
          iban: "",
          isShared: true,
          sharedOwnerId: s.ownerUserId,
          groupName: s.groupName,
        });
      }
    }
    return NextResponse.json({
      clientId: `group-client-${session.userId}`,
      name: session.username ?? "Користувач",
      webHookUrl: "",
      permissions: "ps",
      accounts,
      jars: [],
    });
  }

  try {
    const { data, fetchedAt } = await clientInfoCache.get(session.userId, Date.now(), () =>
      monoFetch<MonoClientInfo>(decrypt(enc), "/personal/client-info")
    );

    // Додаємо спільні картки інших користувачів, до яких є доступ через групу
    const sharedFromOthers = sharedAccounts.filter((s) => s.ownerUserId !== session.userId);
    const mergedAccounts: MonoAccount[] = [...data.accounts];

    for (const s of sharedFromOthers) {
      // Перевіряємо чи ця карта ще не присутня в mergedAccounts
      if (mergedAccounts.some((a) => a.id === s.accountId)) continue;

      const ownerCache = clientInfoCache.peek(s.ownerUserId);
      const foundInCache = ownerCache?.data.accounts.find((a) => a.id === s.accountId);
      if (foundInCache) {
        mergedAccounts.push({
          ...foundInCache,
          isShared: true,
          sharedOwnerId: s.ownerUserId,
          groupName: s.groupName,
        });
      } else {
        const latestTx = database
          .prepare("SELECT balance, currency_code FROM transactions WHERE account_id = ? ORDER BY time DESC LIMIT 1")
          .get(s.accountId) as { balance: number; currency_code: number } | undefined;
        mergedAccounts.push({
          id: s.accountId,
          sendId: "",
          balance: latestTx?.balance ?? 0,
          creditLimit: 0,
          type: "black",
          currencyCode: latestTx?.currency_code ?? 980,
          cashbackType: "None",
          maskedPan: ["*Спільна*"],
          iban: "",
          isShared: true,
          sharedOwnerId: s.ownerUserId,
          groupName: s.groupName,
        });
      }
    }

    return NextResponse.json(
      { ...data, accounts: mergedAccounts },
      { headers: { "X-Fetched-At": String(fetchedAt) } }
    );
  } catch (e) {
    const err = e as MonoError;
    return NextResponse.json(
      { error: err.message ?? "Помилка запиту" },
      { status: err.status ?? 500 }
    );
  }
}
