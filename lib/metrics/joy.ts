import { median } from "./stats";

export const MIN_RATINGS = 5;

export interface RatedSpend {
  category: string;
  score: number;
  amountBase: number;
}

export interface CategoryJoy {
  key: string;
  ratedCount: number;
  medianJoy: number | null;
  spendBase: number;
  shareOfRated: number | null;
}

export function categoryJoy(rated: RatedSpend[]): CategoryJoy[] {
  if (rated.length === 0) return [];

  const byCategory = new Map<string, { scores: number[]; spendBase: number }>();
  for (const r of rated) {
    const entry = byCategory.get(r.category) ?? { scores: [], spendBase: 0 };
    entry.scores.push(r.score);
    entry.spendBase += r.amountBase;
    byCategory.set(r.category, entry);
  }

  const totalSpendBase = [...byCategory.values()].reduce((sum, e) => sum + e.spendBase, 0);

  const result: CategoryJoy[] = [...byCategory.entries()].map(([key, entry]) => {
    const ratedCount = entry.scores.length;
    return {
      key,
      ratedCount,
      medianJoy: ratedCount < MIN_RATINGS ? null : median(entry.scores),
      spendBase: entry.spendBase,
      shareOfRated: totalSpendBase === 0 ? null : entry.spendBase / totalSpendBase,
    };
  });

  return result.sort((a, b) => b.spendBase - a.spendBase);
}

export type JoyVerdict = "highJoyLowSpend" | "lowJoySpendHeavy";

interface EligibleCategoryJoy extends CategoryJoy {
  medianJoy: number;
  shareOfRated: number;
}

export const MIN_CATEGORIES_FOR_VERDICT = 3;

function verdictFor(cat: EligibleCategoryJoy, joyMedian: number, shareMedian: number): JoyVerdict | null {
  if (cat.shareOfRated < shareMedian && cat.medianJoy > joyMedian) return "highJoyLowSpend";
  if (cat.shareOfRated > shareMedian && cat.medianJoy < joyMedian) return "lowJoySpendHeavy";
  return null;
}

export function computeJoyVerdicts(categories: CategoryJoy[]): Record<string, JoyVerdict | null> {
  const verdicts: Record<string, JoyVerdict | null> = {};
  for (const c of categories) verdicts[c.key] = null;

  const eligible = categories.filter(
    (c): c is EligibleCategoryJoy => c.medianJoy !== null && c.shareOfRated !== null
  );
  if (eligible.length < MIN_CATEGORIES_FOR_VERDICT) return verdicts;

  const joyMedian = median(eligible.map((c) => c.medianJoy));
  const shareMedian = median(eligible.map((c) => c.shareOfRated));
  if (joyMedian === null || shareMedian === null) return verdicts;
  for (const c of eligible) verdicts[c.key] = verdictFor(c, joyMedian, shareMedian);
  return verdicts;
}
