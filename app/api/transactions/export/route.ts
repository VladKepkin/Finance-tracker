import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  adapterQueryRangeTransactions,
  adapterGetAccessibleAccountIds,
  adapterGetAllKV,
} from "@/lib/data-adapter";
import { withTelemetry } from "@/lib/telemetry";
import type { WalletEntry } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatCsvDate(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const day = pad2(d.getDate());
  const month = pad2(d.getMonth() + 1);
  const year = d.getFullYear();
  const hours = pad2(d.getHours());
  const mins = pad2(d.getMinutes());
  const secs = pad2(d.getSeconds());
  return `${day}.${month}.${year} ${hours}:${mins}:${secs}`;
}

function escapeCsvField(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n") || val.includes("\r") || val.includes(";")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

const CURRENCY_MAP: Record<number, string> = {
  980: "UAH",
  840: "USD",
  978: "EUR",
  985: "PLN",
  826: "GBP",
};

export const GET = withTelemetry("/api/transactions/export", async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const account = searchParams.get("account") || "all";
  const fromTime = Number(searchParams.get("from")) || 0;
  const toTime = Number(searchParams.get("to")) || Math.floor(Date.now() / 1000);

  const accessibleAccountIds = await adapterGetAccessibleAccountIds(session.userId);

  // Fetch card transactions
  const txRows = await adapterQueryRangeTransactions(session.userId, fromTime, toTime, accessibleAccountIds);
  const filteredTxs = account !== "all"
    ? txRows.filter((tx) => tx.account_id === account)
    : txRows;

  // Header conforming to standard Monobank CSV
  const header = "Дата і час,Опис,MCC,Сума в валюті картки (UAH),Сума в валюті операції,Валюта операції,Комісія (UAH),Кешбек (UAH),Залишок";
  const lines: string[] = [header];

  for (const tx of filteredTxs) {
    const dateTimeStr = formatCsvDate(tx.time);
    const desc = escapeCsvField(tx.description || tx.comment || "Без опису");
    const mcc = tx.mcc ?? tx.original_mcc ?? 0;
    const amountStr = (tx.amount / 100).toFixed(2);
    const opAmountStr = tx.operation_amount ? (tx.operation_amount / 100).toFixed(2) : amountStr;
    const currStr = CURRENCY_MAP[tx.currency_code] || String(tx.currency_code);
    const commissionStr = tx.commission_rate ? (tx.commission_rate / 100).toFixed(2) : "0.00";
    const cashbackStr = tx.cashback_amount ? (tx.cashback_amount / 100).toFixed(2) : "0.00";
    const balanceStr = tx.balance !== null ? (tx.balance / 100).toFixed(2) : "0.00";

    lines.push(
      `${dateTimeStr},${desc},${mcc},${amountStr},${opAmountStr},${currStr},${commissionStr},${cashbackStr},${balanceStr}`
    );
  }

  // If cash or all, also include wallet entries
  if (account === "all" || account === "cash" || account.startsWith("cash_")) {
    try {
      const kv = await adapterGetAllKV(session.userId);
      const rawWallet = kv["wallet"];
      if (Array.isArray(rawWallet)) {
        const walletEntries = rawWallet as WalletEntry[];
        for (const w of walletEntries) {
          if (account !== "all" && w.accountId && w.accountId !== account) continue;
          if (!w.date) continue;

          // Parse YYYY-MM-DD to date
          const [y, m, d] = w.date.split("-").map(Number);
          const dt = new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
          const dateTimeStr = `${pad2(d || 1)}.${pad2(m || 1)}.${y} 12:00:00`;
          const desc = escapeCsvField(w.source || w.category || `Готівка (${w.kind})`);
          const sign = w.kind === "expense" ? -1 : 1;
          const amt = Math.abs(w.amount || 0) * sign;
          const amountStr = (amt / 100).toFixed(2);
          const currStr = CURRENCY_MAP[w.currency || 980] || "UAH";

          lines.push(
            `${dateTimeStr},${desc},0,${amountStr},${amountStr},${currStr},0.00,0.00,0.00`
          );
        }
      }
    } catch (e) {
      console.warn("[export] Failed to append wallet entries to CSV:", e);
    }
  }

  // UTF-8 BOM so Excel opens Cyrillic without encoding issues
  const csvContent = "\uFEFF" + lines.join("\r\n");
  const todayStr = new Date().toISOString().slice(0, 10);
  const filename = `statement-${account}-${todayStr}.csv`;

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
