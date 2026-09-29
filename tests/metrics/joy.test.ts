import { describe, expect, it } from "vitest";
import {
  categoryJoy,
  computeJoyVerdicts,
  MIN_CATEGORIES_FOR_VERDICT,
  MIN_RATINGS,
  type CategoryJoy,
  type RatedSpend,
} from "../../lib/metrics/joy";

function spend(category: string, score: number, amountBase: number): RatedSpend {
  return { category, score, amountBase };
}

function cat(key: string, medianJoy: number | null, shareOfRated: number | null): CategoryJoy {
  return { key, ratedCount: MIN_RATINGS, medianJoy, spendBase: 100, shareOfRated };
}

describe("categoryJoy", () => {
  it("порожній вхід → порожній вихід", () => {
    expect(categoryJoy([])).toEqual([]);
  });

  it("медіана падає в null нижче MIN_RATINGS і зʼявляється на порозі", () => {
    const four = [1, 2, 3, 4].map((s) => spend("food", s, 10));
    const [withFour] = categoryJoy(four);
    expect(withFour.ratedCount).toBe(4);
    expect(withFour.medianJoy).toBeNull();

    const five = [...four, spend("food", 5, 10)];
    const [withFive] = categoryJoy(five);
    expect(withFive.ratedCount).toBe(MIN_RATINGS);
    expect(withFive.medianJoy).not.toBeNull();
  });

  it("ratedCount рахує оцінки, spendBase підсумовує суми", () => {
    const rated = [spend("food", 4, 100), spend("food", 5, 50), spend("food", 3, 25)];
    const [food] = categoryJoy(rated);
    expect(food.ratedCount).toBe(3);
    expect(food.spendBase).toBe(175);
  });

  it("shareOfRated: дві категорії 300/700 → 0.3 / 0.7, сума часток = 1", () => {
    const rated = [
      spend("food", 4, 300),
      spend("transport", 3, 700),
    ];
    const result = categoryJoy(rated);
    const food = result.find((c) => c.key === "food")!;
    const transport = result.find((c) => c.key === "transport")!;
    expect(food.shareOfRated).toBeCloseTo(0.3);
    expect(transport.shareOfRated).toBeCloseTo(0.7);
    expect(food.shareOfRated! + transport.shareOfRated!).toBeCloseTo(1);
  });

  it("медіана — не середнє: [1,1,5,5,5] → медіана 5, а не середнє 3.4", () => {
    const rated = [1, 1, 5, 5, 5].map((s) => spend("food", s, 10));
    const [food] = categoryJoy(rated);
    expect(food.medianJoy).toBe(5);
    expect(food.medianJoy).not.toBeCloseTo(3.4);
  });

  it("медіана парної кількості оцінок — інтерполяція між середніми двома", () => {
    const rated = [1, 2, 3, 4, 5, 6].map((s) => spend("food", s, 10));
    const [food] = categoryJoy(rated);
    expect(food.medianJoy).toBeCloseTo(3.5);
  });

  it("сортування спадно за spendBase", () => {
    const rated = [
      ...[1, 2, 3, 4, 5].map((s) => spend("small", s, 10)),
      ...[1, 2, 3, 4, 5].map((s) => spend("big", s, 1000)),
    ];
    const result = categoryJoy(rated);
    expect(result.map((c) => c.key)).toEqual(["big", "small"]);
  });

  it("сума всіх spendBase = 0 → shareOfRated null, а не «0%»", () => {
    const rated = [spend("food", 4, 0), spend("transport", 3, 0)];
    const result = categoryJoy(rated);
    for (const c of result) {
      expect(c.shareOfRated).toBeNull();
    }
  });

  it("частки лишаються числом, коли є що ділити", () => {
    const result = categoryJoy([spend("food", 4, 300), spend("transport", 3, 700)]);
    for (const c of result) {
      expect(typeof c.shareOfRated).toBe("number");
      expect(Number.isFinite(c.shareOfRated!)).toBe(true);
    }
  });
});

describe("computeJoyVerdicts", () => {
  const a = cat("a", 5, 0.1);
  const b = cat("b", 3, 0.3);
  const c = cat("c", 1, 0.6);

  it(`гейт: ${MIN_CATEGORIES_FOR_VERDICT} еліджибл категорії — крайні отримують вердикт, медіанна мовчить`, () => {
    const verdicts = computeJoyVerdicts([a, b, c]);
    expect(verdicts.a).toBe("highJoyLowSpend");
    expect(verdicts.c).toBe("lowJoySpendHeavy");
    expect(verdicts.b).toBeNull();
  });

  it("гейт: 2 еліджибл категорії (< MIN_CATEGORIES_FOR_VERDICT) — обидва вердикти null, попри розбіжність", () => {
    const verdicts = computeJoyVerdicts([a, c]);
    expect(verdicts.a).toBeNull();
    expect(verdicts.c).toBeNull();
  });

  it("категорія нижче MIN_RATINGS (medianJoy/shareOfRated === null) ніколи не отримує вердикт", () => {
    const notEligible = cat("d", null, null);
    const verdicts = computeJoyVerdicts([a, b, c, notEligible]);
    expect(verdicts.d).toBeNull();
    expect(verdicts.a).toBe("highJoyLowSpend");
    expect(verdicts.c).toBe("lowJoySpendHeavy");
  });

  it("мутаційна перевірка: якщо гейт послабити до 2, тест на 2 категоріях мав би впасти", () => {
    expect(MIN_CATEGORIES_FOR_VERDICT).toBe(3);
  });
});
