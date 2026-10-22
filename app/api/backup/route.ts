import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAllowedKey } from "@/lib/db";
import {
  adapterGetAllKV,
  adapterSetKV,
  adapterListActiveCommitments,
  adapterInsertCommitment,
  adapterDeactivateCommitment,
  adapterListSalaries,
  adapterInsertSalary,
  adapterRemoveSalary,
  adapterListAllRatings,
  adapterClearAllRatings,
  adapterSetRating,
} from "@/lib/data-adapter";
import { parseCashAccounts, isValidCashAccount } from "@/lib/cashAccounts";
import type { WalletEntry } from "@/lib/storage";
import { withTelemetry } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withTelemetry("/api/backup", async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const kv = await adapterGetAllKV(session.userId);
  const commitments = await adapterListActiveCommitments(session.userId);
  const salaries = await adapterListSalaries(session.userId);
  const ratings = await adapterListAllRatings(session.userId);

  const payload = {
    version: 1,
    exportedAt: Math.floor(Date.now() / 1000),
    data: {
      kv,
      commitments: commitments.map((c) => ({
        name: c.name,
        amount: c.amount,
        currency: c.currency,
        cadence: c.cadence,
        anchorDay: c.anchor_day,
        matcher: c.matcher,
        source: c.source,
      })),
      salaries: salaries.map((s) => ({
        paidOn: s.paid_on,
        amount: s.amount,
        currency: s.currency,
        note: s.note,
      })),
      ratings: ratings.map((r) => ({
        txId: r.tx_id,
        score: r.score,
      })),
    },
  };

  const todayStr = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="finance-backup-${todayStr}.json"`,
      "Cache-Control": "no-store",
    },
  });
});

export const POST = withTelemetry("/api/backup", async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const rawText = await req.text();
  if (rawText.length > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Занадто великий розмір файлу резервної копії" }, { status: 413 });
  }

  let body: {
    mode?: "merge" | "replace";
    data?: {
      kv?: Record<string, unknown>;
      commitments?: Array<{
        name: string;
        amount: number;
        currency?: number;
        cadence?: "weekly" | "monthly" | "quarterly" | "yearly";
        anchorDay?: number;
        matcher?: string | null;
        source?: "card" | "cash";
      }>;
      salaries?: Array<{
        paidOn: string;
        amount: number;
        currency?: number;
        note?: string | null;
      }>;
      ratings?: Array<{
        txId: string;
        score: number;
      }>;
    };
  };

  try {
    body = JSON.parse(rawText);
  } catch {
    return NextResponse.json({ error: "Некоректний JSON" }, { status: 400 });
  }

  const mode = body?.mode === "replace" ? "replace" : "merge";
  const backupData = body?.data || (body as unknown as Record<string, unknown>);
  const backupKv = ((backupData as { kv?: unknown })?.kv || {}) as Record<string, unknown>;
  const backupCommitments = Array.isArray((backupData as { commitments?: unknown })?.commitments)
    ? (backupData as { commitments: Array<Record<string, unknown>> }).commitments
    : [];
  const backupSalaries = Array.isArray((backupData as { salaries?: unknown })?.salaries)
    ? (backupData as { salaries: Array<Record<string, unknown>> }).salaries
    : [];
  const backupRatings = Array.isArray((backupData as { ratings?: unknown })?.ratings)
    ? (backupData as { ratings: Array<Record<string, unknown>> }).ratings
    : [];

  const nowSeconds = Math.floor(Date.now() / 1000);

  if (mode === "replace") {
    // 1. Replace KV entries
    for (const [key, value] of Object.entries(backupKv)) {
      if (isAllowedKey(key)) {
        await adapterSetKV(session.userId, key, value);
      }
    }

    // 2. Replace commitments
    const currentCommits = await adapterListActiveCommitments(session.userId);
    for (const c of currentCommits) {
      await adapterDeactivateCommitment(session.userId, c.id);
    }
    for (const c of backupCommitments) {
      if (c && typeof c.name === "string" && typeof c.amount === "number") {
        await adapterInsertCommitment(
          session.userId,
          {
            name: c.name,
            amount: c.amount,
            currency: typeof c.currency === "number" ? c.currency : 980,
            cadence: (c.cadence as "monthly") || "monthly",
            anchorDay: typeof c.anchorDay === "number" ? c.anchorDay : 1,
            matcher: (c.matcher as string) || null,
            source: (c.source as "card" | "cash") || "card",
          },
          nowSeconds
        );
      }
    }

    // 3. Replace salaries
    const currentSalaries = await adapterListSalaries(session.userId);
    for (const s of currentSalaries) {
      await adapterRemoveSalary(session.userId, s.id);
    }
    for (const s of backupSalaries) {
      if (s && typeof s.paidOn === "string" && typeof s.amount === "number") {
        await adapterInsertSalary(
          session.userId,
          {
            paidOn: s.paidOn,
            amount: s.amount,
            currency: typeof s.currency === "number" ? s.currency : 980,
            note: (s.note as string) || null,
          },
          nowSeconds
        );
      }
    }

    // 4. Replace ratings
    await adapterClearAllRatings(session.userId);
    for (const r of backupRatings) {
      if (
        r &&
        typeof r.txId === "string" &&
        typeof r.score === "number" &&
        r.score >= 1 &&
        r.score <= 5
      ) {
        await adapterSetRating(session.userId, r.txId, r.score, nowSeconds);
      }
    }
  } else {
    // Mode MERGE:
    // 1. Load current state
    const currentKv = await adapterGetAllKV(session.userId);

    // Merge accounts
    const currentAccounts = parseCashAccounts(currentKv["cashAccounts"]);
    const backupAccounts = Array.isArray(backupKv["cashAccounts"]) ? backupKv["cashAccounts"] : [];
    const mergedAccounts = [...currentAccounts];
    const knownNames = new Set(mergedAccounts.map((a) => a.name.toLowerCase().trim()));
    const knownIds = new Set(mergedAccounts.map((a) => a.id));

    for (const rawAcc of backupAccounts) {
      if (isValidCashAccount(rawAcc)) {
        if (!knownIds.has(rawAcc.id) && !knownNames.has(rawAcc.name.toLowerCase().trim())) {
          mergedAccounts.push(rawAcc);
          knownNames.add(rawAcc.name.toLowerCase().trim());
          knownIds.add(rawAcc.id);
        }
      }
    }
    await adapterSetKV(session.userId, "cashAccounts", mergedAccounts);

    // Merge wallet (transactions)
    const currentWallet = Array.isArray(currentKv["wallet"]) ? (currentKv["wallet"] as WalletEntry[]) : [];
    const backupWallet = Array.isArray(backupKv["wallet"]) ? (backupKv["wallet"] as WalletEntry[]) : [];
    const existingWalletKeys = new Set(
      currentWallet.map((w) => `${w.accountId || "cash"}_${w.date}_${w.amount || 0}_${w.kind}_${w.source || ""}`)
    );
    const mergedWallet = [...currentWallet];
    for (const w of backupWallet) {
      const key = `${w.accountId || "cash"}_${w.date}_${w.amount || 0}_${w.kind}_${w.source || ""}`;
      if (!existingWalletKeys.has(key)) {
        mergedWallet.push(w);
        existingWalletKeys.add(key);
      }
    }
    await adapterSetKV(session.userId, "wallet", mergedWallet);

    // Merge other KV settings if current doesn't have them
    for (const [key, value] of Object.entries(backupKv)) {
      if (key === "cashAccounts" || key === "wallet") continue;
      if (isAllowedKey(key) && currentKv[key] === undefined && value !== undefined) {
        await adapterSetKV(session.userId, key, value);
      }
    }

    // Merge commitments
    const currentCommits = await adapterListActiveCommitments(session.userId);
    const commitNames = new Set(currentCommits.map((c) => c.name.toLowerCase().trim()));
    for (const c of backupCommitments) {
      if (c && typeof c.name === "string" && !commitNames.has(c.name.toLowerCase().trim())) {
        await adapterInsertCommitment(
          session.userId,
          {
            name: c.name,
            amount: typeof c.amount === "number" ? c.amount : 0,
            currency: typeof c.currency === "number" ? c.currency : 980,
            cadence: (c.cadence as "monthly") || "monthly",
            anchorDay: typeof c.anchorDay === "number" ? c.anchorDay : 1,
            matcher: (c.matcher as string) || null,
            source: (c.source as "card" | "cash") || "card",
          },
          nowSeconds
        );
        commitNames.add(c.name.toLowerCase().trim());
      }
    }

    // Merge salaries
    const currentSalaries = await adapterListSalaries(session.userId);
    const salaryKeys = new Set(currentSalaries.map((s) => `${s.paid_on}_${s.amount}`));
    for (const s of backupSalaries) {
      const paidOn = String(s.paidOn || "");
      const amount = Number(s.amount) || 0;
      const key = `${paidOn}_${amount}`;
      if (paidOn && !salaryKeys.has(key)) {
        await adapterInsertSalary(
          session.userId,
          {
            paidOn,
            amount,
            currency: typeof s.currency === "number" ? s.currency : 980,
            note: (s.note as string) || null,
          },
          nowSeconds
        );
        salaryKeys.add(key);
      }
    }

    // Merge ratings
    const currentRatings = await adapterListAllRatings(session.userId);
    const existingRatings = new Set(currentRatings.map((r) => r.tx_id));
    for (const r of backupRatings) {
      if (
        r &&
        typeof r.txId === "string" &&
        typeof r.score === "number" &&
        r.score >= 1 &&
        r.score <= 5 &&
        !existingRatings.has(r.txId)
      ) {
        await adapterSetRating(session.userId, r.txId, r.score, nowSeconds);
        existingRatings.add(r.txId);
      }
    }
  }

  const finalKv = await adapterGetAllKV(session.userId);
  const finalCommits = await adapterListActiveCommitments(session.userId);
  const finalSalaries = await adapterListSalaries(session.userId);
  const finalRatings = await adapterListAllRatings(session.userId);

  return NextResponse.json({
    ok: true,
    mode,
    stats: {
      accountsCount: Array.isArray(finalKv["cashAccounts"]) ? finalKv["cashAccounts"].length : 0,
      walletCount: Array.isArray(finalKv["wallet"]) ? finalKv["wallet"].length : 0,
      commitmentsCount: finalCommits.length,
      salariesCount: finalSalaries.length,
      ratingsCount: finalRatings.length,
    },
  });
});
