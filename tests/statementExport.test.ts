import { describe, it, expect } from "vitest";

function escapeCsvField(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n") || val.includes("\r") || val.includes(";")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function formatCsvDate(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const day = pad2(d.getDate());
  const month = pad2(d.getMonth() + 1);
  const year = d.getFullYear();
  const hours = pad2(d.getHours());
  const mins = pad2(d.getMinutes());
  const secs = pad2(d.getSeconds());
  return `${day}.${month}.${year} ${hours}:${mins}:${secs}`;
}

describe("statementExport CSV formatting", () => {
  it("escapes quotes, commas, and semicolons correctly", () => {
    expect(escapeCsvField("Silpo, Kyiv")).toBe('"Silpo, Kyiv"');
    expect(escapeCsvField('McDonald"s')).toBe('"McDonald""s"');
    expect(escapeCsvField("Regular Description")).toBe("Regular Description");
  });

  it("formats dates into DD.MM.YYYY HH:mm:ss format", () => {
    // 2026-10-10 12:00:00 UTC
    const date = new Date(2026, 9, 10, 12, 0, 0);
    const unix = Math.floor(date.getTime() / 1000);
    const formatted = formatCsvDate(unix);
    expect(formatted).toMatch(/^10\.10\.2026 12:00:00$/);
  });
});
