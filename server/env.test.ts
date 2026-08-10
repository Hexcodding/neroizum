import { describe, expect, it } from "vitest";
import { readServerConfig } from "./env.ts";

const FULL: Record<string, string> = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "служебный-ключ",
  NEUROIZIUM_PEPPER: "перец",
  NEUROIZIUM_WEBHOOK_SECRET: "секрет-вебхука",
  NEUROIZIUM_ADMIN_PASSWORD_HASH: "хеш-пароля",
  NEUROIZIUM_ADMIN_TOKEN_SECRET: "секрет-токена",
  GEMINI_API_KEY: "ключ-модели",
  NEUROIZIUM_ALLOWED_ORIGINS: "https://neuroizium.ru, https://app.neuroizium.ru/",
};

function reader(values: Record<string, string>) {
  return (name: string): string | undefined => values[name];
}

describe("настройки сервера", () => {
  it("читает все значения и разбирает список адресов", () => {
    const config = readServerConfig(reader(FULL));

    expect(config.db.url).toBe("https://project.supabase.co");
    expect(config.allowedOrigins).toEqual([
      "https://neuroizium.ru",
      "https://app.neuroizium.ru",
    ]);
  });

  it("забытый секрет роняет запуск и называется по имени", () => {
    const withoutPepper = { ...FULL };
    delete withoutPepper.NEUROIZIUM_PEPPER;

    expect(() => readServerConfig(reader(withoutPepper))).toThrow(/NEUROIZIUM_PEPPER/);
  });

  it("пустая строка считается отсутствующим секретом", () => {
    expect(() => readServerConfig(reader({ ...FULL, GEMINI_API_KEY: "   " }))).toThrow(
      /GEMINI_API_KEY/,
    );
  });

  it("список адресов без единого адреса не проходит", () => {
    expect(() =>
      readServerConfig(reader({ ...FULL, NEUROIZIUM_ALLOWED_ORIGINS: " , , " })),
    ).toThrow(/ALLOWED_ORIGINS/);
  });
});
