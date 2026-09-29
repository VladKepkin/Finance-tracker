import { describe, it, expect } from "vitest";
import { buildMonthlyReport, type MonthlyReportInput } from "@/lib/export/monthlyReport";
import { detectAnomalies } from "@/lib/metrics/anomalies";

const NOW = Date.UTC(2026, 7, 28, 12, 0, 0) / 1000;

function baseInput(overrides: Partial<MonthlyReportInput> = {}): MonthlyReportInput {
  return {
    nowSeconds: NOW,
    periodLabel: "2026-08-01 — 2026-08-31",
    periodFromISO: "2026-08-01",
    periodToISO: "2026-08-31",
    base: 980,
    accountCurrency: 980,

    income: {
      medianBase: null,
      confidence: "insufficient",
      salaryCount: 0,
      fxFailCount: 0,
      fxFailCurrencies: [],
      scheduleLabel: null,
      periodIncomeBase: null,
      periodIncomeFxFailCurrency: null,
    },
    work: {
      hoursPerDay: null,
      weekdaysLabel: null,
      hoursPerWeek: null,
      nonWorkHoursPerWeek: null,
      hourlyRateBase: null,
      hourlyRateReason: null,
    },
    bufferBase: 0,
    savingsPlan: { emergencyMonths: null, monthlyContribution: null, spendablePct: null },
    commitments: [],

    facts: {
      dailyMedianBase: null,
      dailyMedianConfidence: "insufficient",
      monthlyPercentilesBase: null,
      monthlyPercentilesConfidence: "insufficient",
      coverage: { days: 0, samples: 0, from: null, to: null },
      fxUnavailableCurrency: null,
    },

    spend: {
      totalExpenseBase: null,
      fxUnavailableCurrency: null,
      categories: [],
      merchants: [],
      anomalies: [],
    },

    joy: { ratingsCount: 0, categories: [] },

    dynamics: [],

    done: {
      incomeScheduleConfigured: false,
      workScheduleConfigured: false,
      bufferConfigured: false,
      savingsPlanConfigured: false,
      commitmentsCount: 0,
    },

    ...overrides,
  };
}

const INSTRUCTION_BLOCK = `Не пиши: «заробляй більше», «витрачай менше», «склади бюджет», «відкладай 20%»,
«скасуй непотрібні підписки». Це або вже зроблено, або зараз нездійсненне.

Кожна порада має бути:
- конкретною дією, яку можна зробити цього тижня;
- прив'язаною до конкретного РЯДКА з таблиць нижче (назва, сума);
- з порахованим ефектом у ₴/міс із цих самих чисел;
- позначеною зусиллям: разова / щомісячна звичка / потребує домовленості з кимось.

Якщо для поради бракує даних — скажи, яких саме, замість припущення.
Якщо чесна відповідь «тут різати нічого», скажи це прямо.
Максимум 5 порад, відсортованих за (ефект ₴/міс) ÷ (зусилля).`;

describe("buildMonthlyReport", () => {
  it("містить блок інструкцій §5.1 дослівно", () => {
    const md = buildMonthlyReport(baseInput());
    expect(md).toContain(INSTRUCTION_BLOCK);
  });

  it("блок інструкцій — перша секція після заголовка", () => {
    const md = buildMonthlyReport(baseInput());
    const instrIdx = md.indexOf("## Інструкція для моделі");
    const obmezhenIdx = md.indexOf("## Обмеження");
    expect(instrIdx).toBeGreaterThan(-1);
    expect(obmezhenIdx).toBeGreaterThan(instrIdx);
  });

  it("порожня БД → звіт без падіння, чесні написи «невідомо»/«не налаштовано»", () => {
    const md = buildMonthlyReport(baseInput());
    expect(md).toContain("Медіана доходу: невідома");
    expect(md).toContain("Робочий графік не налаштовано");
    expect(md).toContain("Жодного не підтверджено.");
    expect(md).toContain("Недостатньо повних місяців історії для динаміки.");
    expect(md).not.toMatch(/undefined|NaN/);
  });

  it("впевненість доходу поширюється в текст (low ≠ голе число)", () => {
    const md = buildMonthlyReport(
      baseInput({
        income: {
          medianBase: 50_000_00,
          confidence: "low",
          salaryCount: 2,
          fxFailCount: 0,
          fxFailCurrencies: [],
          scheduleLabel: "раз на місяць, 15-го",
          periodIncomeBase: 50_000_00,
          periodIncomeFxFailCurrency: null,
        },
      })
    );
    expect(md).toContain("Впевненість: низька");
    expect(md).toContain("2 виплати");
    expect(md).not.toContain("Впевненість: висока");
  });

  it("висока впевненість доходу теж передається чесно", () => {
    const md = buildMonthlyReport(
      baseInput({
        income: {
          medianBase: 50_000_00,
          confidence: "high",
          salaryCount: 6,
          fxFailCount: 0,
          fxFailCurrencies: [],
          scheduleLabel: null,
          periodIncomeBase: null,
          periodIncomeFxFailCurrency: null,
        },
      })
    );
    expect(md).toContain("Впевненість: висока");
  });

  it("нуль оцінок радості → чесне пояснення, а не порожня секція", () => {
    const md = buildMonthlyReport(baseInput({ joy: { ratingsCount: 0, categories: [] } }));
    const section = md.slice(md.indexOf("## Радість за гроші"), md.indexOf("## Динаміка"));
    expect(section).toContain("Оцінок радості немає жодної");
    expect(section.trim().length).toBeGreaterThan("## Радість за гроші".length + 10);
  });

  it("оцінки радості показані медіаною й часткою, коли є", () => {
    const md = buildMonthlyReport(
      baseInput({
        joy: {
          ratingsCount: 6,
          categories: [{ key: "cafe", label: "Кафе і ресторани", ratedCount: 5, medianJoy: 4, shareOfRated: 0.3 }],
        },
      })
    );
    expect(md).toContain("Кафе і ресторани");
    expect(md).toContain("| 4 | 5 | 30% |");
  });

  it("зобов'язання: частка доходу порахована з місячного еквівалента", () => {
    const md = buildMonthlyReport(
      baseInput({
        income: {
          medianBase: 20_000_00,
          confidence: "high",
          salaryCount: 4,
          fxFailCount: 0,
          fxFailCurrencies: [],
          scheduleLabel: null,
          periodIncomeBase: null,
          periodIncomeFxFailCurrency: null,
        },
        commitments: [
          {
            name: "Claude",
            amountOriginal: 4_000_00,
            currency: 980,
            cadence: "monthly",
            anchorDay: 11,
            monthlyEquivalentBase: 4_000_00,
          },
        ],
      })
    );
    expect(md).toContain("Claude");
    expect(md).toContain("20%");
  });

  it("немає курсу рахунок→база → факти й витрати чесно позначені невідомими, а не нулем", () => {
    const md = buildMonthlyReport(
      baseInput({
        accountCurrency: 840,
        facts: {
          dailyMedianBase: null,
          dailyMedianConfidence: "high",
          monthlyPercentilesBase: null,
          monthlyPercentilesConfidence: "high",
          coverage: { days: 400, samples: 100, from: "2025-01-01", to: "2026-08-01" },
          fxUnavailableCurrency: 840,
        },
        spend: {
          totalExpenseBase: null,
          fxUnavailableCurrency: 840,
          categories: [],
          merchants: [],
          anomalies: [],
        },
      })
    );
    expect(md).toContain("немає курсу USD");
    expect(md).not.toMatch(/Типовий день \(медіана\): 0/);
  });

  it("перевитрата: сума періоду понад P90 позначена явно", () => {
    const md = buildMonthlyReport(
      baseInput({
        facts: {
          dailyMedianBase: 500_00,
          dailyMedianConfidence: "high",
          monthlyPercentilesBase: { p10: 10_000_00, p50: 15_000_00, p90: 20_000_00 },
          monthlyPercentilesConfidence: "high",
          coverage: { days: 400, samples: 100, from: "2025-01-01", to: "2026-08-01" },
          fxUnavailableCurrency: null,
        },
        spend: {
          totalExpenseBase: 25_000_00,
          fxUnavailableCurrency: null,
          categories: [],
          merchants: [],
          anomalies: [],
        },
      })
    );
    expect(md).toContain("Перевитрата:");
  });

  it("без перевитрати — сказано прямо, що її немає", () => {
    const md = buildMonthlyReport(
      baseInput({
        facts: {
          dailyMedianBase: 500_00,
          dailyMedianConfidence: "high",
          monthlyPercentilesBase: { p10: 10_000_00, p50: 15_000_00, p90: 20_000_00 },
          monthlyPercentilesConfidence: "high",
          coverage: { days: 400, samples: 100, from: "2025-01-01", to: "2026-08-01" },
          fxUnavailableCurrency: null,
        },
        spend: {
          totalExpenseBase: 12_000_00,
          fxUnavailableCurrency: null,
          categories: [],
          merchants: [],
          anomalies: [],
        },
      })
    );
    expect(md).toContain("Перевитрати немає:");
  });

  it("не містить секретів (пароля, токена) навіть у полях, що приймають довільний текст", () => {
    const md = buildMonthlyReport(
      baseInput({
        commitments: [
          {
            name: "MONO_TOKEN_LEAK_TEST",
            amountOriginal: 100,
            currency: 980,
            cadence: "monthly",
            anchorDay: 1,
            monthlyEquivalentBase: 100,
          },
        ],
      })
    );
    expect(md).not.toContain("mono_token");
    expect(md).not.toContain("password_hash");
    expect(md).not.toContain("SESSION_SECRET");
  });
});

describe("аномалії: вікно детекції", () => {
  it("день на 50 ₴ не може бути «разовим сплеском»", () => {
    const short = [
      { date: "2026-08-23", expense: 5_000 },
      { date: "2026-08-24", expense: 145_000 },
      { date: "2026-08-25", expense: 5_000 },
    ];
    const onShort = detectAnomalies(short).map((a: { date: string }) => a.date);
    const long = Array.from({ length: 120 }, (_, i) => ({
      date: `2026-04-${String((i % 28) + 1).padStart(2, "0")}`,
      expense: 50_000,
    })).concat(short);
    const onLong = detectAnomalies(long).map((a: { date: string }) => a.date);
    expect(onLong).not.toContain("2026-08-23");
    expect(onShort.length).toBeGreaterThanOrEqual(onLong.length - 1);
  });
});
