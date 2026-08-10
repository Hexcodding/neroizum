import { describe, expect, it } from "vitest";
import {
  generateClientId,
  generateLicenseKey,
  hasLicenseKeyShape,
  hashSecret,
  normalizeLicenseKey,
  secureCompare,
} from "./keys.ts";

const PEPPER = "тестовый-серверный-секрет";

describe("лицензионный ключ", () => {
  it("имеет ожидаемую форму", () => {
    const key = generateLicenseKey();
    expect(key).toMatch(/^NZM-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(hasLicenseKeyShape(key)).toBe(true);
  });

  it("не содержит символов, которые путают при переписывании", () => {
    const keys = Array.from({ length: 200 }, generateLicenseKey).join("");
    expect(keys).not.toMatch(/[01IO]/);
  });

  it("не повторяется", () => {
    const keys = new Set(Array.from({ length: 500 }, generateLicenseKey));
    expect(keys.size).toBe(500);
  });

  it("приводится к каноническому виду", () => {
    expect(normalizeLicenseKey(" nzm-a2b3-c4d5-e6f7 ")).toBe("NZM-A2B3-C4D5-E6F7");
    expect(normalizeLicenseKey("NZM–A2B3–C4D5–E6F7")).toBe("NZM-A2B3-C4D5-E6F7");
  });

  it("мусор не проходит проверку формы", () => {
    expect(hasLicenseKeyShape("NZM-A2B3-C4D5")).toBe(false);
    expect(hasLicenseKeyShape("NZM-A0B1-C4D5-E6F7")).toBe(false);
    expect(hasLicenseKeyShape("")).toBe(false);
  });
});

describe("видимый номер клиента", () => {
  it("имеет свою форму и не похож на ключ", () => {
    expect(generateClientId()).toMatch(/^ID-[A-Z2-9]{6}$/);
  });

  /**
   * Главная ошибка предыдущей версии: видимый префикс был началом самого
   * ключа и раскрывал 7 из 12 секретных символов. Тест ловит возврат такой
   * связи: у номера клиента не должно быть общих кусков с ключом.
   */
  it("не содержит фрагментов ключа", () => {
    for (let index = 0; index < 200; index += 1) {
      const key = generateLicenseKey();
      const clientId = generateClientId().slice(3);
      const groups = key.slice(4).split("-");

      for (const group of groups) {
        expect(clientId).not.toContain(group);
        expect(clientId).not.toContain(group.slice(0, 3));
      }
    }
  });

  it("не повторяется на разумных объёмах", () => {
    const ids = new Set(Array.from({ length: 500 }, generateClientId));
    expect(ids.size).toBeGreaterThan(495);
  });
});

describe("хеширование секретов", () => {
  it("даёт одинаковый результат на одинаковых данных", async () => {
    const first = await hashSecret("NZM-A2B3-C4D5-E6F7", PEPPER);
    const second = await hashSecret("NZM-A2B3-C4D5-E6F7", PEPPER);
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it("с другим серверным секретом даёт другой хеш", async () => {
    const withPepper = await hashSecret("NZM-A2B3-C4D5-E6F7", PEPPER);
    const withOther = await hashSecret("NZM-A2B3-C4D5-E6F7", "другой");
    expect(withPepper).not.toBe(withOther);
  });

  it("не хранит ключ в открытом виде внутри хеша", async () => {
    const hash = await hashSecret("NZM-A2B3-C4D5-E6F7", PEPPER);
    expect(hash).not.toContain("A2B3");
    expect(hash.toUpperCase()).not.toContain("NZM");
  });

  it("без серверного секрета отказывается работать", async () => {
    await expect(hashSecret("NZM-A2B3-C4D5-E6F7", "")).rejects.toThrow(/секрет/);
  });
});

describe("сравнение секретов", () => {
  it("совпадение и несовпадение определяются верно", () => {
    expect(secureCompare("abc123", "abc123")).toBe(true);
    expect(secureCompare("abc123", "abc124")).toBe(false);
    expect(secureCompare("abc", "abcd")).toBe(false);
    expect(secureCompare("", "")).toBe(true);
  });
});
