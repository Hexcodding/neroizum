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

describe("служебный ключ базы", () => {
  const withoutLegacy = (): Record<string, string> => {
    const values = { ...FULL };
    delete values.SUPABASE_SERVICE_ROLE_KEY;
    return values;
  };

  it("новый набор ключей читается по имени default", () => {
    const values = {
      ...withoutLegacy(),
      SUPABASE_SECRET_KEYS: JSON.stringify({
        default: "sb_secret_новый",
        billing: "sb_secret_чужой",
      }),
    };

    expect(readServerConfig(reader(values)).db.serviceKey).toBe("sb_secret_новый");
  });

  it("набор без имени default берёт единственный ключ", () => {
    const values = {
      ...withoutLegacy(),
      SUPABASE_SECRET_KEYS: JSON.stringify({ main: "sb_secret_единственный" }),
    };

    expect(readServerConfig(reader(values)).db.serviceKey).toBe("sb_secret_единственный");
  });

  it("новый набор важнее старого ключа", () => {
    const values = { ...FULL, SUPABASE_SECRET_KEYS: JSON.stringify({ default: "sb_secret_новый" }) };

    expect(readServerConfig(reader(values)).db.serviceKey).toBe("sb_secret_новый");
  });

  it("старый ключ работает, пока новых ключей нет", () => {
    expect(readServerConfig(reader(FULL)).db.serviceKey).toBe("служебный-ключ");
  });

  it("без обоих переменных запуск падает и называет оба имени", () => {
    expect(() => readServerConfig(reader(withoutLegacy()))).toThrow(
      /SUPABASE_SECRET_KEYS.*SUPABASE_SERVICE_ROLE_KEY/,
    );
  });

  it("испорченный набор ключей объясняется, а не роняет разбор JSON", () => {
    const broken = { ...withoutLegacy(), SUPABASE_SECRET_KEYS: "{не json" };
    expect(() => readServerConfig(reader(broken))).toThrow(/SUPABASE_SECRET_KEYS/);

    const empty = { ...withoutLegacy(), SUPABASE_SECRET_KEYS: "{}" };
    expect(() => readServerConfig(reader(empty))).toThrow(/ни одного ключа/);

    const wrongShape = { ...withoutLegacy(), SUPABASE_SECRET_KEYS: '"sb_secret_строкой"' };
    expect(() => readServerConfig(reader(wrongShape))).toThrow(/объектом/);
  });
});
