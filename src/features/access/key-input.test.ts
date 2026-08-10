import { describe, expect, it } from "vitest";
import { formatKeyInput, isKeyComplete } from "./key-input";

describe("ввод ключа", () => {
  it("расставляет разделители сам", () => {
    expect(formatKeyInput("a2b3c4d5e6f7")).toBe("NZM-A2B3-C4D5-E6F7");
  });

  it("чинит вставку из мессенджера: пробелы, регистр, длинное тире", () => {
    expect(formatKeyInput(" nzm–a2b3 c4d5\ne6f7 ")).toBe("NZM-A2B3-C4D5-E6F7");
  });

  it("не даёт ввести лишние символы после полного ключа", () => {
    expect(formatKeyInput("NZM-A2B3-C4D5-E6F7-XXXX")).toBe("NZM-A2B3-C4D5-E6F7");
  });

  it("показывает префикс сразу, ещё до ввода", () => {
    expect(formatKeyInput("")).toBe("NZM");
    expect(formatKeyInput("a2")).toBe("NZM-A2");
  });
});

describe("готовность ключа к отправке", () => {
  it("целый ключ готов", () => {
    expect(isKeyComplete("NZM-A2B3-C4D5-E6F7")).toBe(true);
    expect(isKeyComplete("nzm a2b3 c4d5 e6f7")).toBe(true);
  });

  it("неполный ключ отправлять нельзя: попытка тратится", () => {
    expect(isKeyComplete("")).toBe(false);
    expect(isKeyComplete("NZM-A2B3")).toBe(false);
    expect(isKeyComplete("NZM-A2B3-C4D5-E6F")).toBe(false);
  });
});
