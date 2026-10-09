import type { MonoStatementItem } from "./monobank";
import { isOwnJarTransfer } from "./jarTransfers";
import type { TxOverrideType } from "./storage";

export type { TxOverrideType };

export interface TransferContext {
  fakeIds?: Set<string>;
  txOverrides?: Record<string, TxOverrideType>;
  jarTitles?: readonly string[] | null;
  excludedAccounts?: readonly string[] | null;
  partnerKeywords?: readonly string[] | null;
}

export type TransactionKind =
  | "expense"
  | "income"
  | "internal_transfer"
  | "shared_transit"
  | "ignored";

export interface ClassifiedTransaction {
  item: MonoStatementItem;
  kind: TransactionKind;
  isInternalTransfer: boolean;
  isSharedTransit: boolean;
  isExcluded: boolean;
  isOwnJar: boolean;
  badge?: {
    label: string;
    variant: "default" | "secondary" | "warning" | "outline" | "success";
  };
  reason?: string;
}

const INTERNAL_TRANSFER_PATTERNS = [
  /переказ\s+(на|з[іi]?)\s+сво[єїюяеіi]+\s+карт/i,
  /переказ\s+(на|з[іi]?)\s+свої[хм]?\s+карт/i,
  /(з[іi]?|на)\s+власн[оіїуе]+\s+карт/i,
  /між\s+(своїми|власними)\s+(картками|рахунками)/i,
  /поповнення\s+сво[єїюяеіi]+\s+карт/i,
  /поповнення\s+зі\s+сво[єїюяеіi]+\s+карт/i,
  /переказ\s+на\s+власний\s+рахунок/i,
  /з\s+власного\s+рахунку/i,
  /власн[іі]\s+кошти/i,
];

const DEFAULT_SHARED_TRANSIT_KEYWORDS = [
  "спільне",
  "спільний",
  "бюджет",
  "на спільне",
  "сім'я",
  "сім’я",
  "сімї",
  "продукти",
  "оренда",
  "хата",
  "квартира",
];

const P2P_MCC_LIST = new Set([4829, 6538, 6536, 6012]);

export function isInternalDescription(desc: string | null | undefined): boolean {
  if (!desc) return false;
  const s = desc.trim();
  return INTERNAL_TRANSFER_PATTERNS.some((pattern) => pattern.test(s));
}

export function isSharedTransitMatch(
  item: MonoStatementItem,
  customKeywords?: readonly string[] | null
): boolean {
  const isTransferMcc = !item.mcc || P2P_MCC_LIST.has(item.mcc);
  const text = `${item.description ?? ""} ${item.comment ?? ""} ${item.counterName ?? ""}`.toLowerCase();

  const keywords =
    customKeywords && customKeywords.length > 0
      ? customKeywords
      : DEFAULT_SHARED_TRANSIT_KEYWORDS;

  const hasKeyword = keywords.some((kw) => {
    const k = kw.trim().toLowerCase();
    return k && text.includes(k);
  });

  return Boolean(hasKeyword && (isTransferMcc || text.includes("переказ")));
}

export function findPairedTransfers(items: readonly MonoStatementItem[]): Set<string> {
  const pairedIds = new Set<string>();
  const outgoing: MonoStatementItem[] = [];
  const incoming: MonoStatementItem[] = [];

  for (const it of items) {
    const isP2P = !it.mcc || P2P_MCC_LIST.has(it.mcc);
    if (!isP2P && !isInternalDescription(it.description)) continue;

    if (it.amount < 0) {
      outgoing.push(it);
    } else if (it.amount > 0) {
      incoming.push(it);
    }
  }

  const matchedIn = new Set<string>();

  for (const out of outgoing) {
    const targetAmt = Math.abs(out.amount);
    // Find matching incoming within 30 minutes (1800 sec)
    for (const inc of incoming) {
      if (matchedIn.has(inc.id)) continue;
      if (out.accountId && inc.accountId && out.accountId === inc.accountId) {
        // transfers within exact same card are rare unless reversal, skip
        continue;
      }
      const timeDiff = Math.abs(out.time - inc.time);
      if (timeDiff <= 1800) {
        // Allow exact match or tiny commission difference (up to 1.5%)
        const amtDiff = Math.abs(targetAmt - inc.amount);
        if (amtDiff === 0 || (amtDiff / targetAmt <= 0.02 && amtDiff <= 5000)) {
          pairedIds.add(out.id);
          pairedIds.add(inc.id);
          matchedIn.add(inc.id);
          break;
        }
      }
    }
  }

  return pairedIds;
}

export function classifyTransaction(
  item: MonoStatementItem,
  context: TransferContext = {},
  pairedIds?: Set<string>
): ClassifiedTransaction {
  // 1. Manual User Overrides
  if (context.txOverrides && item.id in context.txOverrides) {
    const override = context.txOverrides[item.id];
    switch (override) {
      case "expense":
        return {
          item,
          kind: "expense",
          isInternalTransfer: false,
          isSharedTransit: false,
          isExcluded: false,
          isOwnJar: false,
          reason: "Вручну позначено як звичайну витрату",
        };
      case "internal_transfer":
        return {
          item,
          kind: "internal_transfer",
          isInternalTransfer: true,
          isSharedTransit: false,
          isExcluded: false,
          isOwnJar: false,
          badge: { label: "🔄 Переказ собі", variant: "secondary" },
          reason: "Вручну позначено як переказ між своїми картками",
        };
      case "shared_transit":
        return {
          item,
          kind: "shared_transit",
          isInternalTransfer: false,
          isSharedTransit: true,
          isExcluded: false,
          isOwnJar: false,
          badge: { label: "👥 Спільний бюджет", variant: "secondary" },
          reason: "Вручну позначено як внесок у спільний бюджет",
        };
      case "ignored":
        return {
          item,
          kind: "ignored",
          isInternalTransfer: false,
          isSharedTransit: false,
          isExcluded: true,
          isOwnJar: false,
          badge: { label: "🚫 Виключено", variant: "warning" },
          reason: "Вручну виключено з підрахунків",
        };
    }
  }

  // 2. Excluded Account (e.g. FOP / business)
  if (item.accountId && context.excludedAccounts && context.excludedAccounts.includes(item.accountId)) {
    return {
      item,
      kind: "ignored",
      isInternalTransfer: false,
      isSharedTransit: false,
      isExcluded: true,
      isOwnJar: false,
      badge: { label: "💼 ФОП", variant: "outline" },
      reason: "Рахунок виключено з особистого бюджету",
    };
  }

  // 3. Legacy Fake Set
  if (context.fakeIds && context.fakeIds.has(item.id)) {
    return {
      item,
      kind: "ignored",
      isInternalTransfer: false,
      isSharedTransit: false,
      isExcluded: true,
      isOwnJar: false,
      badge: { label: "🚫 Виключено", variant: "warning" },
      reason: "Позначено як фейкову операцію",
    };
  }

  // 4. Own Jar Transfer
  if (isOwnJarTransfer(item.mcc, item.description, context.jarTitles)) {
    return {
      item,
      kind: "internal_transfer",
      isInternalTransfer: true,
      isSharedTransit: false,
      isExcluded: false,
      isOwnJar: true,
      badge: { label: "🏺 Банка", variant: "secondary" },
      reason: "Переказ у власну банку Monobank",
    };
  }

  // 5. Paired transfer between cards
  if (pairedIds && pairedIds.has(item.id)) {
    return {
      item,
      kind: "internal_transfer",
      isInternalTransfer: true,
      isSharedTransit: false,
      isExcluded: false,
      isOwnJar: false,
      badge: { label: "🔄 Між своїми", variant: "secondary" },
      reason: "Автоматично зіставлений переказ між власними картками",
    };
  }

  // 6. Keywords in description indicating own card transfer
  if (isInternalDescription(item.description)) {
    return {
      item,
      kind: "internal_transfer",
      isInternalTransfer: true,
      isSharedTransit: false,
      isExcluded: false,
      isOwnJar: false,
      badge: { label: "🔄 Між своїми", variant: "secondary" },
      reason: "Переказ між власними картками за описом",
    };
  }

  // 7. Shared transit / family transfer
  if (item.amount < 0 && isSharedTransitMatch(item, context.partnerKeywords)) {
    return {
      item,
      kind: "shared_transit",
      isInternalTransfer: false,
      isSharedTransit: true,
      isExcluded: false,
      isOwnJar: false,
      badge: { label: "👥 Спільний бюджет", variant: "secondary" },
      reason: "Переказ на спільний сімейний бюджет / партнеру",
    };
  }

  // 8. Default
  if (item.amount < 0) {
    return {
      item,
      kind: "expense",
      isInternalTransfer: false,
      isSharedTransit: false,
      isExcluded: false,
      isOwnJar: false,
    };
  }

  return {
    item,
    kind: "income",
    isInternalTransfer: false,
    isSharedTransit: false,
    isExcluded: false,
    isOwnJar: false,
  };
}

export function isEffectiveExpense(
  item: MonoStatementItem,
  context: TransferContext = {},
  pairedIds?: Set<string>
): boolean {
  if (item.amount >= 0) return false;
  const c = classifyTransaction(item, context, pairedIds);
  return c.kind === "expense" && !c.isExcluded && !c.isInternalTransfer && !c.isSharedTransit;
}

export function isEffectiveIncome(
  item: MonoStatementItem,
  context: TransferContext = {},
  pairedIds?: Set<string>
): boolean {
  if (item.amount <= 0) return false;
  const c = classifyTransaction(item, context, pairedIds);
  return c.kind === "income" && !c.isExcluded && !c.isInternalTransfer;
}
