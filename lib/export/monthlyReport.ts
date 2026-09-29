import type { Cadence } from "../metrics/cadence";
import type { Confidence, Coverage } from "../coverage";
import type { Percentiles } from "../metrics/monthly";
import { formatMoney, formatDateTime, pluralUk } from "../format";
import { currencyMeta } from "../monobank";

export interface ReportIncome {
  medianBase: number | null;
  confidence: Confidence;
  salaryCount: number;
  fxFailCount: number;
  fxFailCurrencies: number[];
  scheduleLabel: string | null;
  periodIncomeBase: number | null;
  periodIncomeFxFailCurrency: number | null;
}

export interface ReportWork {
  hoursPerDay: number | null;
  weekdaysLabel: string | null;
  hoursPerWeek: number | null;
  nonWorkHoursPerWeek: number | null;
  hourlyRateBase: number | null;
  hourlyRateReason: string | null;
}

export interface ReportCommitment {
  name: string;
  amountOriginal: number;
  currency: number;
  cadence: Cadence;
  anchorDay: number;
  monthlyEquivalentBase: number | null;
}

export interface ReportCategorySpend {
  key: string;
  label: string;
  totalBase: number;
  count: number;
  medianCheckBase: number | null;
  shareOfExpense: number | null;
}

export interface ReportMerchant {
  name: string;
  totalBase: number;
  count: number;
}

export interface ReportAnomaly {
  date: string;
  expenseBase: number | null;
}

export interface ReportJoyCategory {
  key: string;
  label: string;
  ratedCount: number;
  medianJoy: number | null;
  shareOfRated: number | null;
}

export interface ReportMonthDynamics {
  month: string;
  expenseBase: number | null;
  incomeBase: number | null;
}

export interface MonthlyReportInput {
  nowSeconds: number;
  periodLabel: string;
  periodFromISO: string;
  periodToISO: string;
  base: number;
  accountCurrency: number;

  income: ReportIncome;
  work: ReportWork;
  bufferBase: number;
  savingsPlan: {
    emergencyMonths: number | null;
    monthlyContribution: number | null;
    spendablePct: number | null;
  };
  commitments: ReportCommitment[];

  facts: {
    dailyMedianBase: number | null;
    dailyMedianConfidence: Confidence;
    monthlyPercentilesBase: Percentiles | null;
    monthlyPercentilesConfidence: Confidence;
    coverage: Coverage;
    fxUnavailableCurrency: number | null;
  };

  spend: {
    totalExpenseBase: number | null;
    fxUnavailableCurrency: number | null;
    categories: ReportCategorySpend[];
    merchants: ReportMerchant[];
    anomalies: ReportAnomaly[];
  };

  joy: {
    ratingsCount: number;
    categories: ReportJoyCategory[];
  };

  dynamics: ReportMonthDynamics[];

  done: {
    incomeScheduleConfigured: boolean;
    workScheduleConfigured: boolean;
    bufferConfigured: boolean;
    savingsPlanConfigured: boolean;
    commitmentsCount: number;
  };
}

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  insufficient: "недостатньо даних",
  low: "низька",
  high: "висока",
};

function money(base: number, v: number | null, reason?: string | null): string {
  if (v === null) return reason ? `невідомо (${reason})` : "невідомо";
  return formatMoney(v, base);
}

function pct(v: number | null): string {
  if (v === null) return "невідомо";
  return `${(v * 100).toFixed(0)}%`;
}

const WEEKDAY_NAMES = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"];

function commitmentWhen(cadence: Cadence, anchorDay: number): string {
  return cadence === "weekly"
    ? `щотижня, ${WEEKDAY_NAMES[anchorDay] ?? anchorDay}`
    : `щомісяця, ${anchorDay}-го`;
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

export function buildMonthlyReport(input: MonthlyReportInput): string {
  const { base } = input;
  const lines: string[] = [];
  const h = (s: string) => lines.push(s);

  h(`# Фінансовий звіт — ${input.periodLabel}`);
  h(``);
  h(`Період: ${input.periodFromISO} — ${input.periodToISO}. Згенеровано: ${formatDateTime(input.nowSeconds)}.`);
  h(``);

  h(`## Інструкція для моделі`);
  h(``);
  h(INSTRUCTION_BLOCK);
  h(``);

  h(`## Обмеження`);
  h(``);
  h(`### Дохід`);
  const inc = input.income;
  if (inc.medianBase !== null) {
    h(
      `Медіана доходу: ${money(base, inc.medianBase)} на місяць. Впевненість: ${
        CONFIDENCE_LABEL[inc.confidence]
      } (${inc.salaryCount} ${pluralUk(inc.salaryCount, "виплата", "виплати", "виплат")} у історії).`
    );
  } else {
    h(`Медіана доходу: невідома — недостатньо записів зарплат (потрібен хоча б один).`);
  }
  if (inc.fxFailCount > 0) {
    h(
      `⚠ ${inc.fxFailCount} ${pluralUk(inc.fxFailCount, "виплату", "виплати", "виплат")} виключено з медіани — курс валюти (${inc.fxFailCurrencies
        .map((c) => currencyMeta(c).code)
        .join(", ")}) невідомий.`
    );
  }
  h(`Графік доходу: ${inc.scheduleLabel ?? "не налаштовано"}.`);
  if (inc.periodIncomeFxFailCurrency !== null) {
    h(`Дохід у цьому періоді: невідомо — немає курсу ${currencyMeta(inc.periodIncomeFxFailCurrency).code}.`);
  } else {
    h(`Дохід, що фактично надійшов у цьому періоді: ${money(base, inc.periodIncomeBase)}.`);
  }
  h(``);

  h(`### Робочий час`);
  const w = input.work;
  if (w.hoursPerDay !== null) {
    h(
      `${w.hoursPerDay} год/день, ${w.weekdaysLabel} → ${w.hoursPerWeek} год/тиждень зайнято, ${w.nonWorkHoursPerWeek} год/тиждень лишається на решту (сон, побут, підробіток разом — не розділено).`
    );
  } else {
    h(`Робочий графік не налаштовано — скільки часу зайнято, невідомо.`);
  }
  if (w.hourlyRateBase !== null) {
    h(`Вартість години роботи (за останньою зарплатою): ${money(base, w.hourlyRateBase)}.`);
  } else {
    h(`Вартість години: невідома${w.hourlyRateReason ? ` (${w.hourlyRateReason})` : ""}.`);
  }
  h(``);

  h(`### Недоторкані гроші`);
  h(`Буфер (не займати): ${money(base, input.bufferBase)}.`);
  const sp = input.savingsPlan;
  if (sp.emergencyMonths !== null || sp.monthlyContribution !== null || sp.spendablePct !== null) {
    h(
      `План заощаджень: ціль подушки — ${
        sp.emergencyMonths !== null ? `${sp.emergencyMonths} міс. витрат` : "не задано"
      }; щомісячний внесок — ${
        sp.monthlyContribution !== null ? money(base, sp.monthlyContribution) : "не задано"
      }; на життя витрачається — ${sp.spendablePct !== null ? `${sp.spendablePct}% доходу` : "не обмежено"}.`
    );
  } else {
    h(`План заощаджень: не налаштовано (жодного поля не заповнено).`);
  }
  h(``);

  h(`### Підтверджені зобов'язання`);
  if (input.commitments.length === 0) {
    h(`Жодного не підтверджено.`);
  } else {
    h(`| Назва | Сума за списання | Періодичність | Місячний еквівалент | Частка доходу |`);
    h(`|---|---|---|---|---|`);
    for (const c of input.commitments) {
      const share =
        c.monthlyEquivalentBase !== null && inc.medianBase !== null && inc.medianBase > 0
          ? c.monthlyEquivalentBase / inc.medianBase
          : null;
      h(
        `| ${c.name} | ${formatMoney(c.amountOriginal, c.currency)} | ${commitmentWhen(
          c.cadence,
          c.anchorDay
        )} | ${money(base, c.monthlyEquivalentBase)} | ${pct(share)} |`
      );
    }
    const totalMonthly = input.commitments.reduce((s, c) => s + (c.monthlyEquivalentBase ?? 0), 0);
    const anyUnknown = input.commitments.some((c) => c.monthlyEquivalentBase === null);
    h(
      `Разом щомісяця${anyUnknown ? " (частково — є неконвертовані)" : ""}: ${money(base, totalMonthly)}${
        inc.medianBase !== null && inc.medianBase > 0
          ? `, це ${pct(totalMonthly / inc.medianBase)} доходу`
          : ""
      }.`
    );
  }
  h(``);

  h(`## Факти (з впевненістю)`);
  h(``);
  if (input.facts.fxUnavailableCurrency !== null) {
    h(
      `Типовий день і місячні перцентіли: невідомо — немає курсу ${currencyMeta(
        input.facts.fxUnavailableCurrency
      ).code}→${currencyMeta(base).code}, конвертувати суми рахунку нема як.`
    );
  } else {
    h(
      `Типовий день (медіана): ${money(base, input.facts.dailyMedianBase)} — впевненість: ${
        CONFIDENCE_LABEL[input.facts.dailyMedianConfidence]
      }.`
    );
    if (input.facts.monthlyPercentilesBase) {
      const p = input.facts.monthlyPercentilesBase;
      h(
        `Місячні витрати: оптимістичний (P10) ${money(base, p.p10)}, реалістичний (P50) ${money(
          base,
          p.p50
        )}, консервативний (P90) ${money(base, p.p90)} — впевненість: ${
          CONFIDENCE_LABEL[input.facts.monthlyPercentilesConfidence]
        }.`
      );
    } else {
      h(`Місячні перцентилі витрат: недостатньо повних місяців історії.`);
    }
  }
  const cov = input.facts.coverage;
  h(
    `Покриття історії: ${cov.samples} ${pluralUk(cov.samples, "операція", "операції", "операцій")}${
      cov.from && cov.to ? ` за ${cov.from} — ${cov.to} (${cov.days} днів)` : ""
    }.`
  );
  if (input.facts.monthlyPercentilesBase && input.spend.totalExpenseBase !== null) {
    const p = input.facts.monthlyPercentilesBase;
    const over = input.spend.totalExpenseBase > p.p90;
    h(
      over
        ? `Перевитрата: цей період (${money(base, input.spend.totalExpenseBase)}) перевищив навіть консервативний P90 (${money(
            base,
            p.p90
          )}) з історії.`
        : `Перевитрати немає: цей період (${money(base, input.spend.totalExpenseBase)}) у межах історичного діапазону (P10–P90: ${money(
            base,
            p.p10
          )} — ${money(base, p.p90)}).`
    );
  } else {
    h(`Перевитрату оцінити не можна — бракує або перцентилів історії, або суми витрат цього періоду.`);
  }
  h(``);

  h(`## Куди йдуть гроші (${input.periodLabel})`);
  h(``);
  if (input.spend.fxUnavailableCurrency !== null) {
    h(
      `Суми цього періоду невідомі — немає курсу ${currencyMeta(
        input.spend.fxUnavailableCurrency
      ).code}→${currencyMeta(base).code}. Часткову суму не показуємо: вона видала б себе за повну.`
    );
  } else if (input.spend.categories.length === 0) {
    h(`Витрат у цьому періоді немає.`);
  } else {
    h(`Загальні витрати: ${money(base, input.spend.totalExpenseBase)}.`);
    h(``);
    h(`### Категорії`);
    h(`| Категорія | Сума | Операцій | Медіана чека | Частка |`);
    h(`|---|---|---|---|---|`);
    for (const c of input.spend.categories) {
      h(
        `| ${c.label} | ${formatMoney(c.totalBase, base)} | ${c.count} | ${money(
          base,
          c.medianCheckBase
        )} | ${pct(c.shareOfExpense)} |`
      );
    }
    h(``);
    h(`### Топ отримувачів`);
    if (input.spend.merchants.length === 0) {
      h(`Немає даних.`);
    } else {
      h(`| Отримувач | Сума | Операцій |`);
      h(`|---|---|---|`);
      for (const m of input.spend.merchants) {
        h(`| ${m.name} | ${formatMoney(m.totalBase, base)} | ${m.count} |`);
      }
    }
    h(``);
    h(`### Разові сплески`);
    if (input.spend.anomalies.length === 0) {
      h(`Жодного — витрати рівномірні, без незвичних піків.`);
    } else {
      h(`Ці дні не варто планувати як типові — вони не входять у медіану вище:`);
      for (const a of input.spend.anomalies) {
        h(`- ${a.date}: ${money(base, a.expenseBase)}`);
      }
    }
  }
  h(``);

  h(`## Радість за гроші`);
  h(``);
  if (input.joy.ratingsCount === 0) {
    h(
      `Оцінок радості немає жодної. Це єдине джерело «що людині справді цінно» в цьому звіті — без нього поради про те, ЩО скорочувати, будуть здогадкою, а не знанням про пріоритети власника. Постав оцінки 1–5 бодай кільком покупкам у застосунку, щоб наступний звіт мав цю секцію.`
    );
  } else if (input.joy.categories.length === 0) {
    h(
      `Є ${input.joy.ratingsCount} ${pluralUk(
        input.joy.ratingsCount,
        "оцінка",
        "оцінки",
        "оцінок"
      )}, але жодна категорія не набрала мінімуму для медіани — висновків поки нема.`
    );
  } else {
    h(`| Категорія | Медіана радості (1–5) | Оцінок | Частка оцінених витрат |`);
    h(`|---|---|---|---|`);
    for (const c of input.joy.categories) {
      h(`| ${c.label} | ${c.medianJoy ?? "недостатньо оцінок"} | ${c.ratedCount} | ${pct(c.shareOfRated)} |`);
    }
  }
  h(``);

  h(`## Динаміка (помісячно)`);
  h(``);
  if (input.dynamics.length === 0) {
    h(`Недостатньо повних місяців історії для динаміки.`);
  } else {
    h(`| Місяць | Витрати | Дохід |`);
    h(`|---|---|---|`);
    for (const m of input.dynamics) {
      h(`| ${m.month} | ${money(base, m.expenseBase)} | ${money(base, m.incomeBase)} |`);
    }
  }
  h(``);

  h(`## Що вже зроблено`);
  h(``);
  h(`- Графік доходу: ${input.done.incomeScheduleConfigured ? "налаштовано" : "не налаштовано"}.`);
  h(`- Робочий графік: ${input.done.workScheduleConfigured ? "налаштовано" : "не налаштовано"}.`);
  h(`- Буфер: ${input.done.bufferConfigured ? `налаштовано, ${money(base, input.bufferBase)}` : "не налаштовано (0)"}.`);
  h(`- План заощаджень: ${input.done.savingsPlanConfigured ? "налаштовано (хоча б поле)" : "не налаштовано"}.`);
  h(`- Підтверджених зобов'язань: ${input.done.commitmentsCount}.`);
  h(
    `- Свідомо НЕ хоче міняти: список порожній — це поле заповнюється вручну власником, у застосунку його поки нема.`
  );
  h(``);

  h(`## Приватність`);
  h(``);
  h(
    `Цей файл — фінансова історія за період вище. Він НЕ містить токена Monobank, пароля чи інших секретів застосунку. Курси валют — поточні (не історичні за кожен день), тож конвертація старих операцій — наближення, не бухгалтерська точність.`
  );

  return lines.join("\n");
}
