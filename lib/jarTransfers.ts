const TRANSFER_MCC = 4829;

export function isOwnJarTransfer(
  mcc: number | null | undefined,
  description: string | null | undefined,
  jarTitles: readonly string[] | null | undefined
): boolean {
  if (mcc !== TRANSFER_MCC) return false;
  if (!jarTitles || jarTitles.length === 0) return false;
  const desc = (description ?? "").trim();
  if (!desc) return false;
  return jarTitles.some((title) => {
    const t = title.trim();
    if (!t) return false;
    return desc === t || desc.includes(`«${t}»`);
  });
}
