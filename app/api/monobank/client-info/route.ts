import { NextResponse } from "next/server";
import { monoFetch, MonoError, type MonoClientInfo, type MonoAccount } from "@/lib/monobank";
import { getSession } from "@/lib/session";
import {
  adapterGetMonoTokenEnc,
  adapterGetSharedAccountsForUser,
  adapterGetLatestTxForAccount,
} from "@/lib/data-adapter";
import { decrypt } from "@/lib/crypto";
import { clientInfoCache } from "@/lib/clientInfoCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const enc = await adapterGetMonoTokenEnc(session.userId);
  const sharedAccounts = await adapterGetSharedAccountsForUser(session.userId);

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
        const latestTx = await adapterGetLatestTxForAccount(s.accountId);
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
        const latestTx = await adapterGetLatestTxForAccount(s.accountId);
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
