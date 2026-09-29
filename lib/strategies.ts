import type { CategorySpend } from "./analytics";
import { currencyMeta } from "./monobank";

export const THRESHOLDS = {
  savingsTargetPct: 20,
  savingsMinPct: 10,
  savingsFirePct: 50,
  emergencyMinMonths: 3,
  emergencyFullMonths: 6,
  rule503020: { needs: 50, wants: 30, savings: 20 },
  swrPct: 4,
  fireMultiple: 25,
  recurringWarnPct: 30,
};

const NEEDS = new Set(["groceries", "utilities", "transport", "fuel", "health", "education"]);
const WANTS = new Set(["cafe", "entertainment", "shopping", "beauty", "travel"]);

export type StrategyLevel = "good" | "warn" | "bad" | "info";

export interface Strategy {
  id: string;
  level: StrategyLevel;
  priority: number;
  title: string;
  detail: string;
  metric?: string;
  progress?: number;
}

export interface StrategyContext {
  monthlyIncome: number | null;
  incomeFxUnavailable: number | null;
  incomeUnavailableReason: string | null;
  monthlyExpense: number | null;
  liquid: number | null;
  liquidFxUnavailable: number | null;
  recurringMonthly: number;
  recurringFxUnavailable: number | null;
  recurringError: string | null;
  byCategory: CategorySpend[];
  fmt: (minor: number) => string;
}

export function buildStrategies(ctx: StrategyContext): Strategy[] {
  const {
    monthlyIncome,
    incomeFxUnavailable,
    incomeUnavailableReason,
    monthlyExpense,
    liquid,
    liquidFxUnavailable,
    recurringMonthly,
    recurringFxUnavailable,
    recurringError,
    byCategory,
    fmt,
  } = ctx;
  const out: Strategy[] = [];
  const hasIncome = monthlyIncome !== null && monthlyIncome > 0;
  const income = monthlyIncome ?? 0;
  const hasExpense = monthlyExpense !== null;
  const expense = monthlyExpense ?? 0;
  const savingsRate = hasIncome && hasExpense ? ((income - expense) / income) * 100 : 0;

  if (liquidFxUnavailable !== null) {
    out.push({
      id: "emergency",
      level: "warn",
      priority: 1,
      title: "Подушка безпеки",
      detail: `Немає курсу для ${currencyMeta(liquidFxUnavailable).code} — ліквідні кошти порахувати не можна.`,
    });
  }
  const emFull = expense * THRESHOLDS.emergencyFullMonths;
  const emMin = expense * THRESHOLDS.emergencyMinMonths;
  if (liquid !== null && hasExpense && expense > 0) {
    const months = liquid / expense;
    if (liquid < emMin) {
      out.push({
        id: "emergency",
        level: "bad",
        priority: 1,
        title: "Збери подушку безпеки",
        detail: `Пріоритет №1 — резерв на ${THRESHOLDS.emergencyMinMonths}–${THRESHOLDS.emergencyFullMonths} міс. витрат на окремому рахунку. Зараз вистачить на ${months.toFixed(1)} міс.`,
        metric: `${fmt(liquid)} / ${fmt(emFull)}`,
        progress: Math.min(1, liquid / emFull),
      });
    } else if (liquid < emFull) {
      out.push({
        id: "emergency",
        level: "warn",
        priority: 2,
        title: "Дотягни подушку до 6 місяців",
        detail: `Базовий резерv є (${months.toFixed(1)} міс.). Доведи до ${THRESHOLDS.emergencyFullMonths} міс. — і можна впевнено інвестувати надлишок.`,
        metric: `${fmt(liquid)} / ${fmt(emFull)}`,
        progress: Math.min(1, liquid / emFull),
      });
    } else {
      out.push({
        id: "emergency",
        level: "good",
        priority: 6,
        title: "Подушка безпеки сформована ✅",
        detail: `У тебе ${months.toFixed(1)} міс. витрат у резерві. Надлишок понад ${THRESHOLDS.emergencyFullMonths} міс. варто інвестувати, а не тримати готівкою.`,
        metric: `${fmt(liquid)}`,
        progress: 1,
      });
    }
  }

  if (hasIncome && hasExpense) {
    if (savingsRate >= THRESHOLDS.savingsFirePct) {
      out.push({
        id: "savings",
        level: "good",
        priority: 5,
        title: "FIRE-рівень заощаджень 🔥",
        detail: `Відкладаєш ${savingsRate.toFixed(0)}% — це темп тих, хто прагне ранньої фінансової незалежності (50%+). Спрямуй надлишок в інвестиції, щоб гроші працювали.`,
        metric: `${savingsRate.toFixed(0)}%`,
        progress: 1,
      });
    } else if (savingsRate >= THRESHOLDS.savingsTargetPct) {
      out.push({
        id: "savings",
        level: "good",
        priority: 5,
        title: "Чудовий рівень заощаджень",
        detail: `Відкладаєш ${savingsRate.toFixed(0)}% доходу (ціль ${THRESHOLDS.savingsTargetPct}%). Автоматизуй «заплати спершу собі» — переказ одразу після зарплати.`,
        metric: `${savingsRate.toFixed(0)}%`,
        progress: 1,
      });
    } else {
      out.push({
        id: "savings",
        level: savingsRate >= THRESHOLDS.savingsMinPct ? "warn" : "bad",
        priority: 3,
        title: "Підніми рівень заощаджень",
        detail: `Зараз ${savingsRate.toFixed(0)}%. Ціль — ${THRESHOLDS.savingsTargetPct}%. Це ${fmt(
          Math.round((income * THRESHOLDS.savingsTargetPct) / 100)
        )} на місяць. Налаштуй автопереказ у день зарплати.`,
        metric: `${savingsRate.toFixed(0)}% → ${THRESHOLDS.savingsTargetPct}%`,
        progress: Math.max(0, Math.min(1, savingsRate / THRESHOLDS.savingsTargetPct)),
      });
    }
  }

  if (hasExpense && expense > 0 && hasIncome) {
    const needs = byCategory.filter((c) => NEEDS.has(c.category.key)).reduce((s, c) => s + c.total, 0);
    const wants = byCategory.filter((c) => WANTS.has(c.category.key)).reduce((s, c) => s + c.total, 0);
    const totalCat = byCategory.reduce((s, c) => s + c.total, 0) || 1;
    const needsPct = (needs / income) * 100;
    const wantsPct = (wants / income) * 100;
    void totalCat;
    out.push({
      id: "rule",
      level: wantsPct > THRESHOLDS.rule503020.wants ? "warn" : "info",
      priority: 4,
      title: "Правило 50/30/20",
      detail: `Потреби ${needsPct.toFixed(0)}% · бажання ${wantsPct.toFixed(0)}% · заощадження ${savingsRate.toFixed(
        0
      )}%. Орієнтир: 50 / 30 / 20.${
        wantsPct > THRESHOLDS.rule503020.wants ? " «Бажання» завеликі — є де скоротити." : ""
      }`,
      metric: `${needsPct.toFixed(0)}/${wantsPct.toFixed(0)}/${savingsRate.toFixed(0)}`,
    });
  }

  if (recurringFxUnavailable !== null) {
    out.push({
      id: "recurring",
      level: "warn",
      priority: 3.5,
      title: "Регулярні платежі",
      detail: `Немає курсу для ${currencyMeta(recurringFxUnavailable).code} — суму регулярних платежів порахувати не можна.`,
    });
  } else if (recurringError !== null) {
    out.push({
      id: "recurring",
      level: "warn",
      priority: 3.5,
      title: "Регулярні платежі",
      detail: `Не вдалося завантажити зобов'язання: ${recurringError}. Сума регулярних платежів невідома.`,
    });
  } else if (recurringMonthly > 0) {
    const pct = hasIncome ? (recurringMonthly / income) * 100 : 0;
    out.push({
      id: "recurring",
      level: pct > THRESHOLDS.recurringWarnPct ? "warn" : "info",
      priority: pct > THRESHOLDS.recurringWarnPct ? 3.5 : 7,
      title: "Регулярні платежі",
      detail: `Щомісяця автоматично списується ${fmt(recurringMonthly)} — це ${fmt(
        recurringMonthly * 12
      )} на рік${hasIncome ? ` і ${pct.toFixed(0)}% доходу` : ""}. Перевір, чи всім ти справді користуєшся.`,
      metric: `${fmt(recurringMonthly)}/міс`,
    });
  }

  if (liquid !== null && hasExpense && expense > 0) {
    const fireNumber = expense * 12 * THRESHOLDS.fireMultiple;
    const pct = (liquid / fireNumber) * 100;
    out.push({
      id: "fire",
      level: "info",
      priority: 8,
      title: "Фінансова незалежність (FIRE)",
      detail: `Капітал для життя з інвестицій (правило ${THRESHOLDS.swrPct}%): ${fmt(
        fireNumber
      )} — це 25× річних витрат. Пройдено ${pct.toFixed(1)}%. Кожні вкладені кошти наближають цю точку.`,
      metric: `${fmt(liquid)} / ${fmt(fireNumber)}`,
      progress: Math.min(1, liquid / fireNumber),
    });
  }

  if (incomeFxUnavailable !== null) {
    out.push({
      id: "income",
      level: "warn",
      priority: 0,
      title: "Дохід",
      detail: `Немає курсу для ${currencyMeta(incomeFxUnavailable).code} — дохід порахувати не можна.`,
    });
  } else if (incomeUnavailableReason !== null) {
    out.push({
      id: "income",
      level: "info",
      priority: 0,
      title: "Дохід",
      detail: incomeUnavailableReason,
    });
  }

  return out.sort((a, b) => a.priority - b.priority);
}
