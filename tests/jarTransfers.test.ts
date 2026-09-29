import { describe, it, expect } from "vitest";
import { isOwnJarTransfer } from "@/lib/jarTransfers";

describe("isOwnJarTransfer", () => {
  it("mcc 4829 + опис == назва банки → переказ у себе", () => {
    expect(isOwnJarTransfer(4829, "Накопичення", ["Накопичення", "Друк"])).toBe(true);
  });

  it("пробіли навколо опису чи назви не заважають (trim), але це не фазі-збіг", () => {
    expect(isOwnJarTransfer(4829, "  Накопичення  ", ["Накопичення"])).toBe(true);
    expect(isOwnJarTransfer(4829, "Накопичення на відпустку", ["Накопичення"])).toBe(false);
    expect(isOwnJarTransfer(4829, "Накопич", ["Накопичення"])).toBe(false);
  });

  it("інший mcc з тим самим описом — не переказ у банку", () => {
    expect(isOwnJarTransfer(5411, "Накопичення", ["Накопичення"])).toBe(false);
  });

  it("mcc 4829, але опис не збігається з жодною банкою — справжній переказ (напр. другу)", () => {
    expect(isOwnJarTransfer(4829, "Іван Іванов", ["Накопичення", "Друк"])).toBe(false);
  });

  it("перелік банок невідомий (null/undefined/порожній) → нічого не виключаємо", () => {
    expect(isOwnJarTransfer(4829, "Накопичення", null)).toBe(false);
    expect(isOwnJarTransfer(4829, "Накопичення", undefined)).toBe(false);
    expect(isOwnJarTransfer(4829, "Накопичення", [])).toBe(false);
  });

  it("порожній опис ніколи не збігається, навіть якщо банка теж мала б порожню назву", () => {
    expect(isOwnJarTransfer(4829, "", [""])).toBe(false);
    expect(isOwnJarTransfer(4829, null, ["Накопичення"])).toBe(false);
  });

  it("mcc відсутній (null/undefined) — ніколи не переказ у банку", () => {
    expect(isOwnJarTransfer(null, "Накопичення", ["Накопичення"])).toBe(false);
    expect(isOwnJarTransfer(undefined, "Накопичення", ["Накопичення"])).toBe(false);
  });

  it("назва банки в лапках-«ялинках» усередині фрази Monobank — переказ у банку", () => {
    expect(isOwnJarTransfer(4829, "Поповнення «Накопичення»", ["Накопичення"])).toBe(true);
    expect(isOwnJarTransfer(4829, "Регулярне поповнення «Накопичення»", ["Накопичення"])).toBe(true);
    expect(isOwnJarTransfer(4829, "Округлення балансу «Накопичення»", ["Накопичення"])).toBe(true);
    expect(isOwnJarTransfer(4829, "Часткове зняття банки «Накопичення»", ["Накопичення"])).toBe(true);
  });

  it("назва банки як звичайний текст БЕЗ лапок (напр. у ФІО отримувача) — НЕ переказ у банку", () => {
    expect(isOwnJarTransfer(4829, "Переказ Накопичення Петровi", ["Накопичення"])).toBe(false);
  });
});
