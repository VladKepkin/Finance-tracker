import type { WalletEntry } from "./storage";
import { isAllowedKey } from "./db";

export type AtomicPatchPayload =
  | {
      action: "wallet_append";
      entries: WalletEntry[];
    }
  | {
      action: "wallet_remove";
      entryId: string;
    }
  | {
      action: "wallet_update";
      entryId: string;
      patch: Partial<WalletEntry>;
    }
  | {
      action: "map_set";
      key: "txNotes" | "txOverrides" | "txCommitments" | "commitmentOverrides" | "budgets";
      itemKey: string;
      itemValue: unknown | null;
    };

export function applyAtomicDataPatch(
  currentKv: Record<string, unknown>,
  payload: AtomicPatchPayload
): { key: string; value: unknown } {
  if (!payload || typeof payload !== "object" || typeof payload.action !== "string") {
    throw new Error("Некоректний запит патчу");
  }

  switch (payload.action) {
    case "wallet_append": {
      if (!Array.isArray(payload.entries)) {
        throw new Error("Поле entries має бути масивом");
      }
      const currentWallet = Array.isArray(currentKv.wallet)
        ? (currentKv.wallet as WalletEntry[])
        : [];
      const existingIds = new Set(currentWallet.map((e) => e.id));
      const nextWallet = [...currentWallet];
      for (const entry of payload.entries) {
        if (entry && typeof entry.id === "string" && !existingIds.has(entry.id)) {
          nextWallet.push(entry);
          existingIds.add(entry.id);
        }
      }
      return { key: "wallet", value: nextWallet };
    }

    case "wallet_remove": {
      if (!payload.entryId || typeof payload.entryId !== "string") {
        throw new Error("Не вказано entryId");
      }
      const currentWallet = Array.isArray(currentKv.wallet)
        ? (currentKv.wallet as WalletEntry[])
        : [];
      const nextWallet = currentWallet.filter((e) => e.id !== payload.entryId);
      return { key: "wallet", value: nextWallet };
    }

    case "wallet_update": {
      if (!payload.entryId || typeof payload.entryId !== "string") {
        throw new Error("Не вказано entryId");
      }
      if (!payload.patch || typeof payload.patch !== "object" || Array.isArray(payload.patch)) {
        throw new Error("Некоректний patch");
      }
      const currentWallet = Array.isArray(currentKv.wallet)
        ? (currentKv.wallet as WalletEntry[])
        : [];
      const nextWallet = currentWallet.map((e) =>
        e.id === payload.entryId ? { ...e, ...payload.patch } : e
      );
      return { key: "wallet", value: nextWallet };
    }

    case "map_set": {
      const mapKey = payload.key;
      if (!mapKey || !isAllowedKey(mapKey)) {
        throw new Error("Недозволений ключ словника");
      }
      if (!payload.itemKey || typeof payload.itemKey !== "string") {
        throw new Error("Некоректний itemKey");
      }
      const rawCurrent = currentKv[mapKey];
      const currentMap: Record<string, unknown> =
        rawCurrent && typeof rawCurrent === "object" && !Array.isArray(rawCurrent)
          ? { ...(rawCurrent as Record<string, unknown>) }
          : {};

      if (payload.itemValue === null || payload.itemValue === undefined) {
        delete currentMap[payload.itemKey];
      } else {
        currentMap[payload.itemKey] = payload.itemValue;
      }
      return { key: mapKey, value: currentMap };
    }

    default: {
      const exhaustiveCheck: never = payload;
      throw new Error(`Невідома дія: ${(exhaustiveCheck as { action: string }).action}`);
    }
  }
}
