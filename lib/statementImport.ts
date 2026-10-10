import { mccToCategory } from "./mcc";

export interface ParsedTransaction {
  id: string;
  date: string; // YYYY-MM-DD
  time: number; // Unix timestamp in seconds
  description: string;
  amount: number; // in minor units (kopecks/cents, positive number)
  currencyCode: number; // e.g. 980
  kind: "expense" | "income";
  categoryKey?: string;
  mcc?: number;
  comment?: string;
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] || "";
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  const tabs = (firstLine.match(/\t/g) || []).length;
  if (tabs > semicolons && tabs > commas) return "\t";
  if (semicolons > commas) return ";";
  return ",";
}

function parseCsvLines(text: string): string[][] {
  const delim = detectDelimiter(text);
  const lines: string[][] = [];
  let currentField = "";
  let currentRecord: string[] = [];
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === delim && !insideQuotes) {
      currentRecord.push(currentField.trim());
      currentField = "";
    } else if ((char === "\r" || char === "\n") && !insideQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i++; // skip \n in CRLF
      }
      currentRecord.push(currentField.trim());
      if (currentRecord.some((f) => f.length > 0)) {
        lines.push(currentRecord);
      }
      currentRecord = [];
      currentField = "";
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRecord.length > 0) {
    currentRecord.push(currentField.trim());
    if (currentRecord.some((f) => f.length > 0)) {
      lines.push(currentRecord);
    }
  }

  return lines;
}

function parseAmount(val: string): number | null {
  if (!val) return null;
  // Clean spaces and currency symbols
  const cleaned = val
    .replace(/\s+/g, "")
    .replace(/[₴$€]/g, "")
    .replace(",", ".");
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  return Math.round(num * 100);
}

function parseDateToTimestamp(dateStr: string): { date: string; time: number } {
  // Try formats:
  // 1. "DD.MM.YYYY HH:mm:ss" or "DD.MM.YYYY HH:mm"
  // 2. "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DD"
  // 3. "DD/MM/YYYY"
  const dmyMatch = dateStr.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const hour = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 12;
    const minute = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    const second = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
    const d = new Date(year, month, day, hour, minute, second);
    const isoDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return { date: isoDate, time: Math.floor(d.getTime() / 1000) };
  }

  const ymdMatch = dateStr.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const hour = ymdMatch[4] ? parseInt(ymdMatch[4], 10) : 12;
    const minute = ymdMatch[5] ? parseInt(ymdMatch[5], 10) : 0;
    const second = ymdMatch[6] ? parseInt(ymdMatch[6], 10) : 0;
    const d = new Date(year, month, day, hour, minute, second);
    const isoDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return { date: isoDate, time: Math.floor(d.getTime() / 1000) };
  }

  const fallback = new Date(dateStr);
  if (!isNaN(fallback.getTime())) {
    return {
      date: fallback.toISOString().slice(0, 10),
      time: Math.floor(fallback.getTime() / 1000),
    };
  }

  const now = new Date();
  return { date: now.toISOString().slice(0, 10), time: Math.floor(now.getTime() / 1000) };
}

export function parseMonobankCsv(rows: string[][]): ParsedTransaction[] {
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.toLowerCase());

  // Find column indices
  const dateIdx = header.findIndex((h) => h.includes("дата") || h.includes("date"));
  const descIdx = header.findIndex((h) => h.includes("опис") || h.includes("desc"));
  const mccIdx = header.findIndex((h) => h.includes("mcc"));
  const amountIdx = header.findIndex(
    (h) => (h.includes("сума") || h.includes("amount")) && !h.includes("операції") && !h.includes("operation")
  );
  const opAmountIdx = header.findIndex((h) => h.includes("операції") || h.includes("operation amount"));

  const targetAmountIdx = amountIdx !== -1 ? amountIdx : opAmountIdx;
  if (dateIdx === -1 || targetAmountIdx === -1) return [];

  const items: ParsedTransaction[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length <= targetAmountIdx) continue;
    const dateStr = row[dateIdx];
    const rawAmount = parseAmount(row[targetAmountIdx]);
    if (!dateStr || rawAmount === null || rawAmount === 0) continue;

    const desc = descIdx !== -1 && row[descIdx] ? row[descIdx] : "Операція";
    const mcc = mccIdx !== -1 && row[mccIdx] ? parseInt(row[mccIdx], 10) : undefined;
    const { date, time } = parseDateToTimestamp(dateStr);
    const kind = rawAmount < 0 ? "expense" : "income";
    const absAmount = Math.abs(rawAmount);

    const cat = mccToCategory(mcc ?? 0, rawAmount);

    items.push({
      id: `mono_import_${time}_${absAmount}_${i}`,
      date,
      time,
      description: desc,
      amount: absAmount,
      currencyCode: 980,
      kind,
      categoryKey: cat.key,
      mcc: mcc && !isNaN(mcc) ? mcc : undefined,
    });
  }

  return items;
}

export function parsePrivatbankCsv(rows: string[][]): ParsedTransaction[] {
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.toLowerCase());

  const dateIdx = header.findIndex((h) => h.includes("дата") || h.includes("date"));
  const timeIdx = header.findIndex((h) => h.includes("час") || h.includes("time"));
  const descIdx = header.findIndex((h) => h.includes("опис") || h.includes("призначення") || h.includes("деталі"));
  const amountIdx = header.findIndex((h) => h.includes("сума в валюті картки") || h.includes("сума"));

  if (dateIdx === -1 || amountIdx === -1) return [];

  const items: ParsedTransaction[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length <= amountIdx) continue;
    let dateStr = row[dateIdx];
    if (timeIdx !== -1 && row[timeIdx]) {
      dateStr = `${dateStr} ${row[timeIdx]}`;
    }
    const rawAmount = parseAmount(row[amountIdx]);
    if (!dateStr || rawAmount === null || rawAmount === 0) continue;

    const desc = descIdx !== -1 && row[descIdx] ? row[descIdx] : "Операція ПриватБанк";
    const { date, time } = parseDateToTimestamp(dateStr);
    const kind = rawAmount < 0 ? "expense" : "income";
    const absAmount = Math.abs(rawAmount);

    items.push({
      id: `privat_import_${time}_${absAmount}_${i}`,
      date,
      time,
      description: desc,
      amount: absAmount,
      currencyCode: 980,
      kind,
    });
  }

  return items;
}

export function parseGenericCsv(rows: string[][]): ParsedTransaction[] {
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.toLowerCase());

  const dateIdx = header.findIndex((h) => h.includes("date") || h.includes("дата") || h.includes("time") || h.includes("час"));
  const descIdx = header.findIndex(
    (h) => h.includes("desc") || h.includes("опис") || h.includes("name") || h.includes("назва") || h.includes("деталі")
  );
  const amountIdx = header.findIndex((h) => h.includes("amount") || h.includes("сума") || h.includes("sum"));

  if (dateIdx === -1 || amountIdx === -1) return [];

  const items: ParsedTransaction[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length <= amountIdx) continue;
    const dateStr = row[dateIdx];
    const rawAmount = parseAmount(row[amountIdx]);
    if (!dateStr || rawAmount === null || rawAmount === 0) continue;

    const desc = descIdx !== -1 && row[descIdx] ? row[descIdx] : "Операція";
    const { date, time } = parseDateToTimestamp(dateStr);
    const kind = rawAmount < 0 ? "expense" : "income";
    const absAmount = Math.abs(rawAmount);

    items.push({
      id: `generic_import_${time}_${absAmount}_${i}`,
      date,
      time,
      description: desc,
      amount: absAmount,
      currencyCode: 980,
      kind,
    });
  }

  return items;
}

export function detectAndParseStatement(csvText: string): {
  bank: "monobank" | "privatbank" | "generic";
  items: ParsedTransaction[];
} {
  const rows = parseCsvLines(csvText);
  if (rows.length < 2) {
    return { bank: "generic", items: [] };
  }

  const headerStr = rows[0].join(" ").toLowerCase();

  if (headerStr.includes("mcc") || headerStr.includes("кешбек") || headerStr.includes("валюті операції")) {
    const items = parseMonobankCsv(rows);
    return { bank: "monobank", items };
  }

  if (headerStr.includes("приват") || headerStr.includes("картка") || headerStr.includes("сума в валюті картки")) {
    const items = parsePrivatbankCsv(rows);
    if (items.length > 0) {
      return { bank: "privatbank", items };
    }
  }

  // Try Monobank
  const mono = parseMonobankCsv(rows);
  if (mono.length > 0) return { bank: "monobank", items: mono };

  // Fallback to generic
  const generic = parseGenericCsv(rows);
  return { bank: "generic", items: generic };
}
